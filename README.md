# pi-tmux-task

Pi extension package for Pi-session-scoped background task management with tmux.

It does **not** implement a scheduler or replace tmux. It gives Pi a simple convention:

- **one Pi session = one tmux task session**;
- **one logical task = one named tmux window / task slot**;
- long-running work is started with helper scripts and observed by the Pi extension.

## What you get

- Agent skill: `tmux-task-manager`
  - Guides the agent to use background tasks for dev servers, watch commands, long tests, scans, reminders, recurring checks, and log tails.
- Slash command: `/tmux-tasks`
  - Opens a task panel in TUI mode, or prints a text summary without TUI.
- Bash integration:
  - Every Pi `bash` call receives `PI_TMUX_SESSION=<current-session-task-session>`.
- Helper CLIs:
  - `pi-tmux-session-name`
  - `pi-tmux-task-run`
- Task notifications:
  - Task exit, terminal bell, input wait, and unexpected disappearance can notify the active Pi conversation.

## Session naming

The tmux session name is:

```text
pi-<project-slug>-<session-id>
```

Example:

```text
pi-pi-tmux-task-019e4988-b257-7be4-a6f7-b945f8fb7d36
```

`project-slug` comes from the current directory basename. The full Pi session id scopes tasks to one Pi conversation.

Because the slug uses only the basename, different checkout paths with the same directory name share the same project prefix. Startup cleanup and notices are best-effort by project slug, not strict absolute-path ownership.

## Installation

Install the package with Pi:

```bash
pi install npm:pi-tmux-task
```

To pin a specific version:

```bash
pi install npm:pi-tmux-task@0.1.0
```

For project-local installation, write the package entry to `.pi/settings.json`:

```bash
pi install -l npm:pi-tmux-task
```

You can also try the package for one Pi run without saving it to settings:

```bash
pi -e npm:pi-tmux-task
```

This package requires `tmux` to be available on `PATH`. After installation, Pi loads the bundled extension and the `tmux-task-manager` skill from the package.

## Usage

Ask Pi to run long-lived work in the background, for example:

```text
Start the dev server as a background task.
```

The bundled skill guides the agent to use a Pi-session-scoped tmux session for dev servers, watch commands, long tests, scans, reminders, recurring checks, and log tails.

Start or rerun a background task manually:

```bash
pi-tmux-task-run api-server -- 'npm run dev'
```

If running from this repository without installing the package bin links:

```bash
./skills/tmux-task-manager/tmux-task-run.sh api-server -- 'npm run dev'
```

When running outside Pi, compute and export the session first:

```bash
export PI_TMUX_SESSION="$(pi-tmux-session-name "$PWD" '<pi-session-id>')"
pi-tmux-task-run api-server -- 'npm run dev'
```

Inside Pi, the extension injects `PI_TMUX_SESSION` into bash tool calls, so helper commands automatically target the current conversation's task session.

Inspect tasks in Pi:

```text
/tmux-tasks
```

Clean dead/exited task windows without touching running tasks:

```text
/tmux-tasks prune-dead
```

Kill the entire current Pi task session after confirmation:

```text
/tmux-tasks kill-all
```

Inspect tmux directly:

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
tmux capture-pane -pt @12 -S -80
```

## Cleanup behavior

Pi shutdown does **not** kill active tmux tasks.

On the next Pi startup, the extension scans same-project historical tmux sessions:

- sessions with no active tasks are cleaned automatically;
- sessions with active tasks are left running and reported to the user with a UI notice;
- these startup notices are not sent to the agent conversation and do not trigger an agent turn.

Manual cleanup remains available through `/tmux-tasks prune-dead`, `/tmux-tasks kill-all`, or direct tmux commands.

## Documentation

- [Architecture and lifecycle](docs/architecture.md)
- [Task event flow](docs/tmux-task-event-flow.md)

## License

MIT. See [LICENSE](LICENSE).

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
```

There is no separate build step; Pi loads the TypeScript extension source directly.
