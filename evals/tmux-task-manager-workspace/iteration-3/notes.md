# Iteration 3 notes

## Goal
Evaluate whether the current skill is actually invoked and whether it is used correctly after invocation.

## What is being measured
1. Did the agent trigger the skill at all?
2. Did the agent read `skills/tmux-task-manager/SKILL.md`?
3. If triggered, did it use the skill correctly?
4. For near-miss prompts, did it avoid triggering the skill?

## Method
- Run prompts naturally with the current project skills available.
- Do not explicitly instruct the subagent to read the skill.
- Save the final answer for each eval.
- Inspect the verbose transcript to see whether the skill file was read.
