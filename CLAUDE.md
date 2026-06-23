# 个人 AI 工作空间

> 可移植的 Claude Code 增强工程。开始前按顺序执行启动步骤。
> **上下文分片**（v1.4）：`.claudeignore` 已排除大文件/归档目录。AI 不要主动读这些路径，也不要全局扫描仓库；确需扫描时必须先询问用户。

---

## 启动协议（AI 进来按这个顺序走）

1. **读本文件 `CLAUDE.md`** → 掌握工作空间全貌（足够 90% 任务）
2. **遵守约定** → 按需翻 `.claude/rules/` 下规则文件
3. **项目级指令** → 如果在子目录工作，读该目录的 `CLAUDE.md`
4. **熟悉项目** → 必读 `PROJECT-CONTEXT.md`（详细架构和系统说明，文件不大）
5. **智能调度** → 复杂任务自动派 Agent（见下方）

---

## 工作空间结构

```
AiCode/
├── CLAUDE.md                          ← ⭐ 启动必读（新会话第一件事）
├── PROJECT-CONTEXT.md                 ← ⭐ 要熟悉项目必读（详细架构和系统说明）
├── 01_AI-ClaudeCode-最佳实践精简.md     ← 行为约定 + 最佳实践
├── Claude工程实践操作手册.md          ← 详细版操作手册（待与精简版合并）
├── README.md                          ← 工程说明与安装
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
│   ├── orchestrator/                  ← 智能调度器
│   ├── parallel/                      ← worktree 并行
│   ├── mcp/                           ← 本地 MCP server
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
| `04_自我进化循环系统设计.md` | v1.8 自我进化系统完整设计 |
| `README.md` | 工程说明与安装 |
