import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { TmuxSnapshot, TmuxTaskSnapshot } from "./types.ts";
import { computeTmuxSessionName, projectSlugForPath } from "./context.ts";
import {
  type TmuxTaskEvent,
  diffTmuxSnapshots,
  filterRepeatedInputEvents,
  formatTmuxTaskEvents,
  formatTmuxTaskNotice,
  getTmuxTaskEventLevel,
  getTmuxTaskMessageOptions,
} from "./tmux/events.ts";
import { startTmuxPoller, type TmuxPollerHandle } from "./tmux/poller.ts";
import { tmuxInstallBellHook, tmuxKillSession, tmuxKillWindowById, tmuxListSessions } from "./tmux/commands.ts";
import { collectTmuxSnapshot } from "./tmux/snapshot.ts";
import { filterSameProjectTmuxSessions, formatStaleTmuxSessionNotice, summarizeStaleTmuxSessions } from "./tmux/stale.ts";
import { showTmuxTasksPanel } from "./ui/tasks-panel.ts";

type ManagedSession = {
  sessionId: string;
  sessionName: string;
  previousSnapshot: TmuxSnapshot | undefined;
  notifiedInputs: Map<string, string>;
  bellHookInstalled: boolean;
};

type StaleSessionNoticeState = {
  inactive: Set<string>;
  active: Set<string>;
};

type RuntimeState = {
  activeSessionId: string | undefined;
  activePoller: TmuxPollerHandle | undefined;
  sessions: Map<string, ManagedSession>;
  staleNotices: Map<string, StaleSessionNoticeState>;
};

const RUNTIME_KEY = "__pi_tmux_task_runtime__";
const runtime = ((globalThis as Record<string, unknown>)[RUNTIME_KEY] ??= {
  activeSessionId: undefined,
  activePoller: undefined,
  sessions: new Map<string, ManagedSession>(),
  staleNotices: new Map<string, StaleSessionNoticeState>(),
}) as RuntimeState;

function formatTaskRef(task: TmuxTaskSnapshot): string {
  return `${task.windowId} (${task.windowName})`;
}

function formatSnapshotSummary(sessionName: string, snapshot: TmuxSnapshot): string {
  if (!snapshot.exists) return `tmux session not found: ${sessionName}`;
  if (snapshot.tasks.length === 0) return `tmux session ${snapshot.sessionName} exists, no task windows found`;

  const lines = snapshot.tasks.map((task) => {
    const status = !task.paneStateKnown ? "unknown" : task.dead ? `dead(${task.exitCode ?? "?"})` : "running";
    const command = task.currentCommand ?? "?";
    const cwd = task.taskCwd ? `\t${task.taskCwd}` : "";
    return `${formatTaskRef(task)}\t${command}\t${status}${cwd}`;
  });

  return [`session: ${snapshot.sessionName}`, ...lines].join("\n");
}

function taskDetails(task: TmuxTaskSnapshot) {
  return {
    windowId: task.windowId,
    windowName: task.windowName,
    paneId: task.paneId,
    paneStateKnown: task.paneStateKnown,
    currentCommand: task.currentCommand,
    taskCwd: task.taskCwd,
    dead: task.dead,
    exitCode: task.exitCode,
    bell: task.bell,
    bellCount: task.bellCount,
    outputPreview: task.outputPreview,
  };
}

function eventDetails(event: TmuxTaskEvent) {
  switch (event.type) {
    case "started":
    case "exited":
    case "notify":
      return { type: event.type, task: taskDetails(event.task) };
    case "input":
      return { type: event.type, prompt: event.prompt, task: taskDetails(event.task) };
    case "disappeared":
      return { type: event.type, previous: taskDetails(event.previous) };
  }
}

function formatStatusLine(snapshot: TmuxSnapshot | undefined): string | undefined {
  if (!snapshot?.exists) return undefined;
  return `tmux: ${snapshot.tasks.length} tasks`;
}

function formatCommandUsage(): string {
  return [
    "Usage:",
    "  /tmux-tasks",
    "  /tmux-tasks prune-dead",
    "  /tmux-tasks kill-all",
    "  /tmux-tasks kill-all --yes   # required in non-UI mode",
  ].join("\n");
}

function removeTasksFromSnapshot(snapshot: TmuxSnapshot | undefined, windowIds: Set<string>): TmuxSnapshot | undefined {
  if (!snapshot || windowIds.size === 0) return snapshot;
  return {
    ...snapshot,
    tasks: snapshot.tasks.filter((task) => !windowIds.has(task.windowId)),
  };
}

async function pruneDeadTaskWindows(tasks: TmuxTaskSnapshot[]): Promise<Set<string>> {
  const deadTasks = tasks.filter((task) => task.dead);
  const results = await Promise.all(deadTasks.map(async (task) => ({ task, ok: await tmuxKillWindowById(task.windowId) })));
  return new Set(results.filter((result) => result.ok).map((result) => result.task.windowId));
}

export function taskFromStartedOutput(output: string, expectedSessionName?: string): TmuxTaskSnapshot | undefined {
  const fields = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(session|window_id|task|cwd)=(.*)$/.exec(line.trim());
    if (match) fields.set(match[1], match[2]);
  }

  if (expectedSessionName && fields.get("session") !== expectedSessionName) return undefined;

  const windowId = fields.get("window_id");
  const windowName = fields.get("task");
  if (!windowId || !windowName) return undefined;

  return {
    windowId,
    windowName,
    currentCommand: "starting",
    taskCwd: fields.get("cwd"),
    paneStateKnown: false,
    dead: false,
    bell: false,
  };
}

function sessionIdFor(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

function sessionNameFor(ctx: ExtensionContext): string {
  return computeTmuxSessionName(ctx.cwd, sessionIdFor(ctx));
}

function ensureManagedSession(ctx: ExtensionContext): ManagedSession {
  const sessionId = sessionIdFor(ctx);
  const existing = runtime.sessions.get(sessionId);
  if (existing) return existing;

  const session: ManagedSession = {
    sessionId,
    sessionName: sessionNameFor(ctx),
    previousSnapshot: undefined,
    notifiedInputs: new Map<string, string>(),
    bellHookInstalled: false,
  };
  runtime.sessions.set(sessionId, session);
  return session;
}

function stopActivePoller(): void {
  runtime.activePoller?.stop();
  runtime.activePoller = undefined;
}

function stopAllPollers(): void {
  stopActivePoller();
  runtime.activeSessionId = undefined;
}

function staleNoticeStateFor(projectSlug: string): StaleSessionNoticeState {
  const existing = runtime.staleNotices.get(projectSlug);
  if (existing) return existing;

  const state = { inactive: new Set<string>(), active: new Set<string>() };
  runtime.staleNotices.set(projectSlug, state);
  return state;
}

async function cleanAndNotifyStaleProjectSessions(ctx: ExtensionContext, currentSessionName: string): Promise<void> {
  const projectSlug = projectSlugForPath(ctx.cwd);
  const noticeState = staleNoticeStateFor(projectSlug);
  const sessionNames = filterSameProjectTmuxSessions(await tmuxListSessions(), projectSlug, currentSessionName);
  const freshSessionNames = sessionNames.filter((sessionName) => !noticeState.inactive.has(sessionName) && !noticeState.active.has(sessionName));
  if (freshSessionNames.length === 0) return;

  const snapshots = await Promise.all(freshSessionNames.map((sessionName) => collectTmuxSnapshot(sessionName)));
  const plan = summarizeStaleTmuxSessions(snapshots);
  const cleanupResults = await Promise.all(plan.inactive.map(async (sessionName) => ({ sessionName, ok: await tmuxKillSession(sessionName) })));
  const cleaned = cleanupResults.filter((result) => result.ok).map((result) => result.sessionName);

  for (const sessionName of cleaned) noticeState.inactive.add(sessionName);
  for (const summary of plan.active) noticeState.active.add(summary.sessionName);

  const notice = formatStaleTmuxSessionNotice(projectSlug, cleaned.length, plan.active);
  if (notice) ctx.ui.notify(notice, plan.active.length > 0 ? "warning" : "info");
}

async function handleActiveSnapshot(pi: ExtensionAPI, ctx: ExtensionContext, session: ManagedSession, snapshot: TmuxSnapshot): Promise<void> {
  if (runtime.activeSessionId !== session.sessionId) return;

  if (!snapshot.exists) {
    session.bellHookInstalled = false;
  } else if (!session.bellHookInstalled) {
    session.bellHookInstalled = await tmuxInstallBellHook(session.sessionName);
  }

  if (runtime.activeSessionId !== session.sessionId) return;

  const rawEvents = diffTmuxSnapshots(session.previousSnapshot, snapshot);
  session.previousSnapshot = snapshot;

  const { events, nextNotifiedInputs } = filterRepeatedInputEvents(rawEvents, snapshot, session.notifiedInputs);
  session.notifiedInputs = nextNotifiedInputs;

  ctx.ui.setStatus("tmux-task", formatStatusLine(snapshot));

  if (runtime.activeSessionId !== session.sessionId) return;

  const message = formatTmuxTaskEvents(events);
  if (message) {
    pi.sendMessage(
      {
        customType: "tmux-task-event",
        content: message,
        display: true,
        details: {
          source: "extension",
          notUserInput: true,
          sessionId: session.sessionId,
          sessionName: session.sessionName,
          level: getTmuxTaskEventLevel(events),
          events: events.map(eventDetails),
        },
      },
      getTmuxTaskMessageOptions(events),
    );
    return;
  }

  const notice = formatTmuxTaskNotice(events);
  if (!notice) return;

  const level = getTmuxTaskEventLevel(events);
  ctx.ui.notify(notice, level);
}

async function activateSession(pi: ExtensionAPI, ctx: ExtensionContext): Promise<ManagedSession> {
  const session = ensureManagedSession(ctx);

  stopActivePoller();
  runtime.activeSessionId = session.sessionId;
  if (!session.bellHookInstalled) {
    session.bellHookInstalled = await tmuxInstallBellHook(session.sessionName);
  }
  runtime.activePoller = startTmuxPoller(session.sessionName, 2000, (snapshot) => handleActiveSnapshot(pi, ctx, session, snapshot));
  ctx.ui.setStatus("tmux-task", formatStatusLine(runtime.activePoller.getLatest() ?? session.previousSnapshot));
  return session;
}

function registerStartedTask(ctx: ExtensionContext, startedTask: TmuxTaskSnapshot): void {
  const session = ensureManagedSession(ctx);
  session.previousSnapshot = session.previousSnapshot
    ? { ...session.previousSnapshot, tasks: [...session.previousSnapshot.tasks.filter((task) => task.windowId !== startedTask.windowId), startedTask] }
    : { sessionName: session.sessionName, exists: true, tasks: [startedTask], capturedAt: Date.now() };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const session = await activateSession(pi, ctx);
    await cleanAndNotifyStaleProjectSessions(ctx, session.sessionName);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    stopActivePoller();
    if (event.reason === "quit") {
      runtime.sessions.clear();
      runtime.staleNotices.clear();
    }
    if (runtime.activeSessionId === sessionIdFor(ctx)) runtime.activeSessionId = undefined;
    ctx.ui.setStatus("tmux-task", undefined);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const sessionName = sessionNameFor(ctx);
    event.input.command = [
      `export PI_TMUX_SESSION=${JSON.stringify(sessionName)}`,
      event.input.command,
    ].join("\n");
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash" || event.isError) return;
    const output = event.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const session = ensureManagedSession(ctx);
    const startedTask = taskFromStartedOutput(output, session.sessionName);
    if (!startedTask) return;

    registerStartedTask(ctx, startedTask);
  });

  pi.registerCommand("tmux-tasks", {
    description: "Show and manage tmux tasks for the current Pi session",
    handler: async (args, ctx) => {
      const command = args.trim();
      const session = await activateSession(pi, ctx);
      const sessionName = session.sessionName;
      const refresh = async () => (runtime.activePoller ? await runtime.activePoller.refreshNow() : await collectTmuxSnapshot(sessionName));
      const snapshot = await refresh();

      if (command === "prune-dead") {
        const deadTasks = snapshot.tasks.filter((task) => task.dead);
        if (deadTasks.length === 0) {
          const content = snapshot.exists ? "No dead tmux task windows to prune." : `tmux session not found: ${sessionName}`;
          if (ctx.hasUI) ctx.ui.notify(content, snapshot.exists ? "info" : "warning");
          else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName, snapshot } });
          return;
        }

        const prunedWindowIds = await pruneDeadTaskWindows(deadTasks);
        const pruned = deadTasks.filter((task) => prunedWindowIds.has(task.windowId));
        const failed = deadTasks.filter((task) => !prunedWindowIds.has(task.windowId));
        session.previousSnapshot = removeTasksFromSnapshot(session.previousSnapshot, prunedWindowIds);
        const content = [
          `Pruned ${pruned.length} dead tmux task window(s) from ${sessionName}.`,
          ...pruned.map((task) => `- ${formatTaskRef(task)}`),
          ...(failed.length > 0 ? [`Failed to prune ${failed.length} window(s):`, ...failed.map((task) => `- ${formatTaskRef(task)}`)] : []),
        ].join("\n");
        if (ctx.hasUI) ctx.ui.notify(content, failed.length > 0 ? "warning" : "info");
        else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName, pruned, failed } });
        return;
      }

      if (command === "kill-all" || command === "kill-all --yes") {
        if (!snapshot.exists) {
          const content = `tmux session not found: ${sessionName}`;
          if (ctx.hasUI) ctx.ui.notify(content, "warning");
          else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName, snapshot } });
          return;
        }

        if (snapshot.tasks.length === 0) {
          const content = `tmux session ${sessionName} exists, no task windows found`;
          if (ctx.hasUI) ctx.ui.notify(content, "info");
          else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName, snapshot } });
          return;
        }

        if (ctx.hasUI && command !== "kill-all --yes") {
          const taskList = snapshot.tasks.map((task) => `- ${task.windowName} ${task.windowId}${task.dead ? " dead" : " running"}`).join("\n");
          const confirmed = await ctx.ui.confirm(
            "Kill all tmux tasks?",
            `Kill the entire tmux task session ${sessionName}?\n\n${taskList}\n\nThis cannot be undone.`,
          );
          if (!confirmed) return;
        } else if (!ctx.hasUI && command !== "kill-all --yes") {
          pi.sendMessage({
            customType: "tmux-task-summary",
            content: `Refusing to kill tmux task session without confirmation. Run /tmux-tasks kill-all --yes to kill ${sessionName}.`,
            display: true,
            details: { sessionName, snapshot },
          });
          return;
        }

        const ok = await tmuxKillSession(sessionName);
        runtime.sessions.delete(session.sessionId);
        const content = ok ? `Killed tmux task session ${sessionName}.` : `Failed to kill tmux task session ${sessionName}.`;
        if (ctx.hasUI) ctx.ui.notify(content, ok ? "info" : "warning");
        else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName, killed: ok } });
        return;
      }

      if (command.length > 0) {
        const content = formatCommandUsage();
        if (ctx.hasUI) ctx.ui.notify(content, "warning");
        else pi.sendMessage({ customType: "tmux-task-summary", content, display: true, details: { sessionName } });
        return;
      }

      if (!ctx.hasUI) {
        const summary = formatSnapshotSummary(sessionName, snapshot);
        pi.sendMessage({
          customType: "tmux-task-summary",
          content: summary,
          display: true,
          details: { sessionName, snapshot },
        });
        return;
      }

      await showTmuxTasksPanel({
        ctx,
        sessionName,
        initialSnapshot: snapshot,
        refresh,
      });
    },
  });
}
