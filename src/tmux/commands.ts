import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TmuxPaneInfo, TmuxWindowInfo } from "../types.ts";
import { parseListPanes, parseListWindows, TMUX_FIELD_SEPARATOR } from "./parse.ts";

const BELL_HOOK_NAME = "alert-bell[9010]";

const execFileAsync = promisify(execFile);

async function runTmux(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("tmux", args, {
      encoding: "utf8",
      env: { ...process.env, LC_CTYPE: process.env.LC_CTYPE || "C.UTF-8" },
    });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? error?.message ?? "",
      code: error?.code ?? 1,
    };
  }
}

export async function tmuxHasSession(sessionName: string): Promise<boolean> {
  const result = await runTmux(["has-session", "-t", sessionName]);
  return result.code === 0;
}

export async function tmuxListSessions(): Promise<string[]> {
  const result = await runTmux(["list-sessions", "-F", "#{session_name}"]);
  if (result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function tmuxListWindows(sessionName: string): Promise<TmuxWindowInfo[]> {
  const result = await runTmux([
    "list-windows",
    "-t",
    sessionName,
    "-F",
    [
      "#{window_name}",
      "#{window_id}",
      "#{window_active}",
      "#{window_panes}",
      "#{window_bell_flag}",
      "#{@pi_tmux_task_bell_count}",
      "#{@pi_task_command}",
      "#{@pi_task_cwd}",
    ].join(TMUX_FIELD_SEPARATOR),
  ]);
  if (result.code !== 0) return [];
  return parseListWindows(result.stdout);
}

export async function tmuxListPanes(sessionName: string): Promise<TmuxPaneInfo[]> {
  const result = await runTmux([
    "list-panes",
    "-s",
    "-t",
    sessionName,
    "-F",
    [
      "#{window_id}",
      "#{window_name}",
      "#{pane_id}",
      "#{pane_dead}",
      "#{pane_dead_status}",
      "#{pane_current_command}",
      "#{pane_title}",
    ].join(TMUX_FIELD_SEPARATOR),
  ]);
  if (result.code !== 0) return [];
  return parseListPanes(result.stdout);
}

export async function tmuxCapturePaneByPaneId(paneId: string, startLine = -40): Promise<string | undefined> {
  const result = await runTmux([
    "capture-pane",
    "-p",
    "-t",
    paneId,
    "-S",
    String(startLine),
  ]);
  if (result.code !== 0) return undefined;
  return result.stdout.trimEnd() || undefined;
}

export async function tmuxCapturePaneByWindowId(windowId: string, startLine = -40): Promise<string | undefined> {
  const result = await runTmux([
    "capture-pane",
    "-p",
    "-t",
    windowId,
    "-S",
    String(startLine),
  ]);
  if (result.code !== 0) return undefined;
  return result.stdout.trimEnd() || undefined;
}

export async function tmuxKillWindowById(windowId: string): Promise<boolean> {
  const result = await runTmux(["kill-window", "-t", windowId]);
  return result.code === 0;
}

export async function tmuxKillSession(sessionName: string): Promise<boolean> {
  const result = await runTmux(["kill-session", "-t", sessionName]);
  return result.code === 0;
}

export async function tmuxSetWindowRemainOnExit(windowId: string): Promise<boolean> {
  const result = await runTmux(["setw", "-t", windowId, "remain-on-exit", "on"]);
  return result.code === 0;
}

export async function tmuxInstallBellHook(sessionName: string): Promise<boolean> {
  const hookCommand =
    "run-shell 'tmux set-option -w -t \"#{hook_window}\" @pi_tmux_task_bell_count \"#{e|+:#{?@pi_tmux_task_bell_count,#{@pi_tmux_task_bell_count},0},1}\" >/dev/null 2>&1'";
  const result = await runTmux(["set-hook", "-t", sessionName, BELL_HOOK_NAME, hookCommand]);
  return result.code === 0;
}

