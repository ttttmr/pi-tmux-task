# Trigger eval review set

Skill: tmux-task-manager

This set now contains 35 realistic prompts:
- 14 should trigger
- 21 should not trigger

## Coverage

### Should trigger
- long-running, continuous/maintained, monitoring, or change-watching work
- waiting on long-running work that should be routed to a managed task
- task start / rerun / inspect / notification handling
- rerun / reuse / naming semantics

### Should not trigger
- generic tmux tutorials and concept questions
- generic shell/scripting/admin tasks, including generic `sleep` syntax questions
- explicit non-tmux choices such as nohup/systemd/foreground execution
- inspecting or attaching to remote tmux sessions (waiting on a remote long job does trigger)
- extension implementation tasks rather than operator workflow

## Notes
The near-miss negatives are intentionally tricky. Several mention tmux, background processes, bell/notification, or project tasks, but they should still stay out of this skill because they are not asking for this project's task-management convention.
