---
name: tmux-task-manager
description: Use this skill whenever work in the current project should keep running without blocking the conversation: dev servers, watch commands, long scans, log tails, monitoring loops, or parallel subtasks. Reuse PI_TMUX_SESSION when available, fall back to ./tmux-session-name.sh when it is missing, keep one logical task per meaningfully named tmux window, and handle restarts, inspection, and task-state notifications consistently.
---

# Tmux Task Manager

## Use when

Use tmux when work should continue in the background without blocking the current turn, such as:
- dev servers
- backend services
- watch mode commands
- long scans or crawls
- log tails or monitoring loops
- parallel subtasks that should keep running

Do not use it for short one-shot commands when immediate output is needed in the current turn.

## Session rule

- Reuse `PI_TMUX_SESSION` when it is already present.
- If it is missing, compute it with `./tmux-session-name.sh`.
- Treat the tmux session as **project-scoped**, not chat-scoped.
- Keep using the same shared project session; do not create ad-hoc per-chat sessions.

## Window naming rule

- Keep **one logical task = one tmux window**.
- Use **concise but meaningful** window names.
- Prefer names that say both **what area** the task belongs to and **what it is doing**.
- Good default patterns:
  - `<component>-<purpose>`
  - `<area>-<action>`

Examples:
- `frontend-dev`
- `api-server`
- `worker-sync`
- `tests-watch`
- `scan-deps`
- `migrate-users`

Avoid names that are:
- too generic: `web`, `api`, `task`, `misc`
- noisy: timestamps or random suffixes
- too long to scan comfortably

## Task lifecycle rules

### Start
When the user wants something to keep running:
- ensure the shared project session exists
- choose a meaningful window name
- start the task in its own named window
- keep the startup flow simple

### Rerun
When restarting the same logical task:
- prefer **reusing the existing window** instead of replacing it
- if the current process is still running, interrupt it cleanly first, then rerun in the same window
- this preserves the existing `window id` and keeps task identity stable
- keep the same task name if the task is conceptually the same
- only rename the window if the task meaning has actually changed
- if the existing window is broken, stuck, or no longer usable, then replace it instead of creating duplicates

### Inspect
When the user asks for status or debugging help:
- inspect the existing window before starting anything new
- use normal tmux inspection primitives as needed
- once a window exists, prefer exact targeting when useful

### Stop
When the user wants the task stopped:
- stop the specific task window
- avoid disturbing unrelated task windows in the same project session

## Notification handling

Notifications may refer to the task by both **window id** and **window name**. Treat the window id as the exact reference once it exists.

### Started
- The task launched.
- Usually no action is needed.

### Exited successfully
- The task finished normally.
- Report completion if relevant.

### Failed
- Inspect output.
- Explain the likely cause.
- If the task should keep running, restart it under the same task name.

### Waiting for input
- Treat this as important.
- Inspect promptly.
- Determine what prompt is blocking progress.
- If the next step is safe and obvious, perform or explain the follow-up interaction.

### Disappeared
- Verify whether the window was intentionally killed or replaced.
- If not expected, inspect the remaining task state.
- Restart under the same task name if the task should still exist.

## Agent checklist

When using tmux for this project:
1. use the shared `PI_TMUX_SESSION`
2. keep one logical task per window
3. choose meaningful window names
4. when rerunning the same task, prefer reusing the existing window; replace it only when reuse is not practical
5. inspect before restarting when debugging
6. react carefully to failure, input-waiting, and disappearance notifications
