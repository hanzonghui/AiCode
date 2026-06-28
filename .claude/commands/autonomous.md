---
name: autonomous
description: 开启自主演进模式（v2.0 P0-1）—— 开关 ON 后 Claude 自主决策开发，不逐步确认。无参数时弹出选择框，可选 single/always/on/off/status；也支持直接传参
---

打开**自主模式开关**。开关 ON 期间，Claude 会：

- 完成一个功能/增量后**自动选下一个**做（不询问"接下来做啥？"）
- 关键决策点**写入快照**而不是问
- 完成后**自动 commit**（如果安全）

## 行为逻辑

- 如果用户直接带参数（`single` / `always` / `on` / `off` / `status`），立即执行对应操作
- 如果用户只输入 `/autonomous`（即 `<command-message>` 为 `autonomous` 且不含额外参数），使用 `AskUserQuestion` 工具弹出选择框，让用户选择模式

## 交互式选择（无参数时）

当 `<command-message>` 为空时，调用 `AskUserQuestion` 工具，提供以下选项：

| 选项 | 对应操作 |
|:-----|:---------|
| **single** | 运行 `npm run autonomous:single` |
| **always** | 运行 `npm run autonomous:always` |
| **on** | 运行 `npm run autonomous:on` |
| **off** | 运行 `npm run autonomous:off` |
| **status** | 运行 `npm run autonomous:status` |

## 终端方向键菜单（推荐）

```bash
npm run autonomous
```

运行后会弹出方向键菜单，↑↓ 选择，↵ 回车确认：

```
? 选择自主模式 (↑↓ 移动，↵ 确认)
 ❯ single   - 完成当前 1 个阶段后自动停止
   always   - 循环执行阶段（离开时用）
   on       - 只开开关，不启动 runner
   off      - 关闭自主模式
```

选择 `single` 或 `always` 后会**自动启动 runner**；选择 `on`/`off` 只切换开关。

## 显式命令用法

```bash
# single 模式：设置开关为 single
/autonomous single

# always 模式：设置开关为 always
/autonomous always

# 启动 runner 执行阶段（按当前 mode）
npm run autonomous:runner

# 一键启动 single 模式并执行一个阶段
npm run autonomous:single

# 一键启动 always 模式并循环执行阶段
npm run autonomous:always

# 向后兼容：start 等价于 always + runner
npm run autonomous:start -- "周末出去办事"

# 只开开关，不启动 runner（默认 always 模式）
npm run autonomous:on

# 查看状态
npm run autonomous:status

# 关闭
/autonomous-stop
# 或
npm run autonomous:off
```

## 行为对比

| 场景 | OFF | single | always |
|:-----|:----|:-------|:-------|
| 完成 1 个增量后 | 询问"接下来做啥？" | 自动停止 | 自动选下一个 |
| 关键决策 | 询问 | 写入快照继续 | 写入快照继续 |
| commit | 询问 | 自动（安全时） | 自动（安全时） |
| 失败 | 询问 | 5 次后自动停 + 汇报 | 5 次后自动停 + 汇报 |
| 阶段完成后 | 等待用户 | 停止 | 启动新 `claude -p` 继续 |

## 安全边界

- ✅ 自主做：智能增量深化、bug 修、文档、commit
- ⚠️ 慎做：修改 `scripts/orchestrator/`、`.claude/`、CLAUDE.md（commit 前先 snapshot）
- ❌ 不做：push 到远程、删分支、删文件、改主目录外文件

## 关闭

```bash
/autonomous-stop
# 或
npm run autonomous:off
```

## 顶部提示

session-init 顶部会显示当前开关状态：
- 🤖 自主模式: ON（single（单阶段），开启于 2026/6/24 17:11）
- 🤖 自主模式: ON（always（循环），开启于 2026/6/24 17:11）
- 🙋 正常模式: OFF（逐步确认）

## 状态文件

`.claude/skills/left-brain/memory/autonomous-state.json`（gitignore 排除）

示例：

```json
{
  "enabled": true,
  "enabled_at": "2026-06-25T10:00:00.000Z",
  "enabled_by": "user",
  "reason": "我离开1小时",
  "mode": "single"
}
```
