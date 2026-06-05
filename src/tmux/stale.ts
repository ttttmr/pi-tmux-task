import type { TmuxSnapshot } from "../types.ts";

export type StaleTmuxSessionSummary = {
  sessionName: string;
  activeCount: number;
  deadCount: number;
  taskNames: string[];
};

export type StaleTmuxSessionCleanupPlan = {
  inactive: string[];
  active: StaleTmuxSessionSummary[];
};

export function filterSameProjectTmuxSessions(sessionNames: string[], projectSlug: string, currentSessionName: string): string[] {
  const prefix = `pi-${projectSlug}-`;
  return sessionNames
    .filter((sessionName) => sessionName.startsWith(prefix) && sessionName !== currentSessionName)
    .sort((a, b) => a.localeCompare(b));
}

export function summarizeStaleTmuxSessions(snapshots: TmuxSnapshot[]): StaleTmuxSessionCleanupPlan {
  const plan: StaleTmuxSessionCleanupPlan = { inactive: [], active: [] };

  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;

    const activeTasks = snapshot.tasks.filter((task) => !task.dead);
    if (activeTasks.length === 0) {
      plan.inactive.push(snapshot.sessionName);
      continue;
    }

    const deadCount = snapshot.tasks.length - activeTasks.length;
    plan.active.push({
      sessionName: snapshot.sessionName,
      activeCount: activeTasks.length,
      deadCount,
      taskNames: activeTasks.map((task) => task.windowName).sort((a, b) => a.localeCompare(b)),
    });
  }

  plan.inactive.sort((a, b) => a.localeCompare(b));
  plan.active.sort((a, b) => a.sessionName.localeCompare(b.sessionName));
  return plan;
}

function formatTaskNames(taskNames: string[]): string {
  if (taskNames.length === 0) return "";
  const shown = taskNames.slice(0, 3).join(", ");
  const extra = taskNames.length > 3 ? `, +${taskNames.length - 3} more` : "";
  return ` (${shown}${extra})`;
}

export function formatStaleTmuxSessionNotice(projectSlug: string, cleanedCount: number, active: StaleTmuxSessionSummary[]): string | undefined {
  const lines: string[] = [];

  if (cleanedCount > 0) {
    lines.push(`Cleaned ${cleanedCount} inactive tmux task session(s) for ${projectSlug}.`);
  }

  if (active.length > 0) {
    lines.push(`Existing tmux task session(s) for ${projectSlug} still have active tasks:`);
    for (const summary of active) {
      const deadSuffix = summary.deadCount > 0 ? `, ${summary.deadCount} dead` : "";
      lines.push(`- ${summary.sessionName}: ${summary.activeCount} active${deadSuffix}${formatTaskNames(summary.taskNames)}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}
