通常这句话的意思是：扩展上一次轮询时还能在当前 tmux session 里看到这个后台任务对应的 window，这次已经看不到了。

在这个项目里，`disappeared` 的语义是：

- 之前观察到的 tmux window 从 session 里消失了
- 这是“window 级别的消失”
- 不等同于“进程正常退出”

也就是说，它表示“这个任务不在当前 session 里了”，但不直接说明原因。

常见可能性有几类：

1. 预期行为
- 任务跑完后，对应 window 被自动关掉
- 你手动把那个 window kill 掉了
- 你重跑任务时，旧 window 被替换了
- session 被重建了，旧 window 不复存在

2. 非预期行为
- 任务所在的 tmux window 被误删
- tmux session 本身被杀掉或重置
- 扩展观察的是旧 session / session 名变了
- 任务异常结束，但没有被采集成更明确的 `failed` / `exited` 事件，最后只表现为 window 消失

怎么判断是不是预期行为，建议按这个顺序看：

## 1. 先区分它是不是“正常退出”
如果你之前已经看到类似：

- `exited with code 0`
- `failed`

那说明扩展已经拿到了更明确的结束信号；之后再消失，通常就比较正常。

如果只有 `disappeared`，没有看到 `exited` / `failed`，那就只能说明“window 没了”，不能直接认定成功或失败。

## 2. 看这个任务本来是否应该长期存在
如果它本来是：

- watch
- dev server
- tail / monitor
- 长时间扫描

那它突然 disappeared，通常更值得怀疑，因为这类任务一般不该自己很快消失。

如果它本来是：

- 一次性脚本
- 短命构建
- 跑完即退出的命令

那 disappeared 可能就是预期行为，尤其是在任务完成后 window 被自动清理的情况下。

## 3. 检查 tmux session 里还在不在
最直接的方法是看当前项目对应的 tmux session 里，那个 window 是否还存在：

- 如果整个 session 都没了，说明不是单个任务消失，而是 session 级别变化
- 如果 session 还在，但唯独那个 window 没了，说明确实是该任务窗口被关闭或替换
- 如果出现了同名新 window，可能是 rerun / replace 造成的“旧任务消失”

## 4. 结合最近操作判断
如果你刚做过下面这些事，往往是预期行为：

- 手动停止任务
- 重启/替换任务
- 重建 session
- 清理 window

如果你什么都没动，它却自己 disappeared，就更像异常，需要继续看任务日志或 tmux 状态。

## 5. 看它是不是扩展定义里的 warning，而不是 error
这个项目里：

- `failed` 会被当成 `error`
- `input` 和 `disappeared` 会被当成 `warning`

这也反映了设计意图：`disappeared` 是“值得注意”，但信息不足，不能直接断言失败。

## 一个实用判断标准
可以用这条经验规则：

- 已知是一次性任务，且你刚执行过停止/替换/清理操作：大概率是预期行为
- 已知是长期后台任务，却无明确 `exited` / `failed`，然后突然 disappeared：优先按异常看
- 如果同时伴随 session 重建、window 替换：更可能是管理动作导致的预期消失

一句话总结：

`disappeared from session` 通常表示“这个任务对应的 tmux window 不在当前 session 里了”，而不是“它一定成功结束了”。是否预期，主要看它是不是本来就该结束，以及最近是否发生过手动关闭、替换任务或重建 session 这类操作。