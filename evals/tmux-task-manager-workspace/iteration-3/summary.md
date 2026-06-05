# Iteration 3 invocation + usage results

This iteration measures two things:
1. whether the skill was actually invoked
2. whether the resulting behavior was correct

## Result table

| Eval | Should Trigger | Actually Triggered | Read SKILL.md | Used Correctly | Notes |
|------|----------------|--------------------|---------------|----------------|-------|
| trigger-start-background-dev | Yes | Yes | Yes | Yes | Agent discovered `skills/tmux-task-manager/SKILL.md` and used the background-task-management framing. |
| trigger-rerun-existing-task | Yes | Yes | Yes | Yes | Agent read the skill and correctly preferred reusing the existing task slot to keep identity stable. |
| trigger-input-waiting | Yes | Yes | Yes | Yes | Agent read the skill and correctly treated the task as alive-but-blocked, prioritizing inspect over rerun. |
| trigger-disappeared | Yes | No | No | Yes | Agent answered correctly, but did so by reading `AGENTS.md` and runtime code/docs instead of `SKILL.md`. |
| no-trigger-generic-tmux-help | No | No | No | Yes | Agent did not read the skill and correctly answered as generic tmux help. |
| no-trigger-short-foreground | No | No | No | Yes | Agent did not read the skill and correctly executed the foreground command directly. |

## Summary

### Trigger quality
- 3 / 4 intended-positive prompts actually triggered the skill.
- 2 / 2 intended-negative prompts correctly did **not** trigger the skill.

### Correct-usage quality
- For the prompts that did trigger, the skill was used correctly.
- One positive case (`trigger-disappeared`) was answered correctly without triggering the skill, which means the behavior was right but invocation was missed.

## Main finding
The current skill is **being triggered in most of the important positive cases**, and when it is triggered, the usage is correct.

The main miss is `disappeared`: the agent found enough information in `AGENTS.md` and source files to answer without reading the skill. That means the skill boundary is reasonable, but the repository context is strong enough to partially bypass invocation.

## Important caveat
This repo already contains overlapping guidance in:
- `AGENTS.md`
- `PLAN.md`
- source files such as `src/tmux/events.ts`

So iteration 3 is a **realistic project-context eval**, not a pure isolated trigger test. It measures whether the skill is used in the presence of other repo context, not whether the description alone is sufficient in isolation.

## Recommendation
- Keep the current description and body direction.
- If you want stricter invocation measurement, run the same prompts in a reduced-context environment where `AGENTS.md` and repo docs are hidden from the evaluator.
- For this repo specifically, the only notable invocation miss to watch is the `disappeared` case.
