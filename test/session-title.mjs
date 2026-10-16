import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmuxListSessionTitles, tmuxSetSessionTitle } from '../src/tmux/commands.ts';

const titled = `pi-title-test-${process.pid}-titled`;
const untitled = `pi-title-test-${process.pid}-untitled`;
const tmux = (...args) => execFileSync('tmux', args, { encoding: 'utf8' });

try {
  tmux('new-session', '-d', '-s', titled);
  tmux('new-session', '-d', '-s', untitled);

  assert.equal(await tmuxSetSessionTitle('pi-title-test-missing-session', 'x'), false);

  // Characters tmux could treat as format or shell syntax must round-trip verbatim.
  const title = `Fix "quotes" #{session_name} 'single' $HOME 中文`;
  assert.equal(await tmuxSetSessionTitle(titled, title), true);

  const titles = await tmuxListSessionTitles();
  assert.equal(titles.get(titled), title);
  assert.equal(titles.has(untitled), false, 'sessions without a title are omitted');
} finally {
  for (const name of [titled, untitled]) {
    try {
      tmux('kill-session', '-t', name);
    } catch {
      // already gone
    }
  }
}

console.log('session title tests passed');
