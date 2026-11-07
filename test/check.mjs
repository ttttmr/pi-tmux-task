// Keep every check away from the user's default tmux server and configuration.
import { execFileSync } from 'node:child_process';
import { isolatedTmux, repo } from './helpers/isolated-tmux.mjs';

const fixture = await isolatedTmux();
const options = { cwd: repo, env: fixture.env, stdio: 'inherit' };
try {
  execFileSync('bash', ['test/tmux-integration.sh'], options);
  for (const name of ['context', 'events', 'stale', 'session-title', 'index-functions', 'tasks-panel-static', 'tasks-overview', 'poller', 'late-start']) {
    execFileSync(process.execPath, ['--experimental-strip-types', `test/${name}.mjs`], options);
  }
  execFileSync(process.execPath, ['--experimental-strip-types', '-e', "import('./src/index.ts')"], options);
} finally {
  await fixture.cleanup();
}
