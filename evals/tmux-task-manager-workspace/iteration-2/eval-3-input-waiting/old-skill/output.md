这个状态应该理解为：后台任务还没有失败或结束，而是卡在了一个需要人工确认的交互提示上。`Proceed with migration? [y/N]` 说明该任务所在的 tmux 窗口正在等待输入，所以扩展才会发 `waiting for input` 通知。按这个 skill 的约定，这类通知要优先处理，先检查现有任务窗口，不要另外新开一个重复任务。

建议这样做：

1. 先定位原来的 tmux 任务窗口
   - 优先用通知里带的 `window id`，因为 skill 里明确说一旦窗口已存在，就把 `window id` 当成精确引用。
   - 如果只有窗口名，也可以先按窗口名定位。
   - 还要继续复用当前项目的共享 session：优先 `PI_TMUX_SESSION`，没有的话再用 `./tmux-session-name.sh` 算。

2. 抓最近输出，确认它到底停在什么地方
   - 不要重启，先 inspect 现有窗口。
   - 常见做法是抓这个窗口最近几十到几百行输出，例如：

   ```bash
   tmux capture-pane -pt <window-id-or-session:window> -S -120
   ```

   如果想直接看更完整一点：

   ```bash
   tmux capture-pane -pt <window-id-or-session:window> -S -300
   ```

   重点看：
   - 迁移工具名称
   - 提示前的最后几行日志
   - 它是在 asking for confirmation，还是还有别的报错/警告

3. 继续处理这个交互
   - 现在这个提示的含义是：默认是否定（`[y/N]`），直接回车通常等于 `N`。
   - 只有在你确认这次 migration 本来就应该继续时，才向该 tmux 窗口发送 `y` 并回车。
   - 如果你不确定，就不要盲目发 `y`；先看最近输出，确认这是预期的迁移。

   发送输入通常就是对原窗口直接发键：

   ```bash
   tmux send-keys -t <window-id-or-session:window> y Enter
   ```

   如果你决定取消：

   ```bash
   tmux send-keys -t <window-id-or-session:window> Enter
   ```

   或者明确发 `n` 再回车：

   ```bash
   tmux send-keys -t <window-id-or-session:window> n Enter
   ```

4. 发完以后再抓一次最近输出确认结果
   - 看它是继续跑了、成功结束了，还是失败了。
   - 如果失败，再根据输出解释原因；如果它本来就应该长期运行，再考虑在同一个逻辑窗口里重启，而不是新建重复窗口。

简化理解就是：
- `waiting for input` = 任务被交互提示阻塞了，不是已经挂了
- 先 inspect 原窗口，抓最近输出
- 确认提示含义后，再往同一个 tmux 窗口发送 `y/N`
- 处理完再检查后续输出，不要直接新开重复任务