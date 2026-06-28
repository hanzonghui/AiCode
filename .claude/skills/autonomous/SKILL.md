---
name: autonomous
displayName: 🤖 自主模式 — Claude 自主决策开发
version: 1.0
description: >
  打开自主模式开关，让 Claude 在你离开时自主决策开发：完成一个增量后自动选下一个、
  关键决策写入快照不询问、安全时自动 commit。CLI 支持 single / always / on / off 四种显式入口。
tags:
  - autonomous-mode
  - state-machine
  - snapshot-driven
  - self-development
  - long-running
author: 韩宗辉
icon: 🤖
---

# 🤖 自主模式 Skill

> **v1.0 · single / always / on / off · 状态机驱动 · 快照保护**

（v1.0 起 `/autonomous` 不再支持无参 toggle；内部 `toggle()` 函数仍保留供脚本调用。）

---

## ⚡ 30 秒上手

```bash
# 开启 + 执行
/autonomous single          # 完成当前 1 个阶段后自动停止
/autonomous always          # 循环执行阶段（你离开时用）
npm run autonomous:runner   # 在已开启状态下启动 runner

# 关闭
/autonomous-stop
# 或
npm run autonomous:off

# 查看状态
npm run autonomous:status
```

---

## 🎯 4 种模式

| 模式 | 含义 | 适用场景 |
|:-----|:-----|:---------|
| **`single`** | 完成**当前 1 个阶段**后自动停止 | "把这阶段做完就停" |
| **`always`** | 完成阶段后**自动开启新阶段**，循环执行 | "我离开几小时，让它跑" |
| **`on`** | 开启自主模式（默认 always，不启动 runner）| 只想开开关 |
| **`off`** | 关闭自主模式（默认）| 回到逐步确认 |

---

## 🔧 状态机

```
                  /autonomous single
OFF ───────────────────────────────→ ON (single)
 ↑                                       │
 │ /autonomous-stop                      │ 完成 1 阶段
 │                                       ↓
ON ←────────────────────────────────── 自动停止
 ↑                                       │
 │                                       │ /autonomous always
 │                                       ↓
 │                                   ON (always)
 │                                       │
 │                                       │ 完成 1 阶段
 │                                       ↓
 └───────────────────────────────── 自动开启新阶段
                                       (循环)
```

### 状态文件

`.claude/skills/left-brain/memory/autonomous-state.json`（gitignore）：

```json
{
  "enabled": true,
  "enabled_at": "2026-06-25T10:00:00.000Z",
  "enabled_by": "user",
  "reason": "我离开1小时",
  "mode": "single"
}
```

---

## 🚦 行为对比

| 场景 | OFF | single | always |
|:-----|:----|:-------|:-------|
| 完成 1 个增量后 | 询问"接下来做啥？" | 自动停止 | 自动选下一个 |
| 关键决策 | 询问 | 写入快照继续 | 写入快照继续 |
| commit | 询问 | 自动（安全时） | 自动（安全时） |
| 失败 | 询问 | 5 次后自动停 + 汇报 | 5 次后自动停 + 汇报 |
| 阶段完成后 | 等待用户 | 停止 | 启动新 `claude -p` 子会话 |

---

## 🔐 安全边界

| 操作 | 状态 | 原因 |
|:-----|:-----|:-----|
| 智能增量深化、bug 修、文档、commit | ✅ 自主做 | 低风险 |
| 修改 `scripts/orchestrator/`、`.claude/`、`CLAUDE.md` | ⚠️ 慎做 | commit 前先 snapshot |
| push 到远程 | ❌ 不做 | 单人工程，无需 PR |
| 删分支 / 删文件 / 改主目录外文件 | ❌ 不做 | 破坏性操作 |

---

## 🧠 选题切换机制（v2.2.0+）

每个阶段/选题完成后：

1. **必须保存快照**（不受 30 分钟常规间隔限制）
2. 快照内容必须包含 **下一个选题目标**
3. 当前 `claude -p` 子会话**直接退出**
4. 外部 `autonomous-runner.js` 启动**新的 `claude -p` 子会话**
5. 新子会话通过 SessionStart hook 自动加载 `latest_state.json`
6. 从快照中读取 `stage.next`，按新选题独立推进

**为什么**：
- 防止上下文污染（每个选题独立）
- 控制 token 消耗（长上下文降智 + 费钱）
- 让每个选题有清晰的起点
- 每个 `claude -p` 子会话天然拥有全新上下文，等价于 `/clear`

---

## 📊 状态展示

`session-init.sh` 顶部会显示：

```
🤖 自主模式: ON (single · 单阶段，开启于 2026/6/24 17:11)
   下一步: M25 skill 生态扩展
   历史: M21 ✅ M22 ✅ M23 ✅ M24 ✅
```

---

## 🔧 核心脚本

| 文件 | 作用 |
|:-----|:-----|
| `scripts/orchestrator/autonomous.js` | 开关引擎（single/always/on/off；内部保留 toggle 函数）|
| `scripts/orchestrator/autonomous-runner.js` | 循环执行器（spawn `claude -p` 子会话）|
| `scripts/orchestrator/test-autonomous.js` | 测试（64/64 通过）|
| `scripts/orchestrator/test-autonomous-runner.js` | runner 测试（12/12 通过，含 M24-C 双向桥）|
| `.claude/hooks/SessionStart` | 启动时加载快照 + 显示状态 |
| `.claude/skills/left-brain/scripts/state-snapshot.js` | 快照保存（v2.2.0+ 含 stage 字段）|

---

## 🔗 关联

- 命令入口：`.claude/commands/autonomous.md` + `autonomous-stop.md`
- 规则文件：`.claude/rules/autonomous.md`
- L5 影响：第 5 条（自治覆盖率 + 人工干预率趋势）的数据来源
- v2.2.0 P0-1 实现

---

## 🧪 测试

- `test-autonomous.js`：62/62 通过
- `test-autonomous-runner.js`：12/12 通过（含 M24-C 双向桥）

---

*升级自 `/autonomous` 命令（v1.0 · 2026-06-27 · M25 skill 生态扩展）*