# Changelog

> 所有版本变更记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

> **说明**：2026-06-25 清理历史 Unreleased 堆积 — 已交付内容已迁入对应版本号段（详见下方各 `[vX.Y.Z]`）。
> 本段仅作占位，下个增量/发版再追加条目。

### Added - 阶段 1：04 文档第十二章瘦身（已完成）
- `04_自我演进路线.md` 第十二章只保留里程碑表 M1~M15
- 删除：实测数据 / npm scripts 列表 / 测试状态 / 路线分水岭段 / Backlog 段 / 风险和缓解段
- 后续：路线分水岭段将迁移到 0.5 长期愿景末尾（阶段 2）

### Added - 阶段 2：路线分水岭段修正（已完成）
- `04_自我演进路线.md` 新增 0.6 节「路线分水岭（v2.x 执行闭环 → v3.0.0 学习闭环）」
- 关键修正：M12 LLM-judge 闸门归 v2.x（它解决执行层判断更准，不是 v3.0.0 新能力）
- v3.0.0 重新定义 = M13+M14+M15 三个子闭环（失败 / 复用 / 评价）
- L5 达成条件补全 5 条：M13~M15 ✅ + 失败蒸馏率 ≥ 80% + 知识命中率 ≥ 30% + 月度 metric 持续 3 个月 + 自治覆盖率/人工干预率趋势

---

## [v2.0.4] - 2026-06-25

**主题**：演进治理基础设施（P0-0 元能力 — 防多窗口打架）

> **背景**：用户反思 2026-06-25「两个窗口自由发挥去优化相互影响了」+「演进计划执行的只能是一个大的核心（防止两个窗口改的不同）」。本版本就是把这个心智模型制度化。

### 🧠 Added - 演进计划锁（Evolution Lock）

**目标**：解决"多窗口/多会话同时改 04.md / CLAUDE.md / CHANGELOG 导致状态漂移"问题。给多个"内存副本"加 `synchronized`（演进锁）+ `volatile`（单一权威源）。

**实现细节**：

- **单一权威源** `.claude/skills/left-brain/memory/evolution-plan.json`（gitignore）
  - `current` — 当前阶段（id / title / owner / locked_at / scope / allowed_docs）
  - `next` — 候选队列（id / title / queued_at / note / priority）
  - `history` — 完成历史（最近 20 条）

- **锁引擎** `scripts/orchestrator/evolution-lock.js`（v1.0.0）
  - `status` / `acquire <id> [owner] [title]` / `release [id]` / `complete <id> [summary]` / `queue <id> [title] [note]` / `peek <id>` / `init`
  - **三层锁机制**：
    - L1 软锁：窗口启动时主动读 evolution-plan.json
    - L2 文件锁：acquire 原子写 current.owner + locked_at；5 分钟超时自动释放（可被接管）
    - L3 hook 强制：未来由 PostToolUse hook 接入（本期未实现，留作未来）
  - **安全特性**：
    - 永不 throw（异常 → 退化）
    - 单文件原子写入（.tmp + rename）
    - 5 分钟 stale 检测（超时不显式 release 仍可被接管）
    - 同 id 重入允许；不同 id 冲突报错

- **规则文件** `.claude/rules/evolution-lock.md`
  - 启动协议：会话启动必读 evolution-plan.json
  - 工作流：acquire → work → complete
  - 锁冲突处理矩阵
  - 禁止项：不允许绕过锁写 04.md / CLAUDE.md / CHANGELOG

- **session-init Step 0** 集成：所有会话启动自动显示锁状态 + 冲突警告

- **package.json 集成**：
  - `test:evo-lock` / `evo-lock` / `evo-lock:status` / `evo-lock:complete`
  - 主 test 链追加 `test-evolution-lock.js`

- **测试** `scripts/orchestrator/test-evolution-lock.js`：**12/12 通过**
  - loadState 默认值 / saveState 原子写入 / status 空状态 / acquire 成功 / acquire 冲突 / acquire 接管 stale / release 成功 / release id 不匹配 / complete 写 history / queue + 重复跳过 / peek 三档 / CLI 端到端

- **初始化**：M13 / M14 / M15 已入 next 队列；当前 current = P0-0-evo-governance

**Files**：
- 新增 `scripts/orchestrator/evolution-lock.js`
- 新增 `scripts/orchestrator/test-evolution-lock.js`
- 新增 `.claude/rules/evolution-lock.md`
- 修改 `.claude/skills/left-brain/scripts/session-init.sh`（加 Step 0）
- 修改 `.gitignore`（排除 evolution-plan.json）
- 修改 `package.json`（加 npm scripts + 测试链）

**关联**：`.claude/rules/evolution-lock.md` · `.claude/rules/autonomous.md` · 增量 P0-0 · 后续 M13/M14/M15 启动前置条件

---

## [v2.2.2] - 2026-06-25

**主题**：autonomous-runner 子会话 prompt 强化（commit 历史 · Windows 兼容续）

> **说明**：本段为 2026-06-25 `/audit` v1.0.0 清理 Unreleased 段时，从 v2.0.3 内容里拆出。
> 解决 spawn 修复后子会话能启动但不调 `complete-stage` 的问题。

### 🐛 Fixed - autonomous-runner 子会话不调 complete-stage

**症状**：spawn 修复后，子会话能正常启动且 `code=0` 退出，但 runner 仍判失败（连续 6 次）—— `stage.status` 仍 `in_progress`。

**根因**：`buildStagePrompt` 设计不严，把"读上下文"和"调 complete-stage"混在一起。子会话（`claude -p`）把我传入的 prompt 误读为"用户的半句话消息"，走了 SessionStart 启动协议 + 等用户指令，**完全没按 prompt 清单的第 3 步调 `complete-stage`**。

**修复**（v2.2.1 → v2.2.2）：
- prompt 开头加 `⚠️⚠️⚠️ 强制上下文` 声明：明确"非对话 / 没有用户 / 不能发问"
- 任务清单 5 步化（顺序化 + 编号）+ 移到顶部
- 第 4 步（`complete-stage`）显式标 `⚠️ 关键：漏掉 runner 会判失败`
- 显式禁用：`不要走 SessionStart 启动协议 / 不要问"用户要我做什么"`
- 测试：`testBuildStagePrompt` 新增 6 项断言（⚠️、claude -p、不能发问、5 步清单、第 4 步关键）
- 测试 8/8 通过

**Files**：
- 修改 `scripts/orchestrator/autonomous-runner.js`（`buildStagePrompt` 重写）
- 修改 `scripts/orchestrator/test-autonomous-runner.js`（`testBuildStagePrompt` 增强断言）

---

## [v2.2.1] - 2026-06-25

**主题**：autonomous-runner Windows spawn ENOENT 修复

> **说明**：本段为 2026-06-25 `/audit` v1.0.0 清理 Unreleased 段时，从 v2.0.3 内容里拆出。

### 🐛 Fixed - autonomous-runner Windows spawn ENOENT

**症状**：在 Windows 上启动 `/autonomous single` 或 `npm run autonomous:runner` 时，连续 5 次 `spawn claude ENOENT` 后自动停。

**根因**：`scripts/orchestrator/autonomous-runner.js:233` 用 `spawn(CLAUDE_BIN, ['-p', prompt], { shell: false })`。Node.js 子进程不继承 PowerShell 的 PATH，找不到 `C:\Users\Administrator\AppData\Roaming\npm\claude.cmd`（Claude Code CLI 实际已安装）。

**修复**（v2.2.0 → v2.2.1）：
- 新增 `resolveClaudeBin()`：优先 `CLAUDE_BIN` 环境变量；Windows 上自动解析 `%APPDATA%\npm\claude.cmd`；其他回落 `claude`
- `shell: false` → `shell: true`（让 PowerShell/cmd 接管 PATH 解析，跨 shell 边界稳）
- ENOENT 时给清晰 hint（提示 `npm i -g @anthropic-ai/claude-code` / 设置 `CLAUDE_BIN`）
- 导出 `resolveClaudeBin` + 7→8 测试用例（含 Windows 路径解析验证）
- 测试：`node scripts/orchestrator/test-autonomous-runner.js` 8/8 通过
- 验证：`resolveClaudeBin()` → `C:\Users\Administrator\AppData\Roaming\npm\claude.cmd`，exists=true

**Files**：
- 修改 `scripts/orchestrator/autonomous-runner.js`（spawn + 新增 resolveClaudeBin + 文档注释）
- 修改 `scripts/orchestrator/test-autonomous-runner.js`（+ 1 测试用例）

---

## [v2.0.3] - 2026-06-25

**主题**：M12 LLM-judge 闸门 + auto-implement 双轨制（commit 4b188ef）

> **说明**：本段为 2026-06-25 `/audit` v1.0.0 清理 Unreleased 段时从顶部迁出。原段还夹带 v2.2.1 / v2.2.2 修复，已分别拆出到对应版本号段。

### 🧠 Added - M12 LLM-judge 闸门：auto-implement 智能判定

**背景**：增量 F（M7 v2.2.0）已实现 auto-implement 闭环，但"该不该学"的判定完全靠硬阈值（composite ≥ 7.0 / effort = small / 路径黑名单），本质是规则过滤而非智能判断。这导致"7.0 阈值的候选里 80% 不值得学、6.5 阈值里可能藏着好货"。

**目标**：在硬阈值闸门前加一道 LLM-judge，让模型真正评估"这个能力对 AiCode 智能演进有没有价值"。硬阈值保留为安全兜底。

**实现路径**：A 方案（独立 `judgeCandidate()` 接口，与 score/generate 风格完全对称）

### Added - llm-adapter judge 接口
- 4 个 adapter 全部加 `async judge(candidate, criteria)` 方法
  - HeuristicAdapter.judge 真实实现：基于 composite / effort / suggestion / forbiddenDeps 规则返回 accept/reject/skip
  - AnthropicAdapter / OllamaAdapter / CliAdapter 暂 throw（与 score/generate 行为一致）→ 工厂降级到 Heuristic
- 顶层函数 `judgeCandidateWithFallback(candidate, criteria, opts)`：与 `scoreWithFallback` / `generateWithFallback` 完全对称
- 永不抛错契约：null / 非对象 candidate 兜底返回 reject；LLM 不可用 → 工厂降级
- 返回结构：`{verdict: 'accept'|'reject'|'skip', score, reasons, backend}`（与 score/generate 形态一致）

### Changed - auto-implement 双轨制
- `evaluateSafety` 改 `async` + **双轨制**：
  1. 先调 `judgeCandidateWithFallback` —— LLM `reject` → 一票否决（不再走硬阈值）
  2. `accept` / `skip` / 任何 LLM 失败情况 → 走原 `evaluateSafetyHard` 兜底
- 保留原 `evaluateSafetyHard`（纯同步）作为纯硬阈值版本，便于测试 / 旧调用方独立调用
- 返回结构新增 `source: 'llm'|'hard'`，可观测"哪道闸门实际拒了"
- `listExecutable` / `implementOne` / `run` 全部 await 化（向后兼容：所有调用方测试同步修复）

### Test
- `scripts/orchestrator/test-judge-candidate.js` **新建 · 26/26 通过**
  - 6 段：接口契约 4 项 + Heuristic 判定 6 项 + Anthropic throw 1 项 + WithFallback 6 项（null 兜底 2 项 + criteria 自定义 3 项）+ 字段别名 1 项
- `scripts/evolution/test-auto-implement.js` **26/26 通过**（原 24 项硬阈值断言全保留 + 新增 2 项 source 字段验证）
  - reason 关键字兼容旧 `forbidden dep` 和新 `禁止依赖`（向后兼容）
- `scripts/orchestrator/test-llm-adapter.js` 回归 **23/23** 无影响
- **总计 75/75 全过，0 回归**
- package.json：`test` 链 + `test:llm` 链都纳入 `test-judge-candidate.js`

### Files
- 新增：`scripts/orchestrator/test-judge-candidate.js`（~130 行）
- 修改：`scripts/orchestrator/llm-adapter.js`（+95 行：4 adapter.judge + judgeCandidateWithFallback + null 兜底）
- 修改：`scripts/evolution/auto-implement.js`（evaluateSafety async + 双轨制 + 保留 evaluateSafetyHard）
- 修改：`scripts/evolution/test-auto-implement.js`（await 化 + reason 关键字兼容 + source 字段断言）
- 修改：`package.json`（version 2.0.2 → 2.0.3 + test 链纳入 judge 测试）

### 关联
- 命中 04 文档 §0.4 增量 M12（v2.0.3 新增）
- 关联 04 文档 §12 里程碑表 M12 ✅
- 符合"最高指令"：让 Claude 能"真学聪明"——判断从规则升级为 LLM，是 L4 真正的智能闸门
- 关联增量 M15 效果 metric（30 天后量化 LLM-judge 价值）

---

## [Unreleased] - 工程自查能力 /audit skill（v2.0.2）

### 🔍 Added - 增量 P0-6：工程自查/审计（Self-Audit）

**背景**：用户提的诉求——"我们有时候重新评价分析我们的工程会发现一些不足,希望 Claude 能做一个能力自动发现不足和需要改进的地方"。

**目标**：让 Claude 自己（或用户）能一键跑出 6 段审计报告：工程画像 / 已完成能力 / 已声明未完成 / 能力缺口 / 重复冗余 / 优化建议。报告可一键整合到 04.md backlog 段 + 自动开 todo。

**流程（4 步,每步询问）**：
1. **分析** — 读 4 类源数据（根目录文档 + 代码骨架 + git 状态 + 左脑知识图谱）,不扫描整个仓库,遵守 `.claudeignore`
2. **输出报告** — 终端即时输出 6 段结构化报告,持久化到 `.claude/audits/audit-YYYYMMDD-HHMM.md`
3. **询问是否整合到 04 文档** — 写入 `04_自我演进路线.md` 末尾 backlog 段
4. **询问是否开始优化** — 全部 P0 / 选 X 项 / 暂不 / 交给 /autonomous always

**实现细节**：
- **入口** `.claude/commands/audit.md` + `.claude/skills/audit/SKILL.md`(`/audit` 命令)
- **浅层引擎** `scripts/orchestrator/audit/quick-audit.js`
  - 6 个扫描器：`scanProfile / scanCompletedCapabilities / scanDeclaredButUnfinished / scanCapabilityGaps / scanDuplicates / generateSuggestions`
  - 输入源：`CHANGELOG.md` + `04_自我演进路线.md` + `03_版本迭代计划.md` + `CLAUDE.md` + `PROJECT-CONTEXT.md` + `.claude/skills/*/SKILL.md` + `.claude/commands/` + `scripts/orchestrator/` 子系统 + git log + `autonomous-state.json`
  - 报告落盘：`.claude/audits/audit-YYYYMMDD-HHMM.md`
  - 历史索引：`.claude/skills/left-brain/memory/audit-history.json`（保留 20 条）
  - **永不 throw**（任何扫描失败 → 返回空数组）
  - **不写任何代码文件**（只读 + 写 `.claude/audits/` 和 04.md backlog）
  - 浅层 < 5K tokens / 深度 < 50K tokens
- **深度引擎** `scripts/orchestrator/audit/full-audit.js`（v2.0.2 已实现）
  - 9 个子系统任务清单（dispatcher / reflection / proactive / evolution / planning / workflow / left-brain / recall / autonomous）
  - 生成 JSON 任务清单（每个含 promptTemplate 给 Claude Code runtime 用 Agent tool 派 explorer 子代理）
  - `aggregateResults` 汇总多 Agent 结果，P0/P1/P2 排序（用 `??` 避免 `0 || 99` 的 falsy 坑）
  - CLI：`tasks / json / help`
- **npm scripts**：`audit / audit:json / audit:history / audit:full / audit:full:json / test:audit`,加入主 `test` 链
- **package.json**：`2.0.1 → 2.0.2`
- **测试**：`scripts/orchestrator/audit/test-quick-audit.js` **9/9 通过** + `scripts/orchestrator/audit/test-full-audit.js` **9/9 通过**

**自检验证**（首次跑 `/audit` 发现并修复 2 个真问题）：
- ⚠️ P0-1: audit SKILL.md 引用 `scripts/orchestrator/audit/full-audit.js` 但文件未建（深度模式缺失）→ **已修复,新建 full-audit.js（9 子系统任务清单 + aggregateResults）**
- ⚠️ P0-2: `package.json` line 8 和 line 70 都定义了 `"test:evolution"`,后定义的覆盖前面的（值不同,少一个测试）→ **已修复,删除 line 70 重复定义,保留 line 8 完整 3 测试版本**
- 🟡 P2-1: 当前仅 2 个 skill,建议把高频能力包装为 skill（远期,留作未来 backlog）

**与其他命令的边界**：
- `/autofix` 修**当下**技术债 — `/audit` 找**长期**方向缺口
- `/cron-report` 看 **anomaly 日报**（每日 cron）— `/audit` 看 **能力全景**（按需）
- `/workflow` 建议**下一步具体动作** — `/audit` 建议**长期方向**
- `/secondary-review` 复查**单次高风险改动** — `/audit` 复查**整个工程**

### Files
- 新增：`.claude/skills/audit/SKILL.md`
- 新增：`.claude/commands/audit.md`
- 新增：`scripts/orchestrator/audit/quick-audit.js` (~410 行)
- 新增：`scripts/orchestrator/audit/full-audit.js` (~230 行)
- 新增：`scripts/orchestrator/audit/test-quick-audit.js` (~120 行,9/9 通过)
- 新增：`scripts/orchestrator/audit/test-full-audit.js` (~110 行,9/9 通过)
- 修改：`package.json`（version 2.0.1 → 2.0.2,新增 6 个 npm script,test 链追加 test-quick-audit + test-full-audit,删除重复 test:evolution）
- 修改：`04_自我演进路线.md`（新增 P0-6 增量段 + M16 里程碑 + 顶部同步日期）

### 关联
- 命中 04 文档 §0.4 增量（v2.0.2 新增 P0-6 工程审计）
- 关联 04 文档 §12 里程碑 M16
- 符合"最高指令"：让 Claude 能自己"重新评价工程"→ 帮 Claude 变智能（L4/L5 路线必备）

---

## [Unreleased] - self-discipline 强化：动作 0（commit 前自动存快照）

### 🔧 Changed - 决策树加"动作 0"，杜绝"4 commit 1 快照"

**背景**：2026-06-25 上午发现 — 4 个 commit（04 真实化 / doc-sync 串联 / 01-02 补全 / B 方案正交化）只补了 1 个快照。根因：milestone 模式按"完成/里程碑/交付"标签触发，docs/refactor 类型 commit 不带这些关键词会全跳过；而 self-discipline 决策树里"快照"是可选项不是必选项。

**调整**：
- `.claude/rules/self-discipline.md` — 表格里 🟡 / 🔴 / 🏁 三行加"**0 先存快照**"前缀；顶部加 2026-06-25 强化说明
- `scripts/orchestrator/自我约束规范.md` — 动作编号表新增 `0`：`commit 前自动存快照`；"何时存快照"段补频率（1 commit 1 快照）
- 决策树从"测试 → 快照 → KB"改为"快照 → 测试 → KB"（快照先于测试，因测试可能改文件，先存能保留改动前状态）

**影响**：🟡 / 🔴 / 🏁 任何 commit 前**必须**先跑 `session-summary.sh save`，不再依赖标签自动触发。

### Files
- 修改：`.claude/rules/self-discipline.md`
- 修改：`scripts/orchestrator/自我约束规范.md`

### 关联
- 命中 self-discipline 决策树
- 与 doc-sync 规则（动作 4a）并列，组成"🔴 大级别双强制"

---

## [Unreleased] - 3 文件职责正交化（B 方案）+ /audit 能力补全

### 🔧 Refactor - CLAUDE.md / 01 / 02 三个文件职责正交化

**背景**：2026-06-25 用户评价——根据文件名用户会习惯性看 01 + 02，希望两个文件"包含全部核心功能说明"。但现状是 3 个文件（CLAUDE.md / 01 / 02）都有"快速操作"表，**职责重叠、互相不同步、可能各写各的**。

**调整**（B 方案，3 文件职责清晰）：
- **CLAUDE.md** = 启动导航（启动协议 / 工作空间结构 / 规则文件清单 / 核心定位）
  - "快速操作"段改为"导航链接"——完整表迁到 01
- **01_AI-ClaudeCode-最佳实践精简.md** = 用户速查主表（核心原则 / 快速操作 / 能力速查）
  - 顶部加"职责定位"段，明确"用户命令速查主表"身份
  - 引用 02 作为"详细说明"、引用 doc-sync 作为"改动收尾规则"
- **02_工作空间功能介绍.md** = 完整说明字典（每能力一节 + 实现 + 用法 + 测试）
  - 主体不动

**为什么走 B 不走 A/C/D**：
- A（加交叉引用）：3 处表都过时风险，比现在 1 处更差
- C（合并 01+02）：违反 SRP，让 doc-sync 新规则失效
- D（02 归档）：给"详细"内容贴"归档"标签是反信号
- B 胜在：3 文件正交、改一处不影响他处、与 doc-sync 天然兼容、改动 1 小时内

### 🔍 Added - 02 §2.25 /audit 工程自查/审计（v2.0.2 M16）

**背景**：2026-06-25 用户顺手指出 CHANGELOG 里有 /audit v2.0.2 这一条，但 01/02 没补——按 doc-sync 规则这是违规。

**调整**：
- 01 顶部"最后更新"加"新增 /audit 工程自查"
- 01 快速操作表加 /audit 一行
- 01 能力速查表加 /audit 一行
- 01 版本状态表加 M16 ✅
- 02 §2.25 新增 /audit 完整节（6 段浅层 + 9 子系统深度 + 用法 + 测试 + 自检发现 2 个真问题）
- 02 现状速览表 + 关键数字表 + 版本演进表 各补一行
- 02 工作空间结构树 audit/ 子目录补 2 个具体文件

**影响**：用户和 AI 现在能查到 /audit 完整说明；3 文件职责正交、doc-sync 同步更精准。

### Files
- 修改：`CLAUDE.md`（快速操作表改为导航链接）
- 修改：`01_AI-ClaudeCode-最佳实践精简.md`（升格为速查主表 + /audit 3 处）
- 修改：`02_工作空间功能介绍.md`（新增 §2.25 + 4 处表更新 + 工作空间结构 audit/ 节点）
- 修改：`CHANGELOG.md`（本条）

### 关联
- 命中 self-discipline 决策树动作 4a（同步 4 文档 + CHANGELOG）
- 为 M13 失败蒸馏器（自动检测 doc-drift）打基础

---

## [Unreleased] - 01 + 02 文档补全：v2.0 ~ v2.6 期间 7 个新能力

### 📚 Docs - 精简版 + 详细版真实反映 v2.6.0 工程状态

**背景**：2026-06-25 用户指出 doc-sync 串联规则之外，01/02 两个根目录文档**严重过时**——
- 01 精简版最后更新 2026-06-23（v1.9），6 个版本未反映
- 02 详细版最后更新 2026-06-24（v2.4），2 个版本 + 4 个增量未反映
两份文件都缺二次采样 / cron 报告 / LLM advisor / 个人 workflow / 自主模式 / 评分驱动 Agent 数量等关键能力。用户和 AI 看不到完整图谱。

**01 精简版改动**：
- 顶部"最后更新"→ v2.6.0
- 核心原则表加 2 行（**文档同步串联** / **工作流学习**）
- 快速操作表加 3 行（**二次采样** / **cron 报告** / **工作流建议**）
- 能力速查表加 6 行（**二次采样** / **cron 报告** / **LLM advisor** / **任务复杂度评分** / **自主演进模式** / **个人 workflow**）
- 新增第十二章"版本状态"：A~H 增量 + M9~M10 全部 ✅，M12~M15 ⏳ v3.0.0

**02 详细版改动**：
- 顶部"最后更新"→ v2.6.0
- 现状速览表更新版本号 + 测试数 + 4 个新能力行
- 工作空间结构树补 4 个新节点（reflection/ + proactive/ + planning/ + workflow/ + autonomous.js）
- 自我进化层加 auto-implement + test-auto-implement
- 新增 §2.21~2.24 四个新节（**二次采样** / **cron 报告** / **LLM advisor** / **评分驱动 Agent 数量**）
- 2.5 节自我约束规范补动作 4a（强制同步 5 个根目录文档）
- 2.19 / 2.20 已有节补"v2.6.0 完成态"
- 版本演进表加 v2.0.1 ~ v2.6.0 共 7 行
- 关键数字表更新（200+ 测试 / 50+ 快照 / 75+ KB / 16+ 版本）
- §8 下一步方向拆为"v2.x 剩余"和"v3.0.0 路线（M12~M15）"两段
- 底部尾巴更新为 v2.6.0

**影响**：用户和 AI 现在能完整看到 v2.6.0 能力图谱，新会话加载不漏关键命令。

### Files
- 修改：`01_AI-ClaudeCode-最佳实践精简.md`（+~50 行）
- 修改：`02_工作空间功能介绍.md`（+~250 行）

### 关联
- 命中 self-discipline 决策树动作 4a（同步 4 文档 + CHANGELOG）
- 为 M12~M15 v3.0.0 路线提供"下一步方向"段的可见入口

---

## [Unreleased] - 文档同步规则串联（self-discipline ↔ doc-sync）

### 📚 Docs - 三大规则文件明确互相引用，🔴/🏁 强制同步 4 文档 + CHANGELOG

**背景**：2026-06-25 用户指出"核心功能落地后要在根目录文档中更新体现，否则会遗忘"——本质上是 self-discipline 决策树里"文档更新"是模糊词（只说"文档更新"没说哪几个文件），doc-sync.md 规则又没被决策树强制引用，结果实际跑下来 04 文档 L4 仍然写"✅ 已达"（M7 之后没人更新）。

**调整**：
- `.claude/rules/self-discipline.md` —— 表格里"🔴 大 / 🏁 里程碑"行把"文档更新"明确改为"同步 4 文档 + CHANGELOG（详见 doc-sync.md）"
- `.claude/rules/doc-sync.md` —— 顶部加"🚨 2026-06-25 强化"段，声明本规则被 self-discipline 决策树在 🔴 大 / 🏁 级别强制触发
- `scripts/orchestrator/自我约束规范.md` —— 决策树动作表新增 `4a`（强制同步 5 个根目录文档），"何时更新文档"段加引用 + 4 文件清单
- 3 个规则文件互相引用，AI 决策时不会跳过

**影响**：从此 🔴 大 / 🏁 级别的收尾流程**必须**走 4a 动作，CHANGELOG 永远先写，04/03/CLAUDE/02 反向同步。

### Files
- 修改：`.claude/rules/self-discipline.md`
- 修改：`.claude/rules/doc-sync.md`
- 修改：`scripts/orchestrator/自我约束规范.md`

### 关联
- 命中 self-discipline 决策树
- 为 M13 失败蒸馏器（自动检测 doc-drift）打基础

---

## [Unreleased] - 04 文档真实化：M12~M15 规划 + L4/L5 状态纠正

### 📚 Docs - 自主学习短板明确为 v3.0.0 四个新增量

**背景**：2026-06-25 用户评价指出现状与 04 文档 L4/L5 乐观表态存在落差——自主"执行"已闭环（M7 auto-implement + autonomous-runner），但自主"学习"仍停留在添工具层面。04 文档原 L4 写"✅ 已达"、L5 写"🟡 部分 / 进入实测期"，与"判断靠硬阈值 / 失败未蒸馏 / 调度未接图 / 效果未量化"四项硬缺口不符。

**调整**：

- 0.4 节新增 4 个增量段（M12~M15），均为 ⏳ 计划中（v3.0.0 P0/P1）：
  - **M12 LLM-judge 闸门**（P0-1）— 替代 auto-implement 硬阈值
  - **M13 失败蒸馏器**（P0-2）— anomaly 自动转 KB + 规则
  - **M14 知识图谱反哺调度**（P1-1）— dispatcher 加 `recallBeforeDispatch` 钩子
  - **M15 效果量化指标**（P1-2）— 4 项采集器 + 月度报告
- 0.5 节 L4 状态 ✅ → 🟡（"部分闭环"），L5 状态 🟡 → ❌（"未达"）
- L5 评估段新增 2 项可量化目标：失败蒸馏率 ≥ 80%、知识图谱命中率 ≥ 30%
- 第十二章里程碑表追加 M12~M15 占位
- 新增"路线分水岭"段：明确 v2.x（执行闭环）vs v3.0.0（学习闭环）分界
- 顶部"最近一次同步"日期更新

**影响**：04 文档现在真实反映"工具变多 ≠ Claude 变聪明"的现状，v3.0.0 路线有明确可验收的 4 个目标。

### Files
- 修改：`04_自我演进路线.md`（+~120 行）

### 关联
- 命中 04 文档 L4/L5 段
- 为 v3.0.0 路线提供 4 个可落地目标

---

## [Unreleased] - 智能增量 A/C/D 方案 B（v2.0.1）

### 🔍 Added - 增量 A 方案 B：二次采样验证（secondary-review）

**背景**：高风险改动（dispatcher.js、self-reflect.js、package.json、04.md 等）需要第二双眼睛复查，避免单一 Claude 实例在 PostToolUse hook 中犯错。

- 新增 `scripts/orchestrator/reflection/secondary-review.js`
  - 5 类高风险判定：核心调度/反射/进化文件、根级配置/纲领文档、.claude/rules 规则文件、单次改动 >5 文件、安全敏感关键词
  - 队列持久化到 `.claude/skills/left-brain/memory/secondary-review-queue.json`
  - CLI：`status / clear / add / approve <id> / reject <id>`
  - 去重：同一文件同一原因最近 50 条内不重复
  - 永不 throw
- 扩展 `self-reflect.js`：新增 `high-stakes-trigger` 规则，Edit/Write 后自动评估并加入队列
- 新增 `.claude/commands/secondary-review.md`：/secondary-review 命令文档
- 新增测试：`scripts/orchestrator/reflection/test-secondary-review.js`（50/50 通过）

### 📅 Added - 增量 C 方案 B：后台 cron 主动报告（cron-report）

**背景**：主动扫描只在 SessionStart 跑，用户离开期间的问题无法及时报告。需要后台定时生成日报/周报。

- 新增 `scripts/orchestrator/proactive/cron-report.js`
  - 复用 `proactive-scan.detectAll(force=true)` 生成日报
  - 周报聚合最近 7 天日报，按 message 去重
  - delta 计算（较上次日报的变化）
  - 历史裁剪：日报保留 ≤31 条，周报保留 ≤13 条
  - CLI：`daily / weekly / status / clear`
  - 永不 throw
- 新增 `.claude/commands/cron-report.md`：/cron-report 命令文档
- 新增 npm scripts：`cron:report:daily / weekly / status / clear` 和 `test:cron-report`
- 新增真实 cron 调度：
  - 日报：每天 9:37（job: c54283b7）
  - 周报：每周一 9:42（job: f3097a09）
- 新增测试：`scripts/orchestrator/proactive/test-cron-report.js`（54/54 通过）

### 🤖 Added - 增量 D 方案 B：LLM 辅助 auto-fix

**背景**：test-coverage / deps-outdated / candidate-pending 等复杂维度只生成规则化 proposal，缺少结构化建议。引入 LLM advisor 为每个 proposal 附加可执行建议。

- 扩展 `scripts/orchestrator/llm-adapter.js`：新增统一 `generate(prompt, opts)` 接口
  - HeuristicAdapter.generate：零成本模板建议（按维度关键词）
  - Anthropic / Ollama / Cli adapter：接口预留，未来接真实模型
  - `generateWithFallback`：任何 backend 失败自动降级到 heuristic
- 新增 `scripts/orchestrator/proactive/llm-fix-advisor.js`
  - 针对 test-coverage / deps-outdated / candidate-pending 构造 prompt
  - 调用 `generateWithFallback` 生成建议
  - 永不 throw
- 修改 `scripts/orchestrator/proactive/auto-fix.js`
  - fixTestCoverage / fixDepsOutdated / fixCandidatePending 支持 `useLLM`
  - 新增 `--llm` CLI flag：`node auto-fix.js --llm`
  - LLM 建议写入 fix-proposals.json 的 reason 字段
  - formatReport 显示 LLM 建议摘要
- 更新 `.claude/commands/autofix.md`：加 `--llm` 用法
- 新增测试：`scripts/orchestrator/proactive/test-llm-fix-advisor.js`（19/19 通过）
- 扩展测试：`scripts/orchestrator/test-llm-adapter.js` 加 generate 覆盖（23/23 通过）

### 🔧 Changed - 会话初始化展示增强

- `session-init.sh` 新增 Step 7（二次采样队列）和 Step 8（cron 报告），新会话启动时自动展示

### 🤖 Added - 自主模式 single / always 双模式（v2.2.0）

**背景**：原 `/autonomous` 只有一个"无限 runner"行为，用户需要更灵活的控制：有时只让 Claude 完成当前一个阶段就停，有时才让它循环执行阶段。

- 状态文件 `autonomous-state.json` 新增 `mode` 字段：`'single' | 'always'`
- `scripts/orchestrator/autonomous.js` v2.1.0 → v2.2.0
  - 新增 CLI 子命令：`single [reason]`、`always [reason]`
  - `on` 默认 mode=`always`（向后兼容）
  - `start` 保持 `always + runner` 行为（向后兼容）
  - `toggle` 关闭后保留 mode，再开启时恢复
  - `formatStatusLine()` 显示当前 mode
- `scripts/orchestrator/autonomous-runner.js` v2.0.1 → v2.2.0
  - `runLoop()` 在 single 模式下完成一个阶段后自动 `disableAutonomous` 并退出
  - `status` 输出显示当前 mode
  - `run` 启动日志显示当前 mode
- `package.json` 新增 npm scripts：
  - `autonomous:single` = `single && runner`
  - `autonomous:always` = `always && runner`
- 更新 `.claude/commands/autonomous.md`：说明 single / always 用法与行为对比
- 测试：`test-autonomous.js` 62/62 通过；`test-autonomous-runner.js` 6/6 通过

### 🎯 Changed - M10：任务复杂度评分驱动 Agent 数量（dispatcher.js v2.5.1）

**背景**：M9 给出 0-10 复杂度评分和三档阈值，但 `decide()` 多个路径仍固定派 2 个 Agent，没有把评分转化为调度粒度。

- 新增 `agentsFromScore(score)` 辅助函数：`Math.min(max_agents, Math.ceil(score / 3))`
  - score 1-3 → 1 agent
  - score 4-6 → 2 agents
  - score 7-10 → 3 agents
- 3 处固定 `agents: 2` 改为动态：
  - 命中 `should_dispatch` 关键词路径
  - 任务类型匹配路径（bug_fix / refactor / migration 等）
  - 灰区 `suggested_action.agents`
- `RULES.version` 2.5.0 → 2.5.1
- 测试：
  - `test-dispatcher-scoring.js` 新增 agentsFromScore + decide agents 一致性覆盖（55/55 通过）
  - `test-dispatcher-unit.js` 灰区断言改为按 score 动态判定（65/65 通过）
  - `test-failure-paths.js` 版本号匹配改为正则，避免硬编码 2.5.0（12/12 通过）

### 🤖 Added - 自主模式无人值守 runner（autonomous-runner.js v2.1.0）

**背景**：`.claude/rules/autonomous.md` 要求阶段完成后保存快照并 `/clear` 清理上下文，但 `/clear` 是用户级 slash 命令，脚本和子进程无法直接调用，导致真正的无人值守循环无法实现。

- 新增 `scripts/orchestrator/autonomous-runner.js`
  - 外部循环控制器：阶段完成后退出当前 `claude -p` 子会话，启动新子会话加载快照并继续下一阶段
  - 状态机：`idle → in_progress → completed/failed → next`
  - 失败重试：单阶段失败最多重试 5 次，连续失败 5 次后自动写 `autonomous-state.json enabled=false`
  - 单阶段超时：默认 30 分钟，可配 `AUTONOMOUS_STAGE_TIMEOUT_MS`
  - CLI：`run / stop / status / complete-stage [next]`
- 扩展 `scripts/orchestrator/autonomous.js`
  - 新增 `start [reason]` 命令：开启自主模式并启动 runner 循环
  - 新增 `runner` 命令：在已开启状态下启动 runner 循环
  - 版本：v2.0.0 → v2.1.0
- 扩展 `.claude/skills/left-brain/scripts/state-snapshot.js`
  - 新增 `stage` 字段：`current / status / completed / next / failure_count / started_at`
  - 保存快照时自动保留 runner 已写入的 stage 状态
- 扩展 `package.json`
  - 新增 `autonomous:start` / `autonomous:runner` npm scripts
  - `test:autonomous` 加入 `test-autonomous-runner.js`
- 新增 `.claude/hooks/SessionStart`
  - 新 Claude 会话启动时自动加载最新快照
  - 自主模式开启时提示继续执行命令
- 新增测试：`scripts/orchestrator/test-autonomous-runner.js`（5/5 通过）

### 🤖 Added - 自主模式规则补充（autonomous.md）

**背景**：自主模式下完成一个选题后直接进入下一个选题，缺少强制快照和上下文清理，导致 token 消耗增加、上下文污染。

- 新增 `.claude/rules/autonomous.md`
  - 每个阶段/选题完成后 **必须保存快照**（不受 30 分钟间隔限制）
  - 进入下一个选题前 **必须保存进度**（含下一个考虑的选题）
  - 保存后立即 **`/clear` 清理上下文**，再加载状态执行下一个选题
  - 目的：控制 token 消耗 + 防止上下文污染 + 保持选题起点清晰
- 更新 `04_自我演进路线.md` 自主模式段，引用 `.claude/rules/autonomous.md`
- 更新 `CLAUDE.md` 规则文件清单，新增 `autonomous.md` 行

### 🔧 Fixed - 快照系统修复（Windows CRLF + session-summary 联动）

**背景**：`session-summary.sh save` 只更新左脑会话摘要，不更新 `00_ROOT_快速加载会话.md`；且 `save.js` 在 Windows CRLF 文件上找不到 `\n---\n` 分隔线，导致 ROOT 索引长期不更新。

- 修复 `scripts/会话快照/save.js`
  - 读取 `00_ROOT_快速加载会话.md` 时检测并统一 CRLF → LF
  - 写回时保持原文件换行符风格（CRLF 文件仍写 CRLF）
  - `updateQuickLoad()` 现在能正常更新 ROOT 索引
- 修改 `.claude/skills/left-brain/scripts/session-summary.sh`
  - `save` 命令末尾同步调用 `save.js --force`，确保每次会话摘要保存时 ROOT 索引也更新
  - 自主模式下选题完成后保存快照，00_ROOT 同步落盘

### Files

- 新增：
  - `scripts/orchestrator/autonomous-runner.js`
  - `scripts/orchestrator/test-autonomous-runner.js`
  - `.claude/hooks/SessionStart`
  - `scripts/orchestrator/reflection/secondary-review.js`
  - `scripts/orchestrator/reflection/test-secondary-review.js`
  - `scripts/orchestrator/proactive/cron-report.js`
  - `scripts/orchestrator/proactive/test-cron-report.js`
  - `scripts/orchestrator/proactive/llm-fix-advisor.js`
  - `scripts/orchestrator/proactive/test-llm-fix-advisor.js`
  - `.claude/commands/secondary-review.md`
  - `.claude/commands/cron-report.md`
  - `.claude/rules/autonomous.md`
- 修改：
  - `scripts/orchestrator/autonomous.js`（v2.1.0 + start/runner 入口）
  - `.claude/skills/left-brain/scripts/state-snapshot.js`（+ stage 字段）
  - `package.json`（+ autonomous:start / autonomous:runner / test-autonomous-runner）
  - `scripts/orchestrator/reflection/self-reflect.js`（+ high-stakes-trigger 规则）
  - `scripts/orchestrator/llm-adapter.js`（+ generate 接口）
  - `scripts/orchestrator/proactive/auto-fix.js`（+ --llm / useLLM）
  - `scripts/orchestrator/proactive/test-auto-fix.js`（LLM 模式测试）
  - `scripts/orchestrator/test-llm-adapter.js`（generate 测试）
  - `.claude/skills/left-brain/scripts/session-init.sh`（+ Step 7/8）
  - `.claude/commands/autofix.md`
  - `package.json`（+ cron-report / secondary-review / llm-fix-advisor scripts）
  - `scripts/orchestrator/dispatcher.js`（v2.5.1 M10 agents 动态化）
  - `scripts/orchestrator/test-dispatcher-scoring.js`（+ agents 覆盖）
  - `scripts/orchestrator/test-dispatcher-unit.js`（灰区 agents 动态断言）
  - `scripts/orchestrator/test-failure-paths.js`（版本号正则匹配）
  - `04_自我演进路线.md`（+ 自主模式选题切换规则）
  - `CLAUDE.md`（+ autonomous.md 规则清单）
  - `scripts/会话快照/save.js`（CRLF 兼容 + 保持原换行符）
  - `.claude/skills/left-brain/scripts/session-summary.sh`（save 命令同步调用 save.js --force）
  - `00_ROOT_快速加载会话.md`（索引已更新）

### 🧠 Added - v2.0 P0-5：个人 workflow 智能化（workflow intelligence）

**背景**：v2.0 路线最后一项 P0，让 Claude 学习用户工作模式，根据最近行为主动建议下一步（如"你刚改完 orchestrator .js，是否要跑 npm test？"）。

- 新增 `scripts/orchestrator/workflow/workflow-observer.js`
  - 事件采集：file_modified / command_run / test_run / commit / plan_created / plan_approved / session_start / session_end
  - 自动从文件路径提取模块、扩展名、文件名
  - 写入 `.claude/skills/left-brain/memory/workflow-events.jsonl`
  - CLI：`record / recent / stats / cleanup`
  - 30 天滚动清理
- 新增 `scripts/orchestrator/workflow/pattern-miner.js`
  - 从事件序列挖掘关联规则（A 发生后 T 分钟内发生 B）
  - 支持度 + 置信度过滤
  - 输出 `.claude/skills/left-brain/memory/workflow-patterns.json`
  - CLI：`mine / list / stats`
- 新增 `scripts/orchestrator/workflow/suggestion-engine.js`
  - 根据当前上下文 + 已学习模式生成下一步建议
  - 模式建议 + 启发式兜底（未提交改动 → commit、模块改动 → 对应测试、plan 未批准 → /ok）
  - CLI：`suggest / json / context`
- 新增 `scripts/orchestrator/workflow/workflow-cli.js`
  - 统一入口：`suggest / learn / record / status / context`
- 新增 `.claude/commands/workflow.md`：`/workflow` 命令
- 新增 npm scripts：`workflow / workflow:learn / workflow:status / test:workflow`
- 集成 `session-init.sh`
  - Step 4 后记录 `session_start` 事件
  - 新增 Step 9 主动展示 workflow 建议
- 集成 `session-summary.sh`
  - `save` 命令末尾记录 `session_end` 事件
- 更新 `.gitignore`：排除 workflow 动态数据和测试临时目录
- 测试：
  - `test-workflow-observer.js`：6 项通过
  - `test-pattern-miner.js`：4 项通过
  - `test-suggestion-engine.js`：4 项通过

### 关联

- 命中 04 文档 §0.4 增量 A/C/D
- 命中 04 文档 §0.4 M9/M10 任务复杂度评分深化
- 关联 `.claude/rules/doc-sync.md` 文档同步规则
- 全量测试：`npm test` 全过（测试数因新增模块增长）

---

## [Unreleased] - 文档同步规则 + 演进路线对齐（v2.6.0 doc-sync）

### 📚 Added - 文档同步规则（防里程碑漂移）

**背景**：04 演进路线 0.4 节 增量 E/F/G 仍写"🆕 计划中"，但实际 M6/M7/M8 已交付；只有第十二章里程碑表是 ✅。**里程碑 ≠ 文档同步**的根因暴露。

### Added - `.claude/rules/doc-sync.md` 新规则
- 强制每个里程碑/增量/发版后同步 4 个根目录文档 + CHANGELOG
- 4 文档同步矩阵：CHANGELOG（事实源）→ 04.md（0.4 节/0.5 表/里程碑）→ 03.md（P0 状态）→ CLAUDE.md/02.md（按需）
- 4 触发节点：增量/里程碑/发版/路线图重写
- 集成到增量 C（proactive-scan）作为候选维度 `doc-drift`
- 与 self-discipline 决策树联动（🏁 里程碑级 = 必做文档同步）
- 维护清单：测试 `test-doc-sync.js` + npm script `npm run doc:check`

### Changed - 04 演进路线对齐
- 增量 E：🆕 计划中 → ✅ 已完成（M6 v2.1.0，TF-IDF 60 条 KB 召回率 80%）
- 增量 F：🆕 计划中 → ✅ 已完成（M7 v2.2.0，4 道安全闸门 27/27 测试）
- 增量 G：🆕 计划中 → ✅ 已完成（M8 v2.3.0，state-snapshot 6 收集器 42/42 测试）
- 新增增量 M9 段：任务复杂度评分 v2.5.0（scoreComplexity 0-10 + 三档阈值 + 43/43 测试）
- 0.5 长期愿景表：L2/L3/L4 从"升级中"→ ✅ 已达，L5 进入实测期
- 0.4 节末段追加 M10 候选（score→agents 动态化，0.5 天）
- 顶部"最近一次同步"段新增
- 清理 G 段重复段落

### Changed - CLAUDE.md 规则文件清单
- 新增 `doc-sync.md` 行
- 快速操作表加 `文档漂移检查` 行（npm run doc:check）

### Files
- 新增：`.claude/rules/doc-sync.md`（约 130 行）
- 修改：`04_自我演进路线.md`（0.4 节 E/F/G/M9、0.5 长期愿景表、顶部同步段）
- 修改：`CLAUDE.md`（规则文件清单 + 快速操作表）

### 关联
- 命中 `priority-intelligent-evolution` 文档纪律
- 为后续 doc-drift 自动检测提供规则基线
- 自我约束级别：🏁 里程碑（自动收尾）

---

## [Unreleased] - 工具链就绪（外部信息获取层 v2.4）

### 🌐 Added - Agent Reach 工具链（13 平台路由器）

**背景**：Claude 此前 "知道怎么搜" 但 "搜不到" —— skill 已加载但底层 CLI 全缺。2026-06-24 安装 agent-reach + 6 个零配置 CLI，**L1（感知）层正式打通**：所有子代理（planner/explorer/qa-reviewer）从此能调用 5 个平台的真实数据。

### Added - 7 个新工具（用户级配置，不进 git）
| 工具 | 版本 | 来源 | 用途 |
|:-----|:-----|:-----|:-----|
| agent-reach | 1.5.0 | pipx+GitHub | 13 平台路由核心 |
| gh CLI | latest | winget | GitHub 搜索/Issue/PR（GH_TOKEN 已持久化到 User 环境变量） |
| bili-cli | 0.6.2 | pipx | B站搜索/热门/详情 |
| yt-dlp | 2026.06.09 | pipx | YouTube 字幕/元数据 |
| mcporter | latest | npm -g | MCP 客户端（Exa 等） |
| feedparser | 6.0.12 | pip | RSS/Atom 订阅 |
| pipx | 1.14.1 | pip | Python 工具隔离器（先决条件） |

### Real-world 烟测结果（4/4 真实工作）
- ✅ V2EX：拿到 "庆祝 Steam Machine 发布" 真实帖子
- ✅ B站：搜 "claude" 拿到 129 万播放的 Claude Code 教程
- ✅ 任意网页（Jina Reader）：example.com
- ✅ GitHub：搜 "claude-code" 拿到 134k ⭐ 官方仓库
- ⚠️ YouTube：工具就绪，需 cookie 看 metadata（YouTube 反爬限制）

### 5 个零配置平台就绪
GitHub / B站 / V2EX / RSS / 任意网页 — **立即可用**，无需任何登录

### 8 个登录类平台（未装，按用户决定）
小红书/Reddit/Twitter/LinkedIn/Exa/小宇宙/雪球/微博 — 需要 cookie/API key

### Security
- ✅ Token 不进 AI 对话（环境变量方式导入）
- ✅ 规则写入左脑：[[never-paste-secrets-into-context]]
- ⚠️ 旧 token `ghp_iUp7s8WC...` 已在对话里泄露，**建议手动 revoke**

### Files
- 修改：`CLAUDE.md`（工作空间结构段 + 增强层表 + 快速操作）
- 修改：`02_工作空间功能介绍.md`（新增 2.18 章节 + 现状速览）
- 修改：本文件
- **不动代码**：纯文档 + 用户级工具安装

### 关联
- 命中 `priority-intelligent-evolution` L1（感知）层
- 为后续 `/evolve run` 自我进化提供真实 GitHub 搜索能力（之前因网络阻塞退化为缓存）
- 下次会话自动受益：左脑 KB 可记录"用 agent-reach 搜 X"

---

## [Unreleased] - 路线图更新（v2.x 预览）

### ✅ M9：任务复杂度评分（智能调度优化）- 已完成

**目标**：dispatcher 加 0-10 数字评分，让派/不派决策有量化依据

### Added - scoreComplexity(task)
- 位置：`scripts/orchestrator/dispatcher.js`（v2.5.0）
- 函数：`scoreComplexity(text) → { score, band, breakdown }`
- 三档阈值（`RULES.scoring`）：
  - `score ≤ 3` → `no_dispatch`（不值得派）
  - `4 ≤ score ≤ 7` → `gray_zone`（灰区，保守派 2 Agent）
  - `score ≥ 8` → `dispatch`（直接派）
- 加性打分：
  - 文件数 × 0.6 + 模块数 × 1.2（基础分）
  - should_dispatch 关键词 +3（强信号）
  - dont_dispatch 关键词 -1.5（抑制）
  - 强任务类型（bug_fix / refactor / migration 等）+2
  - 单人处理类型（explanation / question / single_edit）-1
- 钳制到 0-10
- `decide()` 所有 return 路径加 `complexity_score` + `complexity_band` 字段
- 测试：`test-dispatcher-scoring.js` **43/43 通过**（10 维度：返回结构/分数范围/三档阈值/灰区/边界钳制/关键词影响/任务类型影响/decide 集成/分数一致性/CLI 输出）

### 🐛 Fixed - autonomous.js 状态文件路径 bug（v2.3.1 patch）
- **症状**：`/autonomous on` 报告 ON 但磁盘文件**没生成**，跨会话丢失状态
- **根因**：`autonomous.js` 第 35 行 `WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..')` — `__dirname` 已是 `scripts/orchestrator/`，**三级** `..` 走到了工程**外** `H:\AI-han\`，文件写到 `H:\AI-han\.claude/...`（用户主目录）
- **修复**：三级改两级
- **回归测试**：`test-autonomous.js` 加 4 个路径断言（路径必须在工程内、CLI on 后磁盘可见），41/41 全过
- **对照**：`state-snapshot.js` 路径是 4 级 `..`（因为 `__dirname` 多一层），那个是对的

### Files
- 修改：`scripts/orchestrator/dispatcher.js`、`scripts/orchestrator/autonomous.js`、`scripts/orchestrator/test-autonomous.js`
- 新增：`scripts/orchestrator/test-dispatcher-scoring.js`
- 修改：`package.json`（`test` 和 `test:dispatcher` 加新测试）

---

## [Unreleased] - 路线图更新（v2.x 预览）

### 📋 Changed - 04 自我演进路线扩展（文档先行）

**背景**：用户 2026-06-24 评审"团队能力"非当前主力，聚焦"让 Claude 越来越智能"核心目标。同步把 v2.x 待做的 3 个智能增量写入 04 文档，明晰 L1→L5 路径。

### Added - 增量 E：向量语义检索（Semantic Recall）🆕 计划中
- 位置：04 文档 0.4 节
- 目标：L2 长期记忆升级，召回率 ≥ 80%
- 首选方案 E1：TF-IDF 倒排索引（零依赖，0.5 天）
- 备份 E2：本地 MiniLM 嵌入（1-2 天）
- 验收：30 条 KB 真实数据"模糊查询"召回率 ≥ 70%

### Added - 增量 F：进化闭环 auto-implement 🆕 计划中
- 位置：04 文档 0.4 节
- 目标：L4 持续进化升级，从"看新闻"变"自动长技能"
- 核心：`scripts/evolution/auto-implement.js`，`/evolve run --auto` 入口
- 流程：扫描 → 评估 → 筛 composite ≥ 7.0 → worktree → 实现 → 测试 → 审查 → 合并
- 安全边界：small effort 才自动 / 失败 3 次停 / 改 .claude/ 一律拒绝
- 验收：1 个 small-effort 候选从候选到合并 < 30 分钟

### Added - 增量 G：跨会话状态续接（State Snapshot）🆕 计划中
- 位置：04 文档 0.4 节
- 目标：L5 体验升级，新会话首轮自动续接工作现场
- 核心：扩 `session-summary.sh` → `state-snapshot.sh`，序列化 {plan, KB, 修改文件, todos}
- 联动：plan-bridge / proactive-scan / autonomous-mode 都可读
- 验收：开 2 个 session，session 2 首轮直接续接 session 1 工作

### Changed - 0.5 节 L1-L5 阶段表量化
- 从粗略描述升级为带量化指标
- L2：召回率 ≥ 80% / KB 数 ≥ 100
- L3：决策准确率 ≥ 90% / 小任务不派率 ≥ 70%
- L4：候选实现率 ≥ 60% / 实现成功率 ≥ 80%
- L5：自治覆盖率 ≥ 50% / 人工干预率 < 20%

### Added - 里程碑扩展 M6-M9
- M6：向量语义检索（增量 E）
- M7：进化闭环 auto-implement（增量 F）
- M8：跨会话状态续接（增量 G）
- M9：任务复杂度评分（智能调度优化）

### Files
- 修改：`04_自我演进路线.md`（0.4 节追加 E/F/G、0.5 节量化、第十二章里程碑 M6-M9）
- 注：本次**仅文档先行，代码未动**

---

## [v2.1.0] - 2026-06-24

### 🧠 Added - 增量 E：向量语义检索（M6 完成 · 自主模式首次实战）

**背景**：04 路线图增量 E 计划中项。L2 长期记忆升级，让"模糊想找啥"也能命中，召回率 ↑ 50%。
**模式**：本次在 `🤖 自主模式 ON` 下完成，是该模式首次端到端跑通一个完整增量（M6）。

### Added - semantic-recall.js 引擎（方案 E1 TF-IDF）
- 路径：`scripts/orchestrator/recall/semantic-recall.js`
- 算法：TF-IDF + 倒排索引 + 余弦相似度
- 中文：双字 bigram 滑动切分（零分词器依赖）
- 英文：按 `[a-zA-Z0-9]+` 切分，转小写
- 缓存：`memory/embeddings/tfidf-index.json`（KB mtime 变化自动失效）
- CLI：`node semantic-recall.js search|rebuild|stats`

### Added - test-semantic-recall.js 单元测试
- 路径：`scripts/orchestrator/recall/test-semantic-recall.js`
- **31/31 全过**
- 真实数据：60 条 KB 上"模糊查询"召回率 = **80%**（4/5 测试用例命中）

### Changed - left-brain.sh recall 路由
- `recall --semantic <query>` 走 Node TF-IDF 引擎
- 无参数走原 grep 关键词检索（向后兼容）

### Changed - package.json
- 新增 `"test:recall"` npm script
- `npm test` 链追加 semantic-recall 测试

### Files（增量 E）
- 新增：`scripts/orchestrator/recall/semantic-recall.js`（约 220 行）
- 新增：`scripts/orchestrator/recall/test-semantic-recall.js`（约 180 行）
- 修改：`.claude/skills/left-brain/scripts/left-brain.sh`（recall 子命令加 --semantic 路由）
- 修改：`package.json`（test:recall 脚本 + test 链追加）
- 生成：`.claude/skills/left-brain/memory/embeddings/tfidf-index.json`（缓存，gitignore）
- 快照：`.claude/snapshots/2026-06-24-22-52-42-milestone-M6.md`

### 验收数据（5 个真实查询测试用例）
- "智能演进路线" → 命中 ✅
- "dispatcher 调度器" → 命中 ✅
- "上次跟调度器相关的" → 命中 ✅（自然语言问句）
- "快照系统" → 命中 ✅
- "自我反思" → 未命中（term 分布过散，TF-IDF 局限）
- **召回率：80%（≥ 70% 验收线）**

### 局限与升级路径
- TF-IDF 无法处理语义级相似（如"汽车" vs "轿车"）
- 升级 E2：本地 MiniLM 嵌入（@xenova/transformers，1-2 天）
- 升级 E3：Ollama embedding（3 天）

### 关联
- 04 路线图增量 E / M6
- 下一个增量：M7 auto-implement（2-3 天，进化系统闭环）

### 🩹 Fixed - Windows PowerShell 兼容（v2.1.0 补丁）

**问题**：在 Windows PowerShell 调 `bash left-brain.sh recall --semantic ...` 报 `WSL execvpe /bin/bash failed: No such file or directory`（PowerShell 不带 Git Bash/WSL）。

**解决**：在 `package.json` 加 3 个跨平台 npm script，**不依赖 bash**：
- `npm run recall:semantic -- "查询" --top 3`
- `npm run recall:semantic:stats`
- `npm run recall:semantic:rebuild`

**改文件**：`package.json`（+3 行）

---

## [v2.2.0] - 2026-06-24

### 🧬 Added - 增量 F：进化闭环 auto-implement（M7 完成 · 自主模式）

**背景**：04 路线图增量 F 计划中项。L4 持续进化升级，从"看新闻"变"自动长技能"。
**模式**：本次继续在 `🤖 自主模式 ON` 下完成（M7）。

### Added - auto-implement.js 闭环引擎
- 路径：`scripts/evolution/auto-implement.js`（约 380 行）
- **复用 implementer.js 工具**（不重复造轮子：createBranch/mergeBranch/deleteBranch/runTests/gitExec）
- 入口：`npm run evolve:auto` + `node auto-implement.js run --auto`

### Added - 4 道安全闸门
1. **composite_score ≥ 7.0**（实用性+可行性+独立性+风险度+新鲜度 综合分）
2. **effort 必须 ∈ {small}**（medium/large 自动拒绝）
3. **suggestion 必须是 adopt/adapt**（skip 自动拒绝）
4. **路径黑名单**（.claude/ / dispatcher.js / autonomous.js / package.json / CLAUDE.md / 04 / CHANGELOG 任何触碰直接拒）
5. **禁用依赖黑名单**（@anthropic-ai / openai / @xenova/transformers / tensorflow / pytorch）

### Added - 失败保护
- 连续失败 3 次 → 写 anomaly + 自动停
- 单次失败 → 自动回滚分支 + 切回 master
- `npm run evolve:auto:reset` 命令重置连续失败计数

### Added - 双源候选加载
- 源 1：`data/github/candidates.json`（GitHub 趋势评估后的候选）
- 源 2：`data/evolution/auto-tasks.json`（自建任务，支持 `add-task` 命令）

### Added - 干跑模式
- `--dry-run` 输出完整计划但**不实际执行**（适合审阅）
- 命令：`npm run evolve:auto:dry`

### Added - test-auto-implement.js 测试
- 路径：`scripts/evolution/test-auto-implement.js`
- **27/27 全过**
- 覆盖：4 道安全闸门、路径黑名单、双源加载、CLI、连续失败保护、dry-run

### Changed - implementer.js
- `module.exports` 暴露 createBranch/mergeBranch/deleteBranch/hasUncommittedChanges/runTests/getCurrentBranch/gitExec 供 auto-implement 复用

### Changed - package.json
- 新增 5 个 npm script：`evolve:auto` / `evolve:auto:dry` / `evolve:auto:list` / `evolve:auto:status` / `evolve:auto:reset`
- `test:evolution` 追加 test-auto-implement
- `npm test` 链追加 auto-implement 测试

### Files（增量 F / M7）
- 新增：`scripts/evolution/auto-implement.js`（约 380 行）
- 新增：`scripts/evolution/test-auto-implement.js`（约 250 行）
- 修改：`scripts/evolution/implementer.js`（exports 扩展）
- 修改：`package.json`（5 个 npm script + test 链）
- 快照：`.claude/snapshots/2026-06-24-23-27-59-milestone-M7.md`

### 关联
- 04 路线图增量 F / M7
- 下一个增量：M8 跨会话状态续接（增量 G，1 天）

---

## [v2.3.0] - 2026-06-24

### 🔗 Added - 增量 G：跨会话状态续接（M8 完成 · 自主模式三连）

**背景**：04 路线图增量 G 计划中项。L5 体验升级，新会话首轮自动续接工作现场。
**模式**：本次在 `🤖 自主模式 ON` 下连续完成 M6 + M7 + M8 三个增量。

### Added - state-snapshot.js 核心引擎
- 路径：`.claude/skills/left-brain/scripts/state-snapshot.js`（约 250 行）
- **JSON + Markdown 双格式落盘**（程序读 JSON，人读 MD）
- 字段：version / saved_at / session_id / summary / plan_status / current_plan / recent_files_modified / pending_todos / kb_recent / autonomous_state / proactive_anomalies / next_action

### Added - 6 个数据收集器
1. `collectPlanStatus` — 从 pending-plans.json + plan-execution-log.json 推断 plan 状态
2. `collectRecentFiles` — `git log --name-only -n 5` 拿最近改动文件
3. `collectRecentKB` — 按 KB id 倒序取最近 5 条
4. `collectPendingTodos` — 从 04 路线图"⏳ 计划中"行推断
5. `collectAutonomous` — 读 autonomous-state.json
6. `collectAnomalies` — 读 anomalies.json 取最近 3 条

### Changed - session-summary.sh 联动
- `save` 子命令末尾自动调 `state-snapshot.js save`（写双份）
- `load` 子命令优先调 `state-snapshot.js load`（fallback 到旧摘要）
- 向后兼容：旧调用方式 `bash session-summary.sh save "..."` 仍工作

### Added - test-state-snapshot.js 测试
- 路径：`.claude/skills/left-brain/scripts/test-state-snapshot.js`
- **42/42 全过**
- 覆盖：6 个收集器 / save+load 一致性 / renderMarkdown / 500 字符截断 / 无文件 fallback / CLI / 字段完整性

### Changed - package.json
- 新增 4 个 npm script：`state:snapshot` / `state:load` / `state:status` / `test:state`
- `npm test` 链追加 state-snapshot 测试

### 已知 Bug（不在 M8 范围）
- autonomous.js 在 PowerShell + Node 24 下 enable 后**不写磁盘**，但 status 仍显示 ON（疑似进程内缓存）
- state-snapshot.js 对此**鲁棒**：文件不存在时 fallback 到默认值
- 建议后续 M9/M+ 修复

### Files（增量 G / M8）
- 新增：`.claude/skills/left-brain/scripts/state-snapshot.js`（约 250 行）
- 新增：`.claude/skills/left-brain/scripts/test-state-snapshot.js`（约 220 行）
- 修改：`.claude/skills/left-brain/scripts/session-summary.sh`（save/load 联动）
- 修改：`package.json`（4 个 npm script + test 链）
- 快照：`.claude/snapshots/2026-06-24-23-58-48-milestone-M8.md`

### 关联
- 04 路线图增量 G / M8
- 下一个增量：M9 任务复杂度评分（智能调度优化）

---

## [v1.9.1] - 2026-06-24

### 🧠 Changed - 智能演进：自我反思 + 智能规划（增量 A + B）

v1.9.1 是 v1.9 之后的"**智能增量首发版**"，围绕用户终极愿景"让 Claude 日常开发越来越智能、越来越主动"启动。
**核心理念**：把"用户当裁判"改为"AI 写完代码自己检查"，把"AI 拍脑袋干"改为"先出 plan 用户批准"。

### Added - 增量 A：自我反思引擎（4 个内置规则）

| 规则 | 触发 | 检测 |
|:-----|:-----|:-----|
| `code-completeness` | Edit/Write *.js | console.log 残留 / debugger 断点 / 大括号不匹配 |
| `test-trigger` | Edit/Write 非 test-*.js | 提醒对应 test 文件是否需更新 |
| `todo-scan` | Edit/Write *.js | TODO/FIXME/XXX/HACK 标记 |
| `doc-version` | Edit/Write *.md | 过时版本号（v1.0/v1.5/v1.2 等）|

### Added - 增量 B：智能任务规划协议

**核心理念**：复杂任务先出 `[plan]...[/plan]` 块，用户 `/ok` 批准后才执行。

- **CLAUDE.md 规范**：复杂任务判定标准 + plan 输出格式模板
- **`/ok` 命令**：批准 pending-plans.json 最新 plan
- **`/no` 命令**：取消 pending plan
- **planner agent 升级**：严格按 plan 步骤顺序执行

### Files（增量 A + B）

- 新增：`scripts/orchestrator/reflection/self-reflect.js`（291 行）
- 新增：`scripts/orchestrator/reflection/test-self-reflect.js`（38/38 通过）
- 新增：`scripts/orchestrator/planning/plan-detect.js`（245 行）
- 新增：`scripts/orchestrator/planning/test-plan-detect.js`（50/50 通过）
- 新增：`.claude/commands/ok.md` / `no.md`
- 修改：`.claude/skills/left-brain/scripts/posttool-hook.sh`（同时跑 A+B 两个引擎）
- 修改：`.claude/skills/left-brain/scripts/session-init.sh`（Step 5 反思展示）
- 修改：`CLAUDE.md`（加智能任务规划协议章节）
- 修改：`.claude/agents/planner.md`（加 plan 实施指引）
- 修改：`04_自我进化循环系统设计.md`（增量 A + B 标完成）
- 修改：`package.json`（npm test 接入 2 个新测试）
- 修改：`.gitignore`（排除 reflections.jsonl + pending-plans.json）

### 真实运行效果

- A：捕获 2 条反思（console.log + TODO×1）
- B：捕获 1 个 plan（"测试"任务，1 步骤），写入 pending-plans.json
- Step 5 顶部正确显示反思条目

### 下一步

- 增量 C 方案 B/C：后台 cron 通知 + 进化系统联动
- 增量 D 增强：自动写测试 / 自动 npm update（v2.0）

---

## [v1.9.3] - 2026-06-24

### 🟢 Added - Planner 完整升级（增量 B 方案 A）

让 /ok 之后**自动按 plan.steps 派 Agent 执行**。增量 B 协议不再"半成品"——批准即干活。

**协议增强**（CLAUDE.md）：
- 每个 step 下可加可选行：`agent: <类型>` + `files: <逗号分隔>`
- 缺省 fallback（向后兼容）：agent 默认 `claude`，files 从 step 文本自动提取
- 老 plan 仍能正常解析（50/50 老测试通过）

**核心引擎**：`scripts/orchestrator/planning/plan-bridge.js`
- 找 status=approved 的 plan
- 逐 step 调 `claude -p --model <model> "<prompt>"` 启子会话
- prompt 构造：agent 类型 + plan.task + step.text + step.files
- 状态机：pending → approved → executing → done（部分失败变 partial）
- 单 step 失败 → 记 error + 继续下个（不全盘崩）
- 永不 throw

**入口**：
- `/plan-execute` 命令（`.claude/commands/plan-execute.md`）
- `npm run plan:execute`
- `npm run plan:list-approved` / `plan:log`

**日志**：`.claude/skills/left-brain/memory/plan-execution-log.json`（gitignore 排除）

**测试**：
- `test-plan-bridge.js` 44/44 通过
- `test-plan-detect.js` 50/50 向后兼容验证通过

---

## [v2.0.0] - 2026-06-24

### 🟢 Added - 自主演进模式开关（v2.0 P0-1）

让 Claude 拥有**自主决策能力**。用户可启动开关 → 离开电脑前打开 → Claude 自主选下一个增量做，不逐步确认。

**核心引擎**：`scripts/orchestrator/autonomous.js`
- `enable()` / `disable()` / `toggle()` / `isEnabled()` / `getState()`
- 状态文件：`.claude/skills/left-brain/memory/autonomous-state.json`
- CLI 子命令：on / off / toggle / status / is-enabled

**入口**：
- `/autonomous` 命令（`.claude/commands/autonomous.md`）
- `/autonomous-stop` 命令（`.claude/commands/autonomous-stop.md`）
- `npm run autonomous:on` / `autonomous:off` / `autonomous:status`

**顶部展示**：session-init Step 7 显式显示开关状态
- 🤖 自主模式: ON（开启于 2026/6/24 17:11）
- 🙋 正常模式: OFF（逐步确认）

**安全边界**：
- ✅ 自主做：智能增量深化、bug 修、文档、commit
- ⚠️ 慎做：修改 AI 工作目录（commit 前先 snapshot）
- ❌ 不做：push、删分支、删文件、改主目录外文件

**测试**：`scripts/orchestrator/test-autonomous.js` 38/38 通过

**意义**：v2.0 路线（个人开发的智能增强）第一项交付，让用户能放心离开，Claude 自己继续推进智能演进。

---

## [v1.9.2] - 2026-06-24

### 🟢 Added - 自动化修复（智能增量 D）

让 Claude 不只发现问题（C 增量），还自动修可逆项 + 提议复杂项。

**核心引擎**：`scripts/orchestrator/proactive/auto-fix.js`
- 4 个可修维度：uncommitted / test-coverage / deps-outdated / candidate-pending
- 不可修 3 个：ci-status / todo-accumulate / stale-files

**双触发**：
- **保守模式（`--auto`）**：SessionStart 跑，**只动 uncommitted** 自动 commit
- **完整模式**（`/autofix` 命令）：4 项全跑，复杂项生成 proposal

**安全约束**（关键）：
- AI 工作目录文件（`scripts/orchestrator/` / `scripts/evolution/` / `.claude/`）默认跳过自动 commit
- `.env` / `.key` / `node_modules` 绝不自动 commit
- 改动 > 50 文件要求手动 review
- 任意 fix 失败 → 记日志 + 继续（不阻塞）

**Proposal 落盘**：`.claude/skills/left-brain/memory/fix-proposals.json`（gitignore 排除）

**测试**：`scripts/orchestrator/proactive/test-auto-fix.js` 35/35 通过

---

## [v1.9.1] - 2026-06-24

### 🟢 Added - 主动发现问题（智能增量 C）

让 Claude "自己看项目状态"，用户不问也能主动发现问题。

**核心引擎**：`scripts/orchestrator/proactive/proactive-scan.js`
- 7 维度独立检测：ci-status / uncommitted / todo-accumulate / test-coverage / deps-outdated / stale-files / candidate-pending
- 单维度失败不拖垮其他（独立 try/catch）
- 5 分钟缓存（`.last-scan.json`），不每次重扫
- 永不 throw 契约

**入口**：
- `evolution-hook.sh` —— SessionStart 追加 proactive-scan 调用
- `session-init.sh` Step 6 —— 顶部展示 anomaly 清单（仿 Step 5 自我反思格式）

**输出**：
- 顶部 1 行总结（🔴X / 🟡Y / 🟢Z）+ 详细列表
- 落盘到 `.claude/skills/left-brain/memory/anomalies.json`（gitignore 排除）

**测试**：`scripts/orchestrator/proactive/test-proactive-scan.js` 35/35 通过

---

## [v1.9.0] - 2026-06-24

### 🔴 Changed - 基础设施补齐（核心）

v1.9.0 是 v1.8 之后的"基础设施发版"，**不加新功能，只补地基**。
**触发原因**：v1.9 评估（已合并到 `04_自我进化循环系统设计.md` 第十一节智能演进纲领）指出 L4 团队产品的三道硬门槛（CI/CD、可观测性、权限/审计）当前全不达标。
**目标级别**：L2 个人工程 → L3 工程化个人项目。
**实际周期**：1 天（提前 4 周发版）。

### Added - 新增能力

#### P0 基础设施（6 项）

- **GitHub Actions CI**：6 矩阵自动跑测（ubuntu + windows × Node 18 + 20 + 22）；支持 `concurrency` 取消冗余运行；`fail-fast: false` 看全错误
- **withRetry 工具**：`scripts/orchestrator/with-retry.js`，提供 `withRetry(fn, {retries, timeoutMs, backoff})`；区分可重试错误（5xx/网络/超时）和立即失败错误（4xx）；指数退避
- **mcp server 统一错误处理**：`scripts/mcp/_shared.js` 提供 `safeCall(name, args, fn)` / `safeHandle(name, fn)` / `formatError` / `logCall` / `emitMetricSafe` / `emitLogSafe`
- **Metrics 暴露**：`scripts/orchestrator/metrics.js` 提供 `Metrics.increment/timing/gauge/snapshot/printDashboard`；输出 `logs/metrics.jsonl`；自动 P50/P95 计算
- **权限骨架**：`scripts/orchestrator/permissions.js` 22 个能力 / 3 个角色（admin/user/readonly）；`can()` / `requireRole()` / `listCapabilities()` / `currentRole()`（env 读取占位）
- **测试数据公开化**：c8 覆盖率工具集成；README "测试数据" 章节完整公开 15 文件 / 181 断言 / 78.86% 覆盖

#### P1 加固（4 项）

- **结构化日志**：`scripts/orchestrator/logger.js` pino 兼容 API（info/warn/error/debug/trace/fatal）；支持 `child(bindings)` 绑定字段；level 过滤；JSON Lines 输出到 `logs/app.jsonl`
- **Dashboard 脚本**：`scripts/orchestrator/dashboard.js` 文本 + JSON 双模式；聚合 metrics + logs 输出 24h ASCII dashboard
- **权限骨架接入**：dispatcher.js 接入 `can('dispatcher.decide')` 验证
- **test-analyzer 纳入**：24/24 analyzer 测试纳入 `npm test`

#### C-接入（3 项）

- **sqlite-server 接入 _shared**：query/execute handler 用 `safeCall` 包装
- **fetch-server 接入 _shared**：fetch handler 用 `safeCall` 包装；URL 白名单违规统一错误格式 `[local-fetch-server/fetch] ...`
- **集成测试**：`scripts/mcp/test-integration.js` 13/13 通过，验证 mcp 调用后 metrics + logs 真实落盘

#### 新增测试文件（5 个）

- `scripts/orchestrator/test-metrics.js`（10 断言）
- `scripts/orchestrator/test-logger.js`（11 断言）
- `scripts/orchestrator/test-dashboard.js`（16 断言）
- `scripts/orchestrator/test-permissions.js`（23 断言）
- `scripts/mcp/test-integration.js`（13 断言）

#### 新增文档（2 个）

- `05_工程能力评估_全局专家视角.md`（v1.1 修订）：14 个评估维度，新增 CI/CD/可观测性/权限审计 3 个维度
- `06_差距分析与升级路径.md`：12 周升级路线图，按 ROI 排序

### Changed - 已有功能改造

- **dispatcher.js**：CLI 模式接入 metrics + logger + permissions 验证（**核心函数 `decide()` 不动**）
- **mcp/_shared.js**：导出 `safeCall` / `safeHandle` / `emitMetricSafe` / `emitLogSafe` 完整接口
- **package.json**：scripts.test 跑 15 个测试文件 / 181 断言；新增 `test:coverage` / `test:metrics` / `test:logger` / `test:dashboard` / `test:permissions`
- **.github/workflows/test.yml**：升级到 6 矩阵 + concurrency + fail-fast
- **.gitignore**：新增 `coverage/` 排除
- **README.md**：测试数据章节公开 181 断言 / 78.86% 覆盖
- **CLAUDE.md**：相关文件表新增 03/05 引用

### Fixed

- 修复 dispatcher 调度决策无 metrics 记录问题
- 修复 mcp server 错误格式不统一问题（`SQL 错误: ...` / `抓取失败: ...` → 统一 `[server/tool] ...`）
- 修复升级路径里"6 个月前 mcp 接入"承诺（v1.9 真实接入）
- 修复 05 评估里"122 项测试"虚报（实际 10 个测试文件，v1.9 扩到 15 个）

### Security

- **无 npm 依赖新增**（保持 `pino` 等不引入；自实现 pino 兼容最小子集）
- **权限边界占位**：22 能力 / 3 角色集中管理；`v2.0` 接真实认证
- **mcp server 错误不抛给协议层**：失败时返回 `isError: true` 而非 throw，避免 MCP 连接中断

### Documentation

- `05_工程能力评估_全局专家视角.md` v1.1 修订：分数下调、新增维度、附录 C 修订明细
- `06_差距分析与升级路径.md` 新建：12 周路线图 + 工作量估算（同日合并到 `03_版本迭代计划.md` 第十一节附录）
- `03_版本迭代计划.md` v1.2 修订：路线图重排 + 决策记录 + 发版流程
- README.md "测试数据" 章节首次公开

### Metrics

| 指标 | v1.8 起点 | v1.9.0 终点 | 变化 |
|:-----|:---------:|:-----------:|:----:|
| 测试文件 | 10 | **15** | +5 |
| 断言总数 | 101 | **181** | +80 (+79%) |
| 代码覆盖率 | 0%（未公开） | **78.86%** | +78.86 |
| CI 矩阵 | 1（ubuntu × 18）| **6** | ×6 |
| 失败兜底机制 | 仅 Stop hook | withRetry + safeCall + emitMetric + emitLog | 质变 |
| 可观测性 | hook 日志 | metrics + logs + dashboard + 权限 | 质变 |
| mcp 错误处理 | 各 server 独立 try/catch | 统一 `_shared.js` + 真实接入 | 标准化 |

### ⚠️ 已知遗留（v1.9.1 / v2.0 跟进）

- dispatcher.js 覆盖率仅 32.62%（规则引擎大量分支未覆盖）
- permissions 是占位实现（env 读取 role，v2.0 接真实认证）
- 没有真实 CI 跑过（GitHub Actions 配置就绪，待 push 后自动触发）
- P2 5 项未做（snapshot 索引 / session-init 优化 / .qoder 清理 / 进化实测 / access_count 观察）

---

## [v1.8] - 2026-06-23

### Added

- 自我进化系统（v1.8 完整上线）：github-scanner / feature-analyzer / implementer / trend-watcher / self-analyzer / upgrade-checker
- MCP server 三件套：filesystem（npx 官方）/ sqlite（本地）/ fetch（本地）
- 调度器扩展：heuristic-scorer + llm-scorer 双打分
- 并行执行：worktree 真实效果测试 7/7
- 左脑图谱：graph_search 2-hop 扩散
- GitHub 推送：hanzonghui/AiCode 公开仓库
- 自我约束规范：改完代码自动测试 + 快照 + KB

### Metrics

- 测试：101/101 通过
- 测试文件：10 个
- v1.8 之前的版本详见 [03_版本迭代计划.md](03_版本迭代计划.md) 第十一节

---

## 引用

- [03_版本迭代计划.md](03_版本迭代计划.md) — 路线图 + 升级方法论（v1.9.0 起合并原 06 内容）
- [04_自我进化循环系统设计.md](04_自我进化循环系统设计.md) — 自我进化 + 智能演进纲领（v1.9.1+ 起合并原 05 评估内容）
- [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- [Semantic Versioning](https://semver.org/lang/zh-CN/)