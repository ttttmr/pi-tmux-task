import assert from 'node:assert/strict';
import { computeTmuxSessionName } from '../src/context.ts';

function expected(inputPath, sessionId) {
  const normalizedPath = inputPath.replace(/\/+$/g, '') || '/';
  const name = normalizedPath.split('/').filter(Boolean).pop() || '';
  const slug = (name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '').replace(/-+$/, '')) || 'project';
  return `pi-${slug}-${sessionId}`;
}

const sessionA = '019e4988-b257-7be4-a6f7-b945f8fb7d36';
const sessionB = 'abcdef1234567890';

const pathA = '/Users/bytedance/dev/pi-tmux-task';
assert.equal(computeTmuxSessionName(pathA, sessionA), expected(pathA, sessionA));
assert.equal(computeTmuxSessionName(pathA, sessionA), `pi-pi-tmux-task-${sessionA}`);

const pathB = '/tmp/Example Project';
assert.equal(computeTmuxSessionName(pathB, sessionB), expected(pathB, sessionB));
assert.equal(computeTmuxSessionName(pathB, sessionB), `pi-example-project-${sessionB}`);

const pathC = '/tmp/!!!';
assert.equal(computeTmuxSessionName(pathC, sessionA), expected(pathC, sessionA));
assert.equal(computeTmuxSessionName(pathC, sessionA), `pi-project-${sessionA}`);

const pathD1 = '/tmp/repo';
const pathD2 = '/tmp/repo/';
assert.equal(computeTmuxSessionName(pathD1, sessionA), computeTmuxSessionName(pathD2, sessionA));

assert.equal(computeTmuxSessionName('/tmp/repo', '---'), 'pi-repo----');
assert.notEqual(computeTmuxSessionName('/tmp/repo', sessionA), computeTmuxSessionName('/tmp/repo', sessionB));
assert.equal(computeTmuxSessionName('/tmp/repo', sessionA), computeTmuxSessionName('/var/repo', sessionA));

console.log('context tests passed');
