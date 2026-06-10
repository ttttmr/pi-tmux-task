import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { TmuxSnapshot, TmuxTaskSnapshot } from "../types.ts";
import { extractInputPrompt } from "../tmux/events.ts";
import { tmuxKillWindowById } from "../tmux/commands.ts";

type ShowTmuxTasksPanelOptions = {
  ctx: ExtensionCommandContext;
  sessionName: string;
  initialSnapshot: TmuxSnapshot;
  refresh: () => Promise<TmuxSnapshot>;
  onManualKill?: (task: TmuxTaskSnapshot) => void;
  onManualKillFailed?: (task: TmuxTaskSnapshot) => void;
};

function formatTaskRef(task: TmuxTaskSnapshot): string {
  return `${task.windowId} (${task.windowName})`;
}

function formatTaskStatus(task: TmuxTaskSnapshot, theme: any): string {
  const prompt = extractInputPrompt(task.outputPreview);
  if (!task.paneStateKnown) return theme.fg("dim", "unknown");
  if (!task.dead && prompt) return theme.fg("warning", "input");
  if (!task.dead && (task.bell || (task.bellCount ?? 0) > 0)) return theme.fg("accent", "notify");
  if (!task.dead) return theme.fg("success", "running");
  const text = `exit ${task.exitCode ?? "?"}`;
  return task.exitCode === 0 ? theme.fg("dim", text) : theme.fg("warning", text);
}

function padToWidth(text: string, width: number, align: "left" | "right" = "left"): string {
  const clipped = truncateToWidth(text, width, "");
  const padding = Math.max(0, width - visibleWidth(clipped));
  const spaces = " ".repeat(padding);
  return align === "right" ? spaces + clipped : clipped + spaces;
}

function makeBorderLine(width: number, left: string, fill: string, right: string): string {
  if (width <= 1) return truncateToWidth(left, width);
  if (width === 2) return truncateToWidth(left + right, width);
  return left + fill.repeat(width - 2) + right;
}

function makeContentLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth(content, width);
  const innerWidth = width - 2;
  return `│${padToWidth(content, innerWidth)}│`;
}

function makeSectionHeader(title: string, width: number, theme: any): string {
  const innerWidth = Math.max(10, width - 2);
  const label = ` ${title} `;
  const fillWidth = Math.max(0, innerWidth - visibleWidth(label));
  return makeContentLine(theme.fg("accent", theme.bold(label)) + theme.fg("dim", "─".repeat(fillWidth)), width);
}

function getPreviewSnippet(task: TmuxTaskSnapshot): string {
  if (!task.outputPreview) return "-";
  const lines = task.outputPreview
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return lines.at(-1) ?? "-";
}

function renderTaskTable(tasks: TmuxTaskSnapshot[], selectedIndex: number, width: number, theme: any): string[] {
  const innerWidth = Math.max(10, width - 2);
  const gap = 2;
  const visibleRows = 10;
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, tasks.length - visibleRows)));
  const end = Math.min(tasks.length, start + visibleRows);

  const idWidth = 6;
  let statusWidth = Math.min(14, Math.max(10, Math.floor(innerWidth * 0.16)));
  let nameWidth = Math.min(24, Math.max(14, Math.floor(innerWidth * 0.28)));
  let commandWidth = Math.max(12, innerWidth - idWidth - nameWidth - statusWidth - gap * 3);
  let previewWidth = 0;

  const canShowPreview = innerWidth >= 92;
  if (canShowPreview) {
    statusWidth = 12;
    nameWidth = Math.min(22, Math.max(14, Math.floor(innerWidth * 0.2)));
    commandWidth = Math.min(28, Math.max(16, Math.floor(innerWidth * 0.24)));
    previewWidth = innerWidth - idWidth - nameWidth - commandWidth - statusWidth - gap * 4;
    if (previewWidth < 18) {
      previewWidth = 0;
      commandWidth = Math.max(12, innerWidth - idWidth - nameWidth - statusWidth - gap * 3);
    }
  }

  const headerParts = [
    padToWidth(theme.fg("accent", theme.bold("id")), idWidth),
    " ".repeat(gap),
    padToWidth(theme.fg("accent", theme.bold("name")), nameWidth),
    " ".repeat(gap),
    padToWidth(theme.fg("accent", theme.bold("command")), commandWidth),
    " ".repeat(gap),
    padToWidth(theme.fg("accent", theme.bold("status")), statusWidth),
  ];

  if (previewWidth > 0) {
    headerParts.push(" ".repeat(gap));
    headerParts.push(padToWidth(theme.fg("accent", theme.bold("preview")), previewWidth));
  }

  const header = headerParts.join("");
  const lines = [makeContentLine(header, width), makeContentLine(theme.fg("dim", "─".repeat(innerWidth)), width)];

  for (let i = start; i < end; i++) {
    const task = tasks[i]!;
    const rowParts = [
      padToWidth(theme.fg("dim", task.windowId), idWidth),
      " ".repeat(gap),
      padToWidth(task.windowName, nameWidth),
      " ".repeat(gap),
      padToWidth(theme.fg("dim", task.currentCommand ?? "-"), commandWidth),
      " ".repeat(gap),
      padToWidth(formatTaskStatus(task, theme), statusWidth),
    ];

    if (previewWidth > 0) {
      rowParts.push(" ".repeat(gap));
      rowParts.push(padToWidth(theme.fg("dim", getPreviewSnippet(task)), previewWidth));
    }

    const row = rowParts.join("");
    const styledRow = i === selectedIndex ? theme.bg("selectedBg", theme.fg("accent", row)) : row;
    lines.push(makeContentLine(styledRow, width));
  }

  if (tasks.length > visibleRows) {
    lines.push(makeContentLine(theme.fg("dim", `${start + 1}-${end} of ${tasks.length} tasks`), width));
  }

  return lines;
}

function renderKillConfirmation(task: TmuxTaskSnapshot, width: number, theme: any): string[] {
  return [
    makeSectionHeader("confirm kill", width, theme),
    makeContentLine(`${theme.fg("warning", "Kill tmux task?")} ${formatTaskRef(task)}`, width),
    makeContentLine(theme.fg("dim", "This stops only the selected tmux window."), width),
  ];
}

function renderDetails(task: TmuxTaskSnapshot | undefined, width: number, theme: any): string[] {
  if (!task) return [makeContentLine(theme.fg("dim", "No task selected"), width)];

  const lines = [
    makeSectionHeader("selected task", width, theme),
    makeContentLine(`${theme.fg("dim", "name    ")} ${task.windowName}`, width),
    makeContentLine(`${theme.fg("dim", "command ")} ${theme.fg("dim", task.currentCommand ?? "-")}`, width),
    makeContentLine(`${theme.fg("dim", "status  ")} ${formatTaskStatus(task, theme)}`, width),
    makeContentLine(`${theme.fg("dim", "window  ")} ${task.windowId}`, width),
    makeContentLine(`${theme.fg("dim", "pane    ")} ${task.paneId ?? "-"}`, width),
    makeContentLine(`${theme.fg("dim", "cwd     ")} ${theme.fg("dim", task.taskCwd ?? "-")}`, width),
    makeContentLine("", width),
    makeSectionHeader("terminal preview", width, theme),
  ];

  const preview = task.outputPreview?.trim();
  if (!preview) {
    lines.push(makeContentLine(theme.fg("dim", "(no terminal output yet)"), width));
    return lines;
  }

  const wrapped = wrapTextWithAnsi(preview, Math.max(10, width - 2)).slice(-8);
  for (const line of wrapped) {
    lines.push(makeContentLine(line, width));
  }
  return lines;
}

export async function showTmuxTasksPanel({ ctx, sessionName, initialSnapshot, refresh, onManualKill, onManualKillFailed }: ShowTmuxTasksPanelOptions) {
  if (!ctx.hasUI) return;

  await ctx.ui.custom(
    (tui, theme, _kb, done) => {
      let snapshot = initialSnapshot;
      let selectedIndex = 0;
      let busy = false;
      let showDetails = false;
      let pendingKillTask: TmuxTaskSnapshot | undefined;
      let autoRefreshTimer: NodeJS.Timeout | undefined;

      const clampSelection = () => {
        if (snapshot.tasks.length === 0) {
          selectedIndex = 0;
          return;
        }
        if (selectedIndex < 0) selectedIndex = 0;
        if (selectedIndex >= snapshot.tasks.length) selectedIndex = snapshot.tasks.length - 1;
      };

      const selectedTask = () => {
        clampSelection();
        return snapshot.tasks[selectedIndex];
      };

      const refreshSnapshot = async () => {
        if (busy || pendingKillTask) return;
        busy = true;
        try {
          snapshot = await refresh();
          clampSelection();
        } finally {
          busy = false;
          tui.requestRender();
        }
      };

      const closePanel = () => {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = undefined;
        done(undefined);
      };

      const requestKillSelected = () => {
        const task = selectedTask();
        if (!task || busy) return;
        pendingKillTask = task;
        tui.requestRender();
      };

      const cancelKill = () => {
        pendingKillTask = undefined;
        tui.requestRender();
      };

      const confirmKill = async () => {
        const task = pendingKillTask;
        if (!task || busy) return;
        const taskRef = formatTaskRef(task);
        pendingKillTask = undefined;
        busy = true;
        try {
          onManualKill?.(task);
          const ok = await tmuxKillWindowById(task.windowId);
          if (!ok) onManualKillFailed?.(task);
          ctx.ui.notify(ok ? `Killed tmux task ${taskRef}` : `Failed to kill tmux task ${taskRef}`, ok ? "info" : "warning");
          snapshot = await refresh();
          clampSelection();
        } finally {
          busy = false;
          tui.requestRender();
        }
      };

      autoRefreshTimer = setInterval(() => {
        void refreshSnapshot();
      }, 2000);

      return {
        render(width: number) {
          const lines: string[] = [];
          lines.push(makeBorderLine(width, "╭", "─", "╮"));
          lines.push(makeContentLine(theme.fg("accent", theme.bold("Tmux Tasks")), width));
          lines.push(makeContentLine(theme.fg("dim", sessionName), width));
          lines.push(makeContentLine("", width));

          if (!snapshot.exists) {
            lines.push(makeContentLine(theme.fg("warning", "tmux session not found"), width));
          } else if (snapshot.tasks.length === 0) {
            lines.push(makeContentLine(theme.fg("dim", "No task windows found"), width));
          } else {
            clampSelection();
            lines.push(...renderTaskTable(snapshot.tasks, selectedIndex, width, theme));

            if (pendingKillTask) {
              lines.push(makeContentLine("", width));
              lines.push(...renderKillConfirmation(pendingKillTask, width, theme));
            } else if (showDetails) {
              lines.push(makeContentLine("", width));
              lines.push(...renderDetails(selectedTask(), width, theme));
            }
          }

          lines.push(makeContentLine("", width));
          const hint = pendingKillTask
            ? [
                theme.fg("accent", "[y]"),
                theme.fg("dim", " kill  "),
                theme.fg("accent", "[n/esc]"),
                theme.fg("dim", " cancel"),
                busy ? theme.fg("dim", "  killing...") : "",
              ].join("")
            : [
                theme.fg("accent", "[esc]"),
                theme.fg("dim", " close  "),
                theme.fg("accent", "[r]"),
                theme.fg("dim", " refresh  "),
                theme.fg("accent", "[enter]"),
                theme.fg("dim", showDetails ? " hide details  " : " details  "),
                theme.fg("accent", "[k]"),
                theme.fg("dim", " kill"),
                busy ? theme.fg("dim", "  refreshing...") : "",
              ].join("");
          lines.push(makeContentLine(hint, width));
          lines.push(makeBorderLine(width, "╰", "─", "╯"));
          return lines.map((line) => truncateToWidth(line, width));
        },
        invalidate() {},
        handleInput(data: string) {
          if (pendingKillTask) {
            if (matchesKey(data, "escape") || data === "n" || data === "N") {
              cancelKill();
              return;
            }
            if (data === "y" || data === "Y") {
              void confirmKill();
              return;
            }
            return;
          }
          if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
            closePanel();
            return;
          }
          if (matchesKey(data, "up")) {
            selectedIndex -= 1;
            clampSelection();
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "down")) {
            selectedIndex += 1;
            clampSelection();
            tui.requestRender();
            return;
          }
          if (data === "r" || data === "R") {
            void refreshSnapshot();
            return;
          }
          if (matchesKey(data, "enter")) {
            showDetails = !showDetails;
            tui.requestRender();
            return;
          }
          if (data === "k" || data === "K") {
            requestKillSelected();
          }
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "72%",
        minWidth: 60,
        maxHeight: "70%",
        margin: 1,
      },
    },
  );
}
