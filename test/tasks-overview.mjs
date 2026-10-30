import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { FooterComponent, initTheme } from '@earendil-works/pi-coding-agent';
import extension from '../src/index.ts';
import { formatTmuxTasksOverview, formatTmuxTaskSummary, getTmuxTaskStatus } from '../src/ui/tasks-overview.ts';

const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };
const task = (overrides = {}) => ({ windowId: '@1', windowName: 'task', paneStateKnown: true, dead: false, bell: false, ...overrides });
const tasks = [
  task(),
  task({ outputPreview: 'Proceed? [y/N]', bell: true }),
  task({ bell: true }),
  task({ bellCount: 2 }),
  task({ dead: true, exitCode: 0, outputPreview: 'Proceed? [y/N]', bell: true }),
  task({ dead: true, exitCode: 1 }),
  task({ dead: true }),
  task({ paneStateKnown: false, outputPreview: 'Proceed? [y/N]', bell: true }),
];
assert.deepEqual(tasks.map(getTmuxTaskStatus), ['running', 'input', 'notify', 'notify', 'done', 'failed', 'exited', 'unknown']);
assert.equal(formatTmuxTaskSummary(tasks), 'tmux: 8 tasks · 1 running · 1 input · 2 notify · 1 done · 1 failed · 1 exited · 1 unknown');
assert.equal(formatTmuxTaskSummary([]), 'tmux: 0 tasks');
assert.equal(formatTmuxTasksOverview(tasks, theme), 'tmux:8-5-1');
assert.equal(formatTmuxTasksOverview(tasks), 'tmux:8-5-1');
assert.equal(formatTmuxTasksOverview([], theme), undefined);
assert.equal(formatTmuxTasksOverview([
  task({ dead: true, exitCode: 0 }),
  task({ dead: true }),
], theme), 'tmux:2', 'completed tasks and missing exit codes must not count as failures');
assert.equal(formatTmuxTasksOverview([
  task({ paneStateKnown: false, dead: true, exitCode: 1 }),
], theme), 'tmux:1-1', 'unconfirmed panes remain active until their state is known');
assert.equal(formatTmuxTasksOverview([task({ dead: true, exitCode: 1 })], theme), 'tmux:1-1');
// Match the surrounding dim usage text while retaining yellow/red status counts.
const styledOverview = formatTmuxTasksOverview(tasks, {
  ...theme,
  fg: (color, text) => `<${color}>${text}</${color}>`,
  bold: (text) => `<bold>${text}</bold>`,
});
assert.equal(styledOverview, '<dim>tmux:8</dim><dim>-</dim><warning>5</warning><dim>-</dim><error>1</error>');

const handlers = new Map();
const shortcuts = new Map();
const footerActions = new Map();
extension({
  events: {
    on: (name, handler) => { footerActions.set(name, handler); return () => footerActions.delete(name); },
  },
  on: (name, handler) => handlers.set(name, handler),
  registerShortcut: (key, options) => shortcuts.set(key, options.handler),
  registerCommand() {},
});
const runtime = globalThis.__pi_tmux_task_runtime__;
const sessionId = 'overview-test';
const sessionName = 'pi-project-overview-test';
const session = { sessionId, sessionName, notifiedInputs: new Map(), manuallyKilledWindowIds: new Set() };
const snapshot = { sessionName, exists: true, tasks, capturedAt: Date.now() };
runtime.sessions.set(sessionId, session);
runtime.activeSessionId = sessionId;
runtime.activePoller = { refreshNow: async () => snapshot, stop() {} };
let panel;
let panelCount = 0;
const statuses = new Map();
const ctx = {
  mode: 'tui',
  cwd: process.cwd(),
  hasUI: true,
  sessionManager: { getSessionId: () => sessionId },
  ui: {
    theme,
    setStatus: (key, value) => { if (value === undefined) statuses.delete(key); else statuses.set(key, value); },
    setFooter: () => assert.fail('task stats must preserve the existing inline footer'),
    setWidget: (_key, content) => { assert.equal(content, undefined, 'task stats must use the original footer instead of an editor widget'); },
    notify() {},
    custom: (factory) => new Promise((resolve) => {
      panelCount++;
      panel = factory({ requestRender() {} }, theme, {}, (value) => {
        panel.dispose?.();
        resolve(value);
      });
    }),
  },
};
// A freshly launched task makes the original footer status visible immediately.
session.previousSnapshot = { ...snapshot, exists: false, tasks: [] };
await handlers.get('tool_result')({ toolName: 'bash', isError: false, content: [{ type: 'text', text: `session=${sessionName}\nwindow_id=@9\ntask=new-task\n` }] }, ctx);
assert.equal(session.previousSnapshot.exists, true);
assert.equal(statuses.get('tmux-task'), 'tmux:1-1');

// The native footer uses a separate status row; the user's inline footer consumes this same status in its usage row.
initTheme('dark');
const footer = new FooterComponent({
  state: {},
  sessionManager: {
    ...ctx.sessionManager,
    getEntryCount: () => 0,
    getLeafId: () => null,
    getEntries: () => [],
    getCwd: () => '/tmp/overview-project',
    getSessionName: () => undefined,
  },
  getContextUsage: () => undefined,
}, {
  getGitBranch: () => null,
  getExtensionStatuses: () => statuses,
  getAvailableProviderCount: () => 1,
});
const footerLines = footer.render(100);
assert.equal(footerLines.length, 3);
assert.match(footerLines[0], /overview-project/);
assert.match(footerLines[1], /no-model/);
assert.equal(footerLines[2], 'tmux:1-1');
for (const width of [1, 10, 40, 80, 160]) {
  assert.ok(footer.render(width).every((line) => visibleWidth(line) <= width));
}
footer.dispose();

assert.equal(typeof footerActions.get('tmux-task:open-panel'), 'function');
footerActions.get('tmux-task:open-panel')({ source: 'footer' });
await Promise.resolve();
await Promise.resolve();
assert.equal(panelCount, 1);
assert.match(panel.render(160).join('\n'), /1 input/);
await shortcuts.get('alt+t')(ctx);
assert.equal(panelCount, 1, 'repeated opens must not stack panels');
panel.handleInput('\x1b');
await Promise.resolve();
await Promise.resolve();
assert.equal(session.panelOpen, false);
const reopened = shortcuts.get('alt+t')(ctx);
await Promise.resolve();
await Promise.resolve();
assert.equal(panelCount, 2);
panel.handleInput('\x1b');
await reopened;
await shortcuts.get('alt+t')({ ...ctx, mode: 'rpc' });
assert.equal(panelCount, 2);
await handlers.get('session_shutdown')({ reason: 'reload' }, ctx);
assert.equal(footerActions.size, 0, 'reload must remove the old footer listener');
runtime.sessions.delete(sessionId);
runtime.activePoller = undefined;
runtime.activeSessionId = undefined;

// A refresh may settle after /reload invalidates the old extension context,
// even though the replacement runtime resumes the same Pi session ID.
const settleClick = () => new Promise((resolve) => setImmediate(resolve));
const staleContextReads = [];
const unhandledErrors = [];
const onUnhandledRejection = (error) => unhandledErrors.push(String(error));
process.on('unhandledRejection', onUnhandledRejection);
try {
  for (const outcome of ['resolve', 'reject']) {
    const reloadHandlers = new Map();
    const reloadActions = new Map();
    const api = {
      events: { on: (name, handler) => { reloadActions.set(name, handler); return () => reloadActions.delete(name); } },
      on: (name, handler) => reloadHandlers.set(name, handler),
      registerShortcut() {},
      registerCommand() {},
    };
    extension(api);
    let contextActive = true;
    const reloadContext = {};
    for (const key of ['mode', 'cwd', 'hasUI', 'sessionManager', 'ui']) {
      Object.defineProperty(reloadContext, key, { get() {
        if (!contextActive) {
          staleContextReads.push(`${outcome}:${key}`);
          throw new Error('old extension runtime inactive');
        }
        return ctx[key];
      } });
    }
    const oldSession = { ...session, panelOpen: false };
    runtime.sessions.set(sessionId, oldSession);
    runtime.activeSessionId = sessionId;
    let resolveRefresh;
    let rejectRefresh;
    const pendingRefresh = new Promise((resolve, reject) => { resolveRefresh = resolve; rejectRefresh = reject; });
    runtime.activePoller = { refreshNow: () => pendingRefresh, stop() {} };
    const startedEvent = { toolName: 'bash', isError: false, content: [{ type: 'text', text: `session=${sessionName}\nwindow_id=@9\ntask=new-task\n` }] };
    await reloadHandlers.get('tool_result')(startedEvent, reloadContext);
    reloadActions.get('tmux-task:open-panel')();
    assert.equal(oldSession.panelOpen, true, 'the click must be awaiting its refresh');
    await reloadHandlers.get('session_shutdown')({ reason: 'reload' }, reloadContext);
    contextActive = false;

    // A new extension instance resumes the same ID with a fresh session object.
    extension(api);
    const replacementSession = { ...session, panelOpen: false };
    runtime.sessions.set(sessionId, replacementSession);
    runtime.activeSessionId = sessionId;
    runtime.activePoller = { refreshNow: async () => snapshot, stop() {} };
    await reloadHandlers.get('tool_result')(startedEvent, ctx);
    if (outcome === 'resolve') resolveRefresh(snapshot);
    else rejectRefresh(new Error('refresh failed after reload'));
    await settleClick();
    assert.equal(oldSession.panelOpen, false, 'a stale open must release its guard');
    assert.equal(panelCount, 2, 'a stale click must not open a replacement panel');
    assert.equal(replacementSession.panelOpen, false);
    await reloadHandlers.get('session_shutdown')({ reason: 'reload' }, ctx);
  }

  // Errors from a current click must still reach the user.
  const notifications = [];
  runtime.sessions.set(sessionId, { ...session, panelOpen: false });
  runtime.activeSessionId = sessionId;
  runtime.activePoller = { refreshNow: async () => { throw new Error('current refresh failed'); }, stop() {} };
  const currentContext = { ...ctx, ui: { ...ctx.ui, notify: (...args) => notifications.push(args) } };
  await handlers.get('tool_result')({ toolName: 'bash', isError: false, content: [{ type: 'text', text: `session=${sessionName}\nwindow_id=@9\ntask=new-task\n` }] }, currentContext);
  footerActions.get('tmux-task:open-panel')();
  await settleClick();
  assert.deepEqual(notifications, [['Failed to open tmux tasks panel: Error: current refresh failed', 'error']]);
  await handlers.get('session_shutdown')({ reason: 'reload' }, currentContext);
  assert.deepEqual(staleContextReads, [], 'pending clicks must never read an invalidated extension context');
  assert.deepEqual(unhandledErrors, [], 'pending click errors must not become unhandled rejections');
} finally {
  process.off('unhandledRejection', onUnhandledRejection);
  runtime.sessions.delete(sessionId);
  runtime.activePoller = undefined;
  runtime.activeSessionId = undefined;
}

console.log('tasks overview tests passed');
