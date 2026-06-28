# AI 最佳实践与行为约定

> **本文件是"用户速查主表"**（2026-06-25 调整：B 方案正交化）
> - 完整功能说明见 `02_工作空间功能介绍.md`（字典）
> - AI 启动导航见 `CLAUDE.md`（CLAUDE.md 启动协议 / 工作空间结构 / 规则文件清单）
> - 改动收尾规则见 `.claude/rules/doc-sync.md`（🔴 大 / 🏁 级别强制同步 4 文档 + CHANGELOG）
>
> 工作空间通用行为标准。所有 AI 助手和人类开发者共同遵守。
> 最后更新：2026-06-25（v2.6.0：补 4 个能力 — 二次采样验证 / cron 主动报告 / LLM 辅助 auto-fix / 个人 workflow 智能化；M10 评分驱动 Agent 数量已闭环；新增 /audit 工程自查）

---

## 一、核心原则

| 原则 | 说明 |
|:-----|:------|
| **成本意识** | 控制 Token 消耗，按需读取，精炼输出 |
| **记忆优先** | 重要信息自动存左脑知识库，跨会话可用 |
| **任务隔离** | 新任务开新 session，避免 context 污染 |
| **回退优于纠错** | 发现方向错误用 `/rewind`，不在错误上修复 |
| **失败兜底** | LLM/测试/快照失败时自动降级，不崩主流程 |
| **智能调度** | 复杂任务自动派子代理并行，主会话等完工（2-3 倍提速） |
| **快照备份** | 重要节点用 `会话快照` 系统备份，重启 1 秒接上（save.js 自动维护索引，**`/snap-mode` 会话级切换 off/manual/milestone/auto 4 模式**） |
| **自我约束** | AI 完成改动后**自动**跑测试+存快照+写KB+**同步 4 文档 + CHANGELOG**（`.claude/rules/doc-sync.md` 🔴 大 / 🏁 级别强制触发），不需用户提醒 |
| **自我进化** | AI 每天自动扫描 GitHub 学习 Claude 爆款项目，分析可行性并本地实现 |
| **工作流学习** | AI 观察你的工作习惯（observer + pattern-miner + suggestion-engine），`/workflow` 主动建议下一步 |
| **上下文分片** | `.claudeignore` 排除 2GB+ 数据，理论省 60% token |
| **QA 子代理** | `.claude/agents/qa-reviewer.md`（独立验证，28/28 测试覆盖） |
| **后台异步** | `Ctrl+B` 把当前命令放到后台跑，主线继续。`/tasks` 看所有后台任务 |

---

## 二、核心定位：客户端 Agent 增强，不是大模型增强

### 2.1 我们不做什么

- 不训练/微调 Claude 模型
- 不修改 Anthropic 的模型权重
- 不替代 Claude 的推理/编码能力

### 2.2 我们做什么

我们在 Claude Code 客户端外面包了一层增强壳，通过调度、记忆、工具、工作流、自动化，让同样的 Claude 模型发挥出 5-10 倍效率。

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

### 2.3 增强层对应 Agent 组件

| 我们的系统 | Agent 组件 | 作用 |
|:-----------|:-----------|:-----|
| `dispatcher.js` | 编排层 | 智能决定派不派子 Agent |
| `left-brain` | 长期记忆 | 跨会话知识沉淀 |
| MCP servers | 工具链 | 本地文件/数据库/网页能力 |
| `hooks/` | 环境集成 | 自动执行启动/停止逻辑 |
| `自我约束规范.md` | 工作流 | 改完代码自动收尾 |
| `自我进化循环系统` | 学习反馈 | 从 GitHub 学习新能力 |
| `.claudeignore` + `/compact` | 上下文管理 | 省 token |
| `qa-reviewer` | 验证层 | 独立 QA 验证 |
| `/evolve`, `/dispatch` | UX 层 | 高效交互入口 |
| `会话快照` | 状态恢复 | 跨会话接上 |
| **`ui-skill-installer`** (M36A) | **UI 模板脚手架** | **5 场景（landing/dashboard/chat/admin/portfolio）+ shadcn+Tailwind+v0** |
| **`skill-registry`** (M36B+C) | **skill 自动发现+安装** | **20 关键词扫 GitHub/npm + 5 维评分 ≥ 7.0 + 路径穿越防护 + 营销号过滤** |

### 2.4 为什么这个定位更务实

1. **大模型我们做不了** — 算力/数据/能力都是 Anthropic 的事
2. **客户端优化空间大** — 官方只给了基础能力，工程化很弱
3. **可迁移** — 增强层未来可迁移到 Cursor/Windsurf
4. **模型无关** — Claude 4/GPT-5 出来直接受益

### 2.5 效果对比

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

详细说明见 `02_工作空间功能介绍.md` 第 0 节。

### 2.6 智能演进路径 L1→L5（一句话理解"为什么这个工程越来越智能"）

| 级别 | 价值 | 用户感受 | 现状 |
|:----:|:-----|:--------|:----:|
| **L1 工具能用** | 让 Claude 能调 MCP / 文件 / 数据库 | "AI 能读我的本地代码了" | ✅ |
| **L2 记得住** | 让 Claude 跨会话不丢上下文 | "昨天聊的项目名今天不用再说" | ✅ |
| **L3 会决策** | 让 Claude 自动判断派不派 Agent | "排查 BUG 不用我提醒派助手" | ✅ |
| **L4 会学习** | 让 Claude 从 GitHub 自动学新能力 | "AI 每天问我要不要学 MemOS" | ✅ 闭环 |
| **L5 自治运行** | 让 Claude 无人值守完成选题→实施→验证→复盘 | "我睡一觉，活干完了" | 🟡 3/3+1🟡 |

> **每级都建立在前一级之上**，不是平铺。完整说明 + L5 5 条达成条件见 `02_工作空间功能介绍.md` §零。

---

## 三、快速操作（速查表）

| 操作 | 方法 | 说明 |
|:-----|:-----|:-----|
| 记忆知识 | `/remember 内容` 或自动触发 | 存左脑 |
| 搜索知识 | `recall 关键词` | 左脑搜索 |
| 查看系统 | `/status` | 看监控 |
| 压缩上下文 | `/compact-hint` | 精准压缩 |
| 代码审查 | `/code-review` | 多 Agent 审查 |
| 全自动交付 | `/go` | 测试→简化→审查→提交 |
| 新建项目 | `/new-project` | 项目脚手架 |
| **智能派发** | `/dispatch 任务` | 自动判断要不要派 Agent |
| **强制并行** | `/parallel N 任务` | 强制派 N 个 Agent（1-5） |
| **保存快照** | `node scripts/会话快照/save.js "标题" "标签"` 或 `/snap-save "标题" "标签"` | 结束会话前；`--force` 绕过模式 |
| **备份对话** | `node scripts/会话快照/backup-history.js "标签"` | 重要里程碑 |
| **切快照模式** | `/snap-mode off\|manual\|milestone\|auto\|reset` | 会话级覆盖，不动全局 config |
| **加载快照** | `node scripts/会话快照/load.js latest` 或关键词 | 看 `00_ROOT_快速加载会话.md` |
| **自我进化** | `/evolve run` 或 `npm run evolve` | 扫描 GitHub 爆款并评估可行性（候选池已扩到 AI coding + agent 全生态 · M35） |
| **防闭门造车** | `/evolve watch` 或 `npm run trend` | 检查已实现的特性是否过时 |
| **二次采样验证** | `/secondary-review status` / `approve <id>` / `reject <id>` | 复查高风险改动（核心文件 / 根级配置 / 规则文件）队列 |
| **cron 主动报告** | `npm run cron:report:daily` / `weekly` / `status` | 后台定时日报（9:37）+ 周报（周一 9:42），无人值守期间主动汇报 |
| **工作流建议** | `/workflow` / `/workflow learn` / `/workflow status` | session-init Step 9 自动展示"接下来该做什么" |
| **工程自查/审计** | `/audit` 或 `npm run audit` | 6 段浅层报告（工程画像/已完成/未完成/缺口/重复/建议），可一键整合到 04 backlog（详见 02 §2.25） |
| **多 Agent Swarm 协调** | `npm run swarm:demo` 或 `npm run swarm:run 任务 --n=3` | 多视角生成 + 投票汇总（v3.0.5 M31 POC），详见 02 §2.X |
| **SKILL 生态索引** | 看 `.claude/SKILL_INDEX.md` | 6 skill（left-brain/audit/autonomous/evolve/ui-skill-installer/go）总览 + 5 场景脚本（M32 + M43），0 启动成本 |
| **SKILL 自我进化（GEPA）** | `/evolve self-evolve` 或 `npm run gepa:evolve` | 借鉴 Hermes GEPA 思路，基于 execution traces 自动迭代 SKILL.md（M34 · 加 `--apply` 才覆盖），详见 02 §2.X |
| **UI 模板一键安装** | `/ui-install "做 SaaS 后台"` 或 `npm run ui-install` | 30 秒得到 Next.js 15 + shadcn + Tailwind v4 + AI SDK 脚手架（v3.0.5 M36A），详见 02 §2.X |
| **skill 一键安装** | `/skill-install "加 chart 能力"` 或 `npm run skill-install` | 自动扫 GitHub 3 仓 + npm 关键词 + 5 维评分 ≥ 7.0 + 路径穿越防护（v3.0.5 M36B+C · M37 8 文档补同步），详见 02 §2.X |
| **ARIS POC** | `npm run aris-poc:demo` 或 `aris-poc:review -- --file foo.js` 或 `aris-poc:idea -- --json candidates.json` | 借鉴 wanshuiyin/ARIS：6-state verdict 合约 + cross-model review loop（5 视角）+ idea discovery（5 维评分 + Top-K）（v3.0.5 M38），详见 02 §2.32 |
| **Mem POC** | `npm run mem-poc:demo` 或 `mem-poc:inject "PowerShell 中文乱码"` | 借鉴 thedotmack/claude-mem：78 session → 35 事件压缩 + 按 query 注入最相关历史决策/教训（v3.0.5 M39），详见 02 §2.33 |
| **Skill Hub** | `npm run skill-hub:demo` 或 `skill-hub:search "chart"` | 借鉴 davepoon/buildwithclaude：三源聚合（已装+本地+远程缓存）统一搜索/推荐 skill（v3.0.5 M40），详见 02 §2.34 |
| **/go 一键交付** | `/go` 或 `npm run go` / `npm run go:dry` | 测试 → 简化 → 审查 → 提交 4 阶段流水线，失败立即停止（v3.0.5 M43，19/19 测试），详见 02 §2.35 |
| **KB 分类质量** | `npm run kb:report` | 看 KB 分类分布 + 「其他」占比（v3.0.5 M45，49.3% → 4.2%）|
| **文档基线** | 看 `README.md` + `PROJECT-CONTEXT.md` | v3.0.5 用户首看 + session-init 自动加载（M33 重写，告别 v2.0.0 / v1.9 过期）|
| **handoff 接续（推荐 · 一键接续）** | `/handoff` 或 `node handoff.js` | 上下文 40% 时 / 想换窗口 / 5 场景教程见 `.claude/handoff/TUTORIAL.md`（自动复制启动命令到剪贴板 + 打印接续 prompt，由你决定怎么打开）|
| **handoff 接续（VS Code 新窗口）** | `/handoff "..." --auto` | 开 VS Code 新窗口 + 复制启动命令到剪贴板（v3.0.4 M22） |
| **handoff 接续（机器接续 runner）** | `/handoff "..." --runner` 或 `node handoff.js "..." --runner` | 离开时让 runner 循环跑（v3.0.5 M24-C） |
| **handoff 接续（人工接管 runner）** | `/handoff --resume` | runner 跑一半想换回人工（v3.0.5 M24-C） |
| **路线图同步** | `npm run roadmap:sync` | 04.md §十二 ⏳ 段漂移时根除（v3.0.5 M24-D） |
| **L1→L5 智能演进** | v3.0.4 M23 | 4 文档全景图 + 5 级速览 + v4.0.0 触发条件 + L5 5 条达成 |
| **路线图同步预览** | `npm run roadmap:sync:dry` | 看完再决定是否真同步 |
| **路线图同步状态** | `npm run roadmap:sync:status` | 看 next 队列和 04.md 是否一致 |
| **切到后台** | `Ctrl+B` | 把当前命令放到后台跑 |
| **看后台任务** | `/tasks` | 列所有后台运行的任务 |

---

## 四、文件读取策略

- **新会话先读 PROJECT-CONTEXT.md** — 1 分钟掌握全貌，避免扫描整个仓库浪费 token
- **按需读取** — 用户提到哪个文件就读哪个
- **批量读前确认** — 多文件先列清单让用户确认
- **优先搜索** — 使用 Glob/Grep 而非遍历目录
- **部分读取** — 大文件只读需要的行范围
- **不主动读 .claudeignore 排除的目录** — archives/、.skill/、.qoder/、.claude/snapshots/ 等

---

## 五、输出控制

- **精炼** — 避免冗长解释，代码直接可运行
- **最简** — 没特别要求时给最简洁的方案
- **无教学式代码** — 不输出大量注释的"演示代码"

---

## 六、Session 管理

- **新任务 = 新 session**（除非强关联）
- Context > 40% 时主动建议 `/compact` 或重置
- `/compact-hint` 比自动 compact 更精准
- `/rewind` 代替纠错，保持 context 干净
- **会话结束前**：跑 `node scripts/会话快照/save.js "标题" "标签"` 保存快照
- **复杂多步任务**：开干前先 `/snap-mode off` 关闭频繁保存，写完一个功能再 `/snap-mode milestone` + `/snap-save` 归档

---

## 七、AI 能力速查

| 能力 | 入口 | 说明 |
|:-----|:-----|:------|
| 自动感知 | 自动 | 检测事实/决策/偏好/纠正，自动记忆左脑 |
| 知识图谱 | `graph` | 关联推理，2跳扩散搜索 |
| 智能调度 | `/dispatch` 或自动钩子 | Layer 1 规则引擎，12/12 测试 |
| 强制并行 | `/parallel N` | 跳过判断，强制派 N 个 Agent |
| **LLM Adapter** | `LLM_BACKEND=xxx` | 4 backend（heuristic/anthropic/ollama/cli），失败降级 |
| **MCP 工具** | `.claude/mcp.json` | filesystem + sqlite + fetch |
| **快照自动维护** | `node scripts/会话快照/save.js` | 跑完自动追加到 00_ROOT_快速加载会话.md |
| **自我进化** | `/evolve run` / `npm run evolve` | 每日自动扫描 GitHub，学习爆款 Claude 项目并本地实现 |
| **趋势感知** | `/evolve watch` / `npm run trend` | 持续对比已实现特性 vs GitHub 最新趋势，防闭门造车 |
| Subagent | planner/reviewer/explorer | 隔离执行复杂任务 |
| Hooks | 后台自动 | Setup/Stop/PostToolUse/PreToolUse（含 dispatcher 钩子） |
| Status Line | 底部实时 | `🧠N | HH:MM` 实时水位 |
| Token 监控 | `node scripts/orchestrator/token-monitor.js` | 统计派发率 + 估算成本 |
| 规则学习 | `node scripts/orchestrator/learn-rules.js` | 反馈收集 + 模式分析 |
| **快照系统** | `scripts/会话快照/` | save/load/backup-history + **snap-mode 会话级切换** |
| **失败路径测试** | `test-failure-paths.js` | 12 项异常场景兜底验证 |
| **Mermaid 归档图** | `global-archive.sh` | 自动生成分任务流图 |
| **CI 自动回归** | `.github/workflows/test.yml` | push/PR 自动跑 81 项测试 |
| **Benchmark** | `npm run benchmark` | 真实任务串行 vs 并行 |
| **自我约束** | `.claude/rules/self-discipline.md` | **AI 完成后自动收尾（无需提醒），🔴 大 / 🏁 级别强制同步 4 文档 + CHANGELOG** |
| **二次采样验证** | `scripts/orchestrator/reflection/secondary-review.js` | 5 类高风险改动自动入队（核心文件 / 根级配置 / 规则 / >5 文件 / 安全关键词），50/50 测试 |
| **cron 主动报告** | `scripts/orchestrator/proactive/cron-report.js` | 日报 9:37 / 周报周一 9:42，delta 计算 + 历史裁剪，54/54 测试 |
| **LLM 辅助 auto-fix** | `scripts/orchestrator/proactive/llm-fix-advisor.js` | test-coverage / deps-outdated / candidate-pending 加 LLM 建议（`--llm` flag），19+23 测试 |
| **任务复杂度评分** | `dispatcher.js` v2.5.0+ | `scoreComplexity()` 0-10 数字 + 三档阈值（<4 不派 / 4-7 灰区 / >7 派），M10 接入 Agent 数量（1-3） |
| **自主演进模式** | `npm run autonomous`（↑↓ 方向键选择，↵ 自动执行）<br>或 `/autonomous`（无参弹出选择框）<br>或 `/autonomous single\|always\|on\|off` | single 完成一个阶段后停，always 循环；5 道安全闸门 + 5 次失败上限，64+12+6 测试 |
| **个人 workflow 智能化** | `scripts/orchestrator/workflow/*.js` | observer / pattern-miner / suggestion-engine 三层架构，`/workflow` 主动建议 |
| **工程自查/审计** | `scripts/orchestrator/audit/quick-audit.js` | 6 个扫描器（profile / completed / unfinished / gaps / duplicates / suggestions），9/9 测试 |

---

## 八、核心系统速览

工程已实现的几个核心系统，完整说明见 `02_工作空间功能介绍.md`：

| 系统 | 一句话 | 入口 |
|:-----|:-------|:-----|
| **智能调度** | 复杂任务自动派 2-3 个 Agent 并行，主会话汇总 | `/dispatch 任务`、PreToolUse 钩子 |
| **快照系统** | 4 模式可控（`/snap-mode`）：关/手动/里程碑/自动；状态栏可见 | `node scripts/会话快照/save.js` |
| **三级检查点** | 计划 → 迭代 → 全局归档的完整闭环 | `plan-snapshot.js` / `global-archive.sh` |
| **Git worktree** | 多 worker 在独立分支/目录并行开发 | `worktree-parallel.sh` |
| **左脑记忆** | 跨会话知识沉淀与语义搜索 | `left-brain.sh remember/recall` |
| **MCP 工具** | filesystem + sqlite + fetch 本地 server | `.claude/mcp.json` |
| **自我进化** | 每日自动扫描 GitHub 学习 Claude 爆款项目并本地实现 | `/evolve run` |

---

## 九、文件命名规范（重要！）

为方便操作员识别，**用户能直接看的文件用中文名**，**CC 内部用的保留英文**：

| 类型 | 命名 | 例子 |
|:-----|:-----|:-----|
| **根目录索引** | 中文 | `00_ROOT_快速加载会话.md` |
| **使用文档** | 中文 | `使用文档.md`、`决策指南.md` |
| **核心代码** | 英文 | `dispatcher.js`、`test-dispatcher.js` |
| **斜杠命令** | 英文 | `dispatch.md`、`parallel.md`（CC 约定） |
| **钩子配置** | 英文 | `dispatch-decision.js`（CC 引用） |
| **目录** | 中文（用户找的） | `会话快照/`、`文档/` |
| **目录** | 英文（CC 引用的） | `hooks/`、`commands/` |

**为什么不全改中文**？
- CC 系统约定（钩子、命令）依赖英文精确路径
- 改错了全仓崩溃
- 双语并存 = 安全 + 友好

---

---

## 十、相关文件

| 文件 | 说明 |
|:-----|:------|
| `PROJECT-CONTEXT.md` | ⭐ **新会话先读这个（1 分钟掌握全貌，省 token）** |
| `CLAUDE.md` | 启动导航 + 目录结构 |
| `README.md` | 工程简介与安装 |
| **`00_ROOT_快速加载会话.md`** | **根目录索引（每次会话看这个）** |
| `02_工作空间功能介绍.md` | 完整功能说明 + 操作指南 |
| `04_自我进化循环系统设计.md` | **⭐ v1.8 新增：AI 每天从 GitHub 学习并本地实现新能力** |
| `.claude/rules/` | 5 个规则文件（行为/成本/感知/会话/维护/自我约束） |
| `.claude/commands/` | 斜杠命令（dispatch/parallel/code-review/...） |
| `.claude/agents/` | 子代理定义（explorer/planner/reviewer/qa-reviewer） |
| `.claude/skills/left-brain/` | 左脑记忆系统（知识库/脚本/图谱） |
| `scripts/orchestrator/` | 智能调度模块（4 工具 + 2 钩子 + 2 命令） |
| `scripts/会话快照/` | 快照系统（save/load/backup-history） |

---

## 十一、用户使用常用说明（速查）

> 这是**给你（操作员）**看的，不是给 AI 看的。直接复制命令用。

### 📌 智能调度（自动派 Agent）

```bash
# 方式 1：直接提问（钩子自动判断）
"排查订单 BUG"

# 方式 2：手动派发
/dispatch 排查订单 BUG

# 方式 3：强制派 3 个
/parallel 3 全面排查
```

### 📌 快照备份

```bash
# 结束会话前（必做）
node scripts/会话快照/save.js "本次任务标题" "中文标签"

# 重要里程碑
node scripts/会话快照/backup-history.js "中文标签"

# 下次会话加载
cat 00_ROOT_快速加载会话.md
```

### 📌 会话交接（handoff · v3.0.5 M29）

> **何时用**：上下文 40% / 想睡觉 / 想换窗口 —— 让当前会话收尾，新会话无缝接续。
> **何时不用**：要彻底换任务（用 `/clear`）/ 离开几小时让 runner 跑（用 `/autonomous`）

```bash
/handoff           # 🌟 一句话就够，不用写标题
/handoff --auto    # + 开 VS Code 新窗口 + 复制启动命令
```

> **自动行为**：标题从会话摘要 `[已完成]` 自动提取，下一阶段从 `下一步:` 自动提取。
> **5 场景教程**：[`.claude/handoff/TUTORIAL.md`](../.claude/handoff/TUTORIAL.md)

### 📌 左脑记忆

```bash
# 手动记忆
bash .claude/skills/left-brain/scripts/left-brain.sh remember "事实"

# 搜索
bash .claude/skills/left-brain/scripts/left-brain.sh recall "关键词"

# 状态
bash .claude/skills/left-brain/scripts/left-brain.sh dashboard
```

### 📌 调试智能调度

```bash
# 跑 12 个测试
node scripts/orchestrator/test-dispatcher.js

# 看决策日志
node scripts/orchestrator/token-monitor.js stats

# 钩子测试
echo '{"tool_name":"UserPromptSubmit","tool_input":{"prompt":"排查 BUG"}}' | node scripts/orchestrator/hooks/dispatch-decision.js
```

### 📌 切换任务前必做

1. 跑快照（上面命令）
2. 加备注到 00_ROOT_快速加载会话.md
3. `/clear` 重置 session
4. 开始新任务

### 📌 出问题怎么办

| 问题 | 看这个文档 |
|:-----|:----------|
| 不会用智能调度 | `scripts/orchestrator/文档/使用文档.md` |
| 钩子不工作 | `scripts/orchestrator/文档/重启指南.md` |
| 权限弹窗太多 | `scripts/orchestrator/文档/权限设置指南.md` |
| 不知道上版本特性 | `scripts/orchestrator/文档/每日总结-20260622.md` |
| 想看 v1.2 改进 | `scripts/orchestrator/文档/v1.2-改进清单.md` |
| 重启后怎么接上 | `00_ROOT_快速加载会话.md`（根目录） |

---

## 十二、版本状态（v2.6.0）

| 增量 | 版本 | 状态 |
|:-----|:-----|:-----|
| 增量 A 自我反思（v1.9.1）+ 二次采样验证（v2.0.1） | A | ✅ |
| 增量 B 智能任务规划（v1.9.1）+ plan-bridge 桥接（v1.9.3） | B | ✅ |
| 增量 C 主动发现问题 A 方案（v1.9.1）+ cron 报告（v2.0.1） | C | ✅ |
| 增量 D 自动修复 A 方案（v1.9.2）+ LLM advisor（v2.0.1） | D | ✅ |
| 增量 E 向量语义检索（M6 v2.1.0） | E | ✅ |
| 增量 F 进化闭环 auto-implement（M7 v2.2.0） | F | ✅ |
| 增量 G 跨会话状态续接（M8 v2.3.0） | G | ✅ |
| 增量 H 个人 workflow 智能化（M11 v2.6.0） | H | ✅ |
| M9 任务复杂度评分（v2.5.0） | M9 | ✅ |
| M10 评分驱动 Agent 数量（v2.5.1） | M10 | ✅ |
| M16 工程自查/审计 /audit（v2.0.2） | M16 | ✅ |
| M12 LLM-judge 闸门 / M13 失败蒸馏器 / M14 知识图谱反哺 / M15 效果指标 | M12~M15 | ⏳ v3.0.0 规划中 |

> 🚨 **2026-06-25 真实化**：执行层 A~H + M9/M10 全部 ✅，L4 自主"学习" 4 个缺口（LLM-judge / 失败蒸馏 / 知识图谱反哺 / 效果 metric）明确为 v3.0.0 路线（M12~M15）。详见 `04_自我演进路线.md` §0.4。

---

_最后更新：2026-06-25 · v2.6.0 · 个人 workflow 智能化完成 · 200+ 测试全过 · M9/M10 智能调度优化闭环 · M12~M15 v3.0.0 路线明确_