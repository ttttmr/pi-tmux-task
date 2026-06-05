---
name: tmux-task-manager
description: Use tmux for non-blocking project tasks. Reuse the injected PI_TMUX_SESSION when available, fall back to ./tmux-session-name.sh if needed, run one logical task per named tmux window, and interpret tmux-task notifications that include both window id and name.
---

# Tmux Task Manager

Use this skill for any project task that should **not block the main line of work**.

Typical cases:
- dev servers
- backend services
- watch mode commands
- log tailing / observation
- long scans or crawls
- polling / monitoring loops
- delayed or scheduled shell tasks
- parallel subtasks you want to keep alive

Do **not** use tmux for short one-shot commands when you need the output immediately in the current turn.

## Rules

- Reuse the shared project tmux session in `$PI_TMUX_SESSION`.
- If `$PI_TMUX_SESSION` is missing, compute it with `./tmux-session-name.sh`.
- Use **one tmux window per logical task**.
- Give each task a **short, descriptive window name**.
- Preferred names: `web`, `api`, `worker`, `logs`, `watch`, `scan`, `tests`, `build`.
- Avoid long names, timestamps, random suffixes, and vague names like `task` or `misc`.
- When rerunning the same task intentionally, replace the old same-name window.
- Once a window exists, prefer **window id** (`@12`) for follow-up operations.
- Notifications mention both id and name, e.g. `@12 (web)`.

## Session bootstrap

Prefer the injected value from the extension:

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  PI_TMUX_SESSION="$(./tmux-session-name.sh)"
  export PI_TMUX_SESSION
fi
```

Ensure the shared session exists:

```bash
tmux has-session -t "$PI_TMUX_SESSION" 2>/dev/null || \
  tmux new-session -d -s "$PI_TMUX_SESSION" -n shell
```

## Standard start / replace flow

```bash
TASK_NAME=web

EXISTING_WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$EXISTING_WINDOW_ID" ]]; then
  tmux kill-window -t "$EXISTING_WINDOW_ID"
fi

tmux new-window -t "$PI_TMUX_SESSION" -n "$TASK_NAME" \
  "bash -lc 'cd \"$PWD\" && npm run dev'"

WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$WINDOW_ID" ]]; then
  tmux setw -t "$WINDOW_ID" remain-on-exit on
fi
```

Use this pattern whenever you want a stable named background task that can be inspected later.

## Inspect and manage

List tasks:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
```

Inspect pane status:

```bash
tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

Capture recent output:

```bash
tmux capture-pane -pt "@12" -S -80
# or, if you have pane id
# tmux capture-pane -pt "%12" -S -80
```

Kill a task:

```bash
tmux kill-window -t "@12"
```

## How to read notifications

The extension may send messages like:
- `tmux task @12 (web) started`
- `tmux task @12 (web) exited with code 0`
- `tmux task @12 (web) exited with code 1`
- `tmux task @12 (web) is waiting for input: Proceed? [y/N]`
- `tmux task @12 (web) disappeared from session`

Interpret them as follows:
- `started`: the task launched; usually no action needed
- `exited with code 0`: task completed successfully
- `exited with non-zero code`: inspect output; treat as important
- `is waiting for input`: task is blocked on confirmation / password / selection; inspect promptly
- `disappeared from session`: the old window instance is gone; it may have been killed or replaced, so verify whether that was expected

## Agent checklist

When a task should be non-blocking:
1. get `PI_TMUX_SESSION` from the environment, or fall back to `./tmux-session-name.sh`
2. ensure the shared session exists
3. choose a short window name
4. start or replace the task in its own window
5. resolve the new `window id`
6. use that `window id` for inspect / capture / kill
7. pay attention to failure, input-waiting, and disappearance notifications

## Notes

- Window names carry the human task meaning.
- Window ids are for exact follow-up targeting.
- Use `/tmux-tasks` when available to inspect current task windows from the UI.
