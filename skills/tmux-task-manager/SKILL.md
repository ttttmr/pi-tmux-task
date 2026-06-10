---
name: tmux-task-manager
description: Use this skill whenever work should keep running without blocking the current conversation, including starting, rerunning, inspecting, stopping, delaying, scheduling, cleaning up, or following up on background tasks. Use for dev servers, watch commands, long scans/builds/tests, log tails, delayed reminders, recurring checks, and parallel subtasks that should continue while the agent works. Do not use for generic tmux questions or short foreground commands.
---

# Pi Session Task Manager

Manage the agent's Pi-session background work through tmux. The runtime is tmux, but the product surface is **background task management**, not tmux tutoring.

## Mental model

- **One Pi session = one tmux task session**.
- **One logical task = one named tmux window / task slot**.
- The extension injects `PI_TMUX_SESSION` into Pi bash tool calls.
- Agent control happens through bash helpers, tmux primitives, and task event messages.
- The helper is a normal CLI program: `cd` to the directory where the task should run, then call `./tmux-task-run.sh <task-name> -- '<command>'` from this skill directory, or its resolved absolute path.
- The helper records the invocation cwd and reruns the task from that cwd.
- When Pi exits, the extension stops observing the tmux task session but does not kill or rename it. Agents and users own explicit cleanup.
- When a task exits, the extension sends the exit notification and preserves the dead tmux window for later inspection.
- For one-shot delayed reminders, rely on the normal exit notification and final output; do not also emit a terminal bell unless the task is meant to continue running after requesting attention.

## Use when

Use this skill when work should continue in the background without blocking the current turn, such as:
- dev servers, backend services, worker processes
- watch mode commands
- long scans, crawls, builds, test suites, or log tails
- parallel subtasks that should keep running while the agent continues
- delayed follow-up work such as "continue this in 10 minutes"
- recurring checks such as "check this every 10 minutes and alert me if something changes"

Do not use it for:
- short one-shot commands where immediate foreground output is needed
- generic tmux explanations unrelated to Pi-session task management
- user requests that explicitly choose a different process manager such as systemd, launchd, or nohup

## Session and cwd rules

1. Treat `PI_TMUX_SESSION` as the only effective task-routing variable.
2. Use the bundled helper scripts in this skill directory. Relative paths below (`./tmux-session-name.sh`, `./tmux-task-run.sh`) are relative to this `SKILL.md`; resolve them to absolute paths before running commands from another cwd.
3. If `PI_TMUX_SESSION` is missing outside Pi, compute/export it **before any `cd` that is only for the task cwd**:
   ```bash
   export PI_TMUX_SESSION="$(./tmux-session-name.sh "$PWD" "<pi-session-id>")"
   ```
4. `PI_TMUX_SESSION` is an environment variable; `cd` does not change it.
5. Do **not** recompute `PI_TMUX_SESSION` after `cd` unless you intentionally want a different task session.
6. To run a task in a worktree, package, or subdirectory, `cd` there first, then invoke the helper.
7. Do not invent ad-hoc tmux session names. Use the injected or computed `PI_TMUX_SESSION` as-is. The helper explicitly passes that same value into task panes.

## Task naming rules

Choose stable, concise names. Prefer names that identify both the area and purpose.

Good patterns:
- `<component>-<purpose>`
- `<area>-<action>`

Examples:
- `frontend-dev`
- `api-server`
- `worker-sync`
- `tests-watch`
- `scan-deps`
- `review-reminder`

Avoid:
- too generic: `web`, `api`, `task`, `misc`
- timestamps or random suffixes
- names that change on every rerun
- spaces or shell metacharacters

The helper accepts 1-40 characters from letters, numbers, dot, underscore, and hyphen.

## Agent operating rules

- Start/rerun tasks with the bundled `./tmux-task-run.sh` helper, resolved relative to this `SKILL.md`.
- Inspect/control tasks with direct `tmux` commands in bash.
- Preserve the helper output in your reasoning: `session`, `window_id`, `task`, and `cwd`.
- Mention the task name and `window_id` to the user when it helps future follow-up.
- Use `window_id` for precise targeting once known; use task name only to find or rerun the logical task.
- Do not ask the user before safe, reversible actions such as inspecting output or restarting an expected long-running task.
- Ask before sending credentials/secrets, accepting destructive prompts, or killing all tasks.

## Core workflows

### Start a background task

```bash
./tmux-task-run.sh api-server -- 'npm run dev'
```

If `PI_TMUX_SESSION` may be missing:

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  export PI_TMUX_SESSION="$(./tmux-session-name.sh "$PWD" "<pi-session-id>")"
fi
./tmux-task-run.sh api-server -- 'npm run dev'
```

### Start from a worktree or subdirectory

Compute the session before changing directories if needed, then run the helper from the desired task cwd:

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  export PI_TMUX_SESSION="$(./tmux-session-name.sh "$PWD" "<pi-session-id>")"
fi
PI_TMUX_TASK_RUN="$(pwd)/tmux-task-run.sh"
cd /path/to/repo/.worktrees/feature-branch
"$PI_TMUX_TASK_RUN" api-server -- 'npm run dev'
```

### Rerun an existing logical task

Use the same task name:

```bash
./tmux-task-run.sh api-server -- 'npm run dev'
```

The helper prefers reusing the existing named task slot, preserving the underlying window id when possible. Only choose a new task name if the task meaning actually changed.

### Delay once

Use a normal task whose command sleeps, prints the reminder, then exits. Do not add `printf "\a"` for one-shot reminders: the exit notification already wakes the agent, and adding a bell creates redundant task events.

```bash
./tmux-task-run.sh review-reminder -- 'sleep 1800; echo "start review now"'
```

### Run recurring checks

Use a loop in its own task slot. Emit `printf "\a"` for cycles that should wake the agent while the task keeps running:

```bash
./tmux-task-run.sh scan-watch -- 'while true; do npm audit || printf "\a"; sleep 600; done'
```

### Inspect tasks

List task slots, then capture the target window by `window_id`:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
tmux capture-pane -pt @12 -S -80
```

Find a window by task name when you do not yet know the `window_id`:

```bash
window_id="$(tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_name}|#{window_id}' | awk -F '|' '$1=="api-server"{print $2; exit}')"
[[ -n "$window_id" ]] && tmux capture-pane -pt "$window_id" -S -80
```

### Send input to a waiting task

Only send input when the next response is safe and obvious:

```bash
tmux send-keys -t @12 -- y Enter
```

### Stop and cleanup

Stop one task:

```bash
tmux kill-window -t @12
```

Clean residual dead windows without touching running tasks:

```bash
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_dead}' \
  | awk -F '\t' '$3=="1"{print $1}' \
  | sort -u \
  | xargs -r -n1 tmux kill-window -t
```

Stop all tasks in the current Pi task session only when explicitly requested:

```bash
tmux kill-session -t "$PI_TMUX_SESSION"
```

## Notification handling

Task notifications are agent-facing extension messages, not user requests. Conversation-visible notifications are prefixed with `[tmux-task notification]`. Treat them as fresh task state and decide whether to inspect, respond, summarize, restart, or stop. Do not wait for the user if the safe next step follows from the task's purpose.

Task notifications may refer to both `window id` and task name. Treat the `window id` as the exact low-level reference while it exists.

### `started`

A task window was observed. Usually no action is needed; the extension may suppress conversation messages for starts because helper output already shows launch success.

### `exited`

The process exited and the extension observed the exit code when available.

- Treat the exit code and included recent output as context, not a separate event type.
- First use the notification details/recent output, then inspect the preserved dead tmux window with `capture-pane` or `/tmux-tasks` when more context is needed.
- If the exit was expected for a one-shot job, summarize the result and do not restart it.
- If the task should still be running, restart with the same task name using `./tmux-task-run.sh`; the helper reuses the existing task slot when possible.

### `notify`

The task emitted a terminal bell.

- Treat it as a request for attention, not success/failure by itself.
- Inspect recent output or task state for that `window_id` before deciding what happened.
- Use `printf "\a"` for running tasks that need attention without exiting, such as recurring checks. For one-shot reminders, print the reminder and exit instead.

### `input`

The task appears alive but blocked on an interactive prompt.

- Inspect promptly.
- Determine the exact prompt and safe next input.
- If the response is obvious and safe, send it with `tmux send-keys -t <window_id> -- <keys> Enter`.
- If the prompt asks for credentials, secrets, destructive confirmation, or a policy decision, stop and ask the user.

### `disappeared`

A previously observed tmux window no longer exists.

- This is window-level disappearance, not necessarily a normal process exit.
- Verify whether it was intentionally killed, replaced, or cleaned up.
- Restart under the same task name if the logical task should still exist.

## Agent checklist

When managing background tasks:
1. Use `PI_TMUX_SESSION`; compute it only if missing.
2. `cd` to the desired task cwd before invoking the helper.
3. Prefer the bundled `./tmux-task-run.sh` helper over hand-written tmux startup flows.
4. Use one stable task name per logical task.
5. After starting/rerunning, remember the helper's `window_id`, task name, command, and cwd.
6. Rerun with the same task name when restarting the same logical task.
7. For delayed one-shot reminders, print the reminder and exit; use terminal bell only for still-running tasks that should wake the agent.
8. Inspect before restarting when debugging.
9. Use direct tmux commands for inspect, input, stop, and cleanup.
10. React carefully to `exited`, `notify`, `input`, and `disappeared` notifications.
11. Ask before credentials, secrets, destructive confirmations, or killing all tasks; otherwise proceed with safe obvious follow-up.
