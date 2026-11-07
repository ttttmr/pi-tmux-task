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

通过原来的底部状态栏显示三项统计，例如 `tmux:5-3-1`：总数、在跑、失败；数量为零的项连同前面的短横线一起隐藏，总数为零时整项隐藏。在跑包括等待输入、发过通知及状态尚待确认的任务；失败只计入已确认以非零退出码结束的任务。前缀、总数和短横线使用与同行用量文字相同的灰色（dim），在跑数量使用黄色，失败数量使用红色，不加粗。两种终端模式都可按 **Alt+T** 打开任务面板。配合 inline metrics footer 时，全屏模式下点击 tmux 文字即可打开同一个任务面板；Pi 默认 footer 只支持文字，可用 Alt+T。展示位置由当前 footer 决定：Pi 默认 footer 使用独立状态行，inline footer 可拼在用量同一行。使用 `--no-extensions` 测试时，需额外通过 `-e` 加载原来的 inline footer 扩展，才能保留同排布局。面板内展示各任务的细分状态与完整统计，task session 不存在时概览自动隐藏。需要 Pi 1.4.0 或更新版本。

也可以通过命令查看当前对话的后台任务：

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

## 通知交付时机

全局默认配置写入 `~/.pi/agent/tmux-task.json`；项目覆盖配置写入启动 Pi 的目录（`ctx.cwd`）下的 `.pi/tmux-task.json`。两个文件使用相同格式：

```json
{
  "notificationDelivery": "steer"
}
```

| 配置值 | Pi 正在工作时 | Pi 空闲时 |
|---|---|---|
| `followUp`（默认） | 当前模型/工具链将停止、没有更多工具调用时消费；不要求先进入真正 idle。 | 主动启动一轮模型处理。 |
| `steer` | 当前 assistant turn 的工具批次完成后，在下一次模型调用前的安全边界交付；不会打断 token 流或正在运行的命令。 | 主动启动一轮模型处理。 |

优先级为：项目配置 > 全局配置 > 内置默认值 `followUp`。全局文件位于 Pi 的 agent 目录，默认是 `~/.pi/agent`，遵循 `PI_CODING_AGENT_DIR`。文件缺失或内容为 `{}` 时继承下一层；项目显式设置 `followUp` 可以覆盖全局的 `steer`。不向父目录查找。删除项目设置可恢复继承全局配置；删除两级设置可恢复内置默认值。

两级配置都在会话启动时读取，`/reload` 也会重新读取。编辑后执行 `/reload`，后续通知使用新设置。JSON 错误、文件不可读、未知字段或不属于以上两个精确字符串的值，都会显示包含对应文件路径的警告。无效层被忽略，其余有效层继续生效；两级都未提供有效值时使用 `followUp`。这是扩展自己的配置文件，不是 Pi `settings.json` 中的设置项。扩展不会自动写入配置。此处不支持 `nextTurn`：Pi 的这一被动模式留到下一次提示，不会主动唤醒模型。

轮询仍为 2 秒，事件过滤、分组和输入去重保持不变。修改交付时机不等于确认、撤回或取消已排队/已消费事件；查看日志或清理窗口不会清空旧通知。

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
