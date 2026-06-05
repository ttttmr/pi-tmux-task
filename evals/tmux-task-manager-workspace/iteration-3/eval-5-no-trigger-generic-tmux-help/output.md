# tmux 常用快捷键速查表

先记一个前提：tmux 大多数快捷键都要先按前缀键。

- 默认前缀键：`Ctrl-b`
- 下面写成 `Prefix + x`，意思就是先按 `Ctrl-b`，松开后再按 `x`

## 1. 会话 / 窗口 / 面板的概念

- Session：一个 tmux 会话
- Window：一个标签页
- Pane：一个窗口里的分屏

你说的“切窗”通常是指切 `window`，有时也可能是切 `pane`。

---

## 2. 最常用的一组

### 会话相关
- `tmux ls`：查看会话
- `tmux attach -t 名称`：进入会话
- `Prefix + d`：暂时离开当前会话（detach）

### 窗口相关
- `Prefix + c`：新建窗口
- `Prefix + n`：下一个窗口
- `Prefix + p`：上一个窗口
- `Prefix + 0~9`：直接切到指定编号窗口
- `Prefix + ,`：重命名当前窗口
- `Prefix + &`：关闭当前窗口
- `Prefix + w`：列出窗口进行选择

### 面板相关
- `Prefix + %`：左右分屏
- `Prefix + "`：上下分屏
- `Prefix + 方向键`：在面板间切换
- `Prefix + o`：在面板间轮流切换
- `Prefix + x`：关闭当前面板
- `Prefix + z`：当前面板最大化 / 还原
- `Prefix + q`：显示 pane 编号，随后按编号跳转

---

## 3. 你最容易忘的：复制模式

复制模式是 tmux 里查看历史输出、选择文本、复制内容的模式。

### 进入复制模式
- `Prefix + [`

进入后你就可以上下翻历史内容了。

### 复制模式里的常用按键（默认 Emacs 风格）
- `↑ / ↓`：逐行移动
- `PageUp / PageDown`：翻页
- `Ctrl-u`：向上翻半页
- `Ctrl-d`：向下翻半页
- `/`：向下搜索
- `?`：向上搜索
- `n`：下一个搜索结果
- `N`：上一个搜索结果
- `g`：跳到最前
- `G`：跳到最后
- `Space`：开始选择
- `Enter`：复制选中内容并退出复制模式
- `Esc` / `q`：退出复制模式

### 如果是 vi 风格键位（很多人会配这个）
如果你的 tmux 配了 vi key bindings，那么复制模式里常用的是：

- `h j k l`：移动
- `w / b`：按词移动
- `0 / $`：行首 / 行尾
- `g / G`：顶部 / 底部
- `Space`：开始选择
- `Enter`：复制选区
- `/`：搜索
- `n / N`：下一个 / 上一个结果
- `q`：退出复制模式

### 粘贴刚复制的内容
- `Prefix + ]`

也就是：
1. `Prefix + [` 进入复制模式
2. 移动光标，`Space` 开始选
3. `Enter` 复制
4. `Prefix + ]` 粘贴

---

## 4. 切窗快捷键，重点记这几个

如果你老忘“切窗”，优先记下面 4 个就够用了：

- `Prefix + n`：下一个窗口
- `Prefix + p`：上一个窗口
- `Prefix + 0~9`：直接跳到编号窗口
- `Prefix + w`：打开列表选窗口

一个很好记的办法：
- `n = next`
- `p = previous`

---

## 5. 切 pane 和切 window 的区别

### 切 window
- `Prefix + n`
- `Prefix + p`
- `Prefix + 数字`

### 切 pane
- `Prefix + 方向键`
- `Prefix + o`

如果你发现“怎么没切过去”，通常是因为：
- 你想切的是窗口，却按了 pane 的快捷键
- 或者反过来

---

## 6. 推荐你死记的最小集合

如果只背 10 个，我建议背这些：

- `Ctrl-b`：前缀键
- `Prefix + c`：新建窗口
- `Prefix + n`：下一个窗口
- `Prefix + p`：上一个窗口
- `Prefix + 0~9`：切窗口
- `Prefix + %`：左右分屏
- `Prefix + "`：上下分屏
- `Prefix + 方向键`：切 pane
- `Prefix + [`：进入复制模式
- `Prefix + ]`：粘贴复制内容

---

## 7. 一份超短版备忘

```text
前缀键: Ctrl-b

窗口:
Prefix + c      新建窗口
Prefix + n      下一个窗口
Prefix + p      上一个窗口
Prefix + 0~9    切到编号窗口
Prefix + w      列表选窗口

分屏:
Prefix + %      左右分屏
Prefix + "      上下分屏
Prefix + 方向键  切换 pane
Prefix + x      关闭 pane

复制模式:
Prefix + [      进入复制模式
Space           开始选择
Enter           复制并退出
Prefix + ]      粘贴
q / Esc         退出复制模式
```

如果你愿意，我还可以继续给你一份：
1. “tmux for vim 用户版”速查表
2. 或者“适合 iTerm2 / macOS 的 tmux 配置建议”