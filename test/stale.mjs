import assert from 'node:assert/strict';
import {
  filterSameProjectTmuxSessions,
  formatStaleTmuxSessionNotice,
  summarizeStaleTmuxSessions,
} from '../src/tmux/stale.ts';

function task(overrides = {}) {
  return {
    windowId: '@1',
    windowName: 'web',
    paneStateKnown: true,
    dead: false,
    bell: false,
    ...overrides,
  };
}

function snapshot(sessionName, tasks, exists = true) {
  return {
    sessionName,
    exists,
    tasks,
    capturedAt: Date.now(),
  };
}

assert.deepEqual(
  filterSameProjectTmuxSessions(
    [
      'pi-pi-tmux-task-current',
      'pi-pi-tmux-task-old-a',
      'pi-other-old',
      'manual',
      'pi-pi-tmux-task-old-b',
    ],
    'pi-tmux-task',
    'pi-pi-tmux-task-current',
  ),
  ['pi-pi-tmux-task-old-a', 'pi-pi-tmux-task-old-b'],
);

const plan = summarizeStaleTmuxSessions([
  snapshot('missing', [], false),
  snapshot('empty', []),
  snapshot('dead-only', [task({ dead: true, windowName: 'done' })]),
  snapshot('active', [task({ windowName: 'api' }), task({ windowName: 'web' }), task({ dead: true, windowName: 'old' })]),
]);
assert.deepEqual(plan.inactive, ['dead-only', 'empty']);
assert.deepEqual(plan.active, [
  {
    sessionName: 'active',
    activeCount: 2,
    deadCount: 1,
    taskNames: ['api', 'web'],
  },
]);

assert.equal(formatStaleTmuxSessionNotice('repo', 0, []), undefined);
assert.equal(formatStaleTmuxSessionNotice('repo', 2, []), 'Cleaned 2 inactive tmux task session(s) for repo.');
assert.equal(
  formatStaleTmuxSessionNotice('repo', 1, plan.active),
  [
    'Cleaned 1 inactive tmux task session(s) for repo.',
    'Existing tmux task session(s) for repo still have active tasks:',
    '- active: 2 active, 1 dead (api, web)',
  ].join('\n'),
);
assert.equal(
  formatStaleTmuxSessionNotice('repo', 0, [
    {
      sessionName: 'many',
      activeCount: 4,
      deadCount: 0,
      taskNames: ['a', 'b', 'c', 'd'],
    },
  ]),
  ['Existing tmux task session(s) for repo still have active tasks:', '- many: 4 active (a, b, c, +1 more)'].join('\n'),
);

console.log('stale session tests passed');
