我会按这个 skill 的约定，用共享的项目级 tmux session 跑这个长期任务，不阻塞当前回合。

这个项目如果没有现成的 `PI_TMUX_SESSION`，session 名应是：`pi-task:pi-tmux-task-a61`
建议前端任务名：`frontend-dev`

不过我看了这个仓库，当前 `package.json` 里没有现成的前端 `dev` 脚本，所以把下面的 `<你的前端启动命令>` 换成实际命令即可，比如 `npm run dev`、`pnpm dev`、`vite`。

启动：

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  PI_TMUX_SESSION="pi-task:pi-tmux-task-a61"
  export PI_TMUX_SESSION
fi

tmux has-session -t "$PI_TMUX_SESSION" 2>/dev/null || \
  tmux new-session -d -s "$PI_TMUX_SESSION"

tmux new-window -d \
  -t "$PI_TMUX_SESSION" \
  -n "frontend-dev" \
  "cd /Users/bytedance/Dev/pi-tmux-task && <你的前端启动命令>"
```

后续查看状态：

```bash
# 看这个项目 session 里有哪些后台任务
tmux list-windows -t "$PI_TMUX_SESSION"

# 看 frontend-dev 最近的输出
tmux capture-pane -pt "$PI_TMUX_SESSION:frontend-dev" -S -80

# 看它是否还活着、退出码是多少
tmux list-panes -t "$PI_TMUX_SESSION:frontend-dev" \
  -F '#{window_id}\t#{window_name}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
```

如果你想直接进入这个任务看实时输出：

```bash
tmux attach -t "$PI_TMUX_SESSION"
```

停止它：

```bash
tmux kill-window -t "$PI_TMUX_SESSION:frontend-dev"
```

后面如果要重启同一个前端任务，按这个 skill 的约定，优先复用同一个 `frontend-dev` 任务槽，不要再新建一个重复窗口。