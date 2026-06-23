# Claude Code 增强工程

> 一个**会自己调度、自己记忆、自己归档、自己兜底、自己进化**的 Claude Code 工作空间。**122 项测试全过**，实测提速 20%。
>
> **定位**：我们不增强 Claude 大模型本身，而是增强 **Claude Code 客户端 Agent** —— 通过调度、记忆、工具、工作流、自动化，让同样的 Claude 模型发挥出 5-10 倍效率。

[![CI](https://github.com/<USER>/<REPO>/actions/workflows/test.yml/badge.svg)](https://github.com/<USER>/<REPO>/actions/workflows/test.yml)

---

## 🚀 5 分钟快速开始

**复制这 3 条命令：**

```bash
git clone https://github.com/<USER>/<REPO>.git && cd AiCode
bash .workspace/setup.sh     # 一键适配当前环境
npm test                     # 跑 101 项测试，确认环境正常
```

然后启动 Claude Code：

```bash
claude
```

**就这样。** Claude Code 会自动读取 `PROJECT-CONTEXT.md`（1 分钟掌握全貌）和 `CLAUDE.md` 加载行为约定。

> **Token 优化**：`.claudeignore` 已排除 `.skill/`、`.qoder/`、`.claude/snapshots/` 等大目录，新会话避免扫描整个仓库。

### 你会获得什么能力

| 能力 | 效果 | 属于 Agent 哪个部分 |
|:-----|:-----|:--------------------|
| 🧠 智能调度 | 复杂任务自动派 2-3 个 Agent 并行，提速 2-3 倍 | 编排层 |
| 💾 快照系统 | 会话结束一键备份，下次 1 秒接上 | 状态恢复 |
| 📝 左脑记忆 | 跨会话知识沉淀，自动回忆 | 长期记忆 |
| 🔧 MCP 工具 | 本地 filesystem + sqlite + fetch | 工具链 |
| ✅ 自我约束 | AI 完成改动后自动跑测试、存快照、写 KB | 工作流 |
| 🧬 自我进化 | 每日扫描 GitHub，学习爆款 Claude 项目并本地实现 | 学习反馈 |
| 👁️ 趋势感知 | 持续对比已实现特性 vs 最新社区方案 | 防退化 |

> **核心定位**：所有这些增强都在 Claude Code 客户端侧，不改动 Claude 大模型本身。模型是大脑，我们做的是神经系统、记忆系统、工具手和自律机制。

---

## 快速开始

### 新机器上使用
```bash
cd /path/to/AiCode
bash .workspace/setup.sh     # 一键适配当前环境
```

### 新建项目
```bash
# Claude Code 内
/new-project

# 或 Bash 脚本
bash .automation/new-project.sh <项目名> -t <类型> -r <需求文档> -d
```

### 公司项目
```bash
cd AI-【4】-公司项目/
git clone <公司仓库地址>
```

---

## 一、核心定位：客户端 Agent 增强，不是大模型增强

### 1.1 本质区别

| 维度 | 大模型增强 | 客户端 Agent 增强（我们的工作） |
|:-----|:-----------|:------------------------------|
| **改什么** | 模型权重、训练数据、微调、Prompt 工程、RAG | 调度、记忆、工具、工作流、UI、自动化 |
| **在哪里跑** | 云端/GPU | 本地 Claude Code CLI |
| **要不要算力** | 需要大量算力 | 几乎不要 |
| **谁能做** | 需要模型训练能力 | 普通开发者用脚本就能做 |
| **我们的项目** | ❌ 不做 | ✅ 全做 |

### 1.2 架构分层

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

**我们没有碰 Claude 模型本身**，而是在 Claude Code 这个客户端外面做了一层增强壳，让 Claude Code 更会"使唤" Claude 模型。

### 1.3 每个系统对应 Agent 的哪个部分

| 我们的系统 | 属于 Agent 的哪个组件 | 作用 |
|:-----------|:----------------------|:-----|
| `dispatcher.js` 智能调度 | **编排层（Orchestration）** | 决定什么任务派子 Agent，什么自己干 |
| `left-brain` 记忆系统 | **长期记忆（Long-term Memory）** | 跨会话保存知识、偏好、决策 |
| `mcp.json` + MCP servers | **工具链（Tools）** | 给 Claude 提供本地文件/SQLite/网页抓取能力 |
| `hooks/` + `settings.local.json` | **环境集成（Environment Integration）** | 会话启动/结束/工具调用前自动执行逻辑 |
| `自我约束规范.md` | **工作流（Workflow）** | 标准化 AI 改完代码后的收尾流程 |
| `自我进化循环系统` | **学习反馈（Learning/Feedback）** | 让 Agent 从 GitHub 社区学习新能力 |
| `.claudeignore` + `/compact` | **上下文管理（Context Management）** | 控制传给模型的上下文，省 token |
| `qa-reviewer` + 测试 | **验证层（Validation/Safety）** | 独立验证代码质量，防止乱改 |
| `/evolve`, `/dispatch` 命令 | **用户体验层（UX）** | 给用户更高效的交互入口 |
| `会话快照` + `00_ROOT_快速加载会话.md` | **状态恢复（State Recovery）** | 让 Agent 能跨会话继续工作 |

### 1.4 为什么这个定位更务实

**大模型我们做不了**：
- 训练/fine-tune 需要算力和数据
- 我们不可能比 Anthropic 更懂 Claude
- 模型能力由官方决定，我们只能等更新

**客户端 Agent 有巨大优化空间**：

| 官方能力 | 缺什么 | 我们补什么 |
|:---------|:-------|:-----------|
| 能对话 | 不会自己决定要不要派 Agent | 智能调度 |
| 有上下文窗口 | 跨会话失忆 | 左脑记忆 |
| 能调工具 | 没有本地记忆/数据库工具 | MCP sqlite/fetch |
| 能改文件 | 改完不自动测试/归档 | 自我约束 |
| 能联网 | 不会主动学习社区方案 | 自我进化 |
| 能并行 | 多个任务容易冲突 | worktree 隔离 |

**客户端增强是乘数效应**：
- 裸用 Claude Code = 1x
- + 智能调度 = 2-3x
- + 记忆 + 工具 + 工作流 = 5x
- + 自我进化 = 持续增长

### 1.5 对比主流 Agent + LLM

| 维度 | 主流 Agent + LLM | 我们的 AiCode |
|:-----|:-----------------|:--------------|
| 学习能力 | 固定训练数据 | ✅ 每日扫描 GitHub 自我进化 |
| 调度策略 | 无/简单 | ✅ 规则引擎智能决策 |
| 跨会话记忆 | 对话历史 | ✅ 左脑知识库 + 图谱 |
| 收尾质量 | 需人工提醒 | ✅ 自我约束自动收尾 |
| 工程闭环 | 直接改文件 | ✅ 计划→迭代→归档 |
| 并行隔离 | 共享文件系统 | ✅ worktree 真隔离 |
| 成本控制 | 容易 token 爆炸 | ✅ 上下文分片 + compact |
| 稳定性 | 单点依赖 LLM | ✅ 多层失败兜底 |
| 工具链 | 云端/无 | ✅ 本地 MCP server |
| 会话恢复 | 无 | ✅ 快照索引 + 热启动 |
| QA 验证 | 自测 | ✅ 独立 QA 子代理 |

### 1.6 用打游戏比喻

- **大模型** = 游戏角色的基础属性（力量/智力）
- **客户端 Agent** = 玩家的操作界面、快捷键、宏、背包管理、自动寻路、任务追踪
- **我们的工作** = 给 Claude 写了一套 **顶级玩家插件**

我们不改角色属性，但让这个角色会：
- 自动判断什么时候该组队（调度）
- 记住每个 NPC 的喜好（记忆）
- 自动整理背包（上下文管理）
- 每天看攻略论坛学习新打法（自我进化）
- 打完副本自动存档（快照）
- 任务失败自动读档回滚（失败兜底）

### 1.7 长期价值

**可迁移性**：今天增强 Claude Code，明天同样逻辑可迁移到 Cursor/Windsurf 等 Agent 客户端。

**模型无关**：Claude 4 出来直接受益，换 GPT-5 核心逻辑也能复用。

**复利效应**：每实现一个新能力，系统本身更强，知识/模板/规则不断积累。

---

## 二、目录结构

```
AiCode/
│
├── 01_AI-ClaudeCode-最佳实践精简.md       AI 行为约定 + 最佳实践说明
├── CLAUDE.md                            根级指令（记忆系统 + 行为规则）
├── README.md                            本文件
│
├── .workspace/                          工作空间适配
│   ├── setup.sh                         一键适配脚本（搬机器后运行一次）
│   ├── workspace.env                    动态路径（setup.sh 生成）
│   └── README.md                        移植指南
│
├── .automation/                         项目自动化
│   ├── new-project.sh                   一键创建项目脚手架
│   ├── templates/                       模板文件
│   └── README.md                        使用文档
│
├── .claude/                             Claude Code 配置 + 命令 + 子代理 + 左脑记忆
│   ├── rules/                           行为规则
│   ├── skills/left-brain/               左脑记忆系统
│   ├── commands/                        常用命令
│   └── agents/                          专业子代理
│
├── scripts/                             核心自动化脚本
│   ├── orchestrator/                    智能调度器
│   ├── parallel/                        worktree 并行 + Mermaid 生成
│   ├── mcp/                             本地 MCP server
│   └── 会话快照/                         快照保存/加载
│
├── benchmarks/                          真实任务性能基准
├── data/                                SQLite 工作空间数据库
├── archives/                            全局归档
└── .github/                             CI 配置
```

> 个人学习资料、项目代码、其他 AI 工具配置已移出到 `H:/AI-han/AiCode-Personal/`，本仓库只保留 Claude Code 增强工程核心。

---

## 核心约定

所有 AI 助手（Claude Code / Cursor / 通义灵码 / Qoder / MiniMax Code / ZCode）共享同一套行为规范，定义在 **`01_AI-ClaudeCode-最佳实践精简.md`**（根目录）：

- **成本控制**：对话连续 5 轮后提醒压缩上下文
- **文件读取**：按需读取，优先 Grep/Glob 搜索
- **输出精炼**：代码直接可用，不输出教学式代码
- **任务切换**：建议先清空旧上下文

---

## 多工具支持

| 工具 | 指令文件 | 自动加载 |
|:-----|:---------|:---------|
| Claude Code | `CLAUDE.md` | ✅ |
| Cursor | `.cursorrules` | ✅ |
| 通义灵码 | `.lingma/instructions.md` | ✅ |
| Qoder | `.qoderrules` | ✅ |
| MiniMax Code | `.minimaxrc` | ✅ |
| ZCode | `AGENTS.md` | ✅ |

---

## 工作流

### 开发新项目
```
写需求文档 → /new-project 或 bash 脚本 → 自动生成目录 + 6 个工具指令文件
→ AI 助手读取需求自动开发 → 测试验证
```

### 迭代已有项目
```
cd AI-【3】-项目开发/<项目名>
claude
> 读取 REQUIREMENTS_V2.md，在现有代码基础上迭代
```

### 接手公司项目
```
cd AI-【4】-公司项目/
git clone <仓库地址>
cd <项目名>
# 用任意 AI 工具打开，手动添加 CLAUDE.md 引用 01_AI-ClaudeCode-最佳实践精简.md
```

---

## 适用场景

- 个人学习 + 项目开发
- 入职新公司时整体迁移
- 跨 AI 工具协作开发
- 面试准备（学习资料 + 项目经验）

---

## 测试环境与基线

> 以下环境是当前 `npm test` 和 `npm run benchmark` 的跑通基线，供迁移后对照。

| 项目 | 当前环境 |
|:-----|:---------|
| OS | Windows 10 Pro (10.0.19045) |
| Shell | Git Bash |
| Node.js | v24.16.0 |
| Git | 2.49+ |
| Claude Code | 最新版 |
| 网络 | 可访问 example.com、npm registry |

### 当前测试基线

```text
npm test: 101/101 通过
npm run benchmark: 并行比串行快 20%（3 个 IO 型任务，详见 benchmarks/result.md）
```

> 注意：benchmark 数字会随机器、网络、磁盘 IO 波动。建议在新机器上跑 `npm test` 和 `npm run benchmark` 重新建立基线。
