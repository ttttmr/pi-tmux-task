import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDeliveryConfig, loadDeliveryConfig } from '../src/config.ts';
import { getTmuxTaskMessageOptions } from '../src/tmux/events.ts';
import { AgentSession } from '@earendil-works/pi-coding-agent';

const root = await mkdtemp(join(process.cwd(), '.delivery-test-'));
const file = join(root, '.pi', 'tmux-task.json');
const agentDir = join(root, 'agent');
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const task = { windowId: '@1', windowName: 'test', paneId: '%1', paneStateKnown: true, dead: false, bell: false };
const exit = { type: 'exited', task: { ...task, dead: true, exitCode: 1 } };
try {
  assert.deepEqual(await loadDeliveryConfig(root), { notificationDelivery: 'followUp' });
  assert.deepEqual(parseDeliveryConfig({}), { notificationDelivery: 'followUp' });
  for (const value of [null, [], true, 'steer', 3, { notificationDelivery: null }, { notificationDelivery: 'nextTurn' }, { notificationDelivery: 'STEER' }, { notificationDelivery: false }, { notificationDelivery: undefined }, { delivery: 'steer' }, { notificationDelivery: 'steer', typo: 1 }]) {
    const result = parseDeliveryConfig(value);
    assert.equal(result.notificationDelivery, 'followUp');
    assert.ok(result.warning);
  }
  await mkdir(join(root, '.pi'));
  for (const content of ['{', 'null', '{"notificationDelivery":"bad"}']) {
    await writeFile(file, content);
    const result = await loadDeliveryConfig(root);
    assert.equal(result.notificationDelivery, 'followUp');
    assert.match(result.warning, /tmux-task.json.*Using followUp/);
  }
  await rm(file);
  await mkdir(file);
  assert.match((await loadDeliveryConfig(root)).warning, /Cannot read valid JSON/);
  await rm(file, { recursive: true });

  // Global defaults, project overrides, empty layers, and invalid-layer fallback.
  await mkdir(agentDir);
  const globalFile = join(agentDir, 'tmux-task.json');
  await writeFile(globalFile, JSON.stringify({ notificationDelivery: 'steer' }));
  assert.deepEqual(await loadDeliveryConfig(root), { notificationDelivery: 'steer' });
  await writeFile(file, '{}');
  assert.deepEqual(await loadDeliveryConfig(root), { notificationDelivery: 'steer' });
  await writeFile(file, JSON.stringify({ notificationDelivery: 'followUp' }));
  assert.deepEqual(await loadDeliveryConfig(root), { notificationDelivery: 'followUp' });
  for (const content of ['{', '{"notificationDelivery":"bad"}', '{"typo":true}']) {
    await writeFile(file, content);
    const result = await loadDeliveryConfig(root);
    assert.equal(result.notificationDelivery, 'steer');
    assert.ok(result.warning.includes(file));
    assert.match(result.warning, /Using steer/);
  }
  await rm(file);
  await mkdir(file);
  assert.equal((await loadDeliveryConfig(root)).notificationDelivery, 'steer');
  assert.match((await loadDeliveryConfig(root)).warning, /Cannot read valid JSON/);
  await rm(file, { recursive: true });
  await writeFile(globalFile, '{');
  await writeFile(file, JSON.stringify({ notificationDelivery: 'steer' }));
  let result = await loadDeliveryConfig(root);
  assert.equal(result.notificationDelivery, 'steer');
  assert.ok(result.warning.includes(globalFile));
  await writeFile(file, '{');
  result = await loadDeliveryConfig(root);
  assert.equal(result.notificationDelivery, 'followUp');
  assert.ok(result.warning.includes(globalFile) && result.warning.includes(file));
  await writeFile(globalFile, '{}');
  await rm(file);
  assert.deepEqual(await loadDeliveryConfig(root), { notificationDelivery: 'followUp' });
  await rm(globalFile);

  // Capture the real extension's poll callback. No tmux commands or model calls.
  let onSnapshot;
  let stopCount = 0;
  mock.module('../src/tmux/poller.ts', { namedExports: {
    startTmuxPoller: (_name, interval, callback) => {
      assert.equal(interval, 2000);
      onSnapshot = callback;
      return { stop: () => stopCount++, getLatest: () => undefined, refreshNow: async () => ({ exists: false, tasks: [] }) };
    },
  } });
  const commands = await import('../src/tmux/commands.ts');
  mock.module('../src/tmux/commands.ts', { namedExports: {
    ...commands,
    tmuxInstallBellHook: async () => true,
    tmuxListSessions: async () => [],
    tmuxSetSessionTitle: async () => true,
    tmuxKillSession: async () => assert.fail('must not kill a session'),
  } });
  mock.module('../src/tmux/snapshot.ts', { namedExports: {
    collectTmuxSnapshot: async (sessionName) => ({ sessionName, exists: false, tasks: [], capturedAt: 0 }),
  } });
  const { default: extension } = await import('../src/index.ts');
  const sent = [];
  const notices = [];
  const handlers = new Map();
  const registeredCommands = new Map();
  const api = {
    on: (name, handler) => handlers.set(name, handler),
    events: { on: () => () => {} }, registerShortcut() {},
    registerCommand: (name, command) => registeredCommands.set(name, command.handler),
    sendMessage: (...args) => sent.push(args),
  };
  const ctx = {
    cwd: root, mode: 'rpc', hasUI: false,
    sessionManager: { getSessionId: () => 'delivery-test', getSessionName: () => 'test' },
    ui: { notify: (...args) => notices.push(args), setWidget() {}, setStatus() {} },
  };
  const snapshot = (tasks) => ({ sessionName: 'test', exists: true, tasks, capturedAt: 0 });
  for (const [delivery, globalDelivery, expected] of [
    ['followUp', 'steer', 'followUp'], ['steer', 'followUp', 'steer'],
    ['invalid', 'steer', 'steer'], [undefined, 'steer', 'steer'],
    [undefined, undefined, 'followUp'],
  ]) {
    if (globalDelivery) await writeFile(globalFile, JSON.stringify({ notificationDelivery: globalDelivery }));
    else await rm(globalFile);
    if (delivery === undefined) await rm(file);
    else await writeFile(file, JSON.stringify({ notificationDelivery: delivery }));
    sent.length = 0;
    notices.length = 0;
    extension(api);
    await handlers.get('session_start')({}, ctx);
    assert.equal(notices.length, delivery === 'invalid' ? 1 : 0);
    // A file edit only takes effect at the next session_start (/reload included).
    await writeFile(file, JSON.stringify({ notificationDelivery: expected === 'steer' ? 'followUp' : 'steer' }));
    await onSnapshot(snapshot([]));
    await onSnapshot(snapshot([task]));
    assert.equal(sent.length, 0, 'started stays UI-only');
    const prompt = { ...task, outputPreview: 'Proceed? [y/N]' };
    await onSnapshot(snapshot([prompt]));
    await onSnapshot(snapshot([prompt]));
    await onSnapshot(snapshot([prompt]));
    assert.equal(sent.length, 1, 'input remains deduplicated');
    await onSnapshot(snapshot([{ ...prompt, dead: true, exitCode: 1, bell: true }]));
    assert.equal(sent.length, 2);
    assert.match(sent[1][0].content, /sent a terminal notification, then exited with code 1/);
    await onSnapshot(snapshot([]));
    assert.equal(sent.length, 2, 'dead cleanup remains silent');
    await onSnapshot(snapshot([task]));
    await onSnapshot(snapshot([]));
    assert.equal(sent.length, 3);
    assert.match(sent[2][0].content, /disappeared/);
    for (const [message, options] of sent) {
      assert.equal(message.customType, 'tmux-task-event');
      assert.equal(message.details.notUserInput, true);
      assert.deepEqual(options, { deliverAs: expected, triggerTurn: true });
    }
    // Recreating task tracking (e.g. after kill-all) must retain loaded timing.
    globalThis.__pi_tmux_task_runtime__.sessions.delete('delivery-test');
    await registeredCommands.get('tmux-tasks')('unknown', ctx);
    sent.length = 0;
    await onSnapshot(snapshot([]));
    await onSnapshot(snapshot([exit.task]));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0][1], { deliverAs: expected, triggerTurn: true });
    await handlers.get('session_shutdown')({ reason: 'reload' }, ctx);
  }
  assert.equal(stopCount, 10);

  for (const delivery of ['followUp', 'steer']) {
    assert.deepEqual(parseDeliveryConfig({ notificationDelivery: delivery }), { notificationDelivery: delivery });
    for (const events of [[], [{ type: 'started', task }], [exit], [{ type: 'started', task }, exit]]) {
      assert.deepEqual(getTmuxTaskMessageOptions(events, delivery), {
        deliverAs: delivery, triggerTurn: events.includes(exit),
      });
    }
    // Exercise Pi 1.4.0's actual dispatch method with stub run/queue sinks.
    // This checks busy/idle routing, not real LLM scheduling.
    for (const busy of [true, false]) {
      const calls = [];
      const session = {
        isStreaming: busy,
        agent: { steer: () => calls.push('steer'), followUp: () => calls.push('followUp') },
        _startRun: async () => calls.push('startRun'),
      };
      await AgentSession.prototype.sendCustomMessage.call(session, sent[0][0], getTmuxTaskMessageOptions([exit], delivery));
      assert.deepEqual(calls, [busy ? delivery : 'startRun']);
    }
  }
  assert.deepEqual(getTmuxTaskMessageOptions([exit]), { deliverAs: 'followUp', triggerTurn: true });
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  mock.restoreAll();
  await rm(root, { recursive: true, force: true });
}
console.log('notification delivery tests passed (mock extension lifecycle + real Pi dispatch with stub sinks)');
