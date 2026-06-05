这是一个典型的 `waiting for input` 状态：任务还活着，没有正常完成，也不是已经失败退出，而是被一个交互式确认卡住了。

`Proceed with migration? [y/N]` 的含义通常是：
- 程序已经跑到 migration 确认点
- 现在在等你输入
- 不输入的话，它就会一直阻塞在这里
- `[y/N]` 说明默认偏向 `N`，通常直接回车也不会继续迁移

按这个 skill，你现在的处理顺序应该是：先 inspect，先处理已有任务，不要先重开一个重复任务。

## 1. 先理解当前状态
你现在应该把它理解为：
- 这个后台任务对应的 tmux window 仍然存在
- 扩展的 `waiting for input` 通知是重要信号，不是普通提示
- 当前最优先动作是尽快检查它正在等什么输入

如果通知里已经带了 window id，比如 `@12 (migrate-users)`，后续优先用 `@12` 这种精确引用；window name 只是辅助。

## 2. 先定位到这个任务
优先复用 `PI_TMUX_SESSION`；如果没有，就用这个 skill 里的 helper 算出来：

```bash
if [[ -z "${PI_TMUX_SESSION:-}" ]]; then
  PI_TMUX_SESSION="$(/Users/bytedance/Dev/pi-tmux-task/skills/tmux-task-manager/tmux-session-name.sh)"
  export PI_TMUX_SESSION
fi
```

然后列出当前项目 session 里的任务窗口：

```bash
tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
```

如果通知里已经有 `@12` 这种 id，就直接用它，不一定非要再查一遍。

## 3. 抓最近输出
先看最近几十行，确认它前面到底做了什么、现在卡在哪：

```bash
tmux capture-pane -pt "@12" -S -80
```

如果你还想多看一点上下文：

```bash
tmux capture-pane -pt "@12" -S -200
```

把 `@12` 替换成实际的 window id；如果暂时只有名字，也可以先用 `"$PI_TMUX_SESSION:<window-name>"`。

这一步主要是确认：
- 迁移具体要改什么
- 前面有没有 warning / risk 提示
- 是否真的是你预期里的那次 migration

## 4. 决定怎么继续
### 如果你确认应该继续
向这个已有任务发送确认输入：

```bash
tmux send-keys -t "@12" y Enter
```

### 如果你不想继续，或者还没确认风险
可以发 `n`，或者通常直接回车走默认 `N`：

```bash
tmux send-keys -t "@12" n Enter
```

## 5. 输入后继续观察
发完以后，再抓一次最近输出，确认它是继续执行、成功结束，还是报错：

```bash
tmux capture-pane -pt "@12" -S -100
```

如果你想再确认 pane 还活着，也可以看：

```bash
tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}\t#{pane_title}'
```

## 核心判断
- `waiting for input` = 任务还活着，但被交互提示阻塞了
- 现在不要先重开同类任务
- 先对现有 task slot / tmux window 做 inspect
- 先抓最近输出，再决定回 `y` 还是 `n`
- 通知里如果有 window id，优先按 window id 精确操作
