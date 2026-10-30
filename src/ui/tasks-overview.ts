import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TmuxTaskSnapshot } from "../types.ts";
import { extractInputPrompt } from "../tmux/events.ts";

const taskStatusStyles = {
  running: { label: "running", color: "success" },
  input: { label: "input", color: "warning" },
  notify: { label: "notify", color: "accent" },
  done: { label: "done", color: "success" },
  failed: { label: "failed", color: "error" },
  exited: { label: "exited", color: "dim" },
  unknown: { label: "unknown", color: "dim" },
} as const;

/** Classifies detailed task status for the panel; dead panes take precedence over old output. */
export function getTmuxTaskStatus(task: TmuxTaskSnapshot): keyof typeof taskStatusStyles {
  if (!task.paneStateKnown) return "unknown";
  if (task.dead) return task.exitCode === 0 ? "done" : task.exitCode === undefined ? "exited" : "failed";
  if (extractInputPrompt(task.outputPreview)) return "input";
  if (task.bell || (task.bellCount ?? 0) > 0) return "notify";
  return "running";
}

/** Formats a detailed task status using the same classification as the panel summary. */
export function formatTmuxTaskStatus(task: TmuxTaskSnapshot, theme: Theme): string {
  const status = getTmuxTaskStatus(task);
  const text = task.paneStateKnown && task.dead ? `exit ${task.exitCode ?? "?"}` : taskStatusStyles[status].label;
  return theme.fg(taskStatusStyles[status].color, text);
}

/** Counts each task once; only nonzero status counts appear in the task summary. */
export function formatTmuxTaskSummary(tasks: TmuxTaskSnapshot[], theme?: Theme): string {
  const counts = new Map<keyof typeof taskStatusStyles, number>();
  for (const task of tasks) {
    const status = getTmuxTaskStatus(task);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const parts = [`tmux: ${tasks.length} tasks`];
  for (const status of Object.keys(taskStatusStyles) as Array<keyof typeof taskStatusStyles>) {
    const count = counts.get(status);
    if (!count) continue;
    const { label, color } = taskStatusStyles[status];
    const text = `${count} ${label}`;
    parts.push(theme ? theme.fg(color, text) : text);
  }
  return parts.join(" · ");
}

/** Formats nonzero footer counts; base text matches the dim usage row and an empty task list hides the status. */
export function formatTmuxTasksOverview(tasks: TmuxTaskSnapshot[], theme?: Theme): string | undefined {
  if (tasks.length === 0) return undefined;
  let running = 0;
  let failed = 0;
  for (const task of tasks) {
    // Keep unconfirmed panes active, matching the runtime's active-task classification.
    if (!task.paneStateKnown || !task.dead) running++;
    else if (task.exitCode !== undefined && task.exitCode !== 0) failed++;
  }
  const title = `tmux:${tasks.length}`;
  const parts = [theme ? theme.fg("dim", title) : title];
  if (running > 0) {
    const active = String(running);
    parts.push(theme ? theme.fg("warning", active) : active);
  }
  if (failed > 0) {
    const failures = String(failed);
    parts.push(theme ? theme.fg("error", failures) : failures);
  }
  return parts.join(theme ? theme.fg("dim", "-") : "-");
}
