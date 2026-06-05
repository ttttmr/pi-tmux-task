import type { TmuxPaneInfo, TmuxSnapshot, TmuxTaskSnapshot, TmuxWindowInfo } from "../types.ts";
import {
  tmuxCapturePaneByPaneId,
  tmuxCapturePaneByWindowId,
  tmuxHasSession,
  tmuxListPanes,
  tmuxListWindows,
  tmuxSetWindowRemainOnExit,
} from "./commands.ts";

function pickPrimaryPane(windowId: string, panes: TmuxPaneInfo[]): TmuxPaneInfo | undefined {
  return panes.find((pane) => pane.windowId === windowId);
}

function isShellCommand(command: string | undefined): boolean {
  if (!command) return false;
  return ["bash", "zsh", "sh", "fish", "dash"].includes(command);
}

function normalizeDisplayText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function resolveTaskCommand(windowInfo: TmuxWindowInfo, paneInfo?: TmuxPaneInfo): string | undefined {
  const taskCommand = normalizeDisplayText(windowInfo.taskCommand);
  if (taskCommand) return taskCommand;

  const paneTitle = normalizeDisplayText(paneInfo?.paneTitle);
  const paneCommand = normalizeDisplayText(paneInfo?.currentCommand);

  if (paneTitle && isShellCommand(paneCommand)) return paneTitle;
  if (paneCommand) return paneCommand;
  return paneTitle;
}

function toTaskSnapshot(windowInfo: TmuxWindowInfo, paneInfo?: TmuxPaneInfo, outputPreview?: string): TmuxTaskSnapshot {
  return {
    windowId: windowInfo.windowId,
    windowName: windowInfo.windowName,
    paneId: paneInfo?.paneId,
    paneStateKnown: paneInfo != null,
    currentCommand: resolveTaskCommand(windowInfo, paneInfo),
    taskCwd: normalizeDisplayText(windowInfo.taskCwd),
    dead: paneInfo?.dead ?? false,
    exitCode: paneInfo?.exitCode,
    bell: windowInfo.windowBell,
    bellCount: windowInfo.bellCount,
    outputPreview,
  };
}

export async function collectTmuxSnapshot(sessionName: string): Promise<TmuxSnapshot> {
  const capturedAt = Date.now();
  const exists = await tmuxHasSession(sessionName);

  if (!exists) {
    return {
      sessionName,
      exists: false,
      tasks: [],
      capturedAt,
    };
  }

  const [windows, panes] = await Promise.all([tmuxListWindows(sessionName), tmuxListPanes(sessionName)]);

  const tasks = await Promise.all(
    windows.map(async (windowInfo) => {
      void tmuxSetWindowRemainOnExit(windowInfo.windowId);
      const paneInfo = pickPrimaryPane(windowInfo.windowId, panes);
      const outputPreview = paneInfo?.paneId
        ? await tmuxCapturePaneByPaneId(paneInfo.paneId, -20)
        : await tmuxCapturePaneByWindowId(windowInfo.windowId, -20);
      return toTaskSnapshot(windowInfo, paneInfo, outputPreview);
    }),
  );

  tasks.sort((a, b) => a.windowName.localeCompare(b.windowName) || a.windowId.localeCompare(b.windowId));

  return {
    sessionName,
    exists: true,
    tasks,
    capturedAt,
  };
}
