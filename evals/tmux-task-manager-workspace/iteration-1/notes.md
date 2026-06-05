# Iteration 1 notes

## Goal
Compare the current tmux-task-manager skill draft with an improved version oriented around:
- stronger trigger phrasing
- clearer fallback path usage
- clearer runbook structure
- better distinction between when to use tmux vs not
- concise but explicit operator workflows: start/replace/inspect/kill/respond to notifications

## Planned eval dimensions
1. Does the skill strongly trigger on real requests involving long-running/background tasks?
2. Does it cause the agent to preserve the project-scoped session convention?
3. Does it teach replace semantics clearly?
4. Does it guide the model to respond well to task notifications, especially input-waiting?
5. Is it lean and free of distracting or accidental content?

## Simple qualitative rubric
For each eval prompt, compare old vs new skill on:
- actionability
- correctness vs codebase behavior
- trigger clarity
- brevity / focus
- mention of UI + notification semantics
