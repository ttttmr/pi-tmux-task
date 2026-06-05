# tmux task event flow

This document focuses on how tmux snapshots become semantic task events and how those events are delivered.

For the full extension lifecycle, helper flow, and cleanup model, see [`architecture.md`](architecture.md).

Related source files:

- `src/tmux/snapshot.ts`
- `src/tmux/events.ts`
- `src/tmux/poller.ts`
- `src/index.ts`

## Snapshot collection

The active poller observes only the configured Pi task tmux session.

`collectTmuxSnapshot(sessionName)` performs:

1. `tmux has-session -t <session>`
2. `tmux list-windows -t <session>`
3. `tmux list-panes -s -t <session>`
4. best-effort `remain-on-exit on` for observed windows
5. `tmux capture-pane` for recent output preview

If the session does not exist, the snapshot is:

```ts
{
  sessionName,
  exists: false,
  tasks: [],
  capturedAt,
}
```

If the session exists, each tmux window becomes one task snapshot.

Important task fields:

| Field | Meaning |
|---|---|
| `windowId` | Stable tmux id for the task window while it exists. |
| `windowName` | User-facing task name. |
| `paneId` | Primary pane id when known. |
| `paneStateKnown` | Whether pane state was available from `list-panes`. |
| `currentCommand` | Metadata command, pane title, or pane command. |
| `taskCwd` | Helper-recorded task cwd when available. |
| `dead` | Whether the primary pane is dead. |
| `exitCode` | Dead pane exit status when tmux reports it. |
| `bell` | tmux window bell flag. |
| `bellCount` | Hook-maintained terminal bell counter. |
| `outputPreview` | Recent captured output. |

Multi-pane windows are best-effort: the first matching pane is treated as the primary task pane.

## Baseline rule

The first snapshot for a session establishes baseline state.

Existing running, dead, or bell-state tasks in the first snapshot do not produce historical events. Later changes from that baseline can produce events.

Fast-start exception: when `tmux-task-run.sh` prints helper output, `src/index.ts` can register the task optimistically during `tool_result`. This lets a short-lived task produce an `exited` event on the next poll even if it finished before the first normal poll tick.

## Event types

### `started`

A new live window appears.

Trigger:

- current snapshot has a `windowId` not present in the previous snapshot;
- current task is not dead.

Delivery:

- UI status: updated
- UI notice: yes
- conversation message: no
- agent turn: no

`started` is suppressed from conversation messages because helper output usually already shows launch success.

### `exited`

A task is observed as dead.

Triggers:

- a previously running task becomes `dead === true`;
- after baseline, a newly observed task is already dead.

Delivery:

- UI status: updated
- UI notice: no
- conversation message: yes
- agent turn: yes, as `followUp`

Messages:

```text
tmux task @12 (task-name) exited with code 0
tmux task @12 (task-name) exited with code 2
tmux task @12 (task-name) exited with unknown code
```

Recent output is included when available, limited to the last few useful lines.

### `notify`

A task emitted a terminal bell.

Triggers:

- hook-maintained bell count increases;
- fallback: tmux `window_bell_flag` changes from false to true;
- after baseline, a newly observed task already has bell state.

Delivery:

- UI status: updated
- UI notice: no
- conversation message: yes
- agent turn: yes, as `followUp`

Message:

```text
tmux task @12 (task-name) sent a terminal notification
```

The hook-maintained counter avoids missing repeated bells when tmux's sticky bell flag remains set.

### `input`

A live task appears blocked on an interactive prompt.

Required conditions:

- pane state is known;
- pane id exists;
- task is not dead;
- output preview is unchanged across consecutive polls;
- the same prompt can be extracted from the output.

Prompt examples include:

- `[y/N]`
- `(y/n)`
- `password:`
- `Press Enter to continue`
- `Select an option`
- `choice:`
- `continue?`

Delivery:

- UI status: updated
- UI notice: no
- conversation message: yes
- agent turn: yes, as `followUp`

Message:

```text
tmux task @12 (task-name) is waiting for input: Proceed? [y/N]
```

Repeated input notifications are deduped by `windowId + prompt`.

### `disappeared`

A previously live window disappears without first being observed as a dead pane.

Common causes:

- user killed the window;
- task slot was replaced;
- tmux session/window changed externally.

Delivery:

- UI status: updated
- UI notice: no
- conversation message: yes
- agent turn: yes, as `followUp`

Message:

```text
tmux task @12 (task-name) disappeared from session
```

Dead-window cleanup does not produce `disappeared`.

## Delivery rules

After every snapshot, `handleActiveSnapshot(...)`:

1. installs the bell hook if needed;
2. diffs the previous and current snapshots;
3. stores the current snapshot as the next baseline;
4. dedupes repeated input events;
5. updates the status line;
6. chooses UI notice or conversation message.

Delivery matrix:

| Event set | Delivery | Triggers agent turn? |
|---|---|---|
| only `started` | `ctx.ui.notify(...)` | No |
| `exited` / `notify` / `input` / `disappeared` | `pi.sendMessage(...)` with `[tmux-task notification]` | Yes, as `followUp` |
| historical active sessions at startup | `ctx.ui.notify(...)` | No |
| stale inactive cleanup at startup | `ctx.ui.notify(...)` | No |
| `/tmux-tasks` TUI actions | panel UI or `ctx.ui.notify(...)` | No |

Conversation-visible task event messages include:

```ts
{
  customType: "tmux-task-event",
  details: {
    source: "extension",
    notUserInput: true,
    sessionId,
    sessionName,
    level,
    events,
  }
}
```

The `followUp` delivery mode means task events do not interrupt an active agent turn; they are handled after the current work finishes.

## Event matrix

| Event | Trigger summary | UI status | UI notice | Conversation message | Agent turn |
|---|---|---:|---:|---:|---:|
| `started` | new live `windowId` | yes | yes | no | no |
| `exited` | task becomes dead | yes | no | yes | yes, follow-up |
| `notify` | bell count/flag changes | yes | no | yes | yes, follow-up |
| `input` | stable prompt across polls | yes | no | yes | yes, follow-up |
| `disappeared` | live window disappears | yes | no | yes | yes, follow-up |

## Important edge cases

- A missing session hides the status line and produces no events by itself.
- First observation is baseline, not a replay of old state.
- A task without known live pane state cannot produce `input`.
- Dead task output that looks like a prompt cannot produce `input`.
- Dead-window cleanup is expected cleanup, not disappearance.
- Same task name with a different `windowId` is treated as a new task instance.
- Multi-pane windows are best-effort and may not perfectly represent complex manual tmux layouts.
