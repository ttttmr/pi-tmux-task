我会按这个 skill 的约定，用共享的项目级 tmux session 来跑，不阻塞当前回合。

这个项目的 session 名我会用：`pi-task:pi-tmux-task-a61`
建议的窗口名：`frontend-dev`

不过我刚看了这个仓库，当前 `package.json` 里没有现成的前端 `dev` 脚本，所以请把下面命令里的 `<你的前端启动命令>` 替换成真实启动命令，比如 `npm run dev`、`pnpm dev`、`vite` 之类。

启动方式：

```bash
tmux has-session -t "pi-task:pi-tmux-task-a61" 2>/dev/null || \
  tmux new-session -d -s "pi-task:pi-tmux-task-a61"

tmux kill-window -t "pi-task:pi-tmux-task-a61:frontend-dev" 2>/dev/null || true

tmux new-window -d \
  -t "pi-task:pi-tmux-task-a61" \
  -n "frontend-dev" \
  "cd /Users/bytedance/Dev/pi-tmux-task && <你的前端启动命令>"
```

后续查看状态：

```bash
# 看这个项目 session 下有哪些任务窗口
tmux list-windows -t "pi-task:pi-tmux-task-a61"

# 实时进入这个前端任务窗口查看
tmux attach -t "pi-task:pi-tmux-task-a61"
# 进入后切到 frontend-dev 窗口即可

# 不 attach，只看最近输出
tmux capture-pane -pt "pi-task:pi-tmux-task-a61:frontend-dev"
```

停止它：

```bash
tmux kill-window -t "pi-task:pi-tmux-task-a61:frontend-dev"
```

如果这个 session 里只剩这一个任务了，也可以把整个项目 session 一起停掉：

```bash
tmux kill-session -t "pi-task:pi-tmux-task-a61"
```

如果你告诉我这个项目实际要跑的前端命令，我就可以把上面的 `<你的前端启动命令>` 换成可直接执行的最终版本。