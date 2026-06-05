import assert from 'node:assert/strict';
import { taskFromStartedOutput } from '../src/index.ts';

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
console.log('index function tests passed');
