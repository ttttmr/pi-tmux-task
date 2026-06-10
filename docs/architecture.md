# pi-tmux-task architecture

This document describes the high-level architecture, runtime phases, and cleanup model for `pi-tmux-task`.

For detailed event detection rules, see [`tmux-task-event-flow.md`](tmux-task-event-flow.md).

## What the package adds

| Surface | Added by | Purpose |
|---|---|---|
| Skill `tmux-task-manager` | `skills/tmux-task-manager/SKILL.md` | Teaches the agent when/how to run long-running work as managed background tasks. |
| Slash command `/tmux-tasks` | `src/index.ts` | Shows and manages tasks for the current Pi session. |
| Bash env injection | `src/index.ts` `tool_call` handler | Prepends `export PI_TMUX_SESSION=...` to every Pi `bash` call. |
| Helper CLI `pi-tmux-session-name` | `package.json -> bin` | Computes the tmux session name outside Pi. |
| Helper CLI `pi-tmux-task-run` | `package.json -> bin` | Starts/reruns one named task slot inside `$PI_TMUX_SESSION`. |
| Task notifications | `src/index.ts` poller callback | Converts tmux state changes into UI notices or conversation messages. |

The extension does **not** register a new LLM tool. The agent still uses Pi's normal `bash` tool; this extension only injects the task-routing environment variable before the command runs.

## Core architecture

```text
Pi session
  ├─ extension runtime (src/index.ts)
  │   ├─ computes PI_TMUX_SESSION
  │   ├─ injects env into bash tool calls
  │   ├─ starts one active tmux poller
  │   ├─ registers /tmux-tasks
  │   └─ sends UI notices / task event messages
  │
  ├─ agent skill (skills/tmux-task-manager/SKILL.md)
  │   └─ tells the agent to use tmux-task-run.sh for long-running work
  │
  └─ tmux task session: pi-<project-slug>-<session-id>
      ├─ window: api-server      # one logical task slot
      ├─ window: tests-watch
      └─ window: review-reminder
```

Important boundaries:

- The extension observes only the configured tmux task session for the active Pi session.
- Historical same-project sessions are scanned only at startup for cleanup/notice, not continuously polled.
- Task identity is based on tmux `window_id`; task names are user-facing labels via `window_name`.
- The task helper runs commands from the directory where the helper is invoked, while task routing remains attached to `$PI_TMUX_SESSION`.

## Naming and routing

The tmux session name is:

```text
pi-<project-slug>-<session-id>
```

Where:

- `project-slug` comes from the basename of `ctx.cwd`, normalized by `src/context.ts`.
- `session-id` is the full Pi session id from `ctx.sessionManager.getSessionId()`.

`PI_TMUX_SESSION` is the only task-routing variable. The extension injects it into every Pi `bash` tool call:

```bash
export PI_TMUX_SESSION="<computed-session-name>"
```

Because `project-slug` uses only the basename, same-basename checkouts share the same historical-session scan prefix. This is intentional best-effort cleanup/notice behavior, not strict path ownership.

## Runtime phases

### Phase 1 — package load

**Trigger:** Pi loads this package.

**Key files:**

- `package.json`
- `src/index.ts`
- `skills/tmux-task-manager/SKILL.md`

**What happens:**

1. Pi loads `src/index.ts` as an extension.
2. Pi discovers `skills/tmux-task-manager/SKILL.md` as an on-demand skill.
3. The extension registers event handlers for:
   - `session_start`
   - `session_shutdown`
   - `tool_call`
   - `tool_result`
4. The extension registers the slash command `/tmux-tasks`.

No tmux task session is created just by loading the package.

### Phase 2 — Pi session starts

**Trigger:** Pi emits `session_start`.

**Key functions:**

- `sessionIdFor(ctx)`
- `sessionNameFor(ctx)`
- `ensureManagedSession(ctx)`
- `activateSession(pi, ctx)`
- `cleanAndNotifyStaleProjectSessions(ctx, currentSessionName)`

**What happens:**

1. The extension reads the Pi session id.
2. It computes `PI_TMUX_SESSION` from `ctx.cwd` and the session id.
3. It creates or reuses in-memory state for this Pi session:
   - previous tmux snapshot
   - deduped input prompts
   - bell-hook install state
4. It stops any previous active poller in this runtime.
5. It starts one poller for the current tmux task session, every 2 seconds.
6. It updates the Pi status area with `tmux: N tasks` when the session exists.
7. It scans same-project historical tmux sessions:
   - no active tasks → kill the inactive tmux session;
   - active tasks → leave it running and notify the user via `ctx.ui.notify(...)`.
8. When possible, it enriches active historical-session notices with the matching Pi session display name, or the first user message as a title fallback.

Historical-session notices are **UI-only**. They are not sent with `pi.sendMessage(...)`, so they do not trigger an agent turn.

### Phase 3 — bash tool call is prepared

**Trigger:** the agent calls Pi's normal `bash` tool.

**Key node:** `tool_call` handler in `src/index.ts`.

**What happens:**

The extension rewrites the bash command by prepending:

```bash
export PI_TMUX_SESSION="<computed-session-name>"
```

Then the original command runs unchanged after that line.

### Phase 4 — agent starts or reruns a task

**Trigger:** the skill tells the agent to run the helper.

**Key file:** `skills/tmux-task-manager/tmux-task-run.sh`

Typical command:

```bash
./tmux-task-run.sh <task-name> -- '<shell-command>'
```

**What the helper does:**

1. Requires `PI_TMUX_SESSION`.
2. Validates the task name.
3. Resolves the invocation cwd as the task cwd.
4. Creates the tmux session if it does not exist.
5. Creates or reuses a tmux window named after the task.
6. Enables `remain-on-exit` so output remains inspectable after exit.
7. Stores task metadata in tmux window options:
   - `@pi_task_command`
   - `@pi_task_cwd`
8. Installs/refreshes the bell hook for the session.
9. Exports the effective `PI_TMUX_SESSION` inside the task pane.
10. Clears stale Pi session variables inside the task pane.
11. Respawns the window with the requested shell command.

Helper output has a stable field format:

```text
session=<tmux-session>
window_id=@12
task=api-server
cwd=/path/to/project
```

### Phase 5 — bash result is processed

**Trigger:** Pi emits `tool_result` for a successful bash call.

**Key functions:**

- `taskFromStartedOutput(output, expectedSessionName)`
- `registerStartedTask(ctx, startedTask)`

**What happens:**

1. The extension looks for helper output fields: `session`, `window_id`, `task`, `cwd`.
2. If the output belongs to the current `PI_TMUX_SESSION`, the task is registered optimistically in `previousSnapshot`.
3. This lets very short-lived tasks still produce a later `exited` event when the poller sees the dead pane.

If the bash command was unrelated to `tmux-task-run.sh`, this phase does nothing.

### Phase 6 — poller collects tmux snapshots

**Trigger:** poller interval or `/tmux-tasks` refresh.

**Key files:**

- `src/tmux/poller.ts`
- `src/tmux/snapshot.ts`
- `src/tmux/commands.ts`
- `src/tmux/parse.ts`

**What happens:**

The poller collects a `TmuxSnapshot` for the active session using tmux commands:

```bash
tmux has-session
tmux list-windows
tmux list-panes
tmux capture-pane
```

Each tmux window becomes one `TmuxTaskSnapshot` with fields such as:

- `windowId`
- `windowName`
- `paneId`
- `currentCommand`
- `taskCwd`
- `dead`
- `exitCode`
- `bell`
- `bellCount`
- `outputPreview`

Snapshot collection is best-effort for multi-pane windows: the first matching pane is treated as the primary task pane.

### Phase 7 — snapshot diff becomes semantic events

**Trigger:** a new snapshot arrives.

**Key file:** `src/tmux/events.ts`

**What happens:**

The extension diffs the previous and current snapshots into semantic task events:

| Event | Meaning |
|---|---|
| `started` | A new live tmux window appeared. |
| `exited` | A task became dead, or a newly observed task is already dead after baseline. |
| `notify` | A task emitted a terminal bell. |
| `input` | A live task appears to be waiting at a stable prompt. |
| `disappeared` | A previously live window disappeared without becoming a dead pane first. |

Important details:

- The first snapshot establishes baseline and does not replay historical running/dead/bell events.
- `input` requires a live known pane and the same prompt-like output across two polls.
- Repeated `input` notifications are deduped per `windowId + prompt`.
- If a task rings and exits in the same snapshot, the semantic order is `notify` then `exited`, and delivery text collapses them into one combined notification.
- Dead window cleanup does not produce `disappeared` notifications.

### Phase 8 — event delivery chooses UI vs conversation

**Trigger:** after event diff and input dedupe.

**Key functions:**

- `formatTmuxTaskEvents(events)`
- `formatTmuxTaskNotice(events)`
- `getTmuxTaskMessageOptions(events)`
- `handleActiveSnapshot(...)`

**Delivery rules:**

| Event set | Delivery | Agent turn? |
|---|---|---|
| only `started` | `ctx.ui.notify(...)` | No |
| `exited` / `notify` / `input` / `disappeared` | `pi.sendMessage(...)` with `[tmux-task notification]` | Yes, as `followUp` |
| historical active sessions at startup | `ctx.ui.notify(...)` | No |
| `/tmux-tasks` UI actions | `ctx.ui.notify(...)` or panel UI | No |

Conversation task messages include details metadata marking them as extension-generated task state rather than user input.

### Phase 9 — user or agent manages tasks

**Slash command:**

```text
/tmux-tasks
/tmux-tasks prune-dead
/tmux-tasks kill-all
/tmux-tasks kill-all --yes
```

**Direct tmux inspection:**

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux list-panes -s -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
tmux capture-pane -pt @12 -S -80
```

**Cleanup semantics:**

- `prune-dead` kills only dead/exited task windows in the current Pi task session.
- `kill-all` kills the entire current Pi task session after confirmation.
- Pi shutdown does not kill active tasks.
- The next session startup may clean inactive historical sessions automatically.

### Phase 10 — session shutdown

**Trigger:** Pi emits `session_shutdown`.

**What happens:**

1. The extension stops the active poller.
2. If the reason is `quit`, process-local runtime maps are cleared.
3. The status line is cleared.
4. Active tmux tasks are not killed.

Inactive historical sessions are cleaned on the next startup scan instead.

## Lifecycle summary

```text
package load
  -> register extension hooks, command, skill

session_start
  -> compute session name
  -> start active poller
  -> cleanup inactive historical sessions
  -> notify user about active historical sessions

bash tool_call
  -> inject PI_TMUX_SESSION

agent runs tmux-task-run.sh
  -> create/reuse tmux session + task window
  -> run command in task cwd
  -> print session/window/task/cwd fields

tool_result
  -> parse helper output
  -> optimistically register started task

poll tick
  -> collect tmux snapshot
  -> diff events
  -> update status
  -> UI notice or conversation message

/tmux-tasks
  -> inspect, refresh, prune dead windows, or kill current task session

session_shutdown
  -> stop active poller
  -> clear in-memory runtime state on quit
  -> do not kill active tmux tasks
```

## Cleanup model

| Cleanup point | What is cleaned | What is preserved |
|---|---|---|
| Startup historical scan | Same-project historical sessions with zero active tasks | Historical sessions with active tasks |
| `/tmux-tasks prune-dead` | Dead windows in current Pi task session | Running windows |
| `/tmux-tasks kill-all` | Entire current Pi task session after confirmation | Other Pi/task sessions |
| `session_shutdown` | Poller and in-memory runtime state | Active tmux tasks |

This model avoids killing running work just because Pi or a Paseo-managed agent exits, while still removing abandoned sessions that contain no live tasks.

## Invariants and gotchas

- `PI_TMUX_SESSION` is the only routing variable.
- The helper must be used for managed tasks; ad-hoc tmux sessions are not part of the product contract.
- The active poller observes one tmux session only.
- Historical-session cleanup scans by `pi-<project-slug>-` prefix only.
- Historical active-session notices show the Pi session display name/title only when the matching session metadata can be found.
- `project-slug` is basename-based, so same-basename projects may share historical cleanup/notice scope.
- The first snapshot is a baseline, not a replay of old events.
- Multi-pane windows are best-effort; the first matching pane is treated as primary.
- Conversation messages are for actionable task events; UI notices are for user-only state and non-agent-triggering information.
