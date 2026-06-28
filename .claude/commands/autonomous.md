---
name: autonomous
description: 开启自主演进模式（v2.0 P0-1）—— 开关 ON 后 Claude 自主决策开发，不逐步确认。支持 single（完成一个阶段后自动停止）和 always（循环执行阶段）两种模式
---

打开**自主模式开关**。开关 ON 期间，Claude 会：

- 完成一个功能/增量后**自动选下一个**做（不询问"接下来做啥？"）
- 关键决策点**写入快照**而不是问
- 完成后**自动 commit**（如果安全）

## 两种模式

| 模式 | 含义 |
|:-----|:-----|
| **single** | 完成**当前一个阶段**后自动停止，关闭开关 |
| **always** | 完成一个阶段后**自动开启新阶段**，循环执行 |

## 用法

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
