import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/tasks-panel.ts', import.meta.url), 'utf8');

assert.equal(source.includes('ctx.ui.confirm'), false, 'tasks panel must not open an external confirm dialog');
assert.equal(source.includes('[y] kill  ${theme.fg("accent", "[n/esc]")} cancel'), false, 'inline kill confirmation must not duplicate footer actions');
assert.match(source, /const hint = pendingKillTask[\s\S]*\[y\][\s\S]*\[n\/esc\]/, 'kill confirmation actions should live in the panel footer');

console.log('tasks panel static tests passed');
