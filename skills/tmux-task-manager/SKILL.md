---
name: tmux-task-manager
description: Use this skill whenever a command should keep running in the background for the current Pi conversation and report back when it exits, rings, blocks on input, or needs follow-up. Use for dev servers, watches, long tests/builds/scans, delayed reminders, log tails, and parallel subtasks. Do not use for short foreground commands or generic tmux help.
---

# Pi Session Task Manager

Use this skill to start and observe background work for the **current Pi conversation**.

## Golden path

Run the helper script bundled with this skill, with a stable task name and the command:

```bash
/path/to/this-skill/tmux-task-run.sh <task-name> -- '<command>'
```

Resolve `tmux-task-run.sh` relative to this `SKILL.md` and use that absolute path in bash commands. Do not rely on a `PATH` command and do not search the filesystem for another copy.

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

If the helper itself fails, report the helper error instead of guessing a fix. If the helper script path from this skill is not available, report a Pi skill/package installation problem instead of locating another copy manually.

## Missing session/window states

Treat tmux target errors as task state, not as a reason to guess or repair names:

| Observation | Meaning | Action |
| --- | --- | --- |
| `$PI_TMUX_SESSION` is empty | Pi task environment was not injected | Stop and report the environment problem |
| `$PI_TMUX_SESSION` is set, but tmux says `can't find session: pi-...` | No task tmux session exists yet for this Pi conversation, or it was already cleaned up | This is normal when no background task is active. Start new background work with the helper; do not create/guess/repair the session yourself |
| tmux says `can't find window: @12` | The recorded task window is gone, killed, or replaced | List current task windows once if orientation is needed; do not keep capturing the stale `window_id` |
| tmux says `can't find window: pi-...` | A session name was used where a window target was expected | Use `tmux list-windows -t "$PI_TMUX_SESSION"` for session-level listing, or `tmux capture-pane -pt @12` for a recorded window |

When resuming work from an older Pi conversation, do not assume that conversation's tmux task session still exists. Recover state from the transcript or current project files; if more background work is needed, start a new task in the current Pi conversation.

## Task names

Use one stable task name per logical task. Keep it short: letters, numbers, `.`, `_`, `-`, max 40 chars.

Examples:

```bash
/path/to/this-skill/tmux-task-run.sh api-server -- 'pnpm dev'
/path/to/this-skill/tmux-task-run.sh web-build -- 'pnpm --filter @echo/web build'
/path/to/this-skill/tmux-task-run.sh log-tail -- 'tail -f logs/app.log'
```

Use the same task name to rerun the same logical task; the helper handles window reuse/replacement.

## Let tmux own the wait

Use tmux for the whole background lifecycle, not just for starting a monitor. If the next useful step depends on time passing or another job finishing, put that wait and follow-up inside the managed task.

Short foreground sleeps are okay only as a startup grace or race guard, for example `sleep 2; tmux capture-pane -pt @12 -S -80` after launching a task.

Do not repeatedly wait in the foreground with commands like:

```bash
sleep 60; tmux capture-pane -pt @12 -S -120
sleep 120; ./check-status
```

If waiting, retrying, polling, or follow-up collection is part of the work, put that loop inside a managed task or wait for the `[tmux-task notification]`.

Do this:

```bash
/path/to/this-skill/tmux-task-run.sh eval-finish -- 'while ! ./is-done; do ./print-status; sleep 300; done; ./collect-results'
```

Not this:

```bash
/path/to/this-skill/tmux-task-run.sh eval-monitor -- './monitor-status'
sleep 600; ./collect-results
```

After starting a managed task, prefer continuing other safe work or waiting for the `[tmux-task notification]`.

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

Do not use the session name as a pane/window target:

```bash
# Wrong: session name is not a window id
tmux capture-pane -pt "$PI_TMUX_SESSION" -S -120
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
4. Run this skill's helper script: `/path/to/this-skill/tmux-task-run.sh <task-name> -- '<command>'`.
5. Record `session`, `session_created`, `window_id`, `task`, and `cwd`.
6. Use only short foreground grace checks; put long/repeated waits inside a managed task.
7. If a session/window is missing, classify it using the table above before acting.
8. On notifications, consume/route/cleanup without treating them as new user requests.
