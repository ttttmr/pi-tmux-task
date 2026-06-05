这个 terminal notification 的意思是：扩展正在监控共享的 tmux task，并发现某个任务窗口发生了值得提示的状态变化。

按这个 skill 的约定，这类通知通常会同时带上：
- window id：例如 `@12`
- window name：例如 `web`

也就是类似：`tmux task @12 (web) ...`

这表示 agent 不应该把它当成一条普通终端输出，而应该把它理解为“共享 tmux session 里的某个后台任务有事件了”，后续优先用 `window id` 做精确操作，用 `window name` 理解任务语义。

应对方式如下：

- `started`
  - 含义：任务已经成功启动。
  - 处理：通常不需要立即动作，只要记住这是哪个窗口即可。

- `exited with code 0`
  - 含义：任务正常完成。
  - 处理：如果这是一次性任务，可视为完成；如果本来预期它应持续运行，就要进一步确认为什么退出。

- `exited with code 1` 或其他非 0
  - 含义：任务失败退出。
  - 处理：应尽快检查该窗口输出，定位报错原因。这属于重要通知。

- `is waiting for input`
  - 含义：任务卡在确认、密码、交互选择等输入点。
  - 处理：应优先处理，因为它已经阻塞，不能继续自动推进。先查看窗口最近输出，判断需要输入什么。

- `disappeared from session`
  - 含义：这个窗口已经不在 tmux session 里了。
  - 处理：要确认这是不是预期行为。它可能是被杀掉了，也可能是同名任务被替换后旧窗口消失了。

agent 的标准处理原则：

1. 把通知对应到共享 tmux session 中的那个任务窗口。
2. 优先使用通知里的 `window id`（如 `@12`）做后续 inspect / capture / kill。
3. 必要时查看当前窗口列表，确认该任务是否还存在。
4. 对失败、等待输入、窗口消失这三类通知要及时跟进；`started` 一般只需记录；`code 0` 一般表示成功结束。

如果需要进一步检查，按这个 skill 的做法通常会：

- 列出任务窗口
  - `tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'`
- 查看 pane 状态
  - `tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'`
- 抓取最近输出
  - `tmux capture-pane -pt "@12" -S -80`

总结一下：
这个通知的本质不是“有人发来一条消息”，而是“某个非阻塞后台 tmux 任务发生了状态事件”。agent 应根据通知类型判断是否要检查输出、补交互输入、确认任务是否失败，或者确认窗口是否被替换/消失。