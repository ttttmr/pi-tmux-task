import assert from 'node:assert/strict';
import { annotateManualKillEvents, taskFromStartedOutput } from '../src/index.ts';

const output = 'session=pi-project-hash-aaa\nwindow_id=@12\ntask=api-server\ncwd=/tmp/project\n';
const task = taskFromStartedOutput(output, 'pi-project-hash-aaa');
assert.equal(task.windowId, '@12');
assert.equal(task.windowName, 'api-server');
assert.equal(task.taskCwd, '/tmp/project');
assert.equal(task.paneId, undefined);
assert.equal(task.paneStateKnown, false);
assert.equal(taskFromStartedOutput(output, 'pi-project-hash-bbb'), undefined);
assert.equal(taskFromStartedOutput('window_id=@13\ntask=legacy\n', 'pi-project-hash-aaa'), undefined);
assert.equal(taskFromStartedOutput('window_id=@13\ntask=legacy\n')?.windowName, 'legacy');

const disappearedEvent = {
  type: 'disappeared',
  previous: {
    windowId: '@12',
    windowName: 'api-server',
    paneStateKnown: true,
    dead: false,
    bell: false,
  },
};
const manuallyKilledWindowIds = new Set(['@12']);
const annotated = annotateManualKillEvents([disappearedEvent], manuallyKilledWindowIds);
assert.equal(annotated[0].reason, 'user-killed');
assert.equal(manuallyKilledWindowIds.size, 0);
assert.equal(annotateManualKillEvents([disappearedEvent], manuallyKilledWindowIds)[0].reason, undefined);

const mixedEvents = annotateManualKillEvents(
  [
    disappearedEvent,
    { ...disappearedEvent, previous: { ...disappearedEvent.previous, windowId: '@13' } },
  ],
  new Set(['@13']),
);
assert.equal(mixedEvents[0].reason, undefined);
assert.equal(mixedEvents[1].reason, 'user-killed');
console.log('index function tests passed');
