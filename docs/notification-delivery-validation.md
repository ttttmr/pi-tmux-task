# Notification delivery integration validation / 通知交付集成验证

Run from this checkout after `npm ci`:

```sh
npm run check:pi-integration
```

`test/pi-delivery-integration.mjs` starts the installed Pi CLI in RPC mode with this checkout's `src/index.ts` loaded via `--no-extensions -e`. It runs real bash tools, the real task helper, tmux windows, the 2-second poller, extension notifications, and Pi's agent loop. Nothing in Pi or the extension is mocked. A loopback HTTP server supplies deterministic OpenAI-compatible streaming responses; it is a model fixture, not an LLM.

The script creates its own agent directory, project configuration, file gates, and tmux socket under the checkout. Pi uses an in-memory session, disables discovered resources and automatic networking, and only calls the loopback endpoint. The tmux server ignores user tmux configuration. All temporary resources are removed on completion or a caught failure. It neither installs this extension globally nor changes user settings or authentication.

## Observed results

Executed on 2026-11-05 with Node.js 24.11.1 and the lockfile's Pi 1.4.0. All three cases passed.

The model fixture first launches a gated background task through Pi's bash tool (request 1). After launch returns, it runs a separate blocked foreground bash tool (request 2). The harness releases the background task and waits for the real poller to report its exit in the footer status. The foreground command must remain running. Once that command is released, the fixture requests another tool (request 3), then finishes without tools (request 4).

| Configuration | First model request containing the exit notification | Foreground command | Idle exit |
|---|---|---|---|
| `followUp` | 5, after the tool chain would stop | Completes normally | Automatically starts request 6 |
| `steer` | 3, immediately after the blocked tool finishes | Completes normally | Automatically starts request 5 |
| Missing config | 5, same as `followUp` | Completes normally | Automatically starts request 6 |

The RPC trace has one `agent_settled` for the initial run, after notification handling. In particular, `followUp` does not require an idle gap. The idle case launches a second gated tmux task after settlement and verifies a new model request without sending another prompt. The test also checks the actual session message's event type, task exit code, and `notUserInput` metadata.

This is stronger than the unit test that calls `AgentSession.sendCustomMessage` with stub sinks: the whole queue/agent loop and HTTP request preparation run in the actual Pi process. It does **not** test an online model, model decision quality, TUI rendering, streaming-token timing, or a real interactive `/reload`. Configuration reload still has deterministic lifecycle coverage in `test/notification-delivery.mjs`.

## 中文说明

上述命令启动真实 Pi RPC 进程，直接加载当前源码。bash、tmux、轮询、通知队列和 agent loop 均使用真实实现；只有模型回答来自本地固定响应服务，不产生在线模型费用。

实测三组全部通过：`steer` 在第 3 次请求就携带退出通知；`followUp` 和缺省配置在第 5 次请求携带通知。两者都等待前台工具正常完成，都可在空闲时由任务退出自动唤醒。`followUp` 的处理发生在 `agent_settled` 之前，不要求先进入 idle。

尚未验证在线模型效果、TUI 展示、token 流期间的具体时序或交互式 `/reload`。本次未修改全局 Pi、已安装扩展或用户配置。
