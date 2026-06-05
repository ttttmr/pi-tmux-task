`tmux task @12 (web) disappeared from session` 的意思是：

这个通知里提到的旧任务窗口实例已经不在当前 tmux session 里了。按这个 skill 的约定，它通常不是一个“正常退出码”通知，而是说明这个 window 本身已经被移除，所以需要先判断它是不是被预期地 kill / replace 掉了。

可以这样理解：
- `@12` 是旧的 window id
- `web` 是这个任务的人类可读名称
- `disappeared from session` 表示这个旧 window 已经从 session 的窗口列表里消失

常见发生场景：
1. 你或别的流程手动执行了 `tmux kill-window -t @12`
2. 按 skill 的“start / replace flow”重新启动同名任务时，先把旧同名窗口 kill 掉，再创建新的同名窗口
3. tmux session 被重建、清理，导致原来的 window id 不存在了
4. 有人改了窗口名、移动了窗口，或者直接删掉了那个窗口，导致扩展再也找不到原来跟踪的那个实例

它和下面几种通知不同：
- `exited with code 0/1`：窗口还在，只是进程退出了
- `disappeared from session`：连窗口实例都没了，扩展无法再按原 window id 跟踪它

下一步判断是不是预期行为，按这个顺序看：

1. 先看你刚才是否主动重跑过同名任务
   - 如果你刚执行过一次同名任务重启，例如把 `web` 重新拉起，那么旧窗口被替换掉通常是预期行为

2. 列出当前 session 里的窗口，检查同名窗口是否还在
   ```bash
   tmux list-windows -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}'
   ```
   重点看：
   - `web` 这个名字是否还在
   - 是否只是 `@12` 消失了，但出现了新的 id，比如 `@15 (web)`

3. 如果同名新窗口存在，基本可判断为“被替换”，通常是预期行为
   - 这时后续应改用新的 `window id` 跟踪，而不是继续看旧的 `@12`

4. 如果同名窗口也不存在，再判断是不是被意外删掉了
   - 这通常表示任务被 kill 了、session 被清了，或者任务管理流程之外有人动过 tmux

5. 如需进一步确认当前是否还有相关进程或窗口内容，可检查 pane 状态
   ```bash
   tmux list-panes -t "$PI_TMUX_SESSION" -F '#{window_id}\t#{window_name}\t#{pane_id}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}'
   ```

6. 如果找到了新的目标窗口，再抓最近输出确认它是不是你预期启动的那个任务
   ```bash
   tmux capture-pane -pt "@15" -S -80
   ```

简化判断原则：
- 旧 id 消失，但同名任务以新 id 存在：大概率是预期的 replace
- 旧 id 消失，且同名任务也不存在：更像非预期，需要排查是谁删了窗口或 session
- 如果你本来就打算停止这个任务：那也是预期行为

一句话总结：
`disappeared from session` 重点不是“进程退出了没”，而是“旧窗口实例已经没了”。下一步先用 `list-windows` 看同名窗口是否被新 id 替代；如果是，就是预期 replace；如果不是，再按意外删除或 session 变化排查。