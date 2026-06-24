# 个人 AI 工作空间

> 可移植的 Claude Code 增强工程。开始前按顺序执行启动步骤。
> **上下文分片**（v1.4）：`.claudeignore` 已排除大文件/归档目录。AI 不要主动读这些路径，也不要全局扫描仓库；确需扫描时必须先询问用户。
>
> 🚨 **最高指令（2026-06-24）**：本工程的核心目标是 **智能演进**（围绕 04 纲领 4 大智能增量 L1→L5 路径）。git 管理 / 多用户 / 权限 / 审计 / 团队产品化等**均非核心**。评估任何新功能/任务时，先问"这能帮 Claude 变智能吗？"→ 否则降级或拒绝。详见 `.claude/memory/priority-intelligent-evolution.md`。

---

## 启动协议（AI 进来按这个顺序走）

1. **读本文件 `CLAUDE.md`** → 掌握工作空间全貌（足够 90% 任务）
2. **遵守约定** → 按需翻 `.claude/rules/` 下规则文件
3. **项目级指令** → 如果在子目录工作，读该目录的 `CLAUDE.md`
4. **熟悉项目** → 必读 `PROJECT-CONTEXT.md`（详细架构和系统说明，文件不大）
5. **智能调度** → 复杂任务自动派 Agent（见下方）
6. **禁止默认全局扫描** → 需要扫描整个仓库时（如 `Grep` 跨文件搜 TODO、`glob **`），必须先询问用户，说明原因并请求授权

---

## 工作空间结构

```
AiCode/
├── CLAUDE.md                          ← ⭐ 启动必读（新会话第一件事）
├── PROJECT-CONTEXT.md                 ← ⭐ 要熟悉项目必读（详细架构和系统说明）
├── 01_AI-ClaudeCode-最佳实践精简.md     ← 行为约定 + 最佳实践
├── README.md                          ← 工程说明与安装
├── CHANGELOG.md                       ← ⭐ 版本变更记录
├── 03_版本迭代计划.md                  ← ⭐ 当前路线图
├── 04_自我进化循环系统设计.md          ← ⭐ 自我进化 + 智能演进纲领（v1.9.1+）
│
├── .automation/                       ← 自动化脚本
├── .workspace/                        ← 工作空间适配
├── .claude/                           ← Claude Code 配置
│   ├── rules/                         ← 拆分规则（详见下方）
│   ├── skills/left-brain/             ← 🧠 左脑记忆系统
│   ├── commands/                      ← 常用命令
│   └── agents/                        ← 专业子代理
│
├── scripts/                           ← 核心自动化脚本
│   ├── evolution/                     ← 🧬 自我进化系统（v1.8：每日扫描 GitHub 学习新能力）
│   ├── orchestrator/                  ← 智能调度器（v1.9：+ metrics + logger + permissions + withRetry）
│   ├── parallel/                      ← worktree 并行
│   ├── mcp/                           ← 本地 MCP server（v1.9：+ _shared 统一错误）
│   └── 会话快照/                       ← 快照保存/加载
│
├── benchmarks/                        ← 真实任务性能基准
├── data/                              ← SQLite 工作空间数据库
└── archives/                          ← 全局归档
```

> 个人学习资料、项目代码、其他 AI 工具配置已移出到 `H:/AI-han/AiCode-Personal/`。
>
> **Token 优化**：`.claudeignore` 已排除 `.skill/`、`.qoder/`、`.claude/snapshots/`、`archives/`、`data/github/trending.json` 等大目录/文件。**禁止全局扫描仓库**；确需扫描时必须先询问用户。

---

## 核心定位：客户端 Agent 增强

### 我们不增强大模型

本工程**不修改 Claude 大模型本身**：
- 不训练/微调模型
- 不修改 Anthropic 的模型权重
- 不替代 Claude 的推理能力

### 我们增强 Claude Code 客户端 Agent

我们在 Claude Code 这个客户端外面包了一层增强壳，让同样的 Claude 模型发挥出 5-10 倍效率：

```
┌─────────────────────────────────────────┐
│           我们的增强层（AiCode）           │
│  调度器 / 记忆库 / 工具链 / 工作流 / 自动化   │
├─────────────────────────────────────────┤
│           Claude Code（官方客户端）         │
│  Agent 运行时 / Hook 系统 / 工具调用        │
├─────────────────────────────────────────┤
│           Claude 大模型（Anthropic）        │
│  推理 / 编码 / 理解 / 生成                 │
└─────────────────────────────────────────┘
```

### 增强层对应 Agent 的哪些组件

| 我们的系统 | Agent 组件 | 作用 |
|:-----------|:-----------|:-----|
| `dispatcher.js` | 编排层 | 智能决定派不派子 Agent |
| `left-brain` | 长期记忆 | 跨会话知识沉淀 |
| MCP servers | 工具链 | 本地文件/数据库/网页能力 |
| `hooks/` | 环境集成 | 自动执行启动/停止逻辑 |
| `自我约束规范.md` | 工作流 | 改完代码自动收尾 |
| `自我进化循环系统` | 学习反馈 | 从 GitHub 学习新能力 |
| `.claudeignore` | 上下文管理 | 省 token |
| `qa-reviewer` | 验证层 | 独立 QA 验证 |
| `/evolve`, `/dispatch` | UX 层 | 高效交互入口 |
| `会话快照` | 状态恢复 | 跨会话接上 |

### 为什么这个定位更务实

1. **大模型我们做不了** — 算力/数据/能力都是 Anthropic 的事
2. **客户端优化空间大** — 官方只给了基础能力
3. **可迁移** — 增强层未来可迁移到 Cursor/Windsurf
4. **模型无关** — Claude 4/GPT-5 出来直接受益

### 效果

- 裸用 Claude Code = 1x
- + 智能调度 = 2-3x
- + 记忆 + 工具 + 工作流 = 5x
- + 自我进化 = 持续增长

详细说明见 `02_工作空间功能介绍.md` 第 0 节。

---

## 快速操作

| 操作 | 命令 |
|:-----|:-----|
| 新建项目 | `/new-project` |
| 记忆知识 | `left-brain.sh remember "..."` |
| 搜索知识 | `left-brain.sh recall "关键词"` |
| 查看状态 | `left-brain.sh dashboard` |
| 自我进化 | `/evolve run` 或 `npm run evolve` |
| 检查过时 | `/evolve watch` 或 `npm run trend` |
| 压缩上下文 | `/compact` |
| 重置会话 | `/clear` |
| **切快照模式** | `/snap-mode off\|manual\|milestone\|auto\|reset` |
| **强制存快照** | `/snap-save "标题" "标签"` |

---

## 规则文件（.claude/rules/）

| 文件 | 作用 |
|:-----|:-----|
| `auto-perceive.md` | 自动感知、纠正学习规则 |
| `behavior.md` | 文件读取、输出控制、任务切换 |
| `session-memory.md` | 会话记忆、智能丢弃 |
| `cost-control.md` | 成本控制 + Git/PR 工作流 |
| `daily-maintenance.md` | 每日更新、Changelog |

---

## 🧠 智能任务规划协议（v1.9.1 增量 B）

> **核心**：复杂任务先出 plan，用户批准后才执行。简单任务直接干不打断。
> 围绕用户终极愿景"让 Claude 越来越智能"。

### 何时必须输出 plan

满足以下**任意 2 条**时，**必须先输出 `[plan]...[/plan]` 块**，等用户 `/ok` 后再执行：

- 涉及文件数 ≥ 3
- 涉及模块数 ≥ 2
- 任务类型：bug_fix / refactor / feature_full / migration / multi_module
- 会修改根目录配置文件（package.json / CLAUDE.md / 04 文档 / .gitignore）
- 用户明确说"先看看方案"/"评估一下"/"规划一下"

### plan 输出格式

```
[plan]
任务: <一句话标题>
目标: <完成什么>
步骤:
  1. <第一步：具体动作 + 涉及文件>
  2. <第二步>
  3. ...
预计改动: <文件数> 个文件 / <行数> 行
预计风险: <低/中/高>
回退方案: <出问题了怎么撤>
[/plan]
```

### plan 协议增强（v1.9.3+ 增量 B 方案 A）

每个步骤下可加可选行让 plan-bridge 知道派什么 Agent：

```
[plan]
任务: 重构 dispatcher
目标: 拆成 3 个子模块
步骤:
  1. 读 dispatcher.js 现状
     agent: explorer        # 可选：explorer/planner/qa-reviewer/claude/code-reviewer
     files: dispatcher.js   # 可选：逗号分隔文件路径
  2. 拆成 3 个子模块
     agent: planner
     files: dispatcher.js, sub-router.js
  3. 写测试
     agent: qa-reviewer
     files: test-dispatcher.js
预计改动: 5 个文件 / 200 行
预计风险: 中
回退方案: git revert <commit>
[/plan]
```

**字段缺省 fallback**（向后兼容老格式）：
- 缺 `agent:` → 默认 `claude`（通用 Agent）
- 缺 `files:` → 从 step 文本正则提取 `*.js` `*.md` 等文件路径

**执行流程**（v1.9.3+）：
1. /ok 批准 → plan 状态变 approved
2. `/plan-execute` 或 `npm run plan:execute` → 调 plan-bridge 引擎
3. 按 step 顺序调 `claude -p` 子会话派 Agent 执行
4. 单步失败不阻塞，全完变 done，部分失败变 partial

### 用户响应

| 用户输入 | 含义 | Claude 动作 |
|:---------|:-----|:-----------|
| `/ok` | 批准执行 | 标记 plan 为 approved，按步骤执行 |
| `/no` | 取消/重做 | 标记 plan 为 cancelled，询问用户调整 |
| 修改意见 | 调整 plan | 重新输出 plan 块 |

### 简单任务（不强制 plan）

- 单文件修改、≤ 2 步骤
- 解释 / 问答 / 推荐
- 用户明确说"直接干" / "别规划"

---

## 🧠 左脑记忆系统

> 自动记忆 + 知识图谱 + 语义搜索。所有命令见下方。

### 启动协议

```bash
# 每次新会话执行
bash .../left-brain/scripts/session-init.sh
bash .../left-brain/scripts/session-summary.sh load
```

### 常用命令

```bash
left-brain.sh remember "内容"    # 记忆
left-brain.sh recall "关键词"    # 搜索
left-brain.sh preference "..."    # 偏好/纠正
left-brain.sh graph              # 知识图谱
left-brain.sh list               # 列表
left-brain.sh dashboard          # 监控
left-brain.sh status             # 状态
```

### 知识库位置

```
.claude/skills/left-brain/memory/
├── MEMORY.md               # 知识索引
├── knowledge/              # 知识条目（KB-*.md）
├── sessions/               # 会话摘要
├── associations/           # 知识图谱
└── logs/                   # 日志
```

---

## 相关文件

| 文件 | 说明 |
|:-----|:-----|
| `PROJECT-CONTEXT.md` | ⭐ 要熟悉项目必读（详细架构和系统说明） |
| `01_AI-ClaudeCode-最佳实践精简.md` | 行为约定 + 最佳实践 |
| `02_工作空间功能介绍.md` | 完整功能说明 + 操作指南 |
| `03_版本迭代计划.md` | ⭐ **当前路线图（v1.2 修订）**：v1.9 基础设施补齐 + v2.0 团队能力 |
| `04_自我进化循环系统设计.md` | ⭐ **自我进化 + 智能演进纲领**：v1.8 自我进化 + v1.9.1+ 三大智能增量 |
| `CHANGELOG.md` | ⭐ **版本变更记录（v1.9.0 已发版）** |
| `README.md` | 工程说明与安装 |
