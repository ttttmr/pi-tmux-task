import type { TmuxSnapshot } from "../types.ts";

export type PiSessionTitleSource = {
  id: string;
  name?: string;
  firstMessage?: string;
};

export type StalePiSessionTitle = {
  id: string;
  title: string;
  source: "name" | "title";
};

export type StaleTmuxSessionSummary = {
  sessionName: string;
  activeCount: number;
  deadCount: number;
  taskNames: string[];
  piSessionTitle?: StalePiSessionTitle;
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

export function piSessionIdFromTmuxSessionName(sessionName: string, projectSlug: string): string | undefined {
  const prefix = `pi-${projectSlug}-`;
  if (!sessionName.startsWith(prefix)) return undefined;

  const sessionId = sessionName.slice(prefix.length);
  return sessionId.length > 0 ? sessionId : undefined;
}

function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function normalizeTitle(text: string | undefined): string | undefined {
  const title = text?.replace(/\s+/g, " ").trim();
  if (!title || title === "(no messages)") return undefined;
  return truncateText(title, 80);
}

function titleForPiSession(session: PiSessionTitleSource): StalePiSessionTitle | undefined {
  const name = normalizeTitle(session.name);
  if (name) return { id: session.id, title: name, source: "name" };

  const title = normalizeTitle(session.firstMessage);
  if (title) return { id: session.id, title, source: "title" };

  return undefined;
}

export function attachPiSessionTitlesToStaleTmuxSessions(
  active: StaleTmuxSessionSummary[],
  projectSlug: string,
  piSessions: PiSessionTitleSource[],
): StaleTmuxSessionSummary[] {
  const piSessionsById = new Map(piSessions.map((session) => [session.id, session]));

  return active.map((summary) => {
    const piSessionId = piSessionIdFromTmuxSessionName(summary.sessionName, projectSlug);
    const piSession = piSessionId ? piSessionsById.get(piSessionId) : undefined;
    const piSessionTitle = piSession ? titleForPiSession(piSession) : undefined;
    return piSessionTitle ? { ...summary, piSessionTitle } : summary;
  });
}

function formatTaskNames(taskNames: string[]): string {
  if (taskNames.length === 0) return "";
  const shown = taskNames.slice(0, 3).join(", ");
  const extra = taskNames.length > 3 ? `, +${taskNames.length - 3} more` : "";
  return ` (${shown}${extra})`;
}

function formatPiSessionTitle(piSessionTitle: StalePiSessionTitle | undefined): string {
  if (!piSessionTitle) return "";
  return ` (${piSessionTitle.title})`;
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
