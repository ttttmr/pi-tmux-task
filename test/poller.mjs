import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { startTmuxPoller } from '../src/tmux/poller.ts';
import { isolatedTmux } from './helpers/isolated-tmux.mjs';

const fixture = await isolatedTmux();
const saved = process.env.PATH;
process.env.PATH = fixture.env.PATH;
const firstRead = Promise.withResolvers();
const release = Promise.withResolvers();
let reads = 0;
const poller = startTmuxPoller('pi-poller-test', 60000, async () => {
  if (++reads === 1) {
    firstRead.resolve();
    await release.promise;
  }
});
try {
  await firstRead.promise;
  const shared = poller.refreshNow();
  execFileSync('tmux', ['new-session', '-d', '-s', 'pi-poller-test'], { env: fixture.env });
  const fresh = poller.refreshNow(true);
  assert.equal(reads, 1, 'refreshes remain serialized');
  release.resolve();
  assert.equal((await shared).exists, false, 'ordinary refresh shares the pending read');
  assert.equal((await fresh).exists, true, 'launch refresh reads tmux after the pending read');
  assert.equal(reads, 2);
  console.log('poller serialization and fresh launch read tests passed');
} finally {
  release.resolve();
  poller.stop();
  process.env.PATH = saved;
  await fixture.cleanup();
}
