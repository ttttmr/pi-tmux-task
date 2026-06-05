# Trigger eval review set

Skill: tmux-task-manager

This set now contains 30 realistic prompts:
- 10 should trigger
- 20 should not trigger

## Coverage

### Should trigger
- long-running background work in the current project
- project task-management requests backed by tmux under the hood
- rerun / reuse / notification / naming semantics

### Should not trigger
- generic tmux tutorials and concept questions
- generic shell/scripting/admin tasks
- explicit non-tmux choices such as nohup/systemd/foreground execution
- remote tmux usage unrelated to the current project convention
- extension implementation tasks rather than operator workflow

## Notes
The near-miss negatives are intentionally tricky. Several mention tmux, background processes, bell/notification, or project tasks, but they should still stay out of this skill because they are not asking for this project's task-management convention.
