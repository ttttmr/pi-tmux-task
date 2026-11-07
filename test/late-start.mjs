// Real helper/tmux/poller/diff; Pi event registration and UI/message sinks are mocked.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import extension from '../src/index.ts';
import { isolatedTmux, quote, repo } from './helpers/isolated-tmux.mjs';

const exec = promisify(execFile);
const fixture = await isolatedTmux();
const cwd = join(fixture.root, 'project');
await mkdir(cwd);
const savedEnv = { PATH: process.env.PATH, TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE };
process.env.PATH = fixture.env.PATH;
delete process.env.TMUX;
delete process.env.TMUX_PANE;
const handlers = new Map();
const sent = [];
const notices = [];
const statuses = [];
extension({
  events: { on: () => () => {} },
  on: (name, handler) => handlers.set(name, handler),
  registerShortcut() {}, registerCommand() {},
  sendMessage: (message, options) => sent.push({ message, options }),
});
const ctx = {
  cwd, mode: 'rpc', hasUI: false,
  sessionManager: { getSessionId: () => 'late-start', getSessionName: () => undefined, getEntries: () => [] },
  ui: { setWidget() {}, setStatus: (_key, value) => statuses.push(value), notify: (text) => notices.push(text) },
};
const runtime = globalThis.__pi_tmux_task_runtime__;
const helper = join(repo, 'skills/tmux-task-manager/tmux-task-run.sh');
const result = (text) => handlers.get('tool_result')({ toolName: 'bash', isError: false, content: [{ type: 'text', text }] }, ctx);
const exits = () => sent.flatMap(({ message }) => message.details.events).filter((event) => event.type === 'exited');
const launch = async (name, command) => {
  const call = { type: 'tool_call', toolName: 'bash', input: { command: `${quote(helper)} ${name} -- ${quote(command)}` } };
  await handlers.get('tool_call')(call, ctx);
  return (await exec('bash', ['-c', call.input.command], { env: fixture.env, cwd })).stdout;
};
const refresh = () => runtime.activePoller.refreshNow();
async function dead(name) {
  // Bound the harness's condition wait; no timing assumption about process exit.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const snapshot = await refresh();
    const task = snapshot.tasks.find((task) => task.windowName === name);
    if (task?.dead) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`task ${name} did not exit`);
}

try {
  await handlers.get('session_start')({}, ctx);
  await refresh(); // deterministic empty baseline
  const background = join(fixture.root, 'background');
  const output = await launch('race', fixture.gateCommand(background));
  await refresh(); // observe the run before its delayed tool_result
  await writeFile(background, 'release');
  const first = await dead('race');
  assert.equal(exits().length, 1);
  const observed = runtime.sessions.get('late-start').previousSnapshot.tasks[0];
  await result(output);
  const afterResult = runtime.sessions.get('late-start').previousSnapshot.tasks[0];
  await refresh();
  assert.equal(exits().length, 1, 'an unchanged dead snapshot must not send a second exit');
  assert.deepEqual(afterResult, observed, 'late helper output must preserve the already observed exit');
  console.log('[PASS] observed exit -> late tool_result -> unchanged dead poll: exactly one exit');

  // Fast rerun on the same window AND pane, finishing before tool_result/poll.
  const short = await launch('race', 'exit 7');
  const rerun = await dead('race');
  assert.equal(rerun.windowId, first.windowId);
  assert.equal(rerun.paneId, first.paneId);
  assert.notEqual(rerun.panePid, first.panePid);
  assert.equal(exits().length, 2, 'dead -> new dead run must produce its own exit');
  assert.equal(exits()[1].task.exitCode, 7);
  await result(short);
  await refresh();
  assert.equal(exits().length, 2);

  // A genuine live rerun must update the footer before tool_result returns.
  const liveGate = join(fixture.root, 'live');
  const live = await launch('race', fixture.gateCommand(liveGate));
  await result(live);
  assert.equal(statuses.at(-1), 'tmux:1-1');
  const liveTask = runtime.sessions.get('late-start').previousSnapshot.tasks[0];
  await result(output); // an even older run's output must not reset the live rerun
  assert.deepEqual(runtime.sessions.get('late-start').previousSnapshot.tasks[0], liveTask);
  await writeFile(liveGate, 'release');
  await dead('race');
  assert.equal(exits().length, 3);
  console.log('[PASS] same window/pane reruns: short failure and live completion remain observable');

  const freshGate = join(fixture.root, 'fresh');
  const fresh = await launch('fresh', fixture.gateCommand(freshGate));
  await result(fresh);
  assert.equal(statuses.at(-1), 'tmux:2-1');
  await writeFile(freshGate, 'release');
  await dead('fresh');
  assert.equal(exits().length, 4);
  const instant = await launch('instant', 'exit 0');
  await result(instant);
  await dead('instant');
  assert.equal(exits().length, 5, 'a new task finishing before the next poll still reports completion');
  const before = runtime.sessions.get('late-start').previousSnapshot;
  await result(fresh.replace(/^session=.*$/m, 'session=pi-other-conversation'));
  assert.equal(runtime.sessions.get('late-start').previousSnapshot, before, 'foreign session output is ignored');
  assert.ok(sent.every(({ options }) => options.deliverAs === 'followUp'));
  assert.ok(sent.every(({ message }) => !/ started/.test(message.content)), 'started stays UI-only');
  assert.ok(notices.some((text) => text.includes('(race) started')));
  console.log('[PASS] immediate footer, session isolation, started filtering and short-task notification');
} finally {
  await handlers.get('session_shutdown')({ reason: 'quit' }, ctx);
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  await fixture.cleanup();
}
