# 个人 AI 工作空间

> 可移植的 Claude Code 增强工程。开始前按顺序执行启动步骤。
> **上下文分片**（v1.4）：`.claudeignore` 已排除大文件/归档目录。AI 不要主动读这些路径，也不要全局扫描仓库；确需扫描时必须先询问用户。
>
> 🚨 **最高指令（2026-06-24）**：本工程的核心目标是 **智能演进**（围绕 04 纲领 4 大智能增量 L1→L5 路径）。git 管理 / 多用户 / 权限 / 审计 / 团队产品化等**均非核心**。评估任何新功能/任务时，先问"这能帮 Claude 变智能吗？"→ 否则降级或拒绝。详见 `.claude/memory/priority-intelligent-evolution.md`。
>
> 🚀 **自主模式（v2.2.0）**：用户可启动 `/autonomous single`（完成一个阶段后自动停止）或 `/autonomous always`（循环执行阶段）让 Claude 自主决策开发。关闭用 `/autonomous-stop`。详见 `04_自我演进路线.md` 顶部"🚀 自主演进模式"段。

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
│   ├── skills/audit/                  ← 🔍 工程自查/审计 skill（v3.0.5 M25）
│   ├── skills/evolve/                 ← 🧬 自我进化 skill（v3.0.5 M25 · /evolve 升格）
│   ├── skills/autonomous/             ← 🤖 自主模式 skill（v3.0.5 M25 · /autonomous 升格）
│   ├── skills/agent-reach/            ← 🌐 13 平台互联网路由（GitHub/B站/V2EX/RSS/任意网页）
│   ├── commands/                      ← 常用命令
│   └── agents/                        ← 专业子代理
│
├── scripts/                           ← 核心自动化脚本
│   ├── evolution/                     ← 🧬 自我进化系统（v1.8：每日扫描 GitHub 学习新能力）
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

> **2026-06-25 调整（B 方案）**：3 文件职责正交化——
> - **CLAUDE.md** = 启动导航（启动协议 / 工作空间结构 / 规则文件清单 / 核心定位）
> - **01_AI-ClaudeCode-最佳实践精简.md** = 用户速查主表（核心原则 / 快速操作 / 能力速查）
> - **02_工作空间功能介绍.md** = 完整说明字典（每能力一节 + 实现 + 用法 + 测试）
>
> 改一处只动一处，doc-sync 规则同步更精准（"用户可见" 在 01、"实现细节" 在 02、"导航" 在 CLAUDE.md）。

---

## 🤝 会话交接助手（v3.0.5 M21 + M22 + M23 + M24 · 用户接续 vs 机器接续）

> **场景**：上下文超长想 `/clear` 切换新会话 / 深夜编程次日继续 / 想换 Claude Code 窗口。
> **答**：`/handoff` 命令自动存快照 + 生成 4 段接续 prompt，你粘到新会话第一句即可接续；加 `--auto` 打开 VS Code 新窗口并把启动命令复制到剪贴板；加 `--runner` spawn autonomous-runner 后台接续（M24-C）。
> **v3.0.5 新增**：5 场景教程（[`.claude/handoff/TUTORIAL.md`](.claude/handoff/TUTORIAL.md)）+ 状态自愈（`session-init.sh` Step 0.5）+ handoff_lifecycle.jsonl 数据基础 + sync-roadmap.js 04.md 自动同步。
> **不破坏**：`/autonomous`（机器接续）/ `/snap-save`（纯存档）/ `/clear` / `/compact`（内建）。

### 3 种"接续"路径对比

| 路径 | 谁接续 | 何时用 | 命令 |
|:-----|:-------|:------|:-----|
| **用户接续（手动）** | 你自己 | 现在收尾，下次自己继续 | `/handoff "标题" "下一阶段"` |
| **用户接续（半自动）** | 你自己 | 开 VS Code 新窗口 + 剪贴板命令 | `/handoff "标题" "下一阶段" --auto` |
| **机器接续** | autonomous-runner | 离开几小时让 runner 循环跑 | `/autonomous always` + `npm run autonomous:runner` |
| **纯存档** | （不接续）| 仅保存，不继续 | `/snap-save "标题" "milestone-X"` |

### `/handoff` 用法（最常用）

```bash
# 无参数：继续摘要里的下一步
node scripts/orchestrator/handoff.js

# 实际执行：存快照 + 标 awaiting_handoff + 输出 4 段接续 prompt
node scripts/orchestrator/handoff.js "当前标题" "下一阶段标题"

# 预览（不真写，看 prompt 再决定）
node scripts/orchestrator/handoff.js "当前标题" --dry-run

# VS Code 新窗口：存快照 + 入队 next + 打开新窗口 + 复制启动命令到剪贴板
node scripts/orchestrator/handoff.js "今天完成 M21" "M20: decision-assistant.js" --auto
```

### 完整流程

```
当前会话（你正在看的）
  ↓ /handoff ["今天完成 M21"] ["M20: decision-assistant.js"] [--auto]
  ↓
✅ 自动存快照（.claude/skills/left-brain/memory/sessions/latest_state.json）
✅ 标 awaiting_handoff=true
✅ next 入队 evolution-plan.json（ID 不重复）
✅ 输出 4 段接续 prompt（30+ 行 markdown）
  ↓
手动：复制 prompt → New Chat / /clear → 粘贴
--auto：打开 VS Code 新窗口 + 生成 claude 启动命令 → 复制到剪贴板 → 在新窗口终端粘贴执行
  ↓
session-init.sh 自动加载 latest_state.json
  ↓
继续干活
```

### 4 段接续 prompt 拼装（自动）

```
1. 会话摘要（来自 latest_state.json.summary）
2. 待办列表（来自 latest_state.json.pending_todos）
3. 下一阶段目标（用户传入 / 摘要解析）
4. 当前状态与约束（自主模式 / 锁 / 关键约束）
```

### 关联

- 完整命令定义：`.claude/commands/handoff.md`
- 核心引擎：`scripts/orchestrator/handoff.js`
- 测试：`scripts/orchestrator/test-handoff.js`（59/59 通过）
- 复用：`session-summary.sh save --force`（v1.8）+ `autonomous-state.json` schema（v2.2.0）+ `evolution-lock.js queue`
- 与 M16/M19 无关（独立的"用户接续"工具，与"机器接续"互补）

---

## 🎯 演进计划的功能怎么来的（外层摘要 · 完整版见 `04_自我演进路线.md` §0.7）

> **用户最常问 3 个问题**：
> 1. "演进计划的任务从哪儿来？"
> 2. "什么时候加新任务？"
> 3. "凭啥选这个不选那个？"

### 📥 4 个候选来源 → 1 个队列

```
04.md §0.4 增量定义        ──┐
/evolve candidates.json     ──┼──→ queue-bridge.js ──→ evolution-plan.json
  (suggestion=adopt)         │    (npm run queue:sync)  (next 队列)
/audit backlog 段           ──┤
左脑偏好/纠正              ──┘
```

| 来源 | 触发 | 产物 | 谁决定 |
|:-----|:-----|:-----|:-------|
| **04.md §0.4 增量定义** | AI 起草 + 用户确认 | 增量段（含验收 / ROI）| 用户主导 |
| **/evolve GitHub 扫描** | `npm run evolve:scan + :analyze` | `data/github/candidates.json`（adopt 才入）| AI 跑 + 用户审 |
| **/audit 工程自审** | `npm run audit` | 04.md 末尾 backlog 段 | AI 跑 + 用户整合 |
| **左脑偏好/纠正** | 用户对话中纠正 AI | `left-brain.sh preference "..."` | 用户主导 |

### 🚦 怎么"加一个新任务"（3 种方法）

```bash
# 方法 1：最规范（AI 起草 + 用户确认）
# 写好 "## 增量 M17：..." + 验收 + ROI，然后告诉我 "M17 入队"

# 方法 2：最快（直接命令）
node scripts/orchestrator/evolution-lock.js queue M17-token-budget "token 预算管理" -p P1

# 方法 3：让 bridge 自动汇聚（先 dry-run 看）
npm run queue:sync:dry   # 看准备入队哪些
npm run queue:sync        # 确认入队
```

### 🔍 怎么判断"该不该加"

| 维度 | 谁判断 |
|:-----|:-------|
| 相关性（跟自身需求匹配）| 用户 |
| 可落地性（人手/技术栈）| 用户 |
| 优先级（P0/P1/P2）| /audit 或 /evolve 自动 + 用户调整 |
| 重复性（是否已在 history）| bridge dedupe（自动）|
| **是否解决真实问题** | **用户（机器不知道你的痛点）**|

### ⚖️ 版本号怎么决定

| 触发 | 版本号 |
|:-----|:------:|
| v3.0.x 修小 bug | patch |
| 完成一个里程碑（Mxx）| minor |
| **L5 5 条全部达成 + 30 天稳定** | **major → v4.0.0** |
| 路线图重写 | major |

**当前（2026-06-25）**：v3.0.1；v4.0.0 等 L5 5 条全部达成（还需 2026-07 / 2026-08 月度数据）。

### 💡 关键原则

1. **别让队列空** — 每次会话结束前查 `next`
2. **别让队列假满** — `--dry-run` 先看再入队
3. **让 AI 主动发现** — 跑 `/evolve` + `/audit` 产候选
4. **让数据驱动设计** — 30 天 L5 数据 → v4.0.0 增量（不是凭空设计）

> 📖 **完整版**：`04_自我演进路线.md` §0.7（演进计划怎么来 / 怎么判断）— 130+ 行深入说明
> 🔧 **操作命令**：`evolution-lock.js status / queue / complete` + `queue:sync` npm 脚本
> 📊 **关联**：M15 评价闭环 → 月度报告驱动设计；M16 候选汇聚 → 3 源 → 1 队列

---

## 规则文件（.claude/rules/）

| 文件 | 作用 |
|:-----|:-----|
| `auto-perceive.md` | 自动感知、纠正学习规则 |
| `behavior.md` | 文件读取、输出控制、任务切换、子代理调度 |
| `session-memory.md` | 会话记忆、智能丢弃 |
| `cost-control.md` | 成本控制 + Git 工作流（个人工程） |
| `daily-maintenance.md` | 每日更新、Changelog |
| `self-discipline.md` | 改动后自动收尾（测试/快照/KB/文档） |
| `doc-sync.md` | 里程碑/增量后同步 04/03/CLAUDE/CHANGELOG，防漂移 |
| `autonomous.md` | 🤖 自主模式 ON 期间行为规则（选题后快照、切题前清理上下文） |
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
