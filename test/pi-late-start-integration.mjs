// Real Pi 1.4.0 RPC + real tmux + deterministic local SSE model fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isolatedTmux, quote, repo } from './helpers/isolated-tmux.mjs';

const fixture = await isolatedTmux();
const cwd = join(fixture.root, 'project');
const agentDir = join(fixture.root, 'agent');
await mkdir(cwd);
await mkdir(agentDir);
const records = [];
const requests = [];
const signals = new EventEmitter();
let fatal;
let nextCommand;
let toolId = 0;
const record = (value) => { records.push(value); signals.emit('record'); };
const fail = (error) => { fatal = error; signals.emit('record'); };
function wait(predicate, label, from = 0) {
  return new Promise((resolve, reject) => {
    const finish = (error, result) => {
      clearTimeout(timer); signals.off('record', check);
      if (error) reject(error); else resolve(result);
    };
    const check = () => {
      if (fatal) return finish(fatal);
      const result = records.slice(from).find(predicate);
      if (result) finish(undefined, result);
    };
    const timer = setTimeout(() => finish(new Error(`Timed out: ${label}`)), 20000);
    signals.on('record', check); check();
  });
}
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.url, '/v1/chat/completions');
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
      id: `fixture-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'race-fixture',
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    chunk({ role: 'assistant' });
    if (nextCommand !== undefined) {
      const command = nextCommand;
      nextCommand = undefined;
      chunk({ tool_calls: [{ index: 0, id: `tool-${++toolId}`, type: 'function', function: {
        name: 'bash', arguments: JSON.stringify({ command }),
      } }] });
      chunk({}, 'tool_calls');
    } else {
      chunk({ content: 'Fixture response finished.' });
      chunk({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  } catch (error) { fail(error); res.end(); }
});
let child;
let closing = false;
let stderr = '';
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await writeFile(join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'local-test-only',
    models: [{ id: 'race-fixture', contextWindow: 32768, maxTokens: 4096 }],
  } } }));
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ retry: { enabled: false }, compaction: { enabled: false } }));
  const env = { ...fixture.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key];
  child = spawn(process.execPath, [join(repo, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js'),
    '--mode', 'rpc', '--no-session', '--offline', '--no-extensions', '-e', process.argv[2] ?? join(repo, 'src/index.ts'),
    '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-mcp', '--no-approve',
    '--provider', 'fixture', '--model', 'race-fixture', '--thinking', 'off', '--tools', 'bash',
  ], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', (data) => { stderr += data; });
  child.on('error', fail);
  child.on('exit', (code, signal) => { if (!closing) fail(new Error(`Pi exited: ${code}/${signal}: ${stderr}`)); });
  let pending = '';
  child.stdout.on('data', (data) => {
    pending += data.toString();
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      try { record(JSON.parse(line)); } catch (error) { fail(new Error(`Non-JSON RPC output: ${line}`, { cause: error })); }
    }
  });
  let id = 0;
  async function rpc(type, values = {}) {
    const requestId = String(++id);
    const response = wait((r) => r.type === 'response' && r.id === requestId, type);
    child.stdin.write(`${JSON.stringify({ id: requestId, type, ...values })}\n`);
    const result = await response;
    assert.equal(result.success, true, JSON.stringify(result));
    return result.data;
  }
  const status = (text) => (r) => r.type === 'extension_ui_request' && r.method === 'setStatus' && r.statusText === text;
  const started = (name) => (r) => r.type === 'extension_ui_request' && r.method === 'notify' && r.message.includes(`(${name}) started`);
  const ended = (id) => (r) => r.type === 'tool_execution_end' && r.toolCallId === `tool-${id}`;
  const settled = (r) => r.type === 'agent_settled';
  const notifications = async () => (await rpc('get_messages')).messages.filter((m) => m.customType === 'tmux-task-event');
  const exitEvents = (messages) => messages.flatMap((m) => m.details.events).filter((event) => event.type === 'exited');
  const helper = join(repo, 'skills/tmux-task-manager/tmux-task-run.sh');
  const launch = (command, name = 'race') => `${quote(helper)} ${name} -- ${quote(command)}`;

  assert.equal((await rpc('get_state')).model.id, 'race-fixture');
  await rpc('prompt', { message: '/tmux-tasks' }); // force empty baseline
  assert.equal(requests.length, 0);

  // Crucially: helper launch AND blocked foreground work share one bash call.
  const background = join(cwd, 'background');
  const foreground = join(cwd, 'foreground');
  nextCommand = `${launch(fixture.gateCommand(background))}\n${fixture.gateCommand(foreground)}\nprintf 'FOREGROUND_FINISHED\\n'`;
  await rpc('prompt', { message: 'Run the combined launch and foreground gate.' });
  await wait(started('race'), 'poller discovers task while the bash tool is blocked');
  await writeFile(background, 'release');
  await wait(status('tmux:1'), 'poller observes exit before tool_result');
  assert.ok(!records.some(ended(1)), 'the combined bash tool must still be running');
  await writeFile(foreground, 'release');
  const result = await wait(ended(1), 'late tool_result');
  assert.equal(result.isError, false);
  assert.match(JSON.stringify(result.result), /FOREGROUND_FINISHED/);
  await wait(settled, 'notification follow-up settles');
  let messages = await notifications();
  assert.equal(exitEvents(messages).length, 1);
  const first = exitEvents(messages)[0].task;
  assert.equal(first.exitCode, 0);

  // /tmux-tasks awaits a real refresh; an old optimistic overwrite would emit exit #2.
  await rpc('prompt', { message: '/tmux-tasks' });
  messages = await notifications();
  assert.equal(exitEvents(messages).length, 1, 'unchanged dead pane must not notify twice');
  console.log('[PASS] real Pi/tmux: combined bash, observed exit before late tool_result, exactly one exit after refresh');

  // Same window/pane, a short second run exits before its tool_result arrives.
  let from = records.length;
  const rerunForeground = join(cwd, 'rerun-foreground');
  nextCommand = `${launch('exit 7')}\n${fixture.gateCommand(rerunForeground)}`;
  await rpc('prompt', { message: 'Rerun the same task slot with a short failure.' });
  await wait(status('tmux:1-1'), 'poller sees short rerun failure', from);
  assert.ok(!records.slice(from).some(ended(2)));
  await writeFile(rerunForeground, 'release');
  await wait(ended(2), 'second late tool_result', from);
  await wait(settled, 'rerun settles', from);
  await rpc('prompt', { message: '/tmux-tasks' });
  messages = await notifications();
  assert.equal(exitEvents(messages).length, 2);
  const second = exitEvents(messages)[1].task;
  assert.equal(second.exitCode, 7);
  assert.equal(second.windowId, first.windowId);
  assert.equal(second.paneId, first.paneId);
  assert.notEqual(second.panePid, first.panePid);
  console.log('[PASS] real Pi/tmux: short dead-to-dead rerun reuses window/pane and sends exactly one new failure');

  // Ordinary startup still updates the footer before the model continues.
  from = records.length;
  const freshGate = join(cwd, 'fresh');
  nextCommand = launch(fixture.gateCommand(freshGate), 'fresh');
  await rpc('prompt', { message: 'Start a normal task.' });
  await wait(ended(3), 'normal helper result', from);
  await wait(settled, 'normal launch settles', from);
  const immediate = records.findIndex((r, i) => i >= from && status('tmux:2-1-1')(r));
  const toolEnd = records.findIndex((r, i) => i >= from && ended(3)(r));
  assert.ok(immediate >= from && immediate < toolEnd, 'footer is updated inside tool_result, before tool_execution_end');
  from = records.length;
  await writeFile(freshGate, 'release');
  await wait(settled, 'idle completion triggers a follow-up', from);
  messages = await notifications();
  assert.equal(exitEvents(messages).length, 3);
  assert.ok(messages.every((m) => m.details.notUserInput === true));
  assert.ok(messages.every((m) => !/ started/.test(m.content)));
  assert.ok(!records.some((r) => r.type === 'extension_error'));
  console.log('[PASS] real Pi/tmux: immediate footer and idle completion; started remains UI-only');
  console.log('Real Pi RPC/tmux late-start integration passed (local model fixture; no online model).');
} catch (error) {
  console.error('Pi stderr:', stderr);
  console.error('Recent records:', JSON.stringify(records.filter((r) => r.type !== 'extension_ui_request' || !['setStatus', 'setWidget'].includes(r.method)).slice(-10), null, 2));
  throw error;
} finally {
  closing = true;
  if (child) {
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    if (child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(timer);
  }
  await new Promise((resolve) => server.close(resolve));
  await fixture.cleanup();
}
