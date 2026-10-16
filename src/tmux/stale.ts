import type { TmuxSnapshot } from "../types.ts";

export type StaleTmuxSessionSummary = {
  sessionName: string;
  activeCount: number;
  deadCount: number;
  taskNames: string[];
  piSessionTitle?: string;
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

function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function normalizeTitle(text: string | undefined): string | undefined {
  const title = text?.replace(/\s+/g, " ").trim();
  if (!title || title === "(no messages)") return undefined;
  return truncateText(title, 80);
}

/** Title shown for a Pi session: its display name, else its first user message. */
export function resolvePiSessionTitle(name: string | undefined, firstUserMessage: string | undefined): string | undefined {
  return normalizeTitle(name) ?? normalizeTitle(firstUserMessage);
}

/** `titlesBySessionName` comes from tmux (`@pi_session_title`), never from Pi session files. */
export function attachPiSessionTitlesToStaleTmuxSessions(
  active: StaleTmuxSessionSummary[],
  titlesBySessionName: Map<string, string>,
): StaleTmuxSessionSummary[] {
  return active.map((summary) => {
    const piSessionTitle = normalizeTitle(titlesBySessionName.get(summary.sessionName));
    return piSessionTitle ? { ...summary, piSessionTitle } : summary;
  });
}

function formatTaskNames(taskNames: string[]): string {
  if (taskNames.length === 0) return "";
  const shown = taskNames.slice(0, 3).join(", ");
  const extra = taskNames.length > 3 ? `, +${taskNames.length - 3} more` : "";
  return ` (${shown}${extra})`;
}

function formatPiSessionTitle(piSessionTitle: string | undefined): string {
  if (!piSessionTitle) return "";
  return ` (${piSessionTitle})`;
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
      lines.push(
        `- ${summary.sessionName}${formatPiSessionTitle(summary.piSessionTitle)}: ${summary.activeCount} active${deadSuffix}${formatTaskNames(summary.taskNames)}`,
      );
    }
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}
