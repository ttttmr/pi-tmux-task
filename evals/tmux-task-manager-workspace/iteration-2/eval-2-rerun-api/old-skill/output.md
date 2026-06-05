按这个 skill 的约定，应该这样做：

1. 继续使用同一个项目级 tmux session
   - 优先复用 `PI_TMUX_SESSION`
   - 如果没有，就用 `./tmux-session-name.sh` 算出 session 名
   - 不要新建一个临时的、按聊天隔离的 session

2. 这次任务名用 `api-server`
   - 这个名字比 `api` 更有语义，符合“一个逻辑任务对应一个有意义的 tmux window”
   - 之后同一个 API 服务都继续复用这个 window

3. rerun 旧任务时，优先复用已有的 `api-server` window
   - 先检查这个 window 是否已经存在
   - 如果里面旧进程还在跑，先做干净中断，再在同一个 window 里重新启动
   - 不要直接再开一个新的同名/近似名后台任务，避免出现重复窗口和状态混乱

4. 只有在旧 window 明显坏掉、卡死、不可复用时，才替换它
   - 正常情况下不要为了“重跑”就新建另一个窗口
   - 复用原 window 的好处是任务身份稳定，观察链路更清晰

5. 为了便于后续观测退出状态，要尽量保持同一个 window id
   - 在同一个已有 window 内 rerun，可以尽量保留原有 `window id`
   - 这样后续无论是 started、exited successfully、failed、waiting for input、disappeared 之类通知，都更容易稳定关联到同一个任务
   - 一旦 window 已存在，后续排查和观测时应优先按 `window id` 精确识别，`window name` 作为辅助

6. 如果后面收到退出或异常通知，按这个约定处理
   - `exited successfully`：说明这次运行正常结束
   - `failed`：先检查该 window 输出，解释原因；如果它本来就该持续运行，再用同一个 `api-server` 名字重启
   - `waiting for input`：优先检查是否有交互阻塞
   - `disappeared`：先确认是不是被人为替换/关闭；如果不是预期，就在同名任务下恢复

一句话总结：
- 这次把 API 服务固定命名为 `api-server`
- rerun 时优先复用已有 `api-server` window，而不是创建重复任务
- 先中断旧进程，再在原 window 内重跑
- 这样最有利于后续持续观测退出状态，尤其是稳定追踪同一个 `window id`
