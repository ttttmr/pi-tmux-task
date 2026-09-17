# Trigger analysis for tmux-task-manager

## Current description
The description is now organized around task situations:
- long-running, continuous, monitoring, change-watching, delayed/reminder, and maintained-service work
- run as a managed background task that reports back on finish / change / ring / input / disappearance
- start / rerun / inspect / task-state interpretation
- tmux as the underlying runtime rather than the main topic
- explicit exclusion of short foreground commands, generic tmux/shell help, and user-requested foreground or non-tmux mechanisms

## Intended should-trigger clusters
1. Long-running service or watch task in current project
2. Long-running scan / tail / monitor loop
3. Multiple concurrent background tasks in same project
4. Rerun / reuse / replace behavior for an existing project background task
5. Meaningful task naming
6. Notification interpretation: failed / waiting-for-input / terminal notification / disappeared
7. Waiting on long-running work (remote/ssh job, container, service, log tail) that should be routed to a managed task instead of foreground sleep

## Intended should-not-trigger clusters
1. Generic tmux education
2. Generic shell/awk help
3. Short foreground one-shot commands
4. Global tmux administration
5. UI or extension implementation work on this package
6. Unrelated scheduling; inspecting or attaching to remote tmux sessions rather than waiting on a long-running remote job (waiting on a remote job *does* trigger, see should-trigger cluster 7)
7. Explicit non-tmux alternatives such as nohup, systemd, or foreground execution
8. Generic tmux scripting or concept questions about bells, ids, panes, or shortcuts

## Manual review of likely trigger behavior

### Strong positives
The current description should strongly match prompts about:
- running a service/watch/scan in the background within the current project
- keeping task names meaningful under a shared project task session backed by tmux
- handling reruns or task-state notifications for those project tasks

### Strong negatives
The current description should strongly avoid:
- tmux tutorials
- shell debugging
- UI implementation tasks
- explicit requests to use something other than tmux

### Borderline / watch items
These are the main edge cases worth watching in future automated trigger tests:
1. prompts that mention tmux heavily but are really generic tmux questions
2. prompts that mention background work but explicitly prefer nohup/systemd/foreground execution
3. prompts about extension internals (`poller`, `tasks panel`, `events.ts`) that contain tmux terminology but are not operator workflow requests
4. prompts about remote/production tmux sessions instead of the current local project convention
5. prompts that mention a failed/disappeared task but explicitly ask to ignore tmux handling and focus only on code changes

## Recommendation
The current description has a much better trigger boundary than the earlier draft. It reads more like a use-when / trigger rule, emphasizes project-scoped task management, and keeps tmux as an implementation detail rather than the primary concept.

The next rigorous step would be a real trigger benchmark loop. Short of that, this 35-prompt set is a good manual regression suite.
