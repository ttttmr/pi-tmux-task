---
name: tmux-task-manager
description: Use this skill whenever work should keep running without blocking the current conversation, including starting, rerunning, inspecting, stopping, delaying, scheduling, cleaning up, or following up on background tasks. Use for dev servers, watch commands, long scans/builds/tests, log tails, delayed reminders, recurring checks, and parallel subtasks that should continue while the agent works. Do not use for generic tmux questions or short foreground commands.
---

# Pi Session Task Manager

Use this skill to manage **background work for the current Pi conversation**. It is an operational checklist, not a tmux tutorial.

## Goal

Make long-running work observable by Pi:

- one Pi conversation → one injected `$PI_TMUX_SESSION`;
- one logical task → one stable tmux window/task name;
- task exits, bells, input waits, and disappearances can notify the agent.

## Non-negotiables

- Start/rerun managed tasks with `tmux-task-run.sh`; do not hand-write tmux startup commands.
- Use the injected `$PI_TMUX_SESSION` only. Never compute, guess, export, or repair it.
- If `$PI_TMUX_SESSION` is missing, stop and report an extension/environment problem.
- Run the helper from the directory that should become the task cwd.
- Keep task names stable and concise: letters, numbers, `.`, `_`, `-`, max 40 chars.
- Preserve helper output in your notes: `session`, `window_id`, `task`, `cwd`.

## Start or rerun a task

Use the helper path from this skill directory, resolved absolutely when needed:

```bash
/path/to/tmux-task-run.sh <task-name> -- '<command>'
```

Examples:

```bash
/path/to/tmux-task-run.sh api-server -- 'npm run dev'
/path/to/tmux-task-run.sh tests-watch -- 'pnpm test -- --watch'
/path/to/tmux-task-run.sh review-reminder -- 'sleep 1800; echo "start review now"'
```

For a worktree or subdirectory:

```bash
TASK_RUN=/absolute/path/to/tmux-task-run.sh
cd /path/to/worktree
"$TASK_RUN" api-server -- 'npm run dev'
```

Use the same task name to rerun the same logical task. Choose a new name only when the task meaning changes.

## Inspect tasks

List tasks in the current Pi task session:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

Capture output by exact `window_id`:

```bash
tmux capture-pane -pt @12 -S -120
```

Find a window by task name only when you do not yet know the id:

```bash
window_id="$(tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_name}|#{window_id}' | awk -F '|' '$1=="api-server"{print $2; exit}')"
[[ -n "$window_id" ]] && tmux capture-pane -pt "$window_id" -S -120
```

## Notifications

Pi may inject `[tmux-task notification]` messages. Treat them as task state, not user requests.

- `exited`: consume the result. Inspect the dead window if the included output is insufficient. Do not restart expected one-shot tasks.
- `notify`: task rang the bell while still running. Inspect output before deciding.
- `input`: task appears blocked on a prompt. Send input only if the answer is safe and obvious; ask the user for credentials, secrets, destructive confirmations, or policy choices.
- `disappeared`: a known window vanished. Verify whether it was killed/replaced; restart only if the logical task should still exist.

For one-shot reminders, print and exit; do not also ring a bell. Use `printf "\a"` only for long-running loops that need attention without exiting.

## Stop and cleanup

Stop one task:

```bash
tmux kill-window -t @12
```

Clean dead windows in the current Pi task session:

```bash
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{pane_dead}' \
  | awk -F '\t' '$2=="1"{print $1}' \
  | sort -u \
  | xargs -r -n1 tmux kill-window -t
```

Kill the whole current Pi task session only after explicit user approval:

```bash
tmux kill-session -t "$PI_TMUX_SESSION"
```

## Quick checklist

1. Is this truly background work? If not, run it foreground.
2. Is `$PI_TMUX_SESSION` present? If not, stop.
3. `cd` to the desired task cwd.
4. Run `tmux-task-run.sh <stable-name> -- '<command>'`.
5. Record `window_id` and task name.
6. On notifications, inspect/route/cleanup without waiting for the user unless a real decision is needed.
