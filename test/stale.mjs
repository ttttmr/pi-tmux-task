import assert from 'node:assert/strict';
import {
  attachPiSessionTitlesToStaleTmuxSessions,
  filterSameProjectTmuxSessions,
  formatStaleTmuxSessionNotice,
  resolvePiSessionTitle,
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

assert.equal(resolvePiSessionTitle('Admin split', 'first message'), 'Admin split');
assert.equal(resolvePiSessionTitle('   ', 'Continue  chat\nreminder'), 'Continue chat reminder');
assert.equal(resolvePiSessionTitle(undefined, '(no messages)'), undefined);
assert.equal(resolvePiSessionTitle(undefined, undefined), undefined);
assert.equal(resolvePiSessionTitle(undefined, 'x'.repeat(100)), `${'x'.repeat(79)}…`);

const activeWithPiSessionTitle = attachPiSessionTitlesToStaleTmuxSessions(
  [
    { sessionName: 'pi-repo-aaa', activeCount: 1, deadCount: 0, taskNames: ['web'] },
    { sessionName: 'pi-repo-bbb', activeCount: 1, deadCount: 0, taskNames: ['api'] },
    { sessionName: 'pi-repo-ccc', activeCount: 1, deadCount: 0, taskNames: ['worker'] },
  ],
  new Map([
    ['pi-repo-aaa', 'Admin split'],
    ['pi-repo-bbb', 'Continue chat reminder'],
    ['pi-repo-ccc', '   '],
    ['pi-repo-unrelated', 'Not listed'],
  ]),
);
assert.deepEqual(activeWithPiSessionTitle, [
  { sessionName: 'pi-repo-aaa', activeCount: 1, deadCount: 0, taskNames: ['web'], piSessionTitle: 'Admin split' },
  { sessionName: 'pi-repo-bbb', activeCount: 1, deadCount: 0, taskNames: ['api'], piSessionTitle: 'Continue chat reminder' },
  { sessionName: 'pi-repo-ccc', activeCount: 1, deadCount: 0, taskNames: ['worker'] },
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
assert.equal(
  formatStaleTmuxSessionNotice('repo', 0, activeWithPiSessionTitle.slice(0, 2)),
  [
    'Existing tmux task session(s) for repo still have active tasks:',
    '- pi-repo-aaa (Admin split): 1 active (web)',
    '- pi-repo-bbb (Continue chat reminder): 1 active (api)',
  ].join('\n'),
);

console.log('stale session tests passed');
