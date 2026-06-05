# tmux-task-manager iteration 2 benchmark

## Summary
Compared the iteration-2 old skill baseline against the current task-management-framed skill on 5 evals:
- long-running-dev
- rerun-api
- input-waiting
- disappeared
- terminal-notification

## Result overview
- **old-skill**: 20 / 21 assertions passed (95.2%)
- **new-skill**: 21 / 21 assertions passed (100.0%)

## Main differences

### 1. New skill is more clearly about task management
- The new skill more consistently frames answers around background task lifecycle and task identity.
- The old skill is still strong, but it more often slips into tmux-centric wording.

### 2. Biggest gain is in the start / manage framing
- In the long-running-dev case, the new skill better centers the answer on managing a persistent background task without blocking the current turn.
- The old skill still tends to emit a larger tmux-heavy startup recipe.

### 3. Rerun and notification handling remain strong
- Both versions now perform well on rerun, input-waiting, disappeared, and terminal-notification handling.
- The new version has the cleaner product framing because it treats tmux as the underlying runtime rather than the main topic.

## Timing notes
- Timing differences in this iteration are small and not especially meaningful.
- The more important signal is wording and framing quality, not raw latency.

## Recommendation
Keep the current task-management-framed skill direction.

If iterating again, focus on:
1. polishing AGENTS.md and surrounding docs to match the same task-management framing
2. possibly adding one more eval that explicitly checks whether answers avoid centering tmux when the prompt does not mention it
3. leaving the skill body otherwise stable
