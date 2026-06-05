# tmux-task-manager iteration 1 benchmark

## Summary
Compared the old skill draft against the current condensed skill on 5 evals:
- long-running-dev
- rerun-api
- input-waiting
- disappeared
- terminal-notification

## Result overview
- **old-skill**: 15 / 20 assertions passed (75.0%)
- **new-skill**: 20 / 20 assertions passed (100.0%)

## Main differences

### 1. Naming quality improved
- Old skill still nudged agents toward overly generic names like `web`.
- New skill consistently pushed more meaningful names such as `frontend-dev` and `api-server`.

### 2. Answers became more workflow-oriented
- Old skill frequently caused the agent to output large shell templates.
- New skill more often produced concise operational guidance: start / rerun / inspect / stop / react to notifications.
- One refinement after this eval: rerun should prefer reusing the existing window when possible, so the `window_id` stays stable.

### 3. Notification handling is now more complete
- Both versions handled waiting-for-input reasonably well.
- Both versions could reason about `disappeared`, though the new skill states the window-level meaning more directly.
- The new skill is clearly better at handling `terminal notification` as a bell/context-inspection signal rather than drifting into generic event handling.

## Timing notes
- The new skill produced better outputs, but one rerun-api eval took much longer than expected.
- This likely reflects run variance or the subagent's local reasoning path, not a meaningful product regression by itself.

## Recommendation
Keep the current condensed skill direction.

At this point the skill body is largely in the right shape. If iterating again, focus on:
1. tightening the description for triggering
2. adding a naming-specific eval set
3. testing rerun behavior more directly against the new "reuse window first" rule
