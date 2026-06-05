import type { TmuxSnapshot, TmuxTaskSnapshot } from "../types.ts";

export type TmuxTaskEvent =
  | { type: "started"; task: TmuxTaskSnapshot }
  | { type: "exited"; task: TmuxTaskSnapshot }
  | { type: "notify"; task: TmuxTaskSnapshot }
  | { type: "input"; task: TmuxTaskSnapshot; prompt: string }
  | { type: "disappeared"; previous: TmuxTaskSnapshot };

function toTaskMap(snapshot: TmuxSnapshot): Map<string, TmuxTaskSnapshot> {
  return new Map(snapshot.tasks.map((task) => [task.windowId, task]));
}

function formatTaskRef(task: TmuxTaskSnapshot): string {
  return `${task.windowId} (${task.windowName})`;
}

function makeExitedEvent(task: TmuxTaskSnapshot): TmuxTaskEvent {
  return { type: "exited", task };
}

function isInputEligible(task: TmuxTaskSnapshot): boolean {
  return task.paneStateKnown && Boolean(task.paneId) && !task.dead;
}

function getBellCount(task: TmuxTaskSnapshot): number {
  return task.bellCount ?? 0;
}

export function extractInputPrompt(preview: string | undefined): string | undefined {
  if (!preview) return undefined;

  const lines = preview
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8);

  const patterns = [
    /\[[YyNn]\/[YyNn]\]/,
    /\[[YyNn]\/[NnYy]\]/,
    /\b\(y\/n\)\b/i,
    /\b\(y\/N\)\b/,
    /\b\(Y\/n\)\b/,
    /\bconfirm\b/i,
    /\bare you sure\b/i,
    /\bproceed\b/i,
    /\bcontinue\?/i,
    /\bpress enter to continue\b/i,
    /\bpassword:\s*$/i,
    /\bpassphrase:\s*$/i,
    /\bselect an option\b/i,
    /\bchoose\b.*:/i,
    /\bchoice:\s*$/i,
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (patterns.some((pattern) => pattern.test(line))) {
      return line;
    }
  }

  return undefined;
}

export function diffTmuxSnapshots(previous: TmuxSnapshot | undefined, current: TmuxSnapshot): TmuxTaskEvent[] {
  if (!previous) return [];

  const events: TmuxTaskEvent[] = [];
  const previousTasks = toTaskMap(previous);
  const currentTasks = toTaskMap(current);

  for (const currentTask of current.tasks) {
    const previousTask = previousTasks.get(currentTask.windowId);
    if (!previousTask) {
      if (currentTask.dead) events.push(makeExitedEvent(currentTask));
      else events.push({ type: "started", task: currentTask });
      continue;
    }

    if (!previousTask.dead && currentTask.dead) {
      events.push(makeExitedEvent(currentTask));
    }

    if (getBellCount(currentTask) > getBellCount(previousTask) || (!previousTask.bell && currentTask.bell)) {
      events.push({ type: "notify", task: currentTask });
    }

    const previousPrompt = extractInputPrompt(previousTask.outputPreview);
    const currentPrompt = extractInputPrompt(currentTask.outputPreview);
    const previewUnchanged = previousTask.outputPreview === currentTask.outputPreview;
    if (
      isInputEligible(previousTask) &&
      isInputEligible(currentTask) &&
      previewUnchanged &&
      currentPrompt &&
      previousPrompt &&
      currentPrompt === previousPrompt
    ) {
      events.push({ type: "input", task: currentTask, prompt: currentPrompt });
    }
  }

  for (const previousTask of previous.tasks) {
    if (!currentTasks.has(previousTask.windowId) && !previousTask.dead) {
      events.push({ type: "disappeared", previous: previousTask });
    }
  }

  return events;
}

export function filterRepeatedInputEvents(
  events: TmuxTaskEvent[],
  current: TmuxSnapshot,
  previousNotifiedInputs: Map<string, string>,
): { events: TmuxTaskEvent[]; nextNotifiedInputs: Map<string, string> } {
  const nextNotifiedInputs = new Map<string, string>();

  for (const task of current.tasks) {
    if (!isInputEligible(task)) continue;
    const prompt = extractInputPrompt(task.outputPreview);
    if (!prompt) continue;
    if (previousNotifiedInputs.get(task.windowId) === prompt) {
      nextNotifiedInputs.set(task.windowId, prompt);
    }
  }

  const filtered: TmuxTaskEvent[] = [];
  for (const event of events) {
    if (event.type !== "input") {
      filtered.push(event);
      continue;
    }

    if (previousNotifiedInputs.get(event.task.windowId) === event.prompt) {
      continue;
    }

    nextNotifiedInputs.set(event.task.windowId, event.prompt);
    filtered.push(event);
  }

  return { events: filtered, nextNotifiedInputs };
}

function formatExitCode(exitCode: number | undefined): string {
  return exitCode == null ? "unknown code" : `code ${exitCode}`;
}

function formatPreview(preview: string | undefined): string | undefined {
  if (!preview) return undefined;
  const lines = preview
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-3);
  if (lines.length === 0) return undefined;
  return lines.map((line) => `  ${line}`).join("\n");
}

export function formatTmuxTaskEvent(event: TmuxTaskEvent): string {
  switch (event.type) {
    case "started":
      return `tmux task ${formatTaskRef(event.task)} started`;
    case "exited": {
      const message = `tmux task ${formatTaskRef(event.task)} exited with ${formatExitCode(event.task.exitCode)}`;
      const preview = formatPreview(event.task.outputPreview);
      return preview ? `${message}\nrecent output:\n${preview}` : message;
    }
    case "notify": {
      const message = `tmux task ${formatTaskRef(event.task)} sent a terminal notification`;
      const preview = formatPreview(event.task.outputPreview);
      return preview ? `${message}\nrecent output:\n${preview}` : message;
    }
    case "input":
      return `tmux task ${formatTaskRef(event.task)} is waiting for input: ${event.prompt}`;
    case "disappeared":
      return `tmux task ${formatTaskRef(event.previous)} disappeared from session`;
  }
}

export function formatTmuxTaskEvents(events: TmuxTaskEvent[]): string | undefined {
  const visibleEvents = events.filter((event) => event.type !== "started");
  if (visibleEvents.length === 0) return undefined;
  return ["[tmux-task notification]", ...visibleEvents.map(formatTmuxTaskEvent)].join("\n");
}

export function formatTmuxTaskNotice(events: TmuxTaskEvent[]): string | undefined {
  if (events.length === 0) return undefined;
  return events.map(formatTmuxTaskEvent).join("\n");
}

export function getTmuxTaskEventLevel(events: TmuxTaskEvent[]): "info" | "warning" | "error" {
  if (events.some((event) => event.type === "input" || event.type === "disappeared")) return "warning";
  if (events.some((event) => event.type === "exited" && event.task.exitCode !== 0)) return "warning";
  return "info";
}

export function shouldTriggerTurnForTmuxTaskEvents(events: TmuxTaskEvent[]): boolean {
  const visibleEvents = events.filter((event) => event.type !== "started");
  return visibleEvents.length > 0;
}

export function getTmuxTaskMessageOptions(events: TmuxTaskEvent[]): { triggerTurn: boolean; deliverAs: "followUp" } {
  return {
    triggerTurn: shouldTriggerTurnForTmuxTaskEvents(events),
    deliverAs: "followUp",
  };
}
