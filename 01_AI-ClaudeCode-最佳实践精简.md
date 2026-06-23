# AI 最佳实践与行为约定

> 工作空间通用行为标准。所有 AI 助手和人类开发者共同遵守。
> 完整功能说明见 `02_工作空间功能介绍.md`，操作细节见各脚本文档。
> 最后更新：2026-06-23（v1.8：新增自我进化循环系统，AI 每日扫描 GitHub 学习并实现新能力）

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
| **快照备份** | 重要节点用 `会话快照` 系统备份，重启 1 秒接上（save.js 自动维护索引） |
| **自我约束** | AI 完成改动后**自动**跑测试+存快照+写KB+更新文档，不需用户提醒 |
| **自我进化** | AI 每天自动扫描 GitHub 学习 Claude 爆款项目，分析可行性并本地实现 |
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
| **保存快照** | `node scripts/会话快照/save.js "标题" "标签"` | 结束会话前 |
| **备份对话** | `node scripts/会话快照/backup-history.js "标签"` | 重要里程碑 |
| **加载快照** | 看 `00_ROOT_快速加载会话.md` | 下次会话开头 |
| **自我进化** | `/evolve run` 或 `npm run evolve` | 扫描 GitHub 爆款并评估可行性 |
| **防闭门造车** | `/evolve watch` 或 `npm run trend` | 检查已实现的特性是否过时 |
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
| 快照系统 | `scripts/会话快照/` | save/load/backup-history |
| **失败路径测试** | `test-failure-paths.js` | 12 项异常场景兜底验证 |
| **Mermaid 归档图** | `global-archive.sh` | 自动生成分任务流图 |
| **CI 自动回归** | `.github/workflows/test.yml` | push/PR 自动跑 81 项测试 |
| **Benchmark** | `npm run benchmark` | 真实任务串行 vs 并行 |
| **自我约束** | `.claude/rules/self-discipline.md` | **AI 完成后自动收尾（无需提醒）** |

---

## 八、核心系统速览

工程已实现的几个核心系统，完整说明见 `02_工作空间功能介绍.md`：

| 系统 | 一句话 | 入口 |
|:-----|:-------|:-----|
| **智能调度** | 复杂任务自动派 2-3 个 Agent 并行，主会话汇总 | `/dispatch 任务`、PreToolUse 钩子 |
| **快照系统** | 会话结束前一键备份，下次 1 秒接上 | `node scripts/会话快照/save.js` |
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

_最后更新：2026-06-23 · v1.8 · 自我进化循环系统完成 · 41 项 evolution 测试全过 · 实测 20 个 GitHub 候选_