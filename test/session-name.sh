#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HELPER="$ROOT_DIR/skills/tmux-task-manager/tmux-session-name.sh"
SESSION_ID="019e4988-b257-7be4-a6f7-b945f8fb7d36"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

pass() {
  echo "[PASS] $*"
}

current_from_pwd="$(PI_SESSION_ID="$SESSION_ID" "$HELPER")"
current_from_arg="$($HELPER "$ROOT_DIR" "$SESSION_ID")"

[[ "$current_from_pwd" == "$current_from_arg" ]] || fail "no-arg output should equal explicit absolute path output"
pass "no-arg output matches explicit absolute path"

expected_current="pi-pi-tmux-task-${SESSION_ID}"
[[ "$current_from_pwd" == "$expected_current" ]] || fail "unexpected session name format: $current_from_pwd"
pass "output has expected session-scoped project name"

if [[ "$current_from_pwd" == *:* ]]; then
  fail "session name must not contain ':'"
else
  pass "session name is tmux-safe"
fi

if PI_SESSION_ID="$SESSION_ID" "$HELPER" relative/path >/dev/null 2>&1; then
  fail "relative path should be rejected"
else
  pass "relative path is rejected"
fi

if env -u PI_SESSION_ID "$HELPER" "$ROOT_DIR" >/dev/null 2>&1; then
  fail "missing pi session id should be rejected"
else
  pass "missing pi session id is rejected"
fi

sample_path="/tmp/Example Project"
expected_name="pi-example-project-${SESSION_ID}"
actual_name="$($HELPER "$sample_path" "$SESSION_ID")"
[[ "$actual_name" == "$expected_name" ]] || fail "expected '$expected_name' but got '$actual_name'"
pass "absolute path and session id input are used for naming"

other_session="abcdef1234567890"
other_name="$($HELPER "$sample_path" "$other_session")"
[[ "$other_name" == "pi-example-project-${other_session}" ]] || fail "session id should be used in full"
[[ "$other_name" != "$actual_name" ]] || fail "different pi sessions should get different tmux sessions"
pass "different pi session ids produce different names"

same_basename_other_path="/var/Example Project"
same_basename_other_name="$($HELPER "$same_basename_other_path" "$SESSION_ID")"
[[ "$same_basename_other_name" == "$actual_name" ]] || fail "same basename and session id should produce the same tmux session"
pass "same basename and session id produce the same name"

echo "session-name tests passed"
