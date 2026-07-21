# pi-tmux-task

`pi-tmux-task` 是一个 Pi 扩展包，用来管理当前 Pi 对话里的后台任务。

它适合这些需要在后台持续运行的场景：

- 开发服务器；
- watch 命令；
- 较长的测试、构建或扫描；
- 持续 tail 日志；
- 等待一段时间后的结果检查；
- 并行后台子任务。

底层使用 `tmux`，但用户不需要直接管理 tmux session。正常使用方式是直接让 Pi “把这个作为后台任务运行”。

[English README](README.md)

## 功能

- **后台任务约定**：一个 Pi 对话对应一个 tmux task session，一个逻辑任务对应一个 tmux window。
- **任务通知**：任务退出、响铃、等待输入或意外消失时，可以通知当前 Pi 对话。
- **任务查看与管理**：`/tmux-tasks` 可以查看任务、预览输出、清理已退出任务窗口或终止任务。
- **对话隔离**：不同 Pi 对话使用不同 task session，避免任务串到别的对话。
- **自动清理**：没有活跃任务的 session 会在安全时清理；仍在运行的任务会保留。

## 包含的资源

- **Pi extension**：`src/index.ts`
  - 注入当前对话的 `PI_TMUX_SESSION`；
  - 轮询 tmux task 状态；
  - 推送任务事件通知；
  - 注册 `/tmux-tasks` 命令。

- **Skill**：`skills/tmux-task-manager/SKILL.md`
  - 指导 agent 判断什么时候应该使用后台任务；
  - 规定任务命名、检查、通知消费和清理方式。

- **Skill helper script**：`skills/tmux-task-manager/tmux-task-run.sh`
  - skill 内部配套脚本；
  - agent 按 skill 相对路径调用；
  - 不是面向用户的全局命令。

- **Slash command**：`/tmux-tasks`
  - 面向用户查看和管理当前 Pi 对话的后台任务。

## 使用方式

安装后，在 Pi 里直接提出后台任务需求即可：

```text
启动 dev server，放在后台跑。
```

```text
跑一下这个长测试，结束后告诉我结果。
```

```text
持续看 worker 日志，如果有错误提醒我。
```

查看当前对话的后台任务：

```text
/tmux-tasks
```

清理已退出的任务窗口：

```text
/tmux-tasks prune-dead
```

终止当前对话的全部后台任务：

```text
/tmux-tasks kill-all
```

## 安装

```bash
pi install npm:pi-tmux-task
```

指定版本：

```bash
pi install npm:pi-tmux-task@0.2.0
```

项目本地安装：

```bash
pi install -l npm:pi-tmux-task
```

临时试用一次：

```bash
pi -e npm:pi-tmux-task
```

需要系统中已有 `tmux`。

## 文档

- [Architecture and lifecycle](docs/architecture.md)
- [Task event flow](docs/tmux-task-event-flow.md)

## Development

```bash
npm install
npm run check
```

Pi 直接加载 TypeScript extension source，没有单独 build 步骤。

## License

MIT. See [LICENSE](LICENSE).
