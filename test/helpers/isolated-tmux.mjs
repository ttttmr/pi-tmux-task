import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;

export async function isolatedTmux() {
  const root = await mkdtemp(join(repo, '.tmux-test-'));
  const socket = join(root, 'socket');
  const tmux = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim();
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'tmux'), `#!/bin/sh\nexec ${quote(tmux)} -f /dev/null -S ${quote(socket)} "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}` };
  delete env.TMUX;
  delete env.TMUX_PANE;
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
`);
  return {
    root, env,
    gateCommand: (file) => `${quote(process.execPath)} ${quote(gate)} ${quote(file)}`,
    async cleanup() {
      try { execFileSync(tmux, ['-S', socket, 'kill-server'], { stdio: 'ignore' }); } catch {}
      await rm(root, { recursive: true, force: true });
    },
  };
}
