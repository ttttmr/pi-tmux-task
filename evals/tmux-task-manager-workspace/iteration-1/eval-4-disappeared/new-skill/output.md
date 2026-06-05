`tmux task disappeared from session` 的意思是：

- 之前已经观察到的那个 tmux task，对应的 tmux window 现在已经不在这个 session 里了。
- 这首先是一个“窗口消失”事件，不等同于“进程正常退出”。
- 也就是说，agent 不能直接把它当成 success / failed，需要先判断这个 window 为什么没了。

常见发生场景：

1. 预期内的情况
   - 有人手动把这个 tmux window kill 掉了
   - 为了重跑任务，旧 window 被替换掉了
   - 任务语义变了，window 被重命名或迁移，不再保留原来的那个 window
   - 整个 session 被重建，原来的 window 自然消失

2. 非预期的情况
   - 操作时误删了错误的 window
   - 某个自动化脚本在清理 tmux window
   - restart 流程没有复用原 window，而是删掉后没有成功拉起新任务
   - session / window 状态异常，导致原 task 不见了

下一步应该怎么判断是不是预期行为：

1. 先确认这是“窗口消失”，不要直接推断成任务成功结束
   - 因为 skill 明确要求把 disappeared 当成 window-level disappearance，而不是 normal exit

2. 检查这个 task 对应的 window 是否是被有意 kill / replace / remove
   - 最近是否刚执行过重启、重跑、替换 window 的动作
   - 是否有人明确要求停止该任务
   - 是否发生了 session 重建

3. 看 session 里剩余的 task 状态
   - 同名 window 是否以另一种方式重新出现了
   - 是否有一个新的 window 在承担同一个逻辑任务
   - 是否只是 window id 变了，但任务本质还在

4. 用“逻辑任务”而不是“旧 window 是否存在”来判断
   - skill 的规则是 one logical task = one tmux window
   - 所以要判断：这个逻辑任务现在是否仍然以某个合理的 window 存在
   - 如果存在，只是旧 window 被替换，那通常是预期行为
   - 如果任务本来应该持续运行，但现在整个 session 里都没有它了，那通常不是预期行为

5. 如果不是预期行为
   - 先 inspect 剩余状态
   - 再按同一个 task name 把它重启回来
   - 如果任务本来就应该持续存在，这是 skill 推荐的处理方式

可以用一个简化判断标准：

- 如果 window 消失是因为“用户主动停了 / agent 明确替换了 / session 合理重建了”，通常算预期行为。
- 如果 window 消失后，这个本应继续存在的逻辑任务也一起没了，而且没有明确的替换理由，通常算非预期行为。

如果我要按这个 skill 来处理，我会把它理解为：

1. 先查这个 window 为什么不见了
2. 再确认同一个逻辑任务是否还在别的 window 里运行
3. 若只是被有意替换，说明是预期行为
4. 若任务本该继续跑却真的消失了，就视为异常，检查后按原 task name 重启