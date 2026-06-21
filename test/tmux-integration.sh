#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

pass() {
  echo "[PASS] $*"
}

require_tmux() {
  command -v tmux >/dev/null 2>&1 || fail "tmux is required for integration test"
}

cleanup_session() {
  local name="$1"
  tmux kill-session -t "$name" >/dev/null 2>&1 || true
}

save_tmux_global_env() {
  tmux show-environment -g "$1" 2>/dev/null || true
}

restore_tmux_global_env() {
  local name="$1"
  local saved="$2"
  if [[ "$saved" == "$name="* ]]; then
    tmux set-environment -g "$name" "${saved#*=}" >/dev/null
  else
    tmux set-environment -gu "$name" >/dev/null 2>&1 || true
  fi
}

require_tmux

old_global_pi_session_id="$(save_tmux_global_env PI_SESSION_ID)"
old_global_pi_tmux_session="$(save_tmux_global_env PI_TMUX_SESSION)"

session_id="019e4988-b257-7be4-a6f7-b945f8fb7d36"
session_name="pi-example-project-${session_id}"
cleanup_session "$session_name"
cleanup_all() {
  cleanup_session "$session_name"
  restore_tmux_global_env PI_SESSION_ID "$old_global_pi_session_id"
  restore_tmux_global_env PI_TMUX_SESSION "$old_global_pi_tmux_session"
}
trap cleanup_all EXIT

if tmux new-session -d -s "$session_name" -n shell; then
  actual_name="$(tmux list-sessions -F '#{session_name}' | grep -Fx "$session_name" || true)"
  [[ "$actual_name" == "$session_name" ]] || fail "session name should round-trip exactly"
  pass "session name round-trips exactly"
else
  fail "failed to create expected session name"
fi

if tmux new-window -d -t "$session_name" -n integration-test; then
  pass "can create window in session"
else
  fail "failed to create window in session"
fi

window_id="$(tmux list-windows -t "$session_name" -F '#{window_name}|#{window_id}' | awk -F '|' '$1=="integration-test"{print $2; exit}')"
[[ -n "$window_id" ]] || fail "window id should be discoverable"
pass "window id discovered"

tmux setw -t "$window_id" remain-on-exit on >/dev/null
tmux respawn-window -k -t "$window_id" 'printf "hello from integration test\n"; exit 0' >/dev/null
sleep 1
preview="$(tmux capture-pane -p -t "$window_id" -S -20)"
[[ "$preview" == *"hello from integration test"* ]] || fail "capture-pane should show command output"
pass "capture-pane works"

if env -u PI_TMUX_SESSION "$ROOT_DIR/skills/tmux-task-manager/tmux-task-run.sh" helper-run -- 'printf "should fail without session\\n"' >/tmp/pi-tmux-task-run-no-session.out 2>/tmp/pi-tmux-task-run-no-session.err; then
  fail "run helper should require PI_TMUX_SESSION"
fi
if ! grep -q 'PI_TMUX_SESSION is required' /tmp/pi-tmux-task-run-no-session.err; then
  fail "run helper should explain missing PI_TMUX_SESSION"
fi
pass "tmux-task-run helper requires explicit session env"

helper_cwd="/tmp/pi-tmux-task-helper-cwd"
mkdir -p "$helper_cwd"
tmux set-environment -g PI_SESSION_ID stale-pi-session >/dev/null
tmux set-environment -g PI_TMUX_SESSION stale-tmux-session >/dev/null
run_output="$(cd "$helper_cwd" && PI_TMUX_SESSION="$session_name" "$ROOT_DIR/skills/tmux-task-manager/tmux-task-run.sh" helper-run -- 'printf "from helper run cwd=%s\\n" "$PWD"; printf "task env session=%s pi=%s\\n" "${PI_TMUX_SESSION:-missing}" "${PI_SESSION_ID-unset}"; exit 0')"
[[ "$run_output" == *"task=helper-run"* ]] || fail "run helper should report task name"
[[ "$run_output" == *"cwd=$helper_cwd"* ]] || fail "run helper should report task cwd"
sleep 1
helper_run_window_id="$(tmux list-windows -t "$session_name" -F '#{window_name}|#{window_id}' | awk -F '|' '$1=="helper-run"{print $2; exit}')"
[[ -n "$helper_run_window_id" ]] || fail "run helper should create task window"
helper_run_preview="$(tmux capture-pane -p -t "$helper_run_window_id" -S -20)"
helper_run_preview_flat="$(printf '%s' "$helper_run_preview" | tr -d '\n')"
[[ "$helper_run_preview" == *"from helper run cwd=$helper_cwd"* ]] || fail "run helper should execute command in configured cwd"
[[ "$helper_run_preview_flat" == *"task env session=$session_name pi=unset"* ]] || fail "run helper should pass only the effective PI_TMUX_SESSION into task panes"
window_task_command="$(tmux list-windows -t "$session_name" -F '#{window_name}|#{@pi_task_command}' | awk -F '|' '$1=="helper-run"{print $2; exit}')"
[[ "$window_task_command" == *'printf "from helper run cwd=%s'* ]] || fail "run helper should store display command in tmux window metadata"
[[ "$window_task_command" == *'exit 0'* ]] || fail "run helper should store the full display command in tmux window metadata"
window_task_cwd="$(tmux list-windows -t "$session_name" -F '#{window_name}|#{@pi_task_cwd}' | awk -F '|' '$1=="helper-run"{print $2; exit}')"
[[ "$window_task_cwd" == "$helper_cwd" ]] || fail "run helper should store task cwd in tmux window metadata"
if ! tmux show-hooks -t "$session_name" | grep -q 'alert-bell\[9010\].*@pi_tmux_task_bell_count'; then
  fail "run helper should install project bell counter hook"
fi
session_task_env="$(tmux show-environment -t "$session_name" PI_TMUX_SESSION 2>/dev/null || true)"
[[ "$session_task_env" == "PI_TMUX_SESSION=$session_name" ]] || fail "run helper should store PI_TMUX_SESSION in the tmux session environment"
pass "tmux-task-run helper works"

wrapper_probe="$(cd "$ROOT_DIR" && LC_CTYPE= SESSION_NAME="$session_name" node --experimental-strip-types --input-type=module <<'EOF'
import { tmuxListPanes, tmuxListWindows } from './src/tmux/commands.ts';
const windows = await tmuxListWindows(process.env.SESSION_NAME);
const panes = await tmuxListPanes(process.env.SESSION_NAME);
const helperWindow = windows.find((window) => window.windowName === 'helper-run');
const helperPane = panes.find((pane) => pane.windowName === 'helper-run');
const integrationPane = panes.find((pane) => pane.windowName === 'integration-test');
const helperPaneStatus = helperPane?.paneId ? 'pane' : 'missing';
console.log(`${helperWindow?.windowId ?? ''}|${helperWindow?.taskCwd ?? ''}|${helperPaneStatus}|${integrationPane?.dead ? 'dead' : 'live'}|${integrationPane?.exitCode ?? ''}`);
EOF
)"
[[ "$wrapper_probe" == "$helper_run_window_id|$helper_cwd|pane|dead|0" ]] || fail "tmux command wrappers should parse all session panes, including non-active dead panes, under C locale"
pass "tmux command wrappers parse session-wide panes under C locale"

if PI_TMUX_SESSION="$session_name" "$ROOT_DIR/skills/tmux-task-manager/tmux-task-run.sh" 'bad name' -- 'printf bad' >/tmp/pi-tmux-task-run-bad-name.out 2>/tmp/pi-tmux-task-run-bad-name.err; then
  fail "run helper should reject invalid task names"
fi
if ! grep -q 'invalid task name' /tmp/pi-tmux-task-run-bad-name.err; then
  fail "run helper should explain invalid task names"
fi
pass "tmux-task-run helper validates task names"

fresh_session_name="pi-another-example-project-${session_id}"
cleanup_session "$fresh_session_name"
first_run_output="$(PI_TMUX_SESSION="$fresh_session_name" "$ROOT_DIR/skills/tmux-task-manager/tmux-task-run.sh" first-task -- 'printf "from first task\\n"; exit 0')"
[[ "$first_run_output" == *"task=first-task"* ]] || fail "first task should report task name"
sleep 1
window_names="$(tmux list-windows -t "$fresh_session_name" -F '#{window_name}')"
[[ "$window_names" == "first-task" ]] || fail "fresh session should contain only the task window, not a bootstrap shell"
first_task_preview="$(tmux capture-pane -p -t "$fresh_session_name:first-task" -S -20)"
[[ "$first_task_preview" == *"from first task"* ]] || fail "first task should run in the initial window"
pass "fresh session starts directly with the task window"
cleanup_session "$fresh_session_name"

scheduled_output="$(PI_TMUX_SESSION="$session_name" "$ROOT_DIR/skills/tmux-task-manager/tmux-task-run.sh" helper-delay -- 'sleep 1; printf "\\a"; echo delayed helper fired; exit 0')"
[[ "$scheduled_output" == *"task=helper-delay"* ]] || fail "sleep-based delayed task should report task name"
sleep 2
helper_delay_window_id="$(tmux list-windows -t "$session_name" -F '#{window_name}|#{window_id}' | awk -F '|' '$1=="helper-delay"{print $2; exit}')"
[[ -n "$helper_delay_window_id" ]] || fail "sleep-based delayed task should create task window"
helper_delay_preview="$(tmux capture-pane -p -t "$helper_delay_window_id" -S -40)"
[[ "$helper_delay_preview" == *"delayed helper fired"* ]] || fail "sleep-based delayed task should eventually execute command"
helper_delay_bell_count="$(tmux show-option -wqv -t "$helper_delay_window_id" @pi_tmux_task_bell_count || true)"
[[ "${helper_delay_bell_count:-0}" -ge 1 ]] || fail "sleep-based delayed task should increment bell counter"
pass "sleep-based delayed task works through tmux-task-run"

echo "tmux integration tests passed"
