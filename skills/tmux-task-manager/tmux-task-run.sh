#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  tmux-task-run.sh <task-name> -- <shell-command>

Requires:
  PI_TMUX_SESSION must already be set by the Pi tmux-task extension.

Example:
  ./tmux-task-run.sh api-server -- 'npm run dev'
EOF
  exit 1
}

require_session() {
  if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
    cat >&2 <<'EOF'
tmux-task-run: PI_TMUX_SESSION is required.

This helper intentionally does not compute or guess the session name. Run it from a Pi session where the tmux-task extension injects PI_TMUX_SESSION.
EOF
    exit 1
  fi

  printf '%s\n' "$PI_TMUX_SESSION"
}

validate_task_name() {
  local task_name="$1"
  if [[ ! "$task_name" =~ ^[A-Za-z0-9._-]{1,40}$ ]]; then
    cat >&2 <<'EOF'
tmux-task-run: invalid task name.

Use 1-40 characters from: letters, numbers, dot, underscore, hyphen.
Examples: frontend-dev, api-server, tests-watch, scan-deps
EOF
    exit 1
  fi
}

resolve_task_cwd() {
  local task_cwd="$PWD"
  case "$task_cwd" in
    /*) ;;
    *)
      echo "tmux-task-run: task cwd must be absolute: $task_cwd" >&2
      exit 1
      ;;
  esac
  printf '%s\n' "$task_cwd"
}

ensure_task_session() {
  local session="$1"
  local task_name="$2"
  local task_cwd="$3"

  if tmux has-session -t "$session" 2>/dev/null; then
    return 1
  fi

  tmux new-session -d -s "$session" -n "$task_name" -c "$task_cwd"
  return 0
}

find_window_id_by_name() {
  local session="$1"
  local task_name="$2"
  local matches

  matches="$(tmux list-windows -t "$session" -F '#{window_name}|#{window_id}' 2>/dev/null | awk -F '|' -v name="$task_name" '$1==name{print $2}')"
  local count
  count="$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$count" -gt 1 ]]; then
    echo "tmux-task-run: multiple windows named '$task_name' exist in $session; rename or remove duplicates first" >&2
    exit 1
  fi

  printf '%s\n' "$matches" | sed '/^$/d' | head -n1
}

install_bell_hook() {
  local session="$1"
  tmux set-hook -t "$session" 'alert-bell[9010]' \
    'run-shell '\''tmux set-option -w -t "#{hook_window}" @pi_tmux_task_bell_count "#{e|+:#{?@pi_tmux_task_bell_count,#{@pi_tmux_task_bell_count},0},1}" >/dev/null 2>&1'\''' >/dev/null
}

set_task_session_environment() {
  local session="$1"
  tmux set-environment -t "$session" PI_TMUX_SESSION "$session" >/dev/null
}

normalize_display_command() {
  local command_string="$1"
  printf '%s' "$command_string" | tr '\n\t' '  ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'
}

main() {
  local task_name command_string session window_id shell_command shell_payload display_command pane_id task_cwd

  [[ $# -ge 3 ]] || usage
  task_name="$1"
  shift
  [[ "$1" == "--" ]] || usage
  shift
  [[ $# -ge 1 ]] || usage
  command_string="$*"

  validate_task_name "$task_name"
  session="$(require_session)"
  task_cwd="$(resolve_task_cwd)"
  ensure_task_session "$session" "$task_name" "$task_cwd" || true
  install_bell_hook "$session"
  set_task_session_environment "$session"

  display_command="$(normalize_display_command "$command_string")"
  shell_payload="set -euo pipefail
export PI_TMUX_SESSION=$(printf '%q' "$session")
unset PI_SESSION_ID
unset PI_TMUX_ROOT_CWD
$command_string"
  shell_command="bash -lc $(printf '%q' "$shell_payload")"
  window_id="$(find_window_id_by_name "$session" "$task_name")"

  if [[ -z "$window_id" ]]; then
    tmux new-window -d -t "$session" -n "$task_name" -c "$task_cwd"
    window_id="$(find_window_id_by_name "$session" "$task_name")"
  fi

  [[ -n "$window_id" ]] || {
    echo "tmux-task-run: failed to resolve window id for task '$task_name'" >&2
    exit 1
  }

  tmux setw -t "$window_id" remain-on-exit on >/dev/null
  tmux set-option -w -t "$window_id" @pi_task_command "$display_command" >/dev/null
  tmux set-option -w -t "$window_id" @pi_task_cwd "$task_cwd" >/dev/null
  tmux respawn-window -k -c "$task_cwd" -t "$window_id" "$shell_command"
  pane_id="$(tmux list-panes -t "$window_id" -F '#{pane_id}' | head -n1)"
  if [[ -n "$pane_id" ]]; then
    tmux select-pane -t "$pane_id" -T "$display_command" >/dev/null
  fi

  printf 'session=%s\nwindow_id=%s\ntask=%s\ncwd=%s\n' "$session" "$window_id" "$task_name" "$task_cwd"
}

main "$@"
