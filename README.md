# pi-tmux-task

`pi-tmux-task` is a Pi extension package for managing background tasks in the current Pi conversation.

It is useful when Pi needs to run work that should continue in the background, such as:

- development servers;
- watch commands;
- long-running tests, builds, or scans;
- log tails;
- delayed follow-up checks;
- parallel background subtasks.

The package uses `tmux` underneath, but users do not need to manage tmux sessions directly. In normal use, just ask Pi to run something as a background task.

[中文说明](README_ZH.md)

## Features

- **Background task convention**: one Pi conversation maps to one tmux task session; one logical task maps to one tmux window.
- **Task notifications**: task exit, terminal bell, input wait, or unexpected disappearance can notify the active Pi conversation.
- **Task inspection and management**: `/tmux-tasks` shows tasks, previews output, prunes exited task windows, and can kill tasks.
- **Conversation isolation**: different Pi conversations use different task sessions.
- **Automatic cleanup**: inactive task sessions are cleaned up when safe; active tasks are preserved.

## Included resources

- **Pi extension**: `src/index.ts`
  - injects `PI_TMUX_SESSION` for the current conversation;
  - polls tmux task state;
  - sends task event notifications;
  - registers `/tmux-tasks`.

- **Skill**: `skills/tmux-task-manager/SKILL.md`
  - teaches the agent when to use background tasks;
  - defines task naming, inspection, notification handling, and cleanup rules.

- **Skill helper script**: `skills/tmux-task-manager/tmux-task-run.sh`
  - bundled with the skill;
  - called by the agent via the skill-relative path;
  - not intended as a user-facing global command.

- **Slash command**: `/tmux-tasks`
  - user-facing command for viewing and managing background tasks in the current Pi conversation.

## Usage

After installation, ask Pi for background work in natural language:

```text
Start the dev server in the background.
```

```text
Run the long test suite and tell me when it finishes.
```

```text
Watch the worker logs and notify me if there is an error.
```

The original footer status area shows `tmux:5-3-1`. The fields are total-running-failed. Zero counts and their preceding hyphens are omitted; an empty task list hides the status. Running includes tasks waiting for input, tasks with notifications, and panes whose state is not yet confirmed. Failed counts only confirmed nonzero exits. The prefix, total, and hyphens use the same dim color as the surrounding usage text; running counts are yellow and failed counts are red. Press **Alt+T** in either terminal mode to open the task panel. With the inline metrics footer integration, clicking the tmux status in fullscreen mode opens the same task panel. The default Pi footer is text-only; use Alt+T there. Placement follows the active footer: Pi’s default footer uses a separate status row, while an inline footer can show it in the usage row. When testing with `--no-extensions`, explicitly load your inline footer extension with another `-e` to preserve that layout. The panel shows all individual task states and detailed status counts. The overview disappears when the task session no longer exists. Requires Pi 1.4.0 or newer.

You can also view current background tasks with the command:

```text
/tmux-tasks
```

Prune exited task windows:

```text
/tmux-tasks prune-dead
```

Kill all background tasks for the current conversation:

```text
/tmux-tasks kill-all
```

## Installation

```bash
pi install npm:pi-tmux-task
```

Pin a version:

```bash
pi install npm:pi-tmux-task@0.2.0
```

Install locally for a project:

```bash
pi install -l npm:pi-tmux-task
```

Try it for one Pi run:

```bash
pi -e npm:pi-tmux-task
```

`tmux` must be available on the system `PATH`.

## Documentation

- [Architecture and lifecycle](docs/architecture.md)
- [Task event flow](docs/tmux-task-event-flow.md)

## Development

```bash
npm install
npm run check
```

Pi loads the TypeScript extension source directly; there is no separate build step.

## License

MIT. See [LICENSE](LICENSE).
