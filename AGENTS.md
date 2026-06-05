# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-20  
**Updated:** 2026-05-22

## OVERVIEW
Project: **pi-tmux-task**

This repository is a **Pi extension package** for Pi-session-scoped background task management. It does not implement its own scheduler. Instead, it defines an agent-facing background-task convention and backs that convention with tmux plus extension-side observability.

### Core product idea
1. **Skill guidance for background task management**
   - Bundle a skill that teaches the agent when to treat work as a long-running background task instead of a foreground command.
   - Standardize on **one Pi session = one task tmux session** and **one logical task = one tmux window / task slot**.
   - Encourage meaningful task naming, reuse of the same task slot on rerun when possible, and follow-up by `window_id` when precise low-level targeting is useful.

2. **Code-level runtime support**
   - Compute a stable Pi-session-scoped tmux session name and inject it into bash calls as `PI_TMUX_SESSION`.
   - Provide UI surfaces to inspect and manage tmux task windows.
   - Poll tmux state, diff snapshots into semantic task events, and push plain-text notifications back into the active Pi conversation.

### Current stack
- **Language:** TypeScript + ESM
- **Runtime:** Node.js
- **Host framework:** `@earendil-works/pi-coding-agent`
- **UI:** `@earendil-works/pi-tui`
- **Shell integration:** tmux + bash helper scripts
- **Tests:** lightweight Node/bash scripts under `test/`

## STRUCTURE
```text
.
├── AGENTS.md
├── docs/
│   ├── architecture.md
│   └── tmux-task-event-flow.md
├── package.json
├── skills/
│   └── tmux-task-manager/
│       ├── SKILL.md
│       ├── tmux-session-name.sh
│       └── tmux-task-run.sh
├── src/
│   ├── context.ts
│   ├── index.ts
│   ├── types.ts
│   ├── tmux/
│   │   ├── commands.ts
│   │   ├── events.ts
│   │   ├── parse.ts
│   │   ├── poller.ts
│   │   └── snapshot.ts
│   └── ui/
│       └── tasks-panel.ts
└── test/
    ├── context.mjs
    ├── events.mjs
    ├── session-name.sh
    └── tmux-integration.sh
```

### Key files
- `package.json`: Pi package metadata. Declares the extension entry and bundled skills.
- `docs/architecture.md`: high-level architecture, runtime phases, lifecycle, and cleanup model.
- `docs/tmux-task-event-flow.md`: event-flow notes for polling, diffing, notifications, and `/tmux-tasks`.
- `skills/tmux-task-manager/SKILL.md`: the agent-facing background-task-management contract.
- `skills/tmux-task-manager/tmux-session-name.sh`: shell helper to deterministically compute the tmux session name.
- `skills/tmux-task-manager/tmux-task-run.sh`: helper to start or rerun a named task slot with explicit `PI_TMUX_SESSION` and `remain-on-exit`.
- `src/index.ts`: extension entry point; wires session lifecycle, env injection, polling, notifications, and `/tmux-tasks` command.
- `src/context.ts`: session-name computation logic shared by runtime/tests.
- `src/tmux/commands.ts`: tmux subprocess wrappers.
- `src/tmux/parse.ts`: parsing of `list-windows` / `list-panes` output.
- `src/tmux/snapshot.ts`: collects the current tmux session snapshot.
- `src/tmux/events.ts`: snapshot diffing and semantic event generation.
- `src/tmux/poller.ts`: periodic polling loop.
- `src/ui/tasks-panel.ts`: TUI panel for viewing, refreshing, and killing task windows.
- `test/`: smoke tests for session naming, tmux integration, and event behavior.

## CORE FUNCTIONALITY

### 1) Skill: guide background task management
The extension relies on a bundled skill instead of a custom scheduler.

Important conventions encoded by the skill:
- Treat long-running or non-blocking work as a background task management problem, not a generic tmux tutorial problem.
- Reuse `$PI_TMUX_SESSION` if available.
- Fall back to the helper script if the env var is missing.
- Use **one task slot per logical task**.
- Give tasks concise but meaningful stable names like `frontend-dev`, `api-server`, `worker-sync`, `scan-deps`, `tests-watch`.
- When rerunning the same task, prefer reusing the existing task slot so the `window_id` stays stable when possible; replace the slot only when reuse is not practical.
- The same skill also covers delayed and recurring background work, such as "continue this in 10 minutes" or "check this every 10 minutes and notify me".
- Use tmux as the underlying runtime and inspection mechanism when needed.
- Intended trigger boundary: long-running background task handling should trigger it; generic tmux help and short foreground commands should not.

### 2) Pi-session-scoped tmux session naming
Implemented mainly in:
- `src/context.ts`
- `src/index.ts`
- `skills/tmux-task-manager/tmux-session-name.sh`

Behavior:
- Compute a stable name from `ctx.cwd` plus the current Pi session id.
- Format is:
  - `pi-<project-slug>-<session-id>`
- `project-slug` is derived from the basename of `ctx.cwd`.
- `session-id` is the full Pi session id.
- Since `project-slug` uses only the basename, historical-session cleanup/notice behavior is best-effort by project slug, not strict absolute-path ownership.
- The extension prepends every bash tool call with `export PI_TMUX_SESSION=...` as the single task-routing variable.
- The task helper runs tasks from the directory where it is invoked, so a command can `cd` into a worktree or subdirectory before calling the helper.
- The task helper explicitly exports the same `PI_TMUX_SESSION` inside task panes so they do not inherit stale tmux server environment values.
- The helper shell script can compute the same name from `pwd` or from an absolute path argument plus a Pi session id for manual use outside Pi.

Key design rule:
- Session naming is **Pi-session-scoped**.
- Resuming the same Pi session observes the same task tmux session.
- A different Pi conversation in the same working directory gets a distinct tmux task session.

### 3) UI for viewing and managing tasks
Implemented mainly in:
- `src/index.ts`
- `src/ui/tasks-panel.ts`

Current UI surfaces:
- **Status area**: shows `tmux: N tasks` only when the configured task tmux session exists.
- **Command**: `/tmux-tasks`
  - list windows/tasks
  - show current command and running/dead state
  - preview recent pane output
  - refresh manually
  - kill selected task window

Non-UI fallback:
- If no TUI is available, the command emits a text summary notification instead.

### 4) Polling + semantic event push into the agent session
Implemented mainly in:
- `src/tmux/commands.ts`
- `src/tmux/parse.ts`
- `src/tmux/snapshot.ts`
- `src/tmux/events.ts`
- `src/tmux/poller.ts`
- `src/index.ts`

Polling model:
- On `session_start`, the extension computes the configured tmux task session name, starts a poller, and scans same-project historical tmux task sessions.
- Historical tmux task sessions with no active tasks are automatically killed; historical sessions with active tasks are left running and reported to the user via `ctx.ui.notify(...)`, not `pi.sendMessage(...)`.
- Poll interval is currently **2000ms**.
- The poller reads tmux state for the configured task session only.
- It builds snapshots from:
  - `tmux has-session`
  - `tmux list-windows`
  - `tmux list-panes`
  - `tmux capture-pane`

Snapshot semantics:
- One observed task corresponds to one tmux window.
- The task tracks fields such as:
  - `windowId`
  - `windowName`
  - `paneId`
  - `currentCommand`
  - `dead`
  - `exitCode`
  - `bell`
  - `outputPreview`

Diff/event semantics:
- `started`
- `exited`
- `notify`
- `input`
- `disappeared`

Notification behavior:
- Render human-readable strings like:
  - `tmux task @12 (frontend-dev) exited with code 0`
  - `tmux task @12 (frontend-dev) sent a terminal notification`
  - `tmux task @12 (frontend-dev) is waiting for input: Proceed? [y/N]`
  - `tmux task @12 (frontend-dev) disappeared from session`
- Suppress `started` messages from the conversation; task launch success is expected to be visible in the initiating tool output.
- Events sent to the conversation are posted with `pi.sendMessage(...)` and auto-trigger an agent turn.
- `started` events are surfaced only as UI notices.
- Input-waiting notifications are deduplicated to avoid repeated spam.
- Note: `disappeared` means the previously observed tmux window is gone from the session; it is a window-level disappearance, not necessarily a normal process exit.

## COMMANDS
| Action | Command |
|--------|---------|
| Install dependencies | `npm install` |
| Run checks/tests | `npm run check` |
| Inspect package metadata | `node -e "console.log(require('./package.json'))"` *(CommonJS shells only; package itself is ESM)* |
| Compute session name | `pi-tmux-session-name "$PWD" "<pi-session-id>"` |
| Start or rerun a task | `PI_TMUX_SESSION=... pi-tmux-task-run <task-name> -- <command>` |

### Notes on running
- There is **no dedicated build script** right now.
- The package is intended to be consumed by Pi via `package.json -> pi.extensions` and `pi.skills`.
- TypeScript sources are referenced directly from `./src/index.ts`.

## CODING STANDARDS
- **Module style:** ESM (`"type": "module"`).
- **TypeScript style:** simple typed functions, explicit domain types, minimal abstraction.
- **Architecture style:** small focused modules by responsibility:
  - context/session naming
  - tmux command execution
  - parsing
  - snapshot collection
  - diff/event generation
  - polling
  - UI rendering
- **Error handling:** command wrappers return safe fallbacks instead of throwing deep into the flow.
- **UI style:** compact TUI components with keyboard-driven interaction.
- **Testing style:** small behavior-oriented smoke tests instead of a full test framework.

## WHERE TO LOOK
- **Extension entry/runtime wiring:** `src/index.ts`
- **Session-name logic:** `src/context.ts`
- **Tmux command wrappers:** `src/tmux/commands.ts`
- **Snapshot/event model:** `src/tmux/snapshot.ts`, `src/tmux/events.ts`
- **Task-management UI:** `src/ui/tasks-panel.ts`
- **Agent instruction contract / background task guidance:** `skills/tmux-task-manager/SKILL.md`
- **Architecture documentation:** `docs/architecture.md`
- **Event-flow documentation:** `docs/tmux-task-event-flow.md`
- **Tests:** `test/`

## IMPORTANT WORKFLOWS

### Add or change session naming
Touch:
- `src/context.ts`
- `skills/tmux-task-manager/tmux-session-name.sh`
- `test/context.mjs`
- `test/session-name.sh`

These must stay consistent.

### Add or change task event behavior
Touch:
- `src/tmux/events.ts`
- possibly `src/tmux/snapshot.ts`
- `test/events.mjs`
- `docs/tmux-task-event-flow.md`

Keep message wording and event semantics aligned with the skill documentation.

### Add or change task UI
Touch:
- `src/ui/tasks-panel.ts`
- `src/index.ts`

Keep the non-UI fallback in sync.

### Change the agent contract
Touch:
- `skills/tmux-task-manager/SKILL.md`
- extension code if behavior changes are no longer just documentation

The skill is part of the product surface, not just an internal note.

## NOTES / GOTCHAS
- This package is intentionally an **observer + convention** layer over tmux, not a scheduler.
- The agent-facing abstraction is background task management; tmux is the underlying runtime.
- The extension assumes **one Pi-session task tmux session** and **one task per tmux window / task slot**.
- Task identity is centered on **`windowId` internally** and **`windowName` for UX**.
- Polling only targets the configured task session, not all tmux sessions on the machine. Startup historical-session cleanup scans only tmux sessions whose names start with the current `pi-<project-slug>-` prefix.
- The current snapshot logic effectively treats the first/primary pane as the task status source; multi-pane windows are best-effort only.
- The status indicator should disappear when the configured tmux task session does not exist.
- Session names must be tmux-safe; avoid `:` in the session name format.
- The helper scripts are part of the intended UX surface, not incidental utilities.
- `tmux-task-run.sh` requires an explicit `PI_TMUX_SESSION`; if it is missing, the agent should compute and export it first.
- If you change message wording, also review event tests, docs, and the skill text.
