import assert from 'node:assert/strict';
import {
  diffTmuxSnapshots,
  extractInputPrompt,
  filterRepeatedInputEvents,
  formatTmuxTaskEvents,
  formatTmuxTaskNotice,
  getTmuxTaskEventLevel,
  getTmuxTaskMessageOptions,
  shouldTriggerTurnForTmuxTaskEvents,
} from '../src/tmux/events.ts';
import { parseListPanes, parseListWindows, TMUX_FIELD_SEPARATOR } from '../src/tmux/parse.ts';

function task(overrides = {}) {
  return {
    windowId: '@1',
    windowName: 'web',
    paneId: '%1',
    paneStateKnown: true,
    currentCommand: 'node',
    taskCwd: undefined,
    dead: false,
    exitCode: undefined,
    bell: false,
    bellCount: undefined,
    outputPreview: undefined,
    ...overrides,
  };
}

function snapshot(tasks, exists = true) {
  return {
    sessionName: 'pi-test-019e4988',
    exists,
    tasks,
    capturedAt: Date.now(),
  };
}

const eventHeader = '[tmux-task notification]';

assert.equal(parseListWindows(['web', '@1', '1', '2', '1', '3', 'npm run dev', '/tmp/project'].join(TMUX_FIELD_SEPARATOR))[0].windowId, '@1');
assert.equal(parseListPanes(['@1', 'web', '%1', '1', '0', 'bash', 'npm run dev'].join(TMUX_FIELD_SEPARATOR))[0].paneId, '%1');
assert.equal(parseListWindows('web_@1_1_2_1_3_npm run dev_/tmp/project')[0].windowId, '');

// first snapshot is passive: existing running/dead/bell tasks are observable state, not fresh events
assert.deepEqual(diffTmuxSnapshots(undefined, snapshot([task()])), []);
assert.deepEqual(diffTmuxSnapshots(undefined, snapshot([task({ dead: true, exitCode: 0 })])), []);
assert.deepEqual(diffTmuxSnapshots(undefined, snapshot([task({ bell: true, bellCount: 1 })])), []);

// started
let events = diffTmuxSnapshots(snapshot([]), snapshot([task()]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'started');
assert.equal(formatTmuxTaskEvents(events), undefined);
assert.equal(formatTmuxTaskNotice(events), 'tmux task @1 (web) started');
assert.equal(getTmuxTaskEventLevel(events), 'info');
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), false);

// exited with explicit code
events = diffTmuxSnapshots(snapshot([task()]), snapshot([task({ dead: true, exitCode: 0 })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'exited');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with code 0`);
assert.equal(formatTmuxTaskNotice(events), 'tmux task @1 (web) exited with code 0');
assert.equal(getTmuxTaskEventLevel(events), 'info');
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);
assert.deepEqual(getTmuxTaskMessageOptions(events), { triggerTurn: true, deliverAs: 'followUp' });

// non-zero exit is still a plain exit event with the code included
events = diffTmuxSnapshots(snapshot([task()]), snapshot([task({ dead: true, exitCode: 2 })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'exited');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with code 2`);
assert.equal(getTmuxTaskEventLevel(events), 'warning');
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);

// exited messages include recent output when available
events = diffTmuxSnapshots(snapshot([task()]), snapshot([task({ dead: true, exitCode: 1, outputPreview: 'line 1\nline 2\nline 3\nline 4' })]));
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with code 1\nrecent output:\n  line 2\n  line 3\n  line 4`);
assert.equal(getTmuxTaskEventLevel(events), 'warning');

// missing exit code should not be reported as code 0
events = diffTmuxSnapshots(snapshot([task()]), snapshot([task({ dead: true, exitCode: undefined })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'exited');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with unknown code`);

// bell / notify from tmux alert flag
events = diffTmuxSnapshots(snapshot([task({ bell: false })]), snapshot([task({ bell: true })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'notify');
assert.match(formatTmuxTaskEvents(events), /^\[tmux-task notification\]\ntmux task @1 \(web\) sent a terminal notification/);
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);

// bell / notify from hook-maintained counter, even when sticky bell flag is unchanged
events = diffTmuxSnapshots(snapshot([task({ bell: true, bellCount: 1 })]), snapshot([task({ bell: true, bellCount: 2 })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'notify');

// notify and exit observed in the same snapshot are ordered by runtime sequence and rendered once
events = diffTmuxSnapshots(
  snapshot([task({ bell: false, bellCount: 0 })]),
  snapshot([task({ dead: true, exitCode: 0, bell: true, bellCount: 1, outputPreview: 'wake up\nPane is dead (status 0)' })]),
);
assert.equal(events.length, 2);
assert.equal(events[0].type, 'notify');
assert.equal(events[1].type, 'exited');
assert.equal(
  formatTmuxTaskEvents(events),
  `${eventHeader}\ntmux task @1 (web) sent a terminal notification, then exited with code 0\nrecent output:\n  wake up\n  Pane is dead (status 0)`,
);
assert.equal(
  formatTmuxTaskNotice(events),
  `tmux task @1 (web) sent a terminal notification, then exited with code 0\nrecent output:\n  wake up\n  Pane is dead (status 0)`,
);

// input prompt extraction
const promptLine = 'Proceed with migration? [y/N]';
assert.equal(extractInputPrompt(`starting...\n${promptLine}`), promptLine);
assert.equal(extractInputPrompt('password:'), 'password:');
assert.equal(extractInputPrompt('Press Enter to continue'), 'Press Enter to continue');
assert.equal(extractInputPrompt('Select an option'), 'Select an option');
assert.equal(extractInputPrompt('Choose deployment target:'), 'Choose deployment target:');
assert.equal(extractInputPrompt('choice:'), 'choice:');
assert.equal(extractInputPrompt('continue?'), 'continue?');

// prompt alone is not enough: changed preview should not trigger input yet
events = diffTmuxSnapshots(
  snapshot([task({ outputPreview: 'starting...' })]),
  snapshot([task({ outputPreview: `starting...\n${promptLine}` })]),
);
assert.equal(events.length, 0);

// input requires prompt + continued waiting (same preview across polls)
events = diffTmuxSnapshots(
  snapshot([task({ outputPreview: `starting...\n${promptLine}` })]),
  snapshot([task({ outputPreview: `starting...\n${promptLine}` })]),
);
assert.equal(events.length, 1);
assert.equal(events[0].type, 'input');
assert.equal(events[0].prompt, promptLine);
assert.equal(getTmuxTaskEventLevel(events), 'warning');
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);

// dead task output can look like a prompt, but it is stale and must not trigger input
events = diffTmuxSnapshots(
  snapshot([task({ dead: true, exitCode: 0, outputPreview: `starting...\n${promptLine}` })]),
  snapshot([task({ dead: true, exitCode: 0, outputPreview: `starting...\n${promptLine}` })]),
);
assert.equal(events.length, 0);

// pane-unknown task output is not confirmed live, so it must not trigger input
events = diffTmuxSnapshots(
  snapshot([task({ paneId: undefined, paneStateKnown: false, outputPreview: `starting...\n${promptLine}` })]),
  snapshot([task({ paneId: undefined, paneStateKnown: false, outputPreview: `starting...\n${promptLine}` })]),
);
assert.equal(events.length, 0);

// a task without a pane id is not input-eligible even if marked known defensively
events = diffTmuxSnapshots(
  snapshot([task({ paneId: undefined, outputPreview: `starting...\n${promptLine}` })]),
  snapshot([task({ paneId: undefined, outputPreview: `starting...\n${promptLine}` })]),
);
assert.equal(events.length, 0);

// repeated unchanged prompt can be deduped by notification filter
events = diffTmuxSnapshots(
  snapshot([task({ outputPreview: `starting...\n${promptLine}` })]),
  snapshot([task({ outputPreview: `starting...\n${promptLine}` })]),
);
let filtered = filterRepeatedInputEvents(events, snapshot([task({ outputPreview: `starting...\n${promptLine}` })]), new Map());
assert.equal(filtered.events.length, 1);
assert.equal(filtered.nextNotifiedInputs.get('@1'), promptLine);
filtered = filterRepeatedInputEvents(events, snapshot([task({ outputPreview: `starting...\n${promptLine}` })]), filtered.nextNotifiedInputs);
assert.equal(filtered.events.length, 0);

// disappeared
events = diffTmuxSnapshots(snapshot([task({ windowId: '@2', windowName: 'api' })]), snapshot([]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'disappeared');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @2 (api) disappeared from session`);
assert.equal(getTmuxTaskEventLevel(events), 'warning');
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);

// disappeared after a user-initiated kill is explicit in the message
events = [{ ...events[0], reason: 'user-killed' }];
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @2 (api) disappeared from session after the user manually killed it`);

// dead task cleanup is expected and should not produce a disappeared notification
events = diffTmuxSnapshots(snapshot([task({ windowId: '@2', windowName: 'api', dead: true, exitCode: 0 })]), snapshot([]));
assert.equal(events.length, 0);

// same name but different id is treated as a new window instance
events = diffTmuxSnapshots(
  snapshot([task({ windowId: '@1', windowName: 'web' })]),
  snapshot([task({ windowId: '@2', windowName: 'web' })]),
);
assert.equal(events.length, 2);
assert.equal(events[0].type, 'started');
assert.equal(events[1].type, 'disappeared');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) disappeared from session`);
assert.equal(shouldTriggerTurnForTmuxTaskEvents(events), true);

// newly observed dead tasks after baseline still produce exit
events = diffTmuxSnapshots(snapshot([]), snapshot([task({ dead: true, exitCode: 0 })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'exited');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with code 0`);

events = diffTmuxSnapshots(snapshot([]), snapshot([task({ dead: true, exitCode: 9 })]));
assert.equal(events.length, 1);
assert.equal(events[0].type, 'exited');
assert.equal(formatTmuxTaskEvents(events), `${eventHeader}\ntmux task @1 (web) exited with code 9`);

console.log('event tests passed');
