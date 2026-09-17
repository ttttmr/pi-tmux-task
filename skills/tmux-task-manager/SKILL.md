---
name: tmux-task-manager
description: Use this skill to run long-running, continuous, monitoring, delayed, or change-watching work as a managed background task that reports back when it finishes, changes, rings, or needs attention — dev servers, watch commands, long builds/tests/scans, log tails, periodic checks, file/state watchers, and delayed reminders. Do not use for short foreground commands, generic tmux/shell help, or when the user asks to run the work in the foreground or with a non-tmux mechanism.
---

# Pi Session Task Manager

Use this skill for work that should keep running instead of blocking the conversation, and that Pi should report back on. Start it as a managed task, then continue other work or end the turn; act on the notification.

## When to use it

| Work | Examples |
| --- | --- |
| Long-running task | a slow build, a full test suite, a large scan, a migration |
| Continuous or maintained task | a dev server, a watch command, `tail -f`, a runtime you keep available |
| Monitoring task | check a service, queue, job, disk, or log on an interval |
| Change watcher | watch a file, state, or endpoint and act when it changes |
| Delayed task or reminder | "remind me in 10 minutes", run X after a delay |

If the work is long, recurring, or something you would otherwise wait or poll for, it belongs here — unless the user explicitly asked to run it in the foreground or with a non-tmux mechanism. Pi sends a `[tmux-task notification]` when the task finishes, rings, blocks on input, or disappears.

## Start a task

One named task per logical task:

```bash
/path/to/this-skill/tmux-task-run.sh <task-name> -- '<command>'
```

Resolve `tmux-task-run.sh` relative to this `SKILL.md` and use that absolute path; do not rely on a `PATH` command and do not search for another copy. The command runs in your current directory, and its output stays readable after it exits.

Task names: letters, numbers, `.`, `_`, `-`; max 40 chars. Reuse the same name to rerun the same logical task — the helper reuses or replaces the window. A retry or another round is still the same task: do not add `-2`, `-3`, or `-retry`.

```bash
/path/to/this-skill/tmux-task-run.sh full-build -- 'pnpm build'
/path/to/this-skill/tmux-task-run.sh dev-server -- 'pnpm dev'
/path/to/this-skill/tmux-task-run.sh queue-drain -- 'while ./queue-busy; do sleep 60; done; echo "queue drained"'
/path/to/this-skill/tmux-task-run.sh health-watch -- 'state=up; while true; do if curl -fsS http://127.0.0.1:3000/health; then state=up; elif [ "$state" = up ]; then printf "\a"; state=down; fi; sleep 60; done'
/path/to/this-skill/tmux-task-run.sh reminder-review -- 'sleep 600; echo "time to review"'
/path/to/this-skill/tmux-task-run.sh watch-config -- './wait-for-change.sh config.json'
```

Record the helper output:

```text
session=...
window_id=...
task=...
cwd=...
```

## Never wait in the foreground

The task does the waiting; you get told. `[tmux-task notification]` is delivered as a follow-up, so it arrives and starts a new turn after your current turn ends.

- Never wait for progress or completion with foreground `sleep`, `capture-pane` loops, or `pane_dead` polling — not even once:

```bash
sleep 120
sleep 60; tmux capture-pane -pt @12 -S -120
while ! tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{pane_dead}' | grep -q 1; do sleep 30; done
```

- The only allowed check is a single ~5s startup confirmation, in the launch call or the call immediately after it: `sleep 1; tmux capture-pane -pt @12 -S -40`.
- If checking, retrying, or following up is part of the work, put that loop inside the task command, so the task exits only when the real work happens:

```bash
/path/to/this-skill/tmux-task-run.sh eval-finish -- 'while ! ./is-done; do ./print-status; sleep 300; done; ./collect-results'
/path/to/this-skill/tmux-task-run.sh remote-job -- 'ssh host "while pgrep -f backup >/dev/null; do sleep 60; done; cat /var/log/backup.out"'
```

- Otherwise continue other work, or end the turn. Ending the turn is not dropping the task: the notification starts a new turn where you read the pane and report. Never report progress you did not observe.

## Notifications

A task reports back by exiting, ringing, blocking on input, or disappearing. Write the task so it signals at the moment you care about:

| Goal | In the task |
| --- | --- |
| Long task finished | exit normally; the `exited` notification carries the result |
| Reminder after a delay | `sleep N; echo ...` and exit |
| Watch for a change | check, then exit (or ring) once the condition is met |
| Stay running but get attention | `printf '\a'` to ring, and keep running |
| Ask for a decision | print the prompt and wait on input |

Two things to know when you write the task:

- A ring notifies once every time it happens, so ring on a state change, not on every poll. `health-watch` above rings only when the service goes from up to down.
- `input` notifications only cover recognizable prompts (`Proceed? [y/N]`, `(y/n)`, `password:`, `continue?`, `press enter to continue`, `select an option`, `choice:`). A custom prompt just sits there silently.

Treat `[tmux-task notification]` as task state, not as a new user request:

- `exited`: inspect and consume the result. Do not restart an expected one-shot task.
- `notify`: inspect the output before deciding.
- `input`: answer only if it is safe and obvious; ask for secrets or destructive choices.
- `disappeared`: verify whether the task was killed or replaced.

If you already consumed a notification for the same task/window/attempt, treat later duplicates as already handled.

## Inspect and clean up

Inspect when a notification arrives or you need orientation — not on a loop. Prefer the recorded `window_id`:

```bash
tmux capture-pane -pt @12 -S -120
```

List current tasks only when you need orientation:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

The session name is not a pane/window target:

```bash
# Wrong
tmux capture-pane -pt "$PI_TMUX_SESSION" -S -120
```

After a task is consumed, kill only its window; kill the whole session only with explicit user approval:

```bash
tmux kill-window -t @12
```

## If the task environment is unavailable

`$PI_TMUX_SESSION` is the only task-routing variable and is injected for you. If it is missing, stop and report it — do not compute, guess, repair, or copy a session name.

A missing session or window is task state, not a name problem: start new work with the helper, or list current windows once with `tmux list-windows -t "$PI_TMUX_SESSION"`. If the helper itself fails, report its error instead of guessing a fix.
