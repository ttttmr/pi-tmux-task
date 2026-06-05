import type { TmuxPaneInfo, TmuxWindowInfo } from "../types.ts";

export const TMUX_FIELD_SEPARATOR = "§";

function parseBooleanFlag(value: string): boolean {
  return value === "1";
}

function parseOptionalNumber(value: string): number | undefined {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseListWindows(output: string): TmuxWindowInfo[] {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [
        windowName = "",
        windowId = "",
        windowActive = "0",
        windowPanes = "0",
        windowBell = "0",
        bellCount = "",
        taskCommand = "",
        taskCwd = "",
      ] = line.split(TMUX_FIELD_SEPARATOR);
      return {
        windowId,
        windowName,
        windowActive: parseBooleanFlag(windowActive),
        windowPanes: parseOptionalNumber(windowPanes) ?? 0,
        windowBell: parseBooleanFlag(windowBell),
        bellCount: parseOptionalNumber(bellCount),
        taskCommand: taskCommand || undefined,
        taskCwd: taskCwd || undefined,
      };
    });
}

export function parseListPanes(output: string): TmuxPaneInfo[] {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [windowId = "", windowName = "", paneId = "", paneDead = "0", paneDeadStatus = "", paneCurrentCommand = "", paneTitle = ""] =
        line.split(TMUX_FIELD_SEPARATOR);
      return {
        windowId,
        windowName,
        paneId,
        dead: parseBooleanFlag(paneDead),
        exitCode: parseOptionalNumber(paneDeadStatus),
        currentCommand: paneCurrentCommand || undefined,
        paneTitle: paneTitle || undefined,
      };
    });
}
