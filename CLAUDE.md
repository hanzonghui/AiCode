# 个人 AI 工作空间

> 可移植的 Claude Code 增强工程。开始前按顺序执行启动步骤。
> **上下文分片**（v1.4）：`.claudeignore` 已排除大文件/归档目录。AI 不要主动读这些路径，也不要全局扫描仓库；确需扫描时必须先询问用户。
>
> 🚨 **最高指令（2026-06-24）**：本工程的核心目标是 **智能演进**（围绕 04 纲领 4 大智能增量 L1→L5 路径）。git 管理 / 多用户 / 权限 / 审计 / 团队产品化等**均非核心**。评估任何新功能/任务时，先问"这能帮 Claude 变智能吗？"→ 否则降级或拒绝。详见 `.claude/memory/priority-intelligent-evolution.md`。
>
> 🚀 **自主模式（v3.0.7）**：运行 `npm run autonomous` 弹出方向键菜单（↑↓ 选择，↵ 确认），或执行 `/autonomous`（无参弹出选择框）/ `/autonomous single/always/on/off` 让 Claude 自主决策开发。**注意**：`/autonomous` 只开开关；要后台无人值守跑需另开 PowerShell 跑 `npm run autonomous:runner`。关闭用 `/autonomous-stop`。详见 `01_AI-ClaudeCode-最佳实践精简.md` §三"🚀 自主模式高频场景"。

---

## 启动协议（AI 进来按这个顺序走）

1. **读本文件 `CLAUDE.md`** → 掌握工作空间全貌（足够 90% 任务）
2. **遵守约定** → 按需翻 `.claude/rules/` 下规则文件
3. **项目级指令** → 如果在子目录工作，读该目录的 `CLAUDE.md`
4. **熟悉项目** → 必读 `PROJECT-CONTEXT.md`（详细架构和系统说明，文件不大）
5. **智能调度** → 复杂任务自动派 Agent（见下方）
6. **禁止默认全局扫描** → 需要扫描整个仓库时（如 `Grep` 跨文件搜 TODO、`glob **`），必须先询问用户，说明原因并请求授权

### 🎯 新会话第 1 分钟必跑（v3.0.8+ · 30 秒上手）

**痛点**：开新会话不知道当前进度 / next 队列 / 下一步 → 习惯性 `/autonomous`（反模式）。

**仪式**（替代 `/handoff` 默认使用 + 替代 `/autonomous` 默认启动）：

1. `/status`（1 键 ~3 秒，看 L5 进度 + next 队列 + 左脑状态）
2. 说一句："继续 next[X]" / "做 [ID]" / "今天想 [主题]"

**不跑**：`/audit`（慢，**用来产生 backlog 不是初始化**，按需开）。

完整场景表（人在 vs 自主模式 + handoff vs compact vs clear 边界）见 [`.claude/rules/session-memory.md`](.claude/rules/session-memory.md) §"新会话第 1 分钟必跑 2 步"。

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
│   ├── skills/audit/                  ← 🔍 工程自查/审计 skill（v3.0.5 M25）
│   ├── skills/evolve/                 ← 🧬 自我进化 skill（v3.0.5 M25 · /evolve 升格）
│   ├── skills/autonomous/             ← 🤖 自主模式 skill（v3.0.5 M25 · /autonomous 升格）
│   ├── skills/agent-reach/            ← 🌐 13 平台互联网路由（GitHub/B站/V2EX/RSS/任意网页）
│   ├── commands/                      ← 常用命令
│   └── agents/                        ← 专业子代理
│
├── scripts/                           ← 核心自动化脚本
│   ├── evolution/                     ← 🧬 自我进化系统（v1.8：每日扫描 GitHub 学习新能力；v3.0.5 M34：+ GEPA skill 自我进化原型）
│   │   ├── gepa-runner.js             ← M34 GEPA 主控器（读 SKILL.md → eval dataset → traces → 遗传优化 → 候选）
│   │   ├── skill-evaluator.js         ← M34 4 维 Pareto fitness（clarity/coverage/error_reduction/size_eff）
│   │   ├── constraint-gates.js        ← M34 5 道护栏（frontmatter/大小/步骤/禁破坏命令/版本/兼容）
│   │   ├── gepa-optimizer.js          ← M34 遗传算法核心（4 变异算子 + 交叉 + tournament + elite）
│   │   ├── trace-collector.js         ← M34 从 logs/app.jsonl 收集 skill 相关执行轨迹
│   │   └── test-gepa.js               ← M34 测试套件 26/26 通过
│   ├── orchestrator/                  ← 智能调度器（v1.9：+ metrics + logger + permissions + withRetry；v2.5.1：M10 复杂度评分驱动 Agent 数量；v2.0.2：+ audit 子系统；v3.0.0：M14 知识图谱反哺 + recallBeforeDispatch 钩子）
│   │   ├── workflow/                  ← 🧠 个人 workflow 智能化（v2.0 P0-5：学习工作模式，主动建议下一步）
│   │   ├── audit/                     ← 🔍 工程自查/审计（v2.0.2 P0-6：6 段浅层报告引擎 + /audit 命令）
│   │   └── metrics/                   ← 📊 M15 效果量化（月度报告 report.js）
│   ├── bridge/                        ← 🔗 M16 候选汇聚桥梁（3 源 → evolution-plan.json）
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
| `swarm-coordinator.js` | 群体层 | 多 Agent 异构视角 + 投票汇总（v3.0.5 M31） |
| `SKILL_INDEX.md` | 生态索引 | 1 张表查清 4 skill 边界 + 5 场景脚本（v3.0.5 M32） |
| `README.md` + `PROJECT-CONTEXT.md` | 文档基线 | 项目名片 + session-init 自动加载的 1 分钟全貌（v3.0.5 M33 重写，告别 v2.0.0 / v1.9 过期）|
| `left-brain` | 长期记忆 | 跨会话知识沉淀 |
| `agent-reach` | 外部感知 | 13 平台互联网路由（GitHub/B站/V2EX/RSS/网页） |
| **`ui-skill-installer`** (M36A) | **UI 模板脚手架** | **5 场景（landing/dashboard/chat/admin/portfolio）+ shadcn+Tailwind+v0，30 秒得到 Next.js 15 脚手架** |
| **`skill-registry`** (M36B+C) | **skill 自动发现+安装** | **GitHub 3 仓 + npm 20+ 关键词 + 5 维评分 ≥ 7.0 + 路径穿越防护 + 营销号过滤（M37 doc-sync 8 文档补漏）** |
| **`aris-poc`** (M38) | **ARIS 借鉴 + 6-state verdict** | **借鉴 wanshuiyin/ARIS：6-state verdict 合约 + cross-model review loop（5 视角）+ idea discovery（5 维评分 + Top-K）+ CLI（npm run aris-poc:demo）** |
| **`mem-poc`** (M39) | **claude-mem 借鉴 + 历史事件注入** | **借鉴 thedotmack/claude-mem：78 session → 35 事件压缩 + 按 query 注入最相关历史决策/教训 + CLI（npm run mem-poc:demo）** |
| **`skill-hub`** (M40) | **buildwithclaude 借鉴 + skill 统一发现** | **借鉴 davepoon/buildwithclaude：已装 + 本地 + 远程缓存三源聚合，统一搜索/推荐 skill + CLI（npm run skill-hub:demo）** |
| **`go`** (M43) | **交付流水线自动化** | **测试 → 简化 → 审查 → 提交 4 阶段一气呵成（失败立即停止），纯函数 + 19/19 测试 + `--dry-run/--skip/--only` 5 参数（v3.0.5）** |
| **`kb-classify`** (M45) | **KB 分类质量提升** | **71 条 KB 「其他」从 49.3% → 4.2%（远超 20% 目标），L5 第 3 条数据真实性 ↑；`npm run kb:report` 看分布 + `npm run kb:enrich` 补 frontmatter + 24/24 测试（v3.0.5）** |
| **`kb-promote`** (M48) | **KB 毕业机制 + memory 体检** | **借鉴 neat-freak 91 行：毕业三触发（主题反复 ≥3 / 系统机制 / 事件 >14 天）+ sync-matrix 变更映射 + self-discipline 5 步法 + memory-health-check 4 项硬约束；`npm run kb:promote -- --report` 看毕业建议 + `npm run memory:health` 体检 MEMORY.md 200/25KB + 17+15 测试（v3.0.6）** |
| **`deep-research`** (M49+3 · v3.0.8) | **深度研究（横纵双轴 · 6 段方法论闭环）** | **借鉴 hv-analysis + 卡兹克公众号通用 Prompt：纵向 5 维度 + 横向 3 场景 + 交汇 5 核心问题 + 3 剧本 + 机遇/风险/痛点 + 分人群（创业者/从业者/学习者/投资人）行动建议；`npm run deep-research -- analyze "对象名"` 生成报告框架（21/21 测试）** |
| MCP servers | 工具链 | 本地文件/数据库/网页能力 |
| `hooks/` | 环境集成 | 自动执行启动/停止逻辑 |
| `自我约束规范.md` | 工作流 | 改完代码自动收尾 |
| `自我进化循环系统` | 学习反馈 | 从 GitHub 学习新能力 |
| `.claudeignore` | 上下文管理 | 省 token |
| `qa-reviewer` | 验证层 | 独立 QA 验证 |
| `/evolve`, `/dispatch` | UX 层 | 高效交互入口 |
| **github-scanner.js (M35)** | **L4 学习闭环** | **关键词 11→20 + 能力加权 + 新星探测，候选池扩到 AI coding + agent 全生态** |
| **semantic-recall.js + left-brain recall 默认入口 (M54 batch2 E)** | **L4 学习闭环兑现** | **默认走 Node TF-IDF 语义引擎（去 --semantic 摩擦），保留 --grep 兼容；L4 "TF-IDF 召回"宣称真实兑现不再假命题** |
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

### 🧬 智能演进路径 L1→L5（5 级递进）

| 级别 | 一句话 | 状态 |
|:----:|:-------|:----:|
| **L1 工具能用** | 调 MCP / 文件 / 数据库 | ✅ |
| **L2 记得住** | 跨会话不丢上下文（KB + 向量检索）| ✅ |
| **L3 会决策** | 自动判断派不派 Agent（M9 + M10）| ✅ |
| **L4 会学习** | GitHub 扫描 + LLM-judge + 失败蒸馏 + 知识图谱反哺（M12/M13/M14/M15）| ✅ 闭环 |
| **L5 自治运行** | 无人值守完成选题→实施→验证→复盘（自主模式）| 🟡 3/3+1🟡 |

> **完整说明**：见 `01_AI-ClaudeCode-最佳实践精简.md` §2.6 + `02_工作空间功能介绍.md` §零  
> **L5 5 条达成**：v4.0.0 最早发版窗口 **2026-10-26**（需 2026-07/08 月度报告 + 30 天数据稳定）

详细说明见 `02_工作空间功能介绍.md` 第 0 节。

---

## 快速操作

> 📋 **本节已迁出为"导航链接"——完整快速操作表是 `01_AI-ClaudeCode-最佳实践精简.md` §三（用户速查主表）**
>
> 用户问"我该用什么命令"→ 查 01 §三
>
> AI 实现细节（每个能力怎么写）→ 查 `02_工作空间功能介绍.md` §二

### 本节只保留 3 项最高频导航

| 操作 | 入口 |
|:-----|:-----|
| **AI 启动协议** | 见上方"启动协议"段（CLAUDE.md 必读） |
| **用户命令速查** | 01_AI-ClaudeCode-最佳实践精简.md §三 |
| **能力详细说明** | 02_工作空间功能介绍.md §二（按 2.X 节） |
| **UI 模板一键安装** | `/ui-install "做 SaaS 后台"` 或 `npm run ui-install` |
| **skill 一键安装** | `/skill-install "加 chart 能力"` 或 `npm run skill-install` |
| **ARIS POC** | `npm run aris-poc:demo` 或 `aris-poc:review -- --file foo.js` |
| **Mem POC** | `npm run mem-poc:demo` 或 `mem-poc:inject "PowerShell 中文乱码"` |
| **Skill Hub** | `npm run skill-hub:demo` 或 `skill-hub:search "chart"` |
| **/go 一键交付** | `npm run go` 或 `npm run go:dry` | 测试→简化→审查→提交 4 阶段流水线（v3.0.5 M43，失败立即停止）|
| **自主模式** | `npm run autonomous`（↑↓ 选择，↵ 确认）<br>或 `/autonomous`（无参弹出选择框）<br>或 `/autonomous single/always/on/off` |

> **2026-06-25 调整（B 方案）**：3 文件职责正交化——
> - **CLAUDE.md** = 启动导航（启动协议 / 工作空间结构 / 规则文件清单 / 核心定位）
> - **01_AI-ClaudeCode-最佳实践精简.md** = 用户速查主表（核心原则 / 快速操作 / 能力速查）
> - **02_工作空间功能介绍.md** = 完整说明字典（每能力一节 + 实现 + 用法 + 测试）
>
> 改一处只动一处，doc-sync 规则同步更精准（"用户可见" 在 01、"实现细节" 在 02、"导航" 在 CLAUDE.md）。

---

## 🤝 会话交接助手

> 📖 **完整教程**：[`.claude/handoff/TUTORIAL.md`](.claude/handoff/TUTORIAL.md)（3 种接续路径 + `/handoff` 用法 + 4 段 prompt 拼装 + 流程图）

---

## 🎯 演进计划的功能怎么来的

> 📖 **完整版**：[`04_自我演进路线.md`](04_自我演进路线.md) §0.7（4 候选来源 + 3 入队方法 + 判断维度 + 版本号规则 + 关键原则 · 130+ 行）

---

## 规则文件（.claude/rules/）

| 文件 | 作用 |
|:-----|:-----|
| `auto-perceive.md` | 自动感知、纠正学习规则 |
| `behavior.md` | 文件读取、输出控制、任务切换、子代理调度 |
| `session-memory.md` | 会话记忆、智能丢弃 |
| `plan-protocol.md` | 智能任务规划协议（[plan] 块格式 + agent/files 字段 + 状态机 + 与 dispatcher 边界，M54 兑现 CLAUDE.md:239 引用）|
| `cost-control.md` | 成本控制 + Git 工作流（个人工程） |
| `daily-maintenance.md` | 每日更新、Changelog |
| `self-discipline.md` | 改动后自动收尾（测试/快照/KB/文档）+ 6 步法（M52 升级 = 5 步 + 0.5 步思维闸门） |
| `doc-sync.md` | 里程碑/增量后同步 04/03/CLAUDE/CHANGELOG，防漂移 |
| **`memory-promote.md`** (M48) | **KB 毕业机制 — 把稳定 KB 升 docs + 缩源为指针，治 memory 膨胀** |
| **`sync-matrix.md`** (M48) | **变更影响矩阵 — 代码层 → 8 文档系统化映射表** |
| **`special-cases.md`** (M48) | **特殊情况段 — 5 种非典型场景兜底（无 README / 无新事实 / 记忆矛盾 / 跨项目 / 历史漏改）** |
| **`first-principles.md`** (M52) | **思维闸门 — 第一性原理（生成前）+ 对抗式审查（完成前）双闭环，AIHOT 两大神级 Prompt 沉淀** |
| `autonomous.md` | 🤖 自主模式 ON 期间行为规则（选题后快照、切题前清理上下文） |
---

## 🧠 智能任务规划协议

> 复杂任务（满足文件数 ≥ 3 / 模块数 ≥ 2 / 改根目录配置 / 5 类任务类型 / 用户说"先评估"中**任意 2 条**）必须先出 `[plan]...[/plan]` 块，等 `/ok` 后再执行。简单任务直接干。
> 📖 **完整格式 + agent 字段 + 执行流程**：见 [`.claude/rules/plan-protocol.md`](.claude/rules/plan-protocol.md)

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
