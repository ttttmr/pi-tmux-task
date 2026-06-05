按这个 skill 的约定，重新跑一遍 `api-server` 时，应该用“同名 window 先替换，再拿新 window id 做后续观测”的流程。

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  PI_TMUX_SESSION="$(./tmux-session-name.sh)"
  export PI_TMUX_SESSION
fi

tmux has-session -t "$PI_TMUX_SESSION" 2>/dev/null || \
  tmux new-session -d -s "$PI_TMUX_SESSION" -n shell

TASK_NAME="api-server"

EXISTING_WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$EXISTING_WINDOW_ID" ]]; then
  tmux kill-window -t "$EXISTING_WINDOW_ID"
fi

tmux new-window -t "$PI_TMUX_SESSION" -n "$TASK_NAME" \
  "bash -lc 'cd \"$PWD\" && <你的 api 启动命令>'"

WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$WINDOW_ID" ]]; then
  tmux setw -t "$WINDOW_ID" remain-on-exit on
fi
```

关键点有 3 个：

1. `api-server` 作为固定 window name，用来表达任务语义。
2. 如果之前已经有同名后台任务，先按名字找到旧 window，然后 `kill-window`，这就是 replace 旧任务。
3. 新窗口启动后，立刻解析出新的 `window id`，并执行：
   ```bash
   tmux setw -t "$WINDOW_ID" remain-on-exit on
   ```
   这样任务退出后窗口不会立刻消失，便于观测退出状态。

之后建议都优先用 `window id` 做精确操作，而不是继续只靠名字。

例如：

查看当前任务列表：
```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
```

查看退出状态：
```bash
tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

抓最近日志：
```bash
tmux capture-pane -pt "$WINDOW_ID" -S -80
```

按这个约定，通知里也会同时带上 id 和 name，比如 `@12 (api-server)`；后续如果看到 exited / waiting for input / disappeared from session，就能明确知道对应的是哪一个任务。