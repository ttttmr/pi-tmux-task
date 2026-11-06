// Real Pi CLI + real tmux + local deterministic OpenAI-compatible HTTP fixture.
// No Pi/extension mocks and no remote model or credentials.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repo, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
const extension = join(repo, 'src/index.ts');
const helper = join(repo, 'skills/tmux-task-manager/tmux-task-run.sh');
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const root = await mkdtemp(join(repo, '.pi-it-'));
const socket = join(root, 'socket');
const tmux = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim();
const bin = join(root, 'bin');
await mkdir(bin);
await writeFile(join(bin, 'tmux'), `#!/bin/sh\nexec ${quote(tmux)} -f /dev/null -S ${quote(socket)} "$@"\n`, { mode: 0o755 });
const gate = join(root, 'gate.mjs');
await writeFile(gate, `
import { existsSync, watch } from 'node:fs';
import { dirname } from 'node:path';
const path = process.argv[2];
if (!existsSync(path)) await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { watcher.close(); reject(new Error('gate timeout')); }, 30000);
  const check = () => { if (existsSync(path)) { clearTimeout(timer); watcher.close(); resolve(); } };
  const watcher = watch(dirname(path), check);
  check();
});
console.log('gate released');
`);
const env = {
  ...process.env,
  PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`,
  PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0',
};
// No inherited tmux client routing or proxy is needed for the local endpoint.
for (const name of ['TMUX', 'TMUX_PANE', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) delete env[name];

async function run(delivery) {
  const cwd = join(root, delivery ?? 'default');
  const agentDir = join(cwd, 'agent');
  await mkdir(join(cwd, '.pi'), { recursive: true });
  await mkdir(agentDir);
  if (delivery) await writeFile(join(cwd, '.pi/tmux-task.json'), JSON.stringify({ notificationDelivery: delivery }));
  const expected = delivery ?? 'followUp';
  const backgroundGate = join(cwd, 'background.done');
  const foregroundGate = join(cwd, 'foreground.done');
  const idleGate = join(cwd, 'idle.done');
  const gateCommand = (file) => `${quote(process.execPath)} ${quote(gate)} ${quote(file)}`;
  const launch = `${quote(helper)} busy-task -- ${quote(gateCommand(backgroundGate))}`;
  const command = `${gateCommand(foregroundGate)}\nprintf 'FOREGROUND_FINISHED\\n'`;
  const records = [];
  const signals = new EventEmitter();
  let fatal;
  const record = (value) => { records.push(value); signals.emit('record'); };
  const fail = (error) => { fatal = error; signals.emit('record'); };
  const wait = (predicate, label, from = 0) => new Promise((resolve, reject) => {
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
  let calls = 0;
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/v1/chat/completions');
      let body = '';
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      requests.push(request);
      calls++;
      record({ type: 'model_request', call: calls, hasNotification: JSON.stringify(request.messages).includes('[tmux-task notification]') });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
        id: `fixture-${calls}`, object: 'chat.completion.chunk', created: 1, model: 'delivery-fixture',
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`);
      chunk({ role: 'assistant' });
      if (calls <= 3) {
        chunk({ tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: {
          name: 'bash', arguments: JSON.stringify({ command: calls === 1 ? launch : calls === 2 ? command : "printf 'CONTINUATION_FINISHED\\n'" }),
        } }] });
        chunk({}, 'tool_calls');
      } else {
        chunk({ content: 'Fixture response finished.' });
        chunk({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    } catch (error) { fail(error); res.writeHead(500); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await writeFile(join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'local-test-only',
    models: [{ id: 'delivery-fixture', contextWindow: 32768, maxTokens: 4096 }],
  } } }));
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ retry: { enabled: false }, compaction: { enabled: false } }));
  const child = spawn(process.execPath, [cli,
    '--mode', 'rpc', '--no-session', '--offline', '--no-extensions', '-e', extension,
    '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-mcp', '--no-approve',
    '--provider', 'fixture', '--model', 'delivery-fixture', '--thinking', 'off', '--tools', 'bash',
  ], { cwd, env: { ...env, PI_CODING_AGENT_DIR: agentDir }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let closing = false;
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
  const started = (name) => (r) => r.type === 'extension_ui_request' && r.method === 'notify' && r.message.includes(`(${name}) started`);
  const settled = (r) => r.type === 'agent_settled';
  try {
    const state = await rpc('get_state');
    assert.equal(state.model.id, 'delivery-fixture');
    // This command also forces an initial empty snapshot before the tool starts.
    await rpc('prompt', { message: '/tmux-tasks' });
    assert.equal(calls, 0, 'the real extension command must handle the prompt');
    await rpc('prompt', { message: 'Run the deterministic delivery experiment.' });
    await wait((r) => r.type === 'tool_execution_start' && r.toolCallId === 'tool-2', 'foreground tool starts after launch completes');
    await writeFile(backgroundGate, 'release');
    await wait((r) => r.type === 'extension_ui_request' && r.method === 'setStatus' && r.statusText === 'tmux:1', 'poller detects background exit');
    assert.equal(calls, 2, 'notification must not interrupt the blocked foreground tool');
    assert.ok(!records.some((r) => r.type === 'tool_execution_end' && r.toolCallId === 'tool-2'), 'foreground is still running');
    await writeFile(foregroundGate, 'release');
    await wait(settled, 'busy run settles');
    const expectedCalls = expected === 'steer' ? 4 : 5;
    assert.equal(calls, expectedCalls);
    const firstNotificationCall = requests.findIndex((r) => JSON.stringify(r.messages).includes('[tmux-task notification]')) + 1;
    assert.equal(firstNotificationCall, expected === 'steer' ? 3 : 5);
    const foregroundEnd = records.findIndex((r) => r.type === 'tool_execution_end' && r.toolCallId === 'tool-2');
    const nextRequest = records.findIndex((r) => r.type === 'model_request' && r.call === 3);
    assert.ok(foregroundEnd >= 0 && foregroundEnd < nextRequest);
    assert.equal(records[foregroundEnd].isError, false);
    assert.match(JSON.stringify(records[foregroundEnd].result), /FOREGROUND_FINISHED/);
    assert.equal(records.filter((r) => r.type === 'agent_settled').length, 1, 'followUp is consumed before settling');
    const launchResult = records.find((r) => r.type === 'tool_execution_end' && r.toolCallId === 'tool-1');
    assert.equal(launchResult.isError, false);
    const output = launchResult.result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const sessionName = /^session=(.+)$/m.exec(output)?.[1];
    assert.ok(sessionName, 'use the session name returned by the real injected helper');
    const messages = (await rpc('get_messages')).messages;
    const notifications = messages.filter((m) => m.customType === 'tmux-task-event');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].details.notUserInput, true);
    assert.match(notifications[0].content, /busy-task.*exited with code 0/);

    // Launch another actual task while Pi is idle; no additional prompt is sent.
    const from = records.length;
    execFileSync(helper, ['idle-task', '--', gateCommand(idleGate)], {
      cwd, env: { ...env, PI_TMUX_SESSION: sessionName }, stdio: 'pipe',
    });
    await wait(started('idle-task'), 'idle task discovered', from);
    await writeFile(idleGate, 'release');
    await wait(settled, 'idle notification wakes Pi without a prompt', from);
    assert.equal(calls, expectedCalls + 1);
    assert.ok(JSON.stringify(requests.at(-1).messages).includes('(idle-task) exited with code 0'));
    assert.ok(!records.some((r) => r.type === 'extension_error'), 'no extension errors');
    console.log(`[PASS] ${delivery ?? 'missing config'}: busy notification first appears in model request #${firstNotificationCall}; foreground completes; follow-up chain settles once; idle exit wakes Pi (request #${calls}).`);
  } catch (error) {
    console.error('Pi stderr:', stderr);
    console.error('Recent records:', JSON.stringify(records.filter((r) => r.type !== 'extension_ui_request' || !['setStatus', 'setWidget'].includes(r.method)).slice(-12), null, 2));
    throw error;
  } finally {
    closing = true;
    child.stdin.end();
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
    if (child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(killTimer);
    await new Promise((resolve) => server.close(resolve));
  }
}

try {
  for (const delivery of ['followUp', 'steer', undefined]) await run(delivery);
  console.log('Real Pi RPC/tmux delivery integration passed. Model responses came from a local fixture, not an online model.');
} finally {
  try { execFileSync(tmux, ['-S', socket, 'kill-server'], { stdio: 'ignore' }); } catch {}
  await rm(root, { recursive: true, force: true });
}
