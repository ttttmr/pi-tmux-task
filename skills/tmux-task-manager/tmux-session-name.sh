#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  tmux-session-name.sh [absolute-path] [pi-session-id]

When pi-session-id is omitted, PI_SESSION_ID is used.
EOF
  exit 1
}

input_path="${1:-}"
pi_session_id="${2:-${PI_SESSION_ID:-}}"

if [[ -z "$input_path" ]]; then
  input_path="$(pwd)"
else
  case "$input_path" in
    /*) ;;
    *)
      echo "tmux-session-name: path must be absolute" >&2
      exit 1
      ;;
  esac
fi

if [[ -z "$pi_session_id" ]]; then
  echo "tmux-session-name: pi session id is required; pass it as the second argument or set PI_SESSION_ID" >&2
  exit 1
fi

normalized_path="$(printf '%s' "$input_path" | sed -E 's#/+$##')"
if [[ -z "$normalized_path" ]]; then
  normalized_path="/"
fi

project_name="$(basename "$normalized_path")"
project_slug="$(printf '%s' "$project_name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$project_slug" ]]; then
  project_slug="project"
fi

printf 'pi-%s-%s\n' "$project_slug" "$pi_session_id"
