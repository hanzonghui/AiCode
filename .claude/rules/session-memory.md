---
description: 会话记忆、跨会话续接、智能丢弃策略
---

<important if="会话中包含项目上下文、技术决策、待办事项等需要跨会话记忆的内容">

## 📋 会话记忆

### 启动协议（每次新会话）
```bash
# 1. 初始化左脑
bash .claude/skills/left-brain/scripts/session-init.sh
# 2. 加载上次会话摘要
bash .claude/skills/left-brain/scripts/session-summary.sh load
```

### 会话结束前
```bash
bash .claude/skills/left-brain/scripts/session-summary.sh save "摘要内容"
```

> Stop hook 已配置 auto-save.sh 兜底自动保存

### 定期自动保存（每10轮）
每10轮对话保存一次快照：
```bash
bash .claude/skills/left-brain/scripts/session-summary.sh save "自动快照: [简要总结本轮对话内容]"
```

### 管理命令
```bash
# 查看所有会话
bash .claude/skills/left-brain/scripts/session-summary.sh list
# 清理旧会话（保留最近30天）
bash .claude/skills/left-brain/scripts/session-summary.sh cleanup 30
```

## 🧠 智能会话记忆

### 核心流程
```
自动加载 → 静默保留 → 3轮判断 → 智能丢弃
```

| 轮次 | 逻辑 | 动作 |
|:-----|:-----|:-----|
| 第1-2轮 | 无论用户问什么 | 保留摘要不显示 |
| 第3轮 | 判断话题是否相关 | 相关→保留；不相关→丢弃 |
| 第4轮+ | 如果摘要还在 | 继续判断，最多保留5轮 |

### 相关性标准

**保留**的迹象：
- 用户内容与摘要主题直接关联
- 用户提到摘要中的关键词（项目名、技术、人物等）
- 用户在继续待办事项

**丢弃**的迹象：
- 用户开启全新话题
- 连续3轮没有提及摘要内容

---

## 🎯 新会话第 1 分钟必跑 2 步（v3.0.8+ · 解决"开新会话不知道做啥"痛点）

> **背景**：用户痛点 — 打开新会话不知道当前进度到哪 / next 队列有啥 / 下一步该做啥 → 习惯性 `/autonomous` 让 AI 跑（但人在场时这是反模式）。
> **方案**：30 秒内 2 步固定仪式（取代 `/handoff` 默认使用 + 取代 `/autonomous` 默认启动）。

### 启动仪式（fast 模式 · 默认）

```bash
# Step 1: 看进度（1 键 ~3 秒）
/status

# Step 2: 决定方向（自然语言）
# "继续 next 队列里 P3 那个" / "做 AUDIT-roadmap-item-skill" / "今天想 [主题]"
```

**不跑**：`/audit`（慢 + 用来产生 backlog，不是初始化动作）

### 场景表（人在模式）

| 场景 | 动作 |
|:-----|:-----|
| **开新会话 + 想继续** | `/status` → 说"继续 next[X]" / 主题 |
| **开新会话 + 已决定做啥** | 直接说"做 X"（0 步上手）|
| **想加新任务到 backlog** | `/audit`（按需，慢但精确）|
| **想看工程漂移 / 8 文档一致性** | `/audit`（按需，慢但精确）|
| **当前会话上下文超 30%** | `/compact` 压缩（不交接）|
| **当前会话有未固化临时状态**（调试中/讨论中）| `/handoff` 打包后 `/clear`（罕见）|
| **离开几小时让 AI 自主跑** | `/autonomous always` + 后台 runner |
| **完成 1 个增量就停** | `/autonomous single` |
| **纯收工**（已 commit + 8 文档同步完）| 直接关，**啥都不跑**（最常见）|

### session-init 速度优化（v3.0.8+）

```bash
# 默认（fast 模式 · 30 秒内启动）
SESSION_INIT_MODE=fast bash session-init.sh   # 跳过 Step 2/3 全文

# 调试 / 排查（full 模式 · 旧行为）
SESSION_INIT_MODE=full bash session-init.sh   # 加载 Step 2/3 完整内容
```

**fast 模式行为**：
- Step 2 加载上次摘要 → **只显示存在 + 第一行标题**（不 grep 全文）
- Step 3 加载相关知识 → **只显示 KB 数量**（不 head 每个 KB）

**full 模式行为**：原行为（详细加载）。

</important>
