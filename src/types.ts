export type TmuxTaskSnapshot = {
  windowId: string;
  windowName: string;
  paneId?: string;
  paneStateKnown: boolean;
  currentCommand?: string;
  taskCwd?: string;
  dead: boolean;
  exitCode?: number;
  bell: boolean;
  bellCount?: number;
  outputPreview?: string;
};

export type TmuxSnapshot = {
  sessionName: string;
  exists: boolean;
  tasks: TmuxTaskSnapshot[];
  capturedAt: number;
};

export type TmuxWindowInfo = {
  windowId: string;
  windowName: string;
  windowActive: boolean;
  windowPanes: number;
  windowBell: boolean;
  bellCount?: number;
  taskCommand?: string;
  taskCwd?: string;
};

export type TmuxPaneInfo = {
  windowId: string;
  windowName: string;
  paneId: string;
  dead: boolean;
  exitCode?: number;
  currentCommand?: string;
  paneTitle?: string;
};
