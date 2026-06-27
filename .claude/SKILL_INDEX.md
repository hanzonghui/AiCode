# 🗂️ AiCode Skill 生态索引（SKILL_INDEX · v3.0.5 M32）

> **作用**：1 张表查清 4 个 skill 的能力边界 + 推荐搭配 + 关键参数 + 总调用例子。
> **学完时长**：5 分钟
> **维护**：M25 起维护，每加 1 个 skill 同步追加
> **关联**：[02.md §零 智能演进路径 L1→L5](02_工作空间功能介绍.md) · [01.md §三 速查主表](01_AI-ClaudeCode-最佳实践精简.md) · [CHANGELOG.md](CHANGELOG.md)

---

## 📊 4 个 Skill 速览

| Skill | 一句话 | 入口命令 | 关键文件 | 学习成本 |
|:------|:-------|:---------|:---------|:--------:|
| **🧠 left-brain** | 跨会话记忆 + 知识图谱 + 语义搜索 + Token 监控 | `bash left-brain.sh remember/recall/graph/dashboard` | `scripts/left-brain.sh` | 30 min |
| **🔍 audit** | 工程健康度自查（1-2 分钟浅层 / 5-10 分钟深度） | `/audit` 或 `node quick-audit.js` | `scripts/orchestrator/audit/quick-audit.js` | 5 min |
| **🤖 autonomous** | 让 Claude 自主决策开发（4 模式：single/always/toggle/off）| `/autonomous single\|always` | `scripts/orchestrator/autonomous.js` + `autonomous-runner.js` | 10 min |
| **🧬 evolve** | 从 GitHub 扫描 Claude 爆款项目 + LLM-judge 评估 + 入队 | `/evolve scan\|analyze\|run\|candidates\|implement` | `scripts/evolution/daily-evolution.js` | 20 min |

---

## 🔗 1. left-brain（必装 · L2 记得住）

**职责**：跨会话记忆 / 知识图谱 / 语义搜索 / Token 监控

**核心能力**

| 能力 | 命令 | 适用场景 |
|:-----|:-----|:---------|
| **记忆** | `left-brain.sh remember "..."` | "我要记住 X" |
| **召回** | `left-brain.sh recall "关键词"` | "我之前说过 X 吗" |
| **偏好** | `left-brain.sh preference "..."` | "我以后不要 X" / "纠正" |
| **图谱** | `left-brain.sh graph` | 看知识关联 |
| **列表** | `left-brain.sh list` | 看所有 KB 条目 |
| **监控** | `left-brain.sh dashboard` | Token 消耗 + 命中率 |
| **状态** | `left-brain.sh status` | 系统健康度 |

**何时用**
- ✅ 任何"我之前说过/做过 X 吗"  → `recall`
- ✅ "记住这个事实/决策/偏好"      → `remember`
- ✅ "纠正 AI 之前的行为"          → `preference`
- ✅ "AI 在跨会话应该记得"          → `remember`

**关键文件**
- 主入口：`scripts/left-brain.sh`（封装 bash）
- 核心引擎：`memory/MEMORY.md`（索引）+ `memory/knowledge/KB-*.md`（条目）
- 关联：[左脑 README](skills/left-brain/docs/README.md)

---

## 🔗 2. audit（周期 · L4 会学习闭环的一部分）

**职责**：工程健康度自查（漂移 / 缺口 / 冗余 / 建议）

**核心能力**

| 模式 | 命令 | 耗时 | 输出 |
|:-----|:-----|:----:|:-----|
| **浅层快速** | `/audit` 或 `node quick-audit.js` | 1-2 min | 6 段报告（工程画像 / 已完成 / 未完成 / 缺口 / 冗余 / 建议）|
| **深度全量** | `/audit full` | 5-10 min | 派 explorer 子代理并发扫各子系统 |
| **整合到 04** | `/audit --to-04` | 0 | 把上次报告写到 `04_自我演进路线.md` 末尾 backlog |
| **建 Todo** | `/audit --to-todo` | 0 | 把"待优化项"自动建 TaskCreate 任务 |

**何时用**
- ✅ 完成里程碑后跑一遍 → 看有没有未声明/未完成
- ✅ "我工程缺什么？" → `/audit` 看 §4 能力缺口
- ✅ 路线图漂移检测 → `/audit` + 自动同步 04.md

**关键文件**
- 主入口：`scripts/orchestrator/audit/quick-audit.js`
- 报告归档：`.claude/audits/audit-YYYYMMDD-HHMM.md`（gitignore）
- 报告历史：`memory/audit-history.json`
- 关联：[audit SKILL](skills/audit/SKILL.md)

---

## 🔗 3. autonomous（机器接续 · L5 自治运行）

**职责**：让 Claude 在你离开时自主决策开发

**核心能力**

| 模式 | 含义 | 适用场景 |
|:-----|:-----|:---------|
| **`single`** | 完成当前 1 个阶段后自动停止 | "把这阶段做完就停" |
| **`always`** | 完成阶段后自动开启新阶段，循环执行 | "我离开几小时，让它跑" |
| **`toggle`** | 反转当前状态（OFF→ON 或 ON→OFF）| 快捷开关 |
| **`off`** | 关闭自主模式（默认）| 回到逐步确认 |

**何时用**
- ✅ "我要去睡觉，让它跑" → `/autonomous always` + `npm run autonomous:runner`
- ✅ "把这阶段做完就停" → `/autonomous single`
- ✅ "我想看下一步会不会自动跑" → `/autonomous single`
- ❌ 不在 L5 决策链不清晰时使用（否则会做错事）

**关键文件**
- 开关引擎：`scripts/orchestrator/autonomous.js`
- 循环执行器：`scripts/orchestrator/autonomous-runner.js`
- 状态文件：`memory/autonomous-state.json`（gitignore）
- 关联：[autonomous SKILL](skills/autonomous/SKILL.md) · [规则](rules/autonomous.md)

---

## 🔗 4. evolve（学习闭环 · L4 会学习）

**职责**：从 GitHub 扫描 Claude 爆款项目 + TF-IDF + LLM-judge 评估 + 入队

**核心能力**

| 能力 | 命令 | 适用场景 |
|:-----|:-----|:---------|
| **扫描** | `/evolve scan` 或 `npm run evolve:scan` | 抓 GitHub trending + search |
| **分析** | `/evolve analyze` 或 `npm run evolve:analyze` | TF-IDF + LLM-judge 打分 |
| **完整流程** | `/evolve run` | scan + analyze 一起跑 |
| **看候选** | `/evolve candidates` | 当前 candidates.json 内容 |
| **实现** | `/evolve implement N` | 实现第 N 个候选（自动分支 + prompt + 测试）|
| **状态** | `/evolve status` | 已实现特性 + 待实现 |
| **历史** | `/evolve log` | 进化历史 |
| **感知** | `/evolve watch` | 自动判断感知层（每日/每周/月度）|
| **报告** | `/evolve report` | 趋势报告 |

**何时用**
- ✅ "AiCode 应该学什么新能力？" → `/evolve run`
- ✅ "GitHub 上有什么爆款 Claude 项目？" → `/evolve scan`
- ✅ "这个候选值不值得做？" → `/evolve analyze`
- ✅ 完成 L4 学习闭环 → 跑月度 `/evolve report`

**关键文件**
- 主入口：`scripts/evolution/daily-evolution.js`
- 候选存储：`data/github/candidates.json`（gitignore）
- 实现引擎：`scripts/evolution/auto-implement.js`
- LLM-judge：`scripts/orchestrator/llm-adapter.js` 中 `judgeCandidateWithFallback()`
- 关联：[evolve SKILL](skills/evolve/SKILL.md)

---

## 🎯 推荐搭配（按场景）

### 场景 1：日常开发

```bash
# 1. 左脑自动加载 session（每会话开始）
bash .claude/skills/left-brain/scripts/session-init.sh

# 2. 写代码
# ...（AI 自动通过 left-brain.sh remember 记忆决策）

# 3. 完成时存快照（commit 前）
bash .claude/skills/left-brain/scripts/session-summary.sh save "..."
```

### 场景 2：完成里程碑（M1~M31）

```bash
# 1. 跑 audit 看有没有未声明
/audit

# 2. 同步 6 文档（doc-sync v2）
#    CHANGELOG.md + 01.md + 02.md + 04.md + 03.md + CLAUDE.md

# 3. commit
git add -A && git commit -m "..."
```

### 场景 3：想学新能力

```bash
# 1. 跑 evolve 扫描
/evolve run

# 2. 看候选 + 选 P1
/evolve candidates

# 3. 入队（自动）
npm run queue:sync

# 4. 启动自主模式跑
/autonomous single
```

### 场景 4：离开几小时让 AI 跑

```bash
# 1. 启动自主模式 + runner
/autonomous always
npm run autonomous:runner

# 2. 关闭时
/autonomous-stop
```

### 场景 5：会话交接

```bash
# 1. /handoff（无参数，从摘要自动提取）
/handoff

# 2. 新会话 /clear + 粘贴 prompt
```

---

## 📐 4 Skill 协作链路（L5 决策链闭环）

```
              ┌─────────────┐
              │  user 决策   │  ← /handoff / /ok / /no
              └──────┬──────┘
                     ↓
        ┌─────────────────────────┐
        │ 4. evolve (L4 学习闭环) │  ← 扫描 GitHub + LLM-judge + 入队
        └────────────┬────────────┘
                     ↓ candidates.json (suggestion=adopt)
                     ↓
              ┌──────────────┐
              │ queue-bridge │  ← /evolve + /audit + 04.md backlog → next
              └──────┬───────┘
                     ↓ evolution-plan.json next
                     ↓
        ┌─────────────────────────┐
        │ 3. autonomous (L5 自治) │  ← /autonomous always → 循环执行
        └────────────┬────────────┘
                     ↓
                     ├─→ audit (浅层报告 → 漂移检测)
                     ├─→ left-brain (记忆 / 快照 / KB 召回)
                     └─→ auto-implement (5 道闸门 + 实现)

        ┌─────────────────────────┐
        │ 1+2. left-brain (L2 记) │  ← 跨会话记忆 + 知识图谱
        └─────────────────────────┘
                     ↓
              sessions/latest_state.json (下次会话自动加载)
```

---

## 🔍 自检问题（开发者维护用）

> 写新 skill 前问 3 问：
>
> 1. **职责正交吗？** — 不和现有 4 skill 重叠吗？重叠的话是合并还是独立？
> 2. **有 L1→L5 路径价值吗？** — 这个 skill 让 Claude 变"更智能"还是"更花哨"？
> 3. **会引发自指循环吗？** — skill 自己管理自己？会变 skill 地狱吗？

> **当前决策**：4 skill 已饱和。下一个 skill 候选只从 audit/evolve 报告中产生，不主动设计。

---

## 🔗 关联

- [CLAUDE.md](CLAUDE.md) 启动导航（含启动协议）
- [01.md §三 速查主表](01_AI-ClaudeCode-最佳实践精简.md)
- [02.md §零 智能演进路径 L1→L5](02_工作空间功能介绍.md)
- [04.md §0.4 增量定义](04_自我演进路线.md)
- [CHANGELOG.md](CHANGELOG.md) 历史
- 单个 SKILL：`skills/left-brain/` / `skills/audit/` / `skills/autonomous/` / `skills/evolve/`

---

*首次创建：v3.0.5 M32 (2026-06-27) · 借鉴 davepoon/buildwithclaude 思路 · 维护：每加 1 个 skill 同步追加*
