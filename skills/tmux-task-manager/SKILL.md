---
name: tmux-task-manager
description: Use this skill whenever a command should keep running in the background for the current Pi conversation and report back when it exits, rings, blocks on input, or needs follow-up. Use for dev servers, watches, long tests/builds/scans, delayed reminders, log tails, and parallel subtasks. Do not use for short foreground commands or generic tmux help.
---

# Pi Session Task Manager

Use this skill to start and observe background work for the **current Pi conversation**.

## Golden path

Run the helper with a stable task name and the command:

```bash
/path/to/tmux-task-run.sh <task-name> -- '<command>'
```

That is all. The helper automatically:

- reads the injected `$PI_TMUX_SESSION`;
- creates the tmux session if it does not exist;
- creates or reuses the named task window;
- runs the command from your current directory;
- keeps the window after exit so output can be inspected;
- lets Pi send a notification when the task exits, rings, disappears, or waits for input.

Record the helper output:

```text
session=...
session_created=true|false
window_id=...
task=...
cwd=...
```

## Error rule

Only handle this environment error yourself:

- If `$PI_TMUX_SESSION` is missing or empty, stop and report that the Pi task environment was not injected.

Do **not** preflight or repair tmux sessions. If `$PI_TMUX_SESSION` is set, call the helper and let it manage the session.

Do not:

- run `tmux ls` to pick another session;
- run `tmux has-session` and then replace `$PI_TMUX_SESSION`;
- invoke the helper as `PI_TMUX_SESSION=<guessed-session> tmux-task-run.sh ...`;
- copy a session name from another conversation.

If the helper itself fails, report the helper error instead of guessing a fix.

## Task names

Use one stable task name per logical task. Keep it short: letters, numbers, `.`, `_`, `-`, max 40 chars.

Examples:

```bash
/path/to/tmux-task-run.sh api-server -- 'pnpm dev'
/path/to/tmux-task-run.sh web-build -- 'pnpm --filter @echo/web build'
/path/to/tmux-task-run.sh review-wait -- './scripts/paseo-watch run --prompt-file tmp/review.md --provider pi --cwd /repo'
```

Use the same task name to rerun the same logical task; the helper handles window reuse/replacement.

## Inspect

Prefer the recorded `window_id`:

```bash
tmux capture-pane -pt @12 -S -120
```

List current task windows only when you need orientation:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

## Notifications

Treat `[tmux-task notification]` as task state, not as a new user request.

- `exited`: inspect/consume the result. Do not restart an expected one-shot task.
- `notify`: inspect output before deciding.
- `input`: answer only if safe and obvious; ask for secrets/destructive choices.
- `disappeared`: verify whether the task was killed/replaced.

If you already consumed a notification for the same task/window/attempt, mark later duplicates as already handled and continue the current user-facing gate.

## Cleanup

After a completed task is consumed, remove only that task window:

```bash
tmux kill-window -t @12
```

Do not kill the whole tmux session unless the user explicitly approves.

## Checklist

1. Is this actually background work? If not, run it foreground.
2. Is `$PI_TMUX_SESSION` non-empty? If not, stop and report environment injection failure.
3. `cd` to the desired task cwd.
4. Run `tmux-task-run.sh <task-name> -- '<command>'`.
5. Record `session`, `session_created`, `window_id`, `task`, and `cwd`.
6. On notifications, consume/route/cleanup without treating them as new user requests.
