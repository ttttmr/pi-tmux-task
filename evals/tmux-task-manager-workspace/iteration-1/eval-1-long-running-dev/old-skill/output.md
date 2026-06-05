可以，用 tmux 按这个 skill 的约定起一个独立前端任务，不阻塞当前回合。建议把前端服务放在 `web` 这个 window 里。

先启动：

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  PI_TMUX_SESSION="$(./tmux-session-name.sh)"
  export PI_TMUX_SESSION
fi

tmux has-session -t "$PI_TMUX_SESSION" 2>/dev/null || \
  tmux new-session -d -s "$PI_TMUX_SESSION" -n shell

TASK_NAME=web

EXISTING_WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$EXISTING_WINDOW_ID" ]]; then
  tmux kill-window -t "$EXISTING_WINDOW_ID"
fi

tmux new-window -t "$PI_TMUX_SESSION" -n "$TASK_NAME" \
  "bash -lc 'cd \"$PWD\" && npm run dev'"

WINDOW_ID="$({ tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}' || true; } \
  | awk -F $'\t' -v name="$TASK_NAME" '$2==name { print $1; exit }')"

if [[ -n "$WINDOW_ID" ]]; then
  tmux setw -t "$WINDOW_ID" remain-on-exit on
  echo "tmux task $WINDOW_ID ($TASK_NAME) started"
fi
```

后续查看状态：

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
```

看这个任务是不是还活着、当前跑的是什么：

```bash
tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

看最近输出（把 `@12` 换成你的实际 window id，例如 `@12 (web)`）：

```bash
tmux capture-pane -pt "@12" -S -80
```

停止它：

```bash
tmux kill-window -t "@12"
```

约定上建议你后面都优先记这个任务的 window id，比如 `@12 (web)`：
- `web` 是人看得懂的任务名
- `@12` 是后续精确查看和停止时用的目标

如果你收到类似这些提示：
- `tmux task @12 (web) started`：说明已经启动
- `tmux task @12 (web) exited with code 0/1`：说明进程退出了，要去看输出
- `tmux task @12 (web) is waiting for input ...`：说明它卡在等待输入，需要尽快检查

如果这个项目前端不是 `npm run dev`，把启动命令替换成实际前端命令即可，但 tmux 约定保持不变：同一个 session、一个逻辑任务一个 window、前端用 `web` 这种短名字。