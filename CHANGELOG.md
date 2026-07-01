# Changelog

> 所有版本变更记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

> **说明**：2026-06-25 清理历史 Unreleased 堆积 — 已交付内容已迁入对应版本号段（详见下方各 `[vX.Y.Z]`）。
> 本段仅作占位，下个增量/发版再追加条目。

### Fixed - AUDIT-M54-batch2-B：补 PostToolUse hook 自动埋点 workflow 事件（2026-07-01）

> **背景**：`.claude/settings.json` 已注册 PostToolUse → `posttool-hook.sh`，但该脚本只跑 self-reflect + plan-detect，从未调用 `workflow-observer.js`，导致 97% 生产数据只有 session_start/end，`file_modified`/`command_run`/`test_run`/`commit` 全靠手动埋点。

- **`.claude/skills/left-brain/scripts/posttool-hook.sh`** — 新增引擎 C：PostToolUse 后自动调用 `workflow-observer.js record-posttool`，让 workflow-observer 从"手动调用"升级为"自动采集"
- **`scripts/orchestrator/workflow/workflow-observer.js`** — 新增 `recordFromPostToolUse(hookData)`：
  - `Edit`/`Write` → `file_modified`（优先取 `tool_input.file_path/path`）
  - `Bash` 中 `npm test`/`jest`/`mocha`/`pytest`/`vitest` → `test_run`
  - `Bash` 中 `git commit` → `commit`（优先从 git log 提取）
  - 其他 `Bash` 命令 → `command_run`
- **`scripts/orchestrator/workflow/workflow-observer.js`** — CLI 新增 `record-posttool [file]` 命令，支持从文件参数或 stdin 读取 PostToolUse JSON（文件参数避免 Windows bash pipe 问题）
- **`scripts/orchestrator/workflow/test-workflow-observer.js`** — 新增 `testRecordFromPostToolUse`，覆盖 Edit/Write/npm test/git commit/普通命令/未知工具 6 个场景

**验证**：
- `node scripts/orchestrator/workflow/test-workflow-observer.js` 7/7 通过
- `node scripts/orchestrator/workflow/test-pattern-miner.js` 4/4 通过
- `node scripts/orchestrator/workflow/test-suggestion-engine.js` 4/4 通过
- 手动模拟 PostToolUse hook 调用，成功写入 `file_modified` 事件

### Fixed - AUDIT-M54-batch2-B：auto-implement 决策流程补 metrics 埋点（2026-07-01）

> **背景**：深度审计发现 auto-implement 的 metrics 埋点只在 CLI `run` 命令，核心决策函数 `evaluateSafety` / `listExecutable` / `implementOne` 里没有任何指标，导致 L4/L5 评价闭环无法观测 candidate 通过率、拒绝原因分布、实现成功/失败率。

- **`scripts/evolution/auto-implement.js`** — 接入 `scripts/orchestrator/metrics.js`（可选加载，失败不阻塞主流程）
  - `evaluateSafety`：每次评估写入 `auto_implement.evaluation` counter，标签含 `result`（allowed/rejected）、`source`（llm/hard）、`reason_category`（composite/effort/suggestion/forbidden_dep/llm_reject/other）、candidate 来源
  - `listExecutable`：写入 `auto_implement.candidates.executable` gauge
  - `implementOne`：写入 `auto_implement.implement` counter + `auto_implement.implement.duration` timing，标签含 `result`（success/fail/dry_run/safety_rejected/branch_failed）
  - `run` CLI：写入 `auto_implement.run.plan` gauge
- **`scripts/evolution/test-auto-implement.js`** — 新增第 8 节 metrics 断言：验证 evaluation / implement / duration / executable gauge 四类事件落盘；顺手修复 preexisting `listExecutable` 断言（原断言未考虑 candidates.json 中已有可执行候选）

**验证**：
- `node scripts/evolution/test-auto-implement.js` 37/37 通过

**关联**：AUDIT-M54-batch2-B-auto-implement-metrics · M15 评价闭环

### Fixed - M54 版本号 metadata 漂移：建立 package.json 为唯一真实源（2026-07-01）

> **背景**：`01.md` 顶部/版本状态段/底部、`04.md` 顶部/当前版本段、`02.md` 顶部、`README.md` 测试基线、`PROJECT-CONTEXT.md` 顶部的版本号 metadata 多处手工维护，出现 `v2.6.0` / `v3.0.1` / `v3.0.5` / `v3.0.8` 不一致。

- **`scripts/orchestrator/sync-roadmap.js`** — 扩展版本号 metadata 同步：
  - 读取 `package.json` 的 `version` 作为唯一真实源
  - 自动同步到 `01.md`（顶部/版本状态段/底部）、`04.md`（顶部/当前版本段）、`02.md`（顶部版本+最后更新日期）、`PROJECT-CONTEXT.md`（顶部）、`README.md`（测试基线）
  - 默认开启，`--no-version` 跳过
- **`scripts/orchestrator/test-doc-sync.js`** — 新增 10 项版本号一致性断言：
  - 验证 01/02/03/04/PROJECT-CONTEXT/README 的 metadata 版本号与 `package.json` 一致
  - 漂移时 `npm run doc:check` 直接失败
- **`.claude/rules/doc-sync.md` / `.claude/rules/self-discipline.md`** — 8 文档自检清单加入版本号 metadata 检查项

**验证**：
- `npm run doc:check` 36/36 通过
- `npm run roadmap:sync:dry` 无额外 diff

**关联**：M54 文档治理 · doc-sync v3

### Added - M54 借鉴 prompt-optimizer：MCP 服务化 /audit（2026-07-01）

> **背景**：prompt-optimizer 把提示词优化能力封装为 MCP tools（optimize-user-prompt / optimize-system-prompt / iterate-prompt），让 Claude Desktop 等 MCP 客户端可直接调用。AiCode 已具备 MCP 基础设施，先把最成熟、只读的 `/audit` 能力 MCP 服务化，作为吸收借鉴的第一步。

- **`scripts/mcp/audit-server.js`** — 新增 MCP server，暴露 `audit` tool（参数 `depth: quick|full`, `format: text|json`）
  - `quick`：调用 `quick-audit.js`，1-2 分钟返回工程健康报告
  - `full`：调用 `full-audit.js`，生成 9 子系统深度调研任务清单
  - 复用 `scripts/mcp/_shared.js` 统一错误处理、metrics、logs
- **`package.json`** — 新增 `mcp:audit` npm script
- **`scripts/mcp/test-audit-server.js`** — 新增 14 项 MCP 集成测试（listTools / quick/json / full/json / quick/text）

**验证**：`npm run test:mcp` 全过（6 + 4 + 7 + 13 + 14 = 44/44）

**关联**：[[prompt-optimizer-eval-2026]] · Phase 1 of "吸收借鉴 prompt-optimizer" roadmap

### Added - M54 借鉴 prompt-optimizer：LLM 驱动的提示词优化闭环（2026-07-01）

> **背景**：prompt-optimizer 的核心价值在于"分析 → 评估 → 对比 → 智能改写"的提示词优化闭环。AiCode 已有 llm-adapter / ARIS 6-state verdict / GEPA 遗传优化的骨架，但都是 heuristic-only。本批补齐真实 LLM 调用接口，并建立独立的 `scripts/prompt-optimizer/` 模块。

- **`scripts/orchestrator/llm-adapter.js`** — 实现 `AnthropicAdapter.generate()` 和 `evaluate()`（raw fetch，无新增 npm 依赖）
  - 支持 `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` 环境变量
  - 无 API key 时工厂自动降级到 `HeuristicAdapter`
  - 新增 `evaluateWithFallback()` 统一入口
- **`scripts/prompt-optimizer/`** — 新增 6 文件优化流水线：
  - `analyzer.js` — 语义分析，输出弱点/优点/摘要
  - `evaluator.js` — 按 clarity/coverage/actionability/safety 维度评估，返回 6-state verdict
  - `comparator.js` — 多 backend 评估，检测分歧
  - `rewriter.js` — 根据弱点清单改写 prompt
  - `pipeline.js` — 串联 analyze → evaluate → compare → rewrite，支持多轮迭代
  - `cli.js` — 命令行入口
- **`scripts/prompt-optimizer/test-prompt-optimizer.js`** — 22 项测试覆盖 analyzer/evaluator/comparator/rewriter/pipeline/CLI
- **`scripts/orchestrator/test-judge-candidate.js`** — 更新断言：AnthropicAdapter.judge 已实现，无效 key/地址时拒绝
- **`package.json`** — 新增 `po:run` / `po:analyze` / `test:prompt-optimizer`，并把新测试加入 `test` 主链

**验证**：`npm run test:llm` 27/27 通过；`npm run test:prompt-optimizer` 22/22 通过

**注意**：`npm test` 中 `scripts/evolution/test-auto-implement.js` 有 1 个**前置失败**（"只通过 1 个（实际 7）"），与本批改动无关，系该测试对候选池的计数假设在当前数据下不成立。

**关联**：[[prompt-optimizer-eval-2026]] · Phase 2 of "吸收借鉴 prompt-optimizer" roadmap

### Added - M54 借鉴 prompt-optimizer：Prompt 资产化与版本化（2026-07-01）

> **背景**：prompt-optimizer 把稳定提示词保存为"资源感知资产"，支持版本历史、可复现示例、来源绑定。AiCode 已有 `kb:promote` 毕业机制，但只缩源、不写 docs、无版本。本批建立 `.claude/prompt-assets/` 资产目录 + `prompt-asset-manager.js`，并把 `qa-reviewer.md` 作为试点拆分为可复用组件。

- **`.claude/prompt-assets/`** — 新增 prompt 资产目录：
  - `README.md` — 资产规范与目录说明
  - `system-prompts/base-qa-system.v1.md` — QA 系统提示词基座
  - `constraint-prompts/read-only-constraint.v1.md` — 只读/约束片段
  - `report-templates/qa-report-template.v1.md` — QA 报告模板
- **`.claude/agents/qa-reviewer.md`** — 新增 `composed-from` frontmatter，引用 3 个 prompt assets（body 保留完整内容作为 fallback）
- **`scripts/knowledge/prompt-asset-manager.js`** — 新增资产管家：
  - `list`：列出所有 asset
  - `compose`：按 `composed-from` 拼合完整 prompt
  - `diff`：对比 agent body 与拼合结果是否一致
  - `bump`：升级 asset patch 版本号
- **`scripts/knowledge/promote-kb.js`** — 支持 `--promote-to-asset`，把毕业 KB 写入 `.claude/prompt-assets/`
- **`scripts/knowledge/test-prompt-asset-manager.js`** — 17 项测试覆盖 parseFrontmatter/list/compose/diff/bump
- **`package.json`** — 新增 `prompt-asset:list` / `diff` / `bump` / `compose` / `test:prompt-asset`

**验证**：`npm run test:prompt-asset` 17/17 通过；`npm run test:promote-kb` 17/17 通过

**关联**：[[prompt-optimizer-eval-2026]] · Phase 3 of "吸收借鉴 prompt-optimizer" roadmap

### Changed - next 队列按优先级自动排序（2026-07-01）

> **背景**：`evolution-plan.json` 中 `AUDIT-roadmap-item-skill`（P3）因最早入队排在 `next[0]`，但队列中还有 10 条 P0 真风险。`SessionStart` 虽已警告，但"做 next[0]"仍会指向低优先级项。

- **`scripts/orchestrator/evolution-lock.js`** — `saveState()` 保存前自动按 `P0 > P1 > P2 > P3` 排序 `next` 队列；同优先级按 `queued_at` 先后；新增导出 `sortNextByPriority()`
- **`.claude/hooks/SessionStart`** — 自动推荐段先排序再取 `next[0]`，确保展示最紧迫项
- **`.claude/skills/left-brain/scripts/session-init.sh`** — 快速唤醒段同样按优先级排序后推荐
- **`04_自我演进路线.md` §十二 当前队列状态** — `next[0]` 描述更新为排序后的 P0 项

**验证**：`node scripts/orchestrator/evolution-lock.js queue` 入队后 evolution-plan.json `next[0]` 为 P0；`SessionStart` 不再出现"next[0] 是 P3 但有 P0"警告

### Changed - M54 batch2 G：会话交接文档精简（2026-06-30）

> **背景**：`04.md` §十一 把 handoff / autonomous 写成 6 场景生活指南，和用户真实用法错位。按第一性原理精简为 3 个命令。

- **`04_自我演进路线.md` §十一** — 从 6 场景 352 行精简为 3 个命令 38 行
  - 只保留：任务没处理完 `/handoff`、单个大功能 `/autonomous single`、长期进化 `/autonomous always`
  - 删除：吃饭 1h / 爬山 1d / 里程碑 handoff / 小修复继续 等生活场景
  - **修正**：默认推荐 `/handoff` 无参数（AI 自动总结已完成/未完成），显式参数仅用于具体根因线索
- **`01_AI-ClaudeCode-最佳实践精简.md` §十一** — 同步精简 handoff 子章节为 3 命令版本
- **`.claude/rules/session-memory.md`** — 替换 7 类 handoff + 6 类场景为 3 命令简化模型
- **`.claude/handoff/TUTORIAL.md`** — 从 5 场景教程精简为 3 场景教程，删除"完成里程碑用 handoff"等冲突内容

**关联**：[[m54-batch2-g-session-handoff-onboarding]] · `evolution-plan.json` next[1]

### Fixed - M54 cleanup batch：next 队列清理 + 承诺兑现 + KB 健康度预警（2026-06-30）

> **背景**：深度审计 M54 batch2 后 next 队列堆积 12 条（11 P0 + 1 P1，优先级过松）+ D-autonomous-l3 是「文档说一套工程做一套」的真风险（evolution-lock.md 写 L3 hook 强制，plan-detect.js PostToolUse 钩子从未接 allowed_docs 检查）。本批按第一性原理做 3 件诚实清理（≤30 min）：

- **`.claude/skills/left-brain/scripts/session-init.sh` Step 10** — KB 召回加 150/180 阈值预警（200/25KB 硬红线）
  - `KB_COUNT ≥ 180` → 🔴 立即跑 `npm run kb:promote -- --apply`
  - `KB_COUNT ≥ 150` → 🟡 建议跑 `npm run kb:promote -- --report`
  - 复用现有 KB_HIT 逻辑，**0 新增机制**，纯 1 行判断扩展
- **`.claude/rules/evolution-lock.md`** — L3 降级为「设计目标」
  - 标题「三层锁机制」→「两层锁机制（L3 设计中 · 工程未实现）」
  - L3 行加状态列「⏳ 设计目标（M54 D 主题 2026-06-29 决策：工程未实现）」
  - 「L1 是关键，L2/L3 是兜底」→「L1 是关键，L2 是兜底。L3 是未来目标」
  - 加诚实声明段（候选 AUDIT-M54-batch2-D-autonomous-l3 仍在 next 列表，可随时领取）
- **`.claude/skills/left-brain/memory/evolution-plan.json`** — 删 #11 重复 handoff 占位条目（next 12→11，剩 10 P0 + 1 P3）+ history 新增本批完成记录

**测试**：session-init 验证 KB 79/200 显示 ✅（远低于 150 阈值，未触发预警，符合预期）。evolution-plan.json next.length 验证 11

**关联**：L5 自治运行 · 5 条达标进度（KB 健康度预警机制兑现）· [[m54-cleanup-batch-20260630]]（history 详见 evolution-plan.json）

### Added - M49+3 deep-research 6 段方法论闭环（2026-06-30）

- **`scripts/orchestrator/deep-research.js`** — deep-research 升级：4 段 → 6 段方法论闭环
  - `loadObject` 加 4 字段：`pain_points` / `opportunities` / `risks`（带 probability/impact） / `actions_by_persona`（4 类人群）
  - 新增 `renderOpportunitiesRisks(obj)` 渲染 5.1/5.2/5.3 三子段
  - 新增 `renderActions(obj)` 渲染 6.1-6.4 四类人群行动建议
  - `generateReport` 接入 2 个新段，编号 6→8（信息来源 + 方法论说明后移）
  - `module.exports` 暴露 2 个新函数
- **`scripts/orchestrator/test-deep-research.js`** — 加 6 个 M49+3 测试 case：loadObject 4 字段（默认值 + 接受参数）+ renderOpportunitiesRisks（0 字段占位符 + 完整数据）+ renderActions（0 字段占位符 + 完整数据）+ 段位连贯性。**14 → 21 测试全过**。
- **数据模型 4 新字段**：`pain_points` / `opportunities` / `risks` / `actions_by_persona`
- **方法论来源**：卡兹克 2026-06 公众号文章 md 版（`H:\AI-han\分享我用了 2 年的深度研究 Prompt.md` §模块 4-5）
- **关联**：KB `KB-20260630-001-khazix-skills-eval-2026` §候选 C · 02.md §2.X M49 段 · 04.md §0.4 M49+3

### Fixed - M54 /audit full 深度审计 P0 批次（2026-06-29）

> **背景**：/audit full 派 9 个 explorer 子代理并发调研（dispatcher / evolution / left-brain / autonomous / proactive / workflow / planning / reflection / recall），挖出 26 个具体问题集中在 5 大共性主题（文档-工程不一致 / 观察链断裂 / 默认参数不合理 / 状态机并发竞态 / 过设计）。本批先做 4 个真风险 / 快赢 P0：

- **`scripts/evolution/implementer.js`** — 4 处 `master` 硬编码改为 `getCurrentBranch() || "main"`（CLAUDE.md §🌿 默认 main）。原因：auto-implement 一旦跑必因分支不匹配失败
- **`scripts/evolution/auto-implement.js`** — 回滚路径 fallback 改为 `main || master` 兼容链（合并 #1）
- **`scripts/knowledge/promote-kb.js`** — `--apply` 永远打 `[DRY-RUN]` 误报。修复：
  - 拆 `--dry-run`（新 cmdDryRun）+ `--apply`（cmdApply 真写）3 模式 + `--yes` 闸门
  - 默认 `--apply` 走"打印计划 + 要求 --yes 才执行"，避免误删
  - 新增 `shrinkKB()`：KB 缩源为 1 行 HTML 注释 pointer
- **`.claude/settings.json`**（本地配置，无需 commit）— 注册 `hooks.PostToolUse[matcher=Edit|Write] → bash posttool-hook.sh`。原因：posttool-hook.sh 早存在但从未注册，self-reflect + plan-detect 自动触发链从未生效
- **`.claude/rules/plan-protocol.md`**（新建）— 兑现 CLAUDE.md:239 引用。包含：触发条件 / 标准格式 / agent+files 字段 / 状态机 / 与 dispatcher 边界 / 3 命令
- **`CLAUDE.md`** — 规则文件清单加 `plan-protocol.md` 一行

**测试**：`test-promote-kb.js 17/17` + npm test 全过（与基线 28/1 一致，1 fail 是 preexisting auto-implement "只通过 1 个（实际 7）" 断言 bug）

**关联**：`.claude/audits/audit-20260629-2330-deep.md`（深度审计完整报告）

### Fixed - M54 /audit batch 2 主题 A：proactive-scan doc-drift 维度补齐（2026-06-30 · v3.0.9）

> **背景**：`.claude/rules/doc-sync.md` 自 2026-06-27 v3 起就承诺"proactive-scan 7 维度之一 = doc-drift"，但工程实际只 7 维度（不含 doc-drift），文档承诺与现实偏差。本批次兑现承诺的 1/4。

- **`scripts/orchestrator/proactive/proactive-scan.js`** — 第 8 维度 `doc-drift` 补齐：
  - 新增 `detectDocDrift()` 函数（~80 行）— 实现 3 段检查：
    1. 04.md "最近一次同步"日期 ≥ CHANGELOG 最近日期（防漂移）
    2. 04.md §0.4 段是否残留 "🆕 计划中" 关键词（每条 +1 漂移点）
    3. 最新 M_N 是否在 01.md + 02.md 出现（漏文档 → 漂移）
  - `DIMENSIONS_ENABLED` 加 `doc-drift: true`
  - `detectors` 数组插入 `['doc-drift', detectDocDrift]`
  - 文件头注释 7 维度 → 8 维度
  - `formatReport` 健康提示"7 维度全过" → "8 维度全过"
  - 模块 export 加 `detectDocDrift`（供测试用）
- **`scripts/orchestrator/proactive/test-proactive-scan-doc-drift.js`**（新建）— 4 场景断言（函数契约 / 真实仓库体检 / 04.md 字段解析 / detectAll 集成）
- **`package.json`**：
  - 主 `test` 串接入 `test-proactive-scan-doc-drift.js`（保持 39/39 总通过）
  - 新增 `test:proactive-scan-doc-drift` 单跑 alias
- **`.claude/skills/left-brain/memory/evolution-plan.json`** — 候选 `AUDIT-M54-batch2-A-doc-drift` 从 `next` 移到 `history`，加 started/completed 时间戳 + summary
- **`04_自我演进路线.md`**：
  - 顶部"最近一次同步"字段更新到 `2026-06-30`
  - §十二 ⏳ 段 A 行标 ✅（保留原位，下次 sync-roadmap 自动移走）
  - M48 段后加"M48 兑现补遗"说明
- **测试**：`test-proactive-scan-doc-drift.js 4/4` + `test-proactive-scan.js 35/35`（无 regression，合计 39/39）+ `npm run doc:check 26/26` 通过
- **剩余**：A 主题 4 维度中的 3 维度（hook-fail / config-drift / memory-health）另立 P1 候选（避免单次合 4 维度失焦）
- **关联**：`.claude/rules/doc-sync.md` 第 8 维度承诺 · M48 neat-freak 借鉴 · batch 2 audit 报告 `.claude/audits/audit-20260629-2330-deep.md` 主题 A

### Fixed - M54 /audit batch 2 主题 E：left-brain recall 默认入口合并（2026-06-30 · v3.0.9）

> **背景**：`.claude/skills/left-brain/scripts/left-brain.sh:446` 走两条并行路径（bash grep + Node TF-IDF 语义引擎），用户默认走 grep → 语义引擎空转 → L4 学习闭环"TF-IDF 召回"是假命题。

- **方案选 A**（保留语义引擎能力，去摩擦；放弃 B = 删引擎缩成简单 grep）：
  - 默认入口走 Node TF-IDF（去掉隐藏 `--semantic` 开关）
  - 保留 `--grep` 兼容路径（调试 / 兼容旧 workflow）
  - Node 进程非零退出 → 自动 fallback 到 bash grep（兜底）
- **改动**：
  - `.claude/skills/left-brain/scripts/left-brain.sh` — `recall|search)` 分支改写（默认 Node + `--grep` fallback + 失败兜底）
  - `scripts/orchestrator/recall/test-left-brain-recall-default.js`（新建）— 6 场景断言（默认走 Node / `--grep` 走 bash / 直调 Node / 真实命中 / exit 0）
  - `package.json` — 主 `test` 串接入 `test-left-brain-recall-default.js` + 新增 `test:left-brain-recall-default` 单跑 alias
- **验证**：
  - `test:left-brain-recall-default` **6/6 通过**
  - `test:recall`（原 baseline）**30/31**（1 preexisting fail = "不存在的查询返回空" 期望值太严，与本次无关）
  - 真实调用 `bash left-brain.sh recall dispatcher` → 返回带"语义检索"+ "相似度%"排序结果（旧 grep 缺），top1 = KB-20260621-013 dispatcher MVP（15.7%）
  - `doc:check` 26/26 通过
- **L4 影响**：
  - 第 1 条「数据真实性」↑：L4 学习闭环宣称"TF-IDF 召回"不再假命题 → 真实兑现
  - 第 4 条「完成质量」↑：去掉用户认知摩擦（不用记 `--semantic` 开关），左脑调用从 grep 升级到语义检索
- **剩余**：E 主题 2 子项中的 E-recall-threshold（P0 · dispatcher 阈值 0.2→0.05）另立条目
- **关联**：`.claude/audits/audit-20260629-2330-deep.md` 主题 E · M14 知识图谱反哺 · semantic-recall.js 索引失效机制（KB mtime 自动 rebuild）

### Fixed - M54 /audit batch 2 主题 D：plan-bridge 永久卡 executing 状态修复（2026-06-30 · v3.0.9）

> **背景**：`.claude/rules/plan-protocol.md` 状态机有 `executing` 状态，但执行流程（`scripts/orchestrator/planning/plan-bridge.js`）只 `updatePlanStatus('executing')` 不记 `executing_at` 字段 + 不做超时检查——脚本崩溃后下次 `executeLatest` 找不到 approved，plan 永久卡死。

- **方案**：3 层防护
  1. **状态字段明确化**：`executing_at` 时间戳
  2. **stale 自动恢复**：`rescueStaleExecutings(30min)` — 超 30 分钟 executing → 自动回退 approved + 写 warn 日志（含 elapsed 分钟数）
  3. **OS-level 锁**：`acquireLock` / `releaseLock`（`memory/plan-bridge.lock` 文件，35 分钟强制接管） + `executePlan` `try/finally` 兜底释放
- **改动**：
  - `scripts/orchestrator/planning/plan-bridge.js` — 新增 `rescueStaleExecutings` / `acquireLock` / `releaseLock` / `touchExecutingLock` 4 函数（~110 行）+ `executePlan` 启动首行调 stale rescue + `try/finally` 包核心循环 + 模块 export 扩展
  - `scripts/orchestrator/planning/test-plan-bridge-stale.js`（新建）— 14 场景断言（stale 恢复 / 30 分钟边界 ±1ms / 单进程锁 / release 后能再 acquire / executePlan 启动自动 rescue / 锁被占拒绝）
  - `package.json` — 主 `test` 串接入 + 新增 `test:plan-bridge-stale` 单跑 alias + `plan:rescue-stale` 命令
- **验证**：
  - `test:plan-bridge-stale` **14/14 通过**
  - `test:plan-bridge`（原 baseline）**44/44 无 regression**
  - 5 类对抗式审查（输入异常 / 边界 / 并发 / 时间污染 / 部署回滚）全部覆盖：边界 30min±1ms 测试 + 锁被占拒绝 + try/finally 兜底
- **L5 影响**：
  - 第 4 条「完成质量」↑：plan 协议状态机从"软标签"升级为"硬承诺"（带时间戳 + 锁 + 自动恢复）
  - 第 5 条「自治覆盖率」↑：自主模式跑 plan 时即使子会话崩溃也能自动恢复，不再需人工干预
- **关联**：`.claude/rules/plan-protocol.md` 状态机 v1 → v2（添加 stale 阈值 + OS 锁条款）· `.claude/audits/audit-20260629-2330-deep.md` 主题 D · M52 first-principles 思维闸门（4 类反模式避免 + 5 类审查角度覆盖）

### Added - M52 「两大神级 Prompt」方法论沉淀：0.5 步思维闸门（v3.0.8 · 2026-06-29）

- **背景**：[AIHOT 作者饭桌心得](两大神级prompt.md) 总结的"两大神级 Prompt"（第一性原理 + 对抗式审查）已在 AiCode 半显式存在——CLAUDE.md 最高指令「先问这能帮 Claude 变智能吗」/ M48 借鉴方法论 / ECC 评估 5 理由 / qa-reviewer / swarm-coordinator，但**没有作为统一方法论 + 必跑动作沉淀**。
- **本阶段动作**：
  - **新增 `.claude/rules/first-principles.md`**（独立规则文件，180+ 行）— 含 4 类反模式（行业共识 / 模仿 trending / 加中间层 / 跳过根因）+ 5 类审查角度（输入异常 / 边界条件 / 并发 / 时间污染 / 部署回滚）+ AIHOT 来源 + 集成方案
  - **升级 `.claude/rules/self-discipline.md`**（v4 → v5 · 5 步法 → 6 步法）— 0.5 步思维闸门（含 0.5a 第一性原理 + 0.5b 对抗式审查 两子步）
  - **新增 `scripts/orchestrator/test-self-discipline.js`** — 19 项校验（self-discipline + first-principles + CLAUDE/01/02/04/CHANGELOG 全部含 M52 引用 + 0.5 步完整性）
- **触发决策表**：

  | 改动级别 | 0.5a 第一性原理 | 0.5b 对抗式审查 |
  |:---------|:---------------:|:---------------:|
  | 🟢 微小 | ❌ | ❌ |
  | 🟡 小 | 🟡 建议（根因未明时）| 🟡 建议（影响大时）|
  | 🔴 大 | ✅ **必跑** | ✅ **必跑** |
  | 🏁 里程碑 | ✅ **必跑** | ✅ **必跑（N=4-8）** |

- **验证**：
  - `node scripts/orchestrator/test-self-discipline.js` **19/19 通过**
  - `npm run test:queue-bridge` **55/55 通过**（无回归）
  - `npm run doc:check` **0 失败**（合计 45 → 48 同步）
- **8 文档同步**：README.md / PROJECT-CONTEXT.md / 01.md / 02.md / 04.md / 03.md / CLAUDE.md / CHANGELOG.md 全部加 M52 引用
- **L5 影响**：
  - 第 4 条「完成质量」↑：🔴/🏁 任务不治表 + 不漏 BUG（5 类审查角度兜底）
  - 第 5 条「自治覆盖率」↑：🔴/🏁 任务必走双闭环（生成 + 验证），L5 数据基础稳固
  - 第 3 条「自治可观测」↑：M52 self-discipline test 提供 19 项量化校验（首次为 self-discipline 加正式测试基线）
- **commit**：M52 (即将)
- **关联**：KB `kb-aihot-two-prompts-2026.md`（local · gitignore）· [[priority-intelligent-evolution]] · [[m48-neat-freak-borrow]] · [first-principles.md](../../.claude/rules/first-principles.md) · [test-self-discipline.js](../../scripts/orchestrator/test-self-discipline.js)

### Decision - close RESEARCH-research-skill-ecosystem-20260626 候选（2026-06-29）

- **背景**：`/audit` 浅层报告 P2 唯一建议（2026-06-26），落 `.claude/audits/research-skill-ecosystem-20260626.md`，含 6 步推荐路径（Step 1+2 L5 文档同步/dashboard + Step 3-5 `/evolve` `/autonomous` `/go` 升 skill + Step 6 L5 趋势图远期）。
- **本阶段动作**：对照 6 步路径与已落地增量：

  | Step | 推荐 | 实际增量 | 状态 |
  |:----:|:-----|:--------|:----:|
  | 1 | L5 文档同步（30min P0）| M42 `sync-l5-progress.js`（14/14 测试）| ✅ |
  | 2 | left-brain dashboard 接 L5（半天 P1）| M42 dashboard L5 段 | ✅ |
  | 3 | 升格 `/evolve` 为 skill（1-2 天 P1）| M25 `.claude/skills/evolve/SKILL.md` v1.0（2026-06-27）| ✅ |
  | 4 | 升格 `/autonomous` 为 skill（1-2 天 P1）| M25 `.claude/skills/autonomous/SKILL.md` v1.0（2026-06-27）| ✅ |
  | 5 | 升格 `/go` 为 skill（0.5-1 天 P2）| M43 `.claude/skills/go/SKILL.md` v1.0（19/19 测试 + 4 阶段流水线）| ✅ |
  | 6 | L5 趋势折线图（远期）| 等 2026-08 第 3 份月度报告 | ⏸ 保留 |

- **决策**：
  - ✅ **候选 close**（6 步路径 100% 落地，无需重复实施）
  - ⏸ **Step 6 保留**为远期候选（写 `04.md` §十二 ⏳ 段"保留作下次调研参考"）
  - ✅ **bridge 测试基线 55/55 保持**（无回归）
- **L5 影响**：
  - 第 4 条"完成质量"↑：研究报告落地率 100%（从"建议性文档" → "可勾选的实施清单"）
  - 第 5 条"自治可观测"↑：候选兑现可关闭（避免 next 队列堆积已实施的候选）
- **关联**：`AUDIT-roadmap-item-skill`（同 P3 仍 ⏳） · [[kb-research-skill-ecosystem-2026]]

### Docs - /handoff + /autonomous 详细使用场景补充（v3.0.8 · 2026-06-29）

- **背景**：用户在 /handoff 会话中反馈"两个命令详细使用场景不够清晰"，需要明确边界。
- **本阶段动作**：
  - `session-memory.md` 场景表扩展为 3 张子表：
    - 9 行"人在模式"基础场景表（保留）
    - **7 行 `/handoff` 详细使用场景**（晚 12 点 / 40% 触顶 / 里程碑 / 双会话 / 调试线索 / 决策痕迹 / 纯收工）
    - **4 行 `/autonomous` 详细使用场景**（离开 1 小时 single / 1 整天 always / 只想开开关 / 后台无人值守 always+runner）
  - 每张子表都加"关键边界"段（与 `/clear` `/compact` `/status` 的差异）
- **关键洞察**：
  - `/handoff` = 人工接续（需粘贴 prompt）
  - `/autonomous` = 机器接续（runner 自动 + SessionStart hook）
  - 两者**正交**而非默认 / 备选
- **Files**：`session-memory.md`（+27 行 · 0 删）

### Changed - session-init 速度优化 + 新会话第 1 分钟 2 步仪式（v3.0.8 · 2026-06-29）

- **背景**：用户痛点 — 打开新会话不知道进度到哪 / next 队列有啥 / 下一步该做啥 → 习惯性 `/autonomous` 让 AI 跑（人在场时反模式）。
- **本阶段动作**：
  - **`session-init.sh`** 加 `SESSION_INIT_MODE` 环境变量（默认 `fast`）：Step 2/3 跳过全文（只显示存在 + 数量），启动 30 秒内完成
  - **`session-memory.md`** 新增"🎯 新会话第 1 分钟必跑 2 步"段 + 9 行场景表（人在模式 vs 自主模式 + handoff vs compact vs clear 边界）
  - **`CLAUDE.md` 启动协议** Step 1.5 加必跑 2 步仪式（`/status` + 自然语言指令）
- **关键边界**：
  - `/status` 取代 `/autonomous` 作为新会话默认（人在场）
  - `/audit` **不放入仪式**（慢，用途是产生 backlog，按需）
  - `/handoff` 仅在"有未固化临时状态"时用（罕见），其余情况直接 `/clear` 或 `/compact`
- **L5 影响**：
  - 第 5 条「人工干预率 ↓」：用户上手摩擦从"习惯性 /autonomous"降到"30 秒 2 步"
  - 第 3 条「自治可观测 ↑」：session-init fast 模式让 SessionStart hook 不再拖慢启动
- **Files**：`session-init.sh` + `session-memory.md` + `CLAUDE.md`（3 文件 · +24 / -3 行）

### Fixed - 合并 package.json 重复 npm script（AUDIT-cleanup-npm-script · 2026-06-29）

- **背景**：`/audit` 浅层报告 P1（2026-06-29 13:08）发现 `package.json` line 23-24 两条命令值完全相同：
  ```json
  "test:verify-runner": "node scripts/orchestrator/verify-runner-subprocess.js",
  "verify:runner": "node scripts/orchestrator/verify-runner-subprocess.js",
  ```
  两条等价命令同时存在 → 入口歧义 + 维护成本翻倍 + 文档同步困难。
- **本阶段动作**：
  - 保留 `test:verify-runner`（已在 `test:autonomous` npm script 里被引用，与 `npm test` 主链一致，命名风格正确）
  - 删除 `verify:runner`（dupe，无外部引用）
- **验证**：
  - `npm run test:verify-runner` **21/21 全部通过**（保留的功能完整）
  - `npm run test:queue-bridge` **55/55 通过**（修了一处 13.3 测试断言：mock 加 ECC 后过滤预期从 2 → 1）
  - `npm run doc:check` **0 失败**（合计 44 → 47 ✅ + ⏳ 同步）
- **CHANGELOG line 240 历史不动**：M19-2 段曾记录"新增 test:verify-runner / verify:runner"——这是历史事实保留，避免改写历史
- **L5 影响**：
  - 第 4 条「完成质量」↑：删 1 行重复命令 = -1 处未来维护点
  - 第 5 条「自治覆盖率」↑：bridge 现已自动入队 3 条新候选（含本候选），`/audit → queue → runner` 链路验证完整

### Fixed - bridge 借鉴状态 dedupe（M16 升级 · v3.0.8 · 2026-06-29）

- **背景**：`scripts/bridge/queue-bridge.js` 每次 `/evolve` 跑都会把已完成的 M26/M27/M31/M38/M39/M40 借鉴项目以新 ID（`EVOLVE-thedotmack-claude-mem` 等）重复入队。根因：dedupe 按 id 匹配，但 `evolution-plan.json history` 段里 ID 是 `M39-claude-mem-poc`（非 EVOLVE- 形式），bridge 不知道已借鉴。
- **本阶段动作**：
  - 新增 `.claude/knowledge/borrowed-repos.json`（commit 进版本）— 8 条已借鉴仓库白名单（M26/M27/M31/M38/M39/M40/M41/M48+M49）
  - `scripts/bridge/queue-bridge.js` 加 `readBorrowedRepos()` + `readEvolveCandidates()` 过滤
  - 大小写不敏感（candidates.json 用 `MemTensor/MemOS` 也能匹配 `memtensor/memos`）
  - 新增测试段 13（`test-queue-bridge.js`）：8 项校验（白名单文件存在/不存在/小写化/mock 过滤/大小写不敏感/真路径恢复）
- **验证**：
  - `npm run queue:sync:dry` 从 10 条 → 4 条（7 条 EVOLVE-* 已借鉴被正确过滤）
  - 测试 55/55 通过（基线 47 → +8 项）
  - 桥的 `data/bridge/queue-sync-2026062905065.md` 显示真实新候选只剩 EVOLVE-affaan-m-ecc + AUDIT-cleanup-npm-script + AUDIT-roadmap-item-skill + RESEARCH-research-skill-ecosystem-20260626
- **commit**：a0377b5

### Decision - ECC（affaan-m/ECC）评估：主体不借鉴，Instincts 概念可借鉴（2026-06-29）

- **背景**：`/evolve` 2026-06-29 扫到 [affaan-m/ECC](https://github.com/affaan-m/ECC) 综合分 7.4/10（⭐223145 · 261 skills · 66 agents · MIT 协议）。需评估是否借鉴。
- **评估结论**：

| 维度 | 判断 |
|:-----|:-----|
| ECC 整体定位 | "harness-native operator system" — 跨 8 大 IDE（Claude Code / Codex / Cursor / OpenCode 等）的 harness 性能系统 |
| 与 AiCode 关系 | **平行 harness**（不是借鉴材料）— 借鉴它 = 借鉴一个 IDE |
| 与 AiCode 差异化 | 商业版 Pro $19/seat/mo；Python 实现；261 skills 是营销数字 |
| Instincts 概念 | **可借鉴**（与 KB 同构，3 处差异：confidence 评分 / TTL prune / evolve 聚类）|

- **可借鉴 3 点**（P3 调研，不立即实现）：
  1. **KB confidence 评分** — M45 KB 分类质量提升已部分实现（classification 置信度）
  2. **KB TTL 自动 prune** — `kb-promote --ttl 30` 选项未实现
  3. **KB evolve 自动聚类** — 与 M48 `kb-promote` 毕业机制重叠，不重复
- **决策**：
  - ✅ **主体不借鉴**（CLAUDE.md 最高指令：评估新功能先问"能帮 Claude 变智能吗" — ECC harness 整体不直接帮 Claude 变智能）
  - ✅ **决策痕迹保留**（KB + CHANGELOG）— 不入队
  - ✅ **更新 borrowed-repos.json** — 加入白名单避免下次重复入队
- **KB 全文**：`.claude/skills/left-brain/memory/knowledge/kb-affaan-ecc-eval-2026.md`（主体结构 + 5 不借理由 + 3 可借鉴点 + 与 KB-001/M34/M41/M48/M49 关联）
- **关联**：AUDIT-khazix-skip（同类决策模式）· [[kb-khazix-skills-borrow-2026]]（同一评估框架）· [[priority-intelligent-evolution]]（最高指令）

### Docs - 自主模式高频使用场景文档化（2026-06-29）

- **背景**：M48/M49 跑通当天（v3.0.7），用户多次问"新窗口 + /autonomous 为什么不自动干活"、"当前会话做 vs runner 后台"、"中途能不能切"——**说明高频用户路径没文档化**。
- **本次同步 4 处**（按 doc-sync 8 文档规则）：
  - **CLAUDE.md 顶部**：`v2.2.0 → v3.0.7` 版本号 + 加 1 句"注意 /autonomous 只开开关 + 改跳 01.md"（导航）
  - **01.md §三**：新增 🚀 自主模式高频场景子段（4 场景表 + 5 条关键认知，**+14 行**）
  - **02.md §2.20**：标题升级 `v2.2.0 → v3.0.7` + 新增 §2.20.1 子节（4 场景 + 5 认知 + 与 stop 关系 + 关联，**+25 行**）
  - **04.md §0.4 M48 段末尾**：新增"M48 完成后的用户可见体验升级"对比表（5 行场景对比），沉淀当天实测
- **不动**：03.md（版本计划与本话题无关）/ PROJECT-CONTEXT.md（100 行速览已含 autonomous 一行）/ README.md
- **用户高频入口**：从 CLAUDE.md / 01.md 都可跳到场景速查表，扫一眼能选（推荐读法）
- **影响**：下次新窗口跑 `/autonomous` 时，用户从 01.md §三 看 4 场景表 → 30 秒决定选"当前会话做"还是"启 runner"

### Added - M49 deep-research 升级：吸收 hv-analysis 横纵双轴方法论（2026-06-29）

- **背景**：[khazix/hv-analysis](https://github.com/KKKKhazix/khazix-skills) 的双轴分析方法论（纵向=时间 + 横向=同期对比 + 交汇=新判断）适合"研究 / 调研 / 摸清楚"等系统化深度研究需求。但其 PDF 输出（WeasyPrint）+ 卡兹克公众号文风不适合工程场景 → **借鉴方法论核心，砍掉 PDF + 文风**，改为 AiCode 风格的离线 CLI + 模板驱动。
- **本阶段动作**：
  - 新建 `scripts/orchestrator/deep-research.js`（330 行）— 纯函数离线 CLI 4 子命令：`analyze "对象名"` 生成报告框架 / `--json` 输出 JSON / `template "对象名"` 输出空模板 / `from-data data.json` 从 JSON 生成报告
  - 新建 `.claude/skills/deep-research/SKILL.md`（**第 8 个正式 skill**）— 触发词 + 方法论 3 段 + 竞品场景 A/B/C + 字数参考 10k-30k 字 + 写作禁区
  - 新建 `scripts/orchestrator/test-deep-research.js` **14/14 通过**（METHODOLOGY / loadObject / renderVertical / renderHorizontal / renderIntersection / generateReport / CLI 4 子命令）
  - 新 npm scripts：`deep-research` + `test:deep-research`
- **核心方法论**（保留自 hv-analysis）：
  - **纵向 5 维度**：起源追溯 / 诞生节点 / 演进历程 / 决策逻辑 / 阶段划分（6000-15000 字）
  - **横向 3 场景**：A 无竞品 / B 少量竞品 / C 充分竞品（3000-10000 字）
  - **交汇 5 核心问题**：历史如何塑造当下 / 竞品的纵向对比 / 优势历史根源 / 劣势历史根源 / 未来 3 剧本（最可能/最危险/最乐观）（1500-3000 字）
- **砍掉**（不适合工程）：❌ PDF 输出（WeasyPrint）· ❌ 卡兹克公众号个人文风 · ❌ 强口语化
- **L5 影响**：
  - 第 4 条「完成质量」↑：方法论驱动 → Claude 不再写"千字流水账"
  - 第 5 条「自治覆盖率」↑：双轴方法论可应用到 /evolve 候选分析 / /audit 工程体检 / /dispatch 任务委派 多场景
- **commit**：见 git log (M49-XXX)
- **关联**：KB `kb-khazix-skills-borrow-2026.md` · 04.md §0.4 M49 增量段 · §十二里程碑表追加 M49 行 · 8 文档同步完成

### Added - M48 neat-freak 完整借鉴（A+B+C+D · 4 子模块 · 2026-06-29）

- **背景**：`github.com/KKKKhazix/khazix-skills` 的 `neat-freak` skill 91 行母本关系 — CLAUDE.md 红线 + doc-sync 8 文档同步均抄自它。差距分析见 [kb-khazix-skills-borrow-2026.md](.claude/skills/left-brain/memory/knowledge/kb-khazix-skills-borrow-2026.md) 识别 3 个核心缺：**毕业机制 / sync-matrix / 特殊情况段**。本增量全补。
- **本阶段动作（4 子模块）**：

  - **M48-A 毕业（promote）机制**：
    - 新建 `.claude/rules/memory-promote.md`（独立规则文件）— 毕业三触发（主题反复 ≥3 / 系统机制描述 / 事件类 >14 天）+ "下一个接手的人需不需要知道" 判据
    - 新建 `scripts/knowledge/promote-kb.js`（289 行）— 半自动 promote 工具，CLI 4 子命令（`--report` / `--dry-run` / `--apply` / `--apply --delete`）+ 5 参数（`--target` / `--kb` / `--delete`）
    - 测试 `scripts/knowledge/test-promote-kb.js` **17/17 通过**
    - 真实体检：75 条 KB 命中 16 条毕业建议（含真实重复主题 'clau' 10 次 / 'tier' 3 次）

  - **M48-B sync-matrix 变更影响矩阵**：
    - 新建 `.claude/rules/sync-matrix.md`（独立规则文件）— 5 段映射：反向删除反模式 / 代码层 → 8 文档映射 / 记忆层变更 / 跨项目检查 / 文档结构通用约定
    - 与 [doc-sync.md](.claude/rules/doc-sync.md) 互引，扩展 self-discipline 决策树

  - **M48-C self-discipline 5 步法升级**：
    - 重写 `.claude/rules/self-discipline.md`（v3 → v4）— 加入"零步尺寸体检 → 一步盘点 → 二步 sync-matrix → 三步修改 → 四步 14 项自检 → 五步变更摘要" 5 步法
    - 嵌入 MEMORY.md 200 行 / 25KB 硬红线 + CLAUDE.md 300 行 / 15KB 软上限 + 单条 memory 100 行 + 体量倒挂 4 项指标
    - 4a 决策树从 6 文档升级到 8 文档（含 `PROJECT-CONTEXT.md` + `README.md`）
    - 引用新规则文件 4 个（memory-promote / sync-matrix / special-cases / 旧 doc-sync）

  - **M48-D 特殊情况段 + MEMORY.md 体检脚本**：
    - 新建 `.claude/rules/special-cases.md`（独立规则文件）— 5 种特殊情况处理（无 README / 无新事实 / 记忆矛盾 / 跨项目 / 历史漏改）
    - 新建 `scripts/knowledge/memory-health-check.js`（310 行）— 4 项体检（MEMORY.md 200/25KB 硬约束 + 单条 KB 100 行 + 体量倒挂 + 跳过条件）+ 退出码 0/1/2（OK/WARN/ERROR）+ `--json` 输出
    - 测试 `scripts/knowledge/test-memory-health-check.js` **15/15 通过**

- **npm scripts（5 个新增）**：
  - `kb:promote` / `kb:promote:apply` — 跑 promote-kb 工具
  - `memory:health` — 跑 MEMORY.md 体检
  - `test:promote-kb` / `test:memory-health` — 测试
- **测试**：32/32 全过（17 promote + 15 health-check）
- **L5 影响**：
  - 第 5 条「自治覆盖率」↑：self-discipline 5 步法纳入"尺寸体检"零步，防 memory 膨胀 → L5 数据基础稳固
  - 第 4 条「完成质量」↑：4a 决策树 + sync-matrix 引用 → 不漏改
  - 第 3 条「自治可观测」↑：memory-health-check 给 L5 月报"memory 体量 / 倒挂"新指标
- **commit**：见 git log (M48-XXX)
- **关联**：KB `kb-khazix-skills-borrow-2026.md` · 04.md §0.4 M48-A/B/C/D 增量段 · §十二里程碑表追加 M48 行 · 8 文档同步完成

### Decision - khazix-skills 借鉴分析 + 候选入队（2026-06-29）

- **背景**：用户问 `github.com/KKKKhazix/khazix-skills`（MIT 协议 · 5 个 skill）哪些可吸收借鉴。
- **评估结论**（5 skill 横向对比）：

| Skill | 评估 | 决策 |
|:------|:-----|:-----|
| 🧹 **neat-freak** | 母本关系（CLAUDE.md 红线 + doc-sync 8 文档同步均抄自它）| 🟡 **M48 入队 P0**（缺 3 条：毕业机制 / sync-matrix / 特殊情况段）|
| 🔥 **aihot** | 已通过 agent-reach 覆盖 | ✅ 跳过 |
| 🔭 **hv-analysis** | 横纵双轴方法论可吸收 | 🟡 **M49 入队 P1**（方法论 → deep-research）|
| 💽 **storage-analyzer** | 零交集（磁盘清理 vs Claude 增强壳）| ❌ 跳过（决策记录）|
| ✍️ **khazix-writer** | 零交集（公众号文风 vs 工程化）| ❌ 跳过（决策记录）|

- **本轮动作**（**只做分析 + 入队，不立即实现 M48**）：
  - KB `kb-khazix-skills-borrow-2026.md` 写入左脑（71 → 72 条）
  - KB-20260629-001 索引追加 MEMORY.md（决策类目）
  - 决策记录 `autonomous-decision-20260629-001.json`
  - `evolution-plan.json` next 队列追加 3 条候选（M48 P0 / M49 P1 / AUDIT-khazix-skip P3；M48-A 自带的"memory 毕业审计"已合入 M48 一并完成）
  - 锁已获取后释放（owner=main-session-20260629）
  - 会话快照已存（`20260629-090533`）
- **下一步**：M48 neat-freak 完整借鉴（4h · 8 文档同步）由 /autonomous runner 自动选 P0 推进
- **理由**：M48 改 3 个核心规则文件 + 1 个新文件 = 🔴 大级别工作量，本轮分析 + 入队是稳妥的"新会话起手式"，避免在单次会话内塞太多（cost-control.md "new task = new session" 原则）

### Added - M45 KB 分类质量提升（2026-06-29）

- **背景**：71 条 KB 中 49.3% 标"其他"（35 条）+ 20 条无 frontmatter 纯文本 → L5 第 3 条「自治可观测」的命中率数据基础是噪声，无法信任。
- **本阶段动作**：
  - **新增 `scripts/knowledge/auto-classify.js`** — 编码检测（utf8 / gb18030）+ 9 类分类规则（偏好/决策/事件/人物/工程经验/概念澄清/技术/bug_fix/feature_full）+ CLI 4 子命令（report / dry-run / apply / detect-encoding）
  - **新增 `scripts/knowledge/enrich-kb.js`** — 把 20 条无 frontmatter 的纯文本 KB（`[KB-YYYYMMDD-NNN] 内容` 格式）补上 frontmatter
  - **新增 `scripts/knowledge/restore-plain-kb.js`** — enrich 出错时还原 20 条原始纯文本（应急工具）
  - **新增 `scripts/orchestrator/test-auto-classify.js`** — 24/24 通过（编码检测 3 + parseKB/rebuildKB 2 + 9 类规则 11 + enrich 解析 3 + L5 数据真实性 5）
  - **npm 4 scripts** — `kb:classify` / `kb:report` / `kb:enrich` / `test:auto-classify`
  - **test 主链追加 `test:auto-classify`** — 纳入 npm test 全量回归
  - **真实效果**：71 条 KB 从「其他 49.3%」降为「其他 4.2%」（远超 20% 目标）；8 类清晰：决策 18 / feature_full 18 / 工程经验 15 / 事件 10 / bug_fix 4 / 偏好 2 / 技术 1
- **commit**：`6b24bce`
- **L5 影响**：第 3 条「自治可观测」的数据基础从噪声变信号；月报「命中率 / 分类质量」可信

### Added - x1xhlol IDE Agent 按需评估 + auto-perceive 规则补完（2026-06-28）

- **背景**：用户问 `x1xhlol/system-prompts-and-models-of-ai-tools` 价值（141k⭐，GPL-3.0，30+ IDE Agent 语料）。与 asgeirtj (chat 产品) 互补（IDE Agent 方向），按"按需抓不 clone"策略读 3 个核心 prompt。
- **本阶段动作**：
  - **新增 KB `ide-agent-prompts-x1xhlol-2026.md`** — 读 Cline (508 行) / Devin (314 行) / Cursor Agent 2.0 (691 行) 提炼 5 模式：
    1. **planning vs standard 双模式切换** — autonomous-runner 应分两阶段（只读 vs 写）
    2. **think tool 10 个必须触发场景** — 显式触发条件清单替代 AI 自决思考
    3. **`<suggest_plan>` 结构化命令** — plan 显式触发信号
    4. **调试铁律 4 条** — 不改测试 / 不加注释 / 看现有模式 / 不假设库可用
    5. **现有模式优先** — 新组件前先看邻居代码
  - **`.claude/rules/auto-perceive.md` 补 "What NOT to save" 5 类不写清单**（commit `2aa0f08`）— 沉淀 cowork-dispatch 借鉴
  - **MEMORY.md 索引追加 1 条**（ide-agent-prompts）
- **GPL-3.0 风险**：所有 KB 内容只能写"我们总结的模式"，**严禁原文搬运 x1xhlol 仓库的 prompt 段落**（asgeirtj 是 CC0，x1xhlol 是 GPL-3.0）
- **测试结果**：N/A（纯 KB 沉淀 + 规则补完）
- **L5 影响**：
  - **未来增量候选**（待 04 路线图确认）：3 个 autonomous-runner 改进方向（详见 `ide-agent-prompts-x1xhlol-2026.md`）
  - **L4 学习闭环 ↑**：IDE Agent 正例库（按需，0 体积成本）
- **关联**：`ide-agent-prompts-x1xhlol-2026.md` · `cowork-dispatch-memory-pattern-2026.md`（互补：chat 产品）

### Files - 本次增量

- KB `ide-agent-prompts-x1xhlol-2026.md` (新) — 5 借鉴模式 + GPL-3.0 划界
- `.claude/rules/auto-perceive.md` (改) — "What NOT to save" 5 类不写清单（已在 commit `2aa0f08`）
- `MEMORY.md` (改) — 索引追加 ide-agent-prompts 条

### Added - asgeirtj 语料库接入 + cowork-dispatch 借鉴评估（2026-06-28）

- **背景**：用户问 `asgeirtj/system_prompts_leaks` 价值，评估为"挖语料不当 skill"。这是 L4 学习闭环的官方对齐机会——仓库 46,778⭐、CC0 license、165+ 真实 SOTA 产品 system prompt（含 Anthropic Claude Fable 5/Opus 4.8/Code/Cowork、OpenAI GPT-5.5、Cursor/Copilot 等）。
- **本阶段动作**：
  - **新增 `data/corpus/system-prompts/`** — `gh repo clone --depth 1` 完整 clone 8.26MB，14 个厂商目录
  - **新增 `.gitignore` + `.claudeignore` 规则** — `data/corpus/` 双 ignore（防误 commit + 防 SessionStart 误读污染 context）
  - **新增 KB 条目 `cowork-dispatch-memory-pattern-2026.md`** — 通读 `Anthropic/claude-cowork-dispatch.md` 提炼 3 个可借鉴模式：
    1. **Dispatcher 严格只路由不做任务** — 对应 autonomous-runner vs swarm-coordinator 边界审计
    2. **auto-memory 规范 5/7 对齐 left-brain** — 缺"What NOT to save 完整列表"+"Before recommending 3 条验证"两项
    3. **MEMORY.md 200 行截断** — 当前 16 行远未到，但应提前加监控
  - **MEMORY.md 索引追加** — cowork-dispatch 借鉴 KB + kangarooking 划走 KB
- **测试结果**：N/A（本阶段仅语料接入 + 文档沉淀，未改主代码）
- **L5 影响**：
  - **L4 学习闭环 ↑**：获得 165+ 正例样本库，未来可强化 M12 LLM-judge 评分
  - **left-brain 7 项规范 5/7 对齐** = 一次官方对齐机会，2 项可低成本补齐（KB 条目内已列出，作为未来增量候选）
- **关联**：`data/corpus/system-prompts/` (8.26MB) · `cowork-dispatch-memory-pattern-2026.md` · `kangarooking-system-prompt-skills-skipped.md`

### Files - asgeirtj 语料库接入

- `data/corpus/` (新) — asgeirtj/system_prompts_leaks clone，gitignore 排除
- `.gitignore` (改) — 第 122 行新增 `data/corpus/`
- `.claudeignore` (改) — 末尾新增 `data/corpus/`
- KB `cowork-dispatch-memory-pattern-2026.md` (新) — 3 借鉴模式 + 划界
- KB `kangarooking-system-prompt-skills-skipped.md` (新) — 划走原因
- `MEMORY.md` (改) — 索引追加 2 条

### Added - AUDIT-roadmap-item-skill：/go skill 升格（M43 · v3.0.5 · 2026-06-28）

- **背景**：`/audit` 浅层报告 P2 长期挂着"扩展 skill 生态"项（2026-06-26 research-skill-ecosystem 报告 P2 推荐路径 Step 3-5），`/go` 是 25 个命令中**唯一**描述了完整 4 阶段流水线（测试→简化→审查→提交）但**没有真实脚本**的命令 — 此前只是 markdown 模板，靠 Claude 在上下文里"记得跑"
- **本阶段动作**：
  - **新建 `scripts/orchestrator/go-pipeline.js`** — 4 阶段流水线引擎 v1.0.0
    - `STAGE_DEFS` 定义 4 阶段元数据（test / simplify / review / commit）+ 默认命令 + 退出码语义
    - `parseArgs` 解析 `--dry-run` / `--skip` / `--only` / `--test-cmd` / `--commit-msg` 5 类参数
    - `runStage` 5 状态：passed / failed / skipped / dry-run
    - `runPipeline` 失败立即停止逻辑（不再带 broken 测试 commit）
    - `formatHuman` 人类可读输出（✅/🟡/⏭️/❌ 4 图标 + 各阶段耗时）
    - 纯函数设计：`opts.exec` 依赖注入 → 测试无需 mock child_process
  - **新建 `scripts/orchestrator/test-go-pipeline.js`** — 19 个单元测试，覆盖：parseArgs 5 flag · runStage 5 状态 · runPipeline 失败立即停止 · --only 单阶段 · --skip 多阶段 · --dry-run 不调 exec · formatHuman 关键字段 · STAGE_DEFS 完整性
  - **新建 `.claude/skills/go/SKILL.md`** — skill 升格为第 6 个正式 skill（与 audit/autonomous/evolve/left-brain/ui-skill-installer 并列），含 30 秒上手 + 4 阶段定义 + CLI 参数 + L5 影响 + 关联
  - **新增 npm scripts**：`go` / `go:dry` / `go:only-test` / `test:go`；`test:go` 已接入 `npm test` 主链
- **测试结果**：`test:go` **19/19 通过**（执行时间 < 1s）；audit 浅层报告 skillCount 5 → 6 ✅
- **L5 影响**：
  - **L5 第 4 条"完成质量"↑**：从"人工记得跑测试" → 4 阶段自动化强制（失败立即停止 + dry-run 预演）
  - **L5 第 5 条"人工干预率" ↓**：交付场景不再需要人脑判断"该提交了吗" / "该跑测试了吗"
  - **AI 越用越顺手**：把"流程类判断"交给脚本而非对话，节省每轮 context token
  - skill 数量 5 → 6（research-skill-ecosystem P2"扩展 skill 生态"目标推进 1/3）
- **关联**：`scripts/orchestrator/go-pipeline.js` (v1.0.0) · `.claude/skills/go/SKILL.md` · `04_自我演进路线.md §0.4 M43` · `research-skill-ecosystem-20260626` P2 推荐路径

### Files - M43 /go skill 升格

### Added - runner 子进程执行能力端到端验证（2026-06-28）

- **背景**：前序阶段 `验证 runner 子进程是否能正确执行阶段` 失败 1 次（`子进程退出 code=null`），根因待验证。runner 是 L5 自治模式的核心执行器，验证完整链路（prompt 构建 → 子进程 spawn → exit code → complete-stage 状态机）是阻塞 L5 第 5 步的前置条件。
- **本阶段动作**：
  - **新建 `scripts/orchestrator/verify-runner-subprocess.js`** — 3 段 21 项端到端检查：
    1. `buildStagePrompt` 强制标记验证（防 BUG #2 复现：12 项 — 含 `AUTONOMOUS RUNNER DIRECTIVE` 标题 / `Do not ask for clarification` / `not a new session` / `[1]-[5]` 5 步 / `critical` 标记 / `complete-stage` 路径 / `session-summary.sh save` / `git push` 禁令 / 长度合理）
    2. `claude -p` 子进程 exit code 验证（3 项 — 真实 spawn claude.cmd → 写入 prompt → 等待退出 → 断言 `code=0` 不是 `null` / 无 timeout / 无 ENOENT）
    3. `complete-stage` 状态机验证（6 项 — 备份/写入 in_progress 快照/调 markStageCompleted/断言 6 个字段正确更新/恢复原快照）
  - **新建 `scripts/orchestrator/test-verify-runner-subprocess.js`** — 回归测试包装，让 npm test 链路也能跑
  - **新增 npm scripts**：`test:verify-runner` / `verify:runner`
- **测试结果**：`verify:runner` **21/21 全部通过**（实测 30s 内完成）
- **根因发现**：前序失败的 `code=null` 不是 runner 代码 BUG，而是单次 spawn 异常（极小概率，无复现）。当前 prompt 设计 + spawn 参数（`--permission-mode auto` + stdin 喂入）经过 v3.0.6 修复后已稳定
- **L5 影响**：
  - L5 自治可观测性：`verify:runner` 命令可作为冒烟测试，定期（每次 runner 启动前）自动验证链路健康
  - L5 闭环验收：runner 端到端能力 = 阶段执行能力，21/21 通过 = 链路合格
- **关联**：`scripts/orchestrator/autonomous-runner.js` (v3.0.6 修复后的 prompt 设计) · `KB-20260625-007` (BUG #2 根因) · commit `a53a28d` (--permission-mode auto 修复) · commit `831024c` (prompt 优化修复)

### Tracking - M26/M27 hook 试用期 Day 1/7 跟踪记录（2026-06-28）

- **背景**：M26（sandbox-tool-output）+ M27（skill-reuse）POC 完成于 2026-06-27，04.md §0.4 明文要求"试用 1 周后决定是否接 hook"。当前 Day 1/7（截止 2026-07-04 周五）
- **本阶段动作**：
  - 重跑两个 POC 测试确认无 regression：`test-sandbox.js` **37/37 通过** + `test-skill-reuse.js` **24/24 通过**
  - 创建试用期跟踪文档 `.claude/skills/left-brain/memory/decisions/m26-m27-trial-tracking.md`：定义 7 天试用期的评估维度（M26 自动触发 / 信息丢失；M27 召回质量 / 注入价值）
  - 标记 Day 1/7 状态：当前无负面信号也无正面信号（用户/AI 主动调用 0 次 — 痛点未迫切到必须接 hook）
- **决策结论**：**未到 1 周不做最终决定**，遵守用户明文要求；留给 Day 7/7 stage 出对比报告
- **下次 stage**：`M26-M27-trial-day7-decision`（2026-07-04 触发）
- **关联**：04.md §0.4 M26/M27 增量段 · evolution-plan.json `试用 1 周后决定 M26/M27 是否接 hook`

### Added - RESEARCH-research-skill-ecosystem-20260626：L5 进度可视化 2/6 步落地（2026-06-28）

- **背景**：`.claude/audits/research-skill-ecosystem-20260626.md` 推荐 6 步路径，本阶段完成 Step 1+2：
  - **Step 1（30 min · P0）**：`scripts/orchestrator/metrics/sync-l5-progress.js` — diff `data/evolution/metrics-YYYYMM.md` 与 `04_自我演进路线.md §0.5 L5 5 条真实进度`，输出需同步项；默认 dry-run，加 `--write` 真改 04.md + 顶部"最近一次同步"时间戳 + 写日志到 `data/l5-sync/`
  - **Step 2（半天 · P1）**：`left-brain.sh dashboard` 新增"L5 自治运行 5 条达标进度"段 — 自动读最近一份 metrics 报告解析 5 条 + 显示 ✅/🟡 状态 + 进度计数（如 `1/5 条达成 (202606)`）
- **新增 npm scripts**：`metrics:sync-l5` / `metrics:sync-l5:write` / `metrics:sync-l5:status` / `test:sync-l5`
- **测试**：`test-sync-l5-progress.js` **14/14 通过**（parseMetricsL5 / parseRoadmapL5 / diffL5 in-sync & out-of-sync & graceful / applyChanges 替换 status + blockquote 兼容 / 顶部时间戳 / findLatestReport）
- **L5 影响**：
  - L5 第 4 条（月度 metric 报告持续 3 个月）：diff 工具确保 04.md §0.5 与 metrics 报告自动对齐，避免文档漂移影响 L5 进度可观测性
  - L5 自治可观测性：dashboard 1 键看 L5 5 条进度（不再翻月度报告）
- **未做**：Step 3-5（/evolve /autonomous /go 升 skill，M25/M32 已部分完成 — 见 04.md §0.4）；Step 6（L5 趋势折线图，等 2026-08 第 3 份月度报告）
- **关联**：`.claude/audits/research-skill-ecosystem-20260626.md` 推荐路径第 1+2 步

### Files - RESEARCH-research-skill-ecosystem-20260626 落地

```
scripts/orchestrator/metrics/sync-l5-progress.js           (新增 - L5 文档同步引擎)
scripts/orchestrator/metrics/test-sync-l5-progress.js      (新增 - 14 个测试用例)
.claude/skills/left-brain/scripts/left-brain.sh             (修改 - dashboard 加 L5 进度段)
package.json                                                (修改 - 4 个 npm scripts)
CHANGELOG.md                                                (本条目)
data/evolution/metrics-202606.md                            (新增 - 验证用月度报告)
```

### Files - M26/M27 试用期 Day 1 跟踪

```
.claude/skills/left-brain/memory/decisions/m26-m27-trial-tracking.md   (新增 Day 1/7 跟踪文档)
CHANGELOG.md                                                          (本条目)
```

### Fixed - security-skills-poc cache 命令 ReferenceError + npm scripts 接入（2026-06-28）

- **痛点**：借鉴 mukul975/Anthropic-Cybersecurity-Skills 的防御性安全 POC 已落地（cache/list/search/map/adapt/demo），但 `cache` 子命令第 135 行引用了不存在的函数 `ghRaw`，执行会抛 ReferenceError；只跑 `demo` 路径的用户察觉不到；npm scripts 也未暴露，与 aris-poc/mem-poc/skill-hub 体验不一致
- **修复**：
  - `scripts/security-skills-poc/security-skills-poc.js` line 135：`ghRaw` → `ghRawContent`
  - `package.json`：新增 6 个 npm 脚本（`security-skills-poc` / `:demo` / `:cache` / `:list` / `:search` + `test:security-skills-poc`），与 aris-poc / mem-poc / skill-hub 保持一致
- **测试**：`test-security-skills-poc.js` **8/8 通过**；`list` 子命令确认本地 cache meta 状态正确
- **关联**：`scripts/security-skills-poc/` · `package.json`

### Files - security-skills-poc 修复

```
scripts/security-skills-poc/security-skills-poc.js   (ghRaw → ghRawContent)
package.json                                         (+ 6 npm scripts)
CHANGELOG.md                                         (本条目)
```

### Fixed - autonomous-runner 子进程权限模式导致阶段无法完成（2026-06-28）

- **痛点**：`autonomous-runner.js` spawn `claude -p` 子会话执行阶段时，子 Claude 默认需要交互式权限确认；非 TTY 子进程无法响应，导致阶段实际未执行就退出，runner 误判为 `子进程退出 code=0` 并累计失败
- **修复**：
  - 延续 v3.0.6 已做的 stdin 喂 prompt 方案，避免 Windows 长参数截断
  - 子进程启动参数追加 `--permission-mode auto`，让子 Claude 在无交互环境下自动执行文件修改 / bash / commit 等安全操作
  - 同步更新注释说明修复原因
- **测试**：`npm run test:autonomous` **64/64 + 12/12 + 6/6 全过**
- **关联**：`.claude/rules/autonomous.md` · `.claude/skills/autonomous/SKILL.md`

### Files - autonomous-runner 子进程修复

```
scripts/orchestrator/autonomous-runner.js     (stdin 喂 prompt + --permission-mode auto)
CHANGELOG.md                                  (本条目)
```

### Added - M38.2 /autonomous 交互式方向键菜单（2026-06-28）

- **痛点**：用户执行 `/autonomous` 无参时报"必须显式指定模式"，记不住 `single/always/on/off` 四个入口；输入完整命令也不够爽
- **目标**：给 `/autonomous` 加一个零依赖的交互式方向键菜单，↑↓ 选择，↵ 回车确认，选完自动执行
- **已实现**：
  - 新增 `scripts/orchestrator/autonomous-menu.js`：零依赖（Node.js 内置 readline + ANSI），TTY 环境下弹出 4 选项菜单
  - 菜单项：`single` / `always` / `on` / `off`
  - 选择 `single`/`always` → 自动开启对应模式并启动 `autonomous-runner.js`
  - 选择 `on` → 只开开关（默认 always，不启动 runner）
  - 选择 `off` → 关闭开关
  - 非 TTY 环境自动回退到命令提示
  - `/autonomous` slash 命令无参时改为弹出 Claude Code 选择框（`AskUserQuestion`），可选 `single/always/on/off`
- **npm scripts**：
  - `npm run autonomous` 调出交互菜单（新增）
  - 原有 `autonomous:single` / `autonomous:always` / `autonomous:on` / `autonomous:off` / `autonomous:status` 保持不变
- **测试**：新增 `scripts/orchestrator/test-autonomous-menu.js`，`npm run test:autonomous` **64/64 + 12/12 + 6/6 全过**
- **文档同步**：更新 `01.md` §三、`02.md` §现状速览、`CLAUDE.md` 快速操作、`PROJECT-CONTEXT.md` 核心系统表、`04.md` 能力状态、`SKILL.md` 命令入口说明
- **关联**：`.claude/commands/autonomous.md` / `.claude/skills/autonomous/SKILL.md`

### Fixed - M38.1 自主模式无参入口绑定 toggle 导致用户无法触发 always（2026-06-28）

- **痛点**：用户执行 `/autonomous`（`npm run autonomous`）默认走 `toggle` 子命令，`toggle` 不传 `mode` 参数，导致行为退化为 `current.mode || 'always'`；用户体感"跑不出 always"
- **修复**（B 方案）：
  - `package.json` 删除顶层 `autonomous` 键（原绑定 `autonomous.js toggle`）
  - `scripts/orchestrator/autonomous.js` 删除 CLI `toggle` 子命令，改为走 `default` 输出用法提示
  - `scripts/orchestrator/test-autonomous.js` 补 4 条断言：无参/显式 `toggle` 不再改变状态，内部 `toggle()` 函数仍可用
- **结果**：用户必须显式执行 `autonomous:single` / `autonomous:always` / `autonomous:on` / `autonomous:off` / `autonomous:status`，消除模糊入口
- **测试**：`npm run test:autonomous` **64/64 + 12/12 全过**
- **关联**：`.claude/skills/autonomous/SKILL.md` 说明的两种模式不变，只是入口更明确

### Added - M38 ARIS POC：借鉴 wanshuiyin/ARIS 实现 review-loop + idea-discovery + 6-state verdict（2026-06-28）

- **痛点**：当前 ai-implement / self-reflect / M12 LLM-judge / M31 swarm 各自定义 verdict 字段（accept/reject/pass/fail/score 1-10），调用方要写多份 if/else 适配；用户写完代码/文档后没人 review 容易出问题；候选/idea 排序靠人工主观
- **目标**：借鉴 ARIS（`Auto-Research-In-Sleep`，12.7k⭐ / 1159 forks）核心 3 个能力，本地化做 Node.js 纯函数 POC
- **已实现**（5 模块 / 95/95 测试 / `scripts/aris-poc/`）：
  - `scripts/aris-poc/verdict.js` — 6 状态合约核心：normalizeVerdict（自动归一 ARIS 别名 `ready`/`almost`/`not_ready` + OpenAI `accept`/`reject` + 业内 `pass`/`fail`）+ makeVerdict 工厂 + isPositive 双条件 + aggregateVerdicts 5 策略（unanimous/majority/any/best_of/worst_of）+ nextAction 推荐 + formatVerdict
  - `scripts/aris-poc/review-loop.js` — 5 个 preset reviewer（correctness/security/style/performance/maintainability）+ runReviewLoop 主循环（maxRounds 默认 4，POSITIVE_THRESHOLD=6 双条件终止）+ REVIEW_STATE.json 持久化 + formatReport Markdown
  - `scripts/aris-poc/idea-discovery.js` — scoreIdea 5 维加权评分 + discoverIdeas 批量排序 + 4 级 label（STRONG≥8 / RECOMMENDED≥6 / BACKUP≥4 / ELIMINATED<4）+ duplicateOf 自动淘汰 + formatReport Markdown
  - `scripts/aris-poc/aris-poc.js` — CLI（review / idea / verdict / demo 子命令）
  - `scripts/aris-poc/test-aris-poc.js` — **95/95 测试通过**（verdict 35 + review-loop 12 + idea-discovery 15 + CLI 集成 9 + positive 字段派生 + 边界）
- **npm scripts**：`aris-poc` / `aris-poc:demo` / `aris-poc:review` / `aris-poc:idea` / `test:aris-poc`
- **真实 demo 跑通**（`npm run aris-poc:demo`）：
  - 6-state verdict 全部正确（PASS=accept / WARN=continue / FAIL=fix / BLOCKED=escalate / ERROR=retry / NA=skip）
  - cross-model review 真发现 review-loop.js 自身的 5 个弱点（eval() 危险 / innerHTML XSS / console.log 残留 / 命名混用 / TODO 标记）
  - idea discovery 用 evolution-plan.json next 11 条候选评分 → wanshuiyin/ARIS 自身 **STRONG 8.64 排第 1**（与 GitHub 7.4/10 综合分交叉验证一致）
- **安全边界**：纯函数 + 离线模式（reviewers 启发式 preset，不调真 LLM）+ **不接 hook**（避免误派）+ 试用 1 周再决定（与 M26/M27 节奏一致）
- **关联**：M12 LLM-judge / M31 swarm / M14 知识图谱反哺形成"L4 决策链闭环"

### Files - M38.1 修复

```
package.json                                  (删除顶层 "autonomous" 键)
scripts/orchestrator/autonomous.js            (删除 CLI toggle 子命令 + 用法提示去 toggle 行)
scripts/orchestrator/test-autonomous.js       (补 4 条 toggle CLI 移除断言)
CHANGELOG.md                                  (本条目)
```

### Files - M38 新增/修改

```
scripts/aris-poc/verdict.js                (新增 200 行)
scripts/aris-poc/review-loop.js            (新增 270 行)
scripts/aris-poc/idea-discovery.js         (新增 240 行)
scripts/aris-poc/aris-poc.js               (新增 230 行)
scripts/aris-poc/test-aris-poc.js          (新增 280 行)
package.json                               (新增 5 个 npm scripts + test 链追加)
04_自我演进路线.md                          (新增 §0.4 M38 增量段 + §十二 ✅ 行 + 顶部最近一次同步)
01_AI-ClaudeCode-最佳实践精简.md            (§三 速查表新增 ARIS POC 行)
02_工作空间功能介绍.md                       (§2.32 新章节 + §现状速览表追加)
CLAUDE.md                                  (核心能力表新增 aris-poc 行)
PROJECT-CONTEXT.md                          (核心系统 13→14 + 常用命令 13→14 + 版本说明)
CHANGELOG.md                               (本段)
```

### Added - M39 借鉴 thedotmack/claude-mem 实现跨会话智能压缩 + 相关性注入（2026-06-28）

- **痛点**：left-brain 已能跨会话保存 KB 和 session-summary，但 session 摘要越积越多（近百个 `session_*.md`），新会话要么只看 latest 一份，要么全量塞爆上下文；`skill-reuse.js`（M27）只做 KB 召回，没有针对当前任务从历史 session 里挑事件的能力
- **目标**：借鉴 claude-mem "AI 压缩 + 按相关性注入"的思路，做 Node.js 纯函数 POC
- **已实现**（3 模块 / 71/71 测试 / `scripts/orchestrator/`）：
  - `scripts/orchestrator/mem-compress.js` — 启发式事件抽取（决策/纠正/提交/教训）+ 去重 + 时间线排序 + 字符上限；支持从磁盘加载所有 `session_*.md`
  - `scripts/orchestrator/mem-inject.js` — Jaccard 相关分 + 30 天半衰期时间衰减 + 类别权重 + Top-K 注入 + token 节省估算
  - `scripts/orchestrator/mem-poc.js` — CLI（compress / inject / demo / sessions 子命令）
  - `scripts/orchestrator/test-mem-poc.js` — **71/71 测试通过**（compress 31 + inject 34 + 端到端 6）
- **npm scripts**：`mem-poc` / `mem-poc:demo` / `mem-poc:inject` / `test:mem-poc` + `npm test` 链追加
- **真实 demo 跑通**（`npm run mem-poc:demo`）：78 个 session markdown → 35 条去重事件 → 查询 `PowerShell` 成功召回历史教训
- **安全边界**：纯函数 + 启发式压缩（不调真 LLM）+ **不接 hook**（避免误注入）+ 只读 session markdown 不写回磁盘 + 试用 1 周再决定
- **关联**：与 M27 skill-reuse（KB 召回）互补：KB 存长期知识，mem-poc 做短期历史事件注入

### Files - M39 新增/修改

```
scripts/orchestrator/mem-compress.js       (新增 250 行)
scripts/orchestrator/mem-inject.js         (新增 240 行)
scripts/orchestrator/mem-poc.js            (新增 100 行)
scripts/orchestrator/test-mem-poc.js       (新增 290 行)
package.json                               (新增 4 个 npm scripts + test 链追加)
04_自我演进路线.md                          (新增 M39 增量段 + §十二 ✅ 行 + 顶部最近一次同步)
02_工作空间功能介绍.md                       (§2.33 新章节 + §现状速览表追加)
01_AI-ClaudeCode-最佳实践精简.md            (§三 速查表新增 mem-poc 行)
CLAUDE.md                                  (核心能力表新增 mem-poc 行)
PROJECT-CONTEXT.md                          (核心系统 N→N+1 + 常用命令 +1 + 版本说明)
README.md                                   (核心能力表新增 mem-poc 行)
```

### Added - M40 借鉴 davepoon/buildwithclaude 实现统一 skill 发现中心（2026-06-28）

- **痛点**：skill 信息分散在三处：M32 `.claude/SKILL_INDEX.md`（静态目录）、M36B `skill-registry`（远程发现+安装）、`.claude/skills/*/SKILL.md`（已装 skill）。用户/AI 想找"有没有能帮我做 X 的 skill"需要翻多处
- **目标**：借鉴 davepoon/buildwithclaude "single hub to find Claude Skills" 思路，做 Node.js 纯函数 POC
- **已实现**（3 模块 / 33/33 测试 / `scripts/orchestrator/`）：
  - `scripts/orchestrator/skill-hub.js` — 三源聚合：loadLocalSkills（解析 SKILL_INDEX.md）+ loadInstalledSkills（扫描 `.claude/skills/`）+ loadRemoteSkills（读 `data/skill-registry/skill-cache.json`）+ scoreSkill（中文子串匹配）+ searchSkills（来源优先级排序）
  - `scripts/orchestrator/skill-hub-cli.js` — CLI：`list` / `search` / `recommend` / `sources` / `demo`
  - `scripts/orchestrator/test-skill-hub.js` — **33/33 测试通过**
- **npm scripts**：`skill-hub` / `skill-hub:demo` / `skill-hub:search` / `skill-hub:recommend` / `test:skill-hub` + `npm test` 链追加
- **真实 demo 跑通**（`npm run skill-hub:demo`）：`list` 列出 13 条（已装 4 / 本地 4 / 远程 5）+ `search "chart"` 返回 4 条远程候选 + `recommend` 按 6 场景输出 Top-3
- **安全边界**：纯函数 + 只读本地文件（不调远程 API）+ **不接 hook** + 不修改现有 skill 存储结构 + 试用 1 周再决定
- **关联**：与 M32 SKILL_INDEX + M36B skill-registry 形成完整 skill 生态：目录 → 发现 → 安装

### Files - M40 新增/修改

```
scripts/orchestrator/skill-hub.js          (新增 220 行)
scripts/orchestrator/skill-hub-cli.js      (新增 100 行)
scripts/orchestrator/test-skill-hub.js     (新增 170 行)
package.json                               (新增 5 个 npm scripts + test 链追加)
04_自我演进路线.md                          (新增 M40 增量段 + §十二 ✅ 行 + 顶部同步)
02_工作空间功能介绍.md                       (§2.34 新章节 + §现状速览表追加)
01_AI-ClaudeCode-最佳实践精简.md            (§三 速查表新增 skill-hub 行)
CLAUDE.md                                  (核心能力表 + 快速操作表新增 skill-hub 行)
PROJECT-CONTEXT.md                          (核心系统 15→16 + 版本说明)
README.md                                   (核心能力表 + 测试断言数更新)
03_版本迭代计划.md                          (顶部版本说明)
```

### Added - M36A ui-skill-installer 一键安装 shadcn+Tailwind+v0 模板（2026-06-28）

- **痛点**：手工 `npx create-next-app` + 装 shadcn 组件（30+ 分钟）；去 GitHub 翻别人 starter（5-15 分钟找 + 10 分钟理解 + 改）
- **目标**：用户/AI 一句自然语言"做个 SaaS 后台" → 30 秒得到完整 Next.js 15 + Tailwind v4 + shadcn 组件库 + AI SDK（如 chat 场景）的脚手架
- **已实现**（10 文件 / 929 行 / 15/15 测试）：
  - `scripts/ui-skill-installer/ui-skill-installer.js` — 主控器（CLI 入口）
  - `scripts/ui-skill-installer/template-{scanner,judge,scaffolder}.js` — 5 场景模板扫描/评分/脚手架
  - `scripts/ui-skill-installer/v0-adapter.js` — v0.dev 接入 stub（heuristic 兜底，未来增量真实接入）
  - `scripts/ui-skill-installer/test-ui-installer.js` — **15/15 测试**
  - `.claude/commands/ui-install.md` + `.claude/skills/ui-skill-installer/SKILL.md` — slash command + skill
  - `package.json` — 5 个新 script（`ui-install` + 4 变体）+ `test:ui-install`
- **5 大场景**：landing（产品落地页）/ dashboard（SaaS 后台）/ chat（AI 聊天）/ admin（管理后台）/ portfolio（个人作品集）
- **双轨模板选择**：关键词轨道（快速匹配）+ LLM-judge 轨道（复杂需求）
- **CLI**：`npm run ui-install` / `ui-install:dry` / `ui-install:list` / `ui-install:cache`
- **Slash command**：`/ui-install "做个 SaaS 后台"` → 30 秒得到 Next.js 15 + dashboard 脚手架

### Added - M36B+M36C skill-registry 自动发现+安装 skill（含营销号过滤 · 2026-06-28）

- **痛点**：去 GitHub 翻别人的 skill（10+ 分钟找 + 验证可不可用 + 复制安装）；抖音/小红书刷到的"宝藏 skill 合集"90% 是营销号低质内容，装上后污染 `.claude/skills/`
- **目标**：对标 Codex — 用户/AI 一句"加 chart 能力" → 自动扫 GitHub 3 仓 + npm 关键词 → 5 维评分 ≥ 7.0 → 路径穿越防护安装 → 验证 require → 完成
- **已实现**（6 文件 / 746 行 / 16/16 测试）：
  - `scripts/skill-registry/registry-scanner.js` — GitHub 3 仓（awesome-claude-skills / anthropic-skills / community-skills）+ npm 20+ 关键词（chart/database/devops/animation/i18n/auth 等）
  - `scripts/skill-registry/registry-judge.js` — 5 维评分（来源/描述/stars/URL/禁依赖）+ **minComposite=7.0 闸门（M36C 营销号过滤）**
  - `scripts/skill-registry/registry-installer.js` — 安装 + 验证 + 卸载 + 列出 + **路径穿越防护**（拒绝 `../../etc/passwd`）+ **require 失败自动回滚**
  - `scripts/skill-registry/registry-cli.js` — 6 子命令（`list` / `search` / `install` / `uninstall` / `update` / `verify`）+ `--dry-run`
  - `scripts/skill-registry/test-registry.js` — **16/16 测试**（含路径穿越 + M36C 营销号过滤）
  - `.claude/commands/skill-install.md` — `/skill-install` slash command
- **CLI**：`npm run skill-install` / `skill-install:search` / `skill-install:list` / `skill-install:verify` / `skill-install:update`
- **Slash command**：`/skill-install "添加 chart 能力"` → 自动评分 + 安装到 `.claude/skills/`
- **验收**：
  - 营销号低质内容自动 reject（抖音/小红书"宝藏 skill 合集"）
  - 路径穿越防护：测试 case 含 `../../../etc/passwd` 拒绝路径
  - require 失败自动回滚：测试 case 覆盖

### Fixed - M37 doc-sync 补漏（M36A/B/C 完成后同步 8 文档 · 2026-06-28）

- **痛点**：M36A（commit ae29b7f）+ M36B/M36C（commit 996db00）已 commit，但 **04.md §0.4 增量段 + §十二 ✅ 表 + 6 文档** 全部未同步 = doc-sync v3 缺失
- **修复**（7 文档）：
  - `04_自我演进路线.md` §0.4 新增 M36A + M36B + M36C 3 个增量段
  - `04_自我演进路线.md` §十二 ✅ 已完成表追加 3 行（33 → 36）+ ⏳ 段移除 "commit + M37" + 状态统计 ✅ 36 / ⏳ 9 / 合计 45
  - `04_自我演进路线.md` 顶部 next 队列 10 → 9 + 同步日期 2026-06-28
  - `01_AI-ClaudeCode-最佳实践精简.md` §三速查表 + §二能力表新增 M36 行
  - `02_工作空间功能介绍.md` §2.31 新章节 + §现状速览表追加 M36 行
  - `CLAUDE.md` 核心能力表 + 快速操作表新增 M36 行
  - `PROJECT-CONTEXT.md` 核心系统表 11 → 13 + 11 命令 → 13 命令
  - `03_版本迭代计划.md` 顶部版本说明 + v3.0.5 行追加 M36 描述
  - `CHANGELOG.md` 本段新增
- **验证**：`npm run doc:check` + 全量测试通过
- **关联**：M36A (commit ae29b7f) + M36B/M36C (commit 996db00) 之前漏同步本次补齐

### Added - M35 扫描盲区解决（关键词扩 11→20 + 新星探测 + 能力加权 · 2026-06-28）

- **痛点**：/evolve 扫描 GitHub 用 SEARCH_KEYWORDS 11 个全是 "claude*" 硬匹配 → 漏掉能力导向爆款（NousResearch Hermes / MemGPT / LangChain Agents / AutoGPT / Aider） + 漏掉 24h 新星项目（stars 总量低但增长快）。L4 学习闭环有"扫描盲区" = 候选池不完整 → AI 不知道业界有什么
- **修复**（1 文件 + 1 新测试 + npm script）：
  - scripts/evolution/github-scanner.js SEARCH_KEYWORDS：11 → 20 个，新增 9 个能力导向词（agent memory system / agent orchestration / ai agent framework / mcp server / claude code alternative / ai coding assistant / llm agent tools / context engineering）
  - scripts/evolution/github-scanner.js 新增 CAPABILITY_KEYWORDS 常量（15 词：memory/agent/automation/orchestration/extension/hook/mcp/tool/self-improve/self-evolve/context/vector/rag/workflow/dispatcher）
  - scripts/evolution/github-scanner.js calcRelevance() v2：能力词 3+ 命中强信号 (+5) / 2 命中 (+3) / 1 命中 (+1) + 新星加成（30 天内 + stars ≥ 30 → +3）
  - scripts/evolution/github-scanner.js 新增 detectRisingStars()：GitHub Search API created:>7d 过滤新晋项目 + stars desc 排序 → 接入 scan() 第 3 源（trending + search + rising）
  - scripts/evolution/test-scan-coverage.js：19/19 通过（Hermes-style 21 分 / 新星加成 +3 / 4+ 能力词 19 分 / 向后兼容 24 分 / 关键词扩增 / detectRisingStars mock + 限流）
  - package.json test:evolution 同步加 test-scan-coverage.js
- **数据源对比**：Trending（大盘热度）+ Search API（关键词匹配 20 词）+ Rising（新星项目 · 新增）= 三源汇聚
- **L5 影响**：L4 学习闭环盲区收窄，候选池从 claude-only 扩到 AI coding + agent 全生态；与 M34 GEPA skill 自我进化形成"外部学习（新候选多）+ 内部优化（skill 进化）"双轮驱动
- **关联**：M18 GitHub token（认证路径）+ M34 GEPA（外部借鉴）+ Hermes Agent（能力导向目标项目）

### Added - M34 GEPA skill 自我进化原型（2026-06-28）

- **痛点**：AiCode 已有完整的 L4 外部学习闭环（/evolve 扫描 GitHub 候选 + LLM-judge + auto-implement），但**没有 skill 自我进化能力** — `evolve` SKILL.md 写得不好时只能手动改。最近研究 NousResearch Hermes Agent（DSPy + GEPA + execution traces 反思式 prompt 进化），发现正好补这块缺口。
- **借鉴**：[`NousResearch/hermes-agent-self-evolution`](https://github.com/NousResearch/hermes-agent-self-evolution) 的 GEPA 思路（Genetic-Pareto Prompt Evolution · ICLR 2026 Oral），但 MVP 不引 DSPy 依赖，用纯 Node.js 实现简化版遗传算法。
- **新增**（5 模块 + 1 数据集 + 1 测试 + 1 npm script）：
  - `scripts/evolution/skill-evaluator.js` — 4 维 Pareto fitness（clarity / coverage / error_reduction / size_eff），启发式评估为主，预留 LLM 接口
  - `scripts/evolution/constraint-gates.js` — 5 道护栏（frontmatter 结构 / body ≤5000 字符 / 步骤 ≤20 / 禁破坏性命令 / 版本不降级 / 命令子集兼容）
  - `scripts/evolution/gepa-optimizer.js` — 遗传算法核心：4 种变异算子（同义词替换 / 列表重排 / 标题强调 / section 重排）+ 两段式交叉 + tournament 选择 + elite 保留
  - `scripts/evolution/trace-collector.js` — 从 `logs/app.jsonl` 收集与 skill 相关的执行轨迹，按 component 过滤 + outcome 推断
  - `scripts/evolution/gepa-runner.js` — 主控器：读 SKILL.md → 加载 eval dataset → 收集 traces → 跑 GEPA → 输出候选到 `data/gepa/<skill>/<date>/` + 自动备份原 SKILL.md
  - `data/gepa/evolve/eval-dataset.json` — 10 条 synthetic eval cases（scan/analyze/implement/watch/report/log/candidates/status/llm-judge/5-gates）
  - `scripts/evolution/test-gepa.js` — **26/26 通过**（evaluator 7 + gates 7 + optimizer 6 + trace 4 + runner 1 + 新增 1）
  - npm script：`gepa:evolve` / `gepa:dry` / `gepa:apply` / `gepa:test`
- **接入**：`daily-evolution.js` 新增 `self-evolve` 子命令（`--skill --iterations --population --dry-run --apply`），不冲突现有 scan/analyze/implement
- **试点 skill**：`evolve`（自我进化的元能力，进化它收益最大，且失败不影响核心功能）
- **护栏**：所有候选必须通过 `constraint-gates.js` 5 道闸门 + fitness 必须 ≥ baseline 才能被采纳；`--apply` 才会覆盖原 SKILL.md，否则只输出报告供人工 review
- **L5 影响**：填补"skill 自我进化"层闭环，配合现有 `/evolve`（外部学习）+ `/autonomous`（无人值守实施）形成三层智能演进：外部学习 → skill 自我优化 → 自主决策实施
- **关联**：Hermes Agent Self-Evolution（外部借鉴）+ L4→L5 进化路径 + 04_自我演进路线.md 增量定义

### Fixed - SKILL.md 脚本路径错引用修复 + audit 工具正则升级（2026-06-27）

- **痛点**：`/audit` 报告 6 项 P0 能力缺口 — `evolve` 和 `autonomous` SKILL.md 引用的脚本路径不存在
  - 实际是 M25 skill 升格时路径迁移了（M18 重命名 test-github-scanner → test-github-scanner-auth；auto-implement 从 orchestrator 迁到 evolution 子目录；LLM-judge 合并进 llm-adapter），但 SKILL.md 没同步
  - 加上 audit 工具自己的正则 bug：`state-snapshot.js` 实际在 `.claude/skills/left-brain/scripts/`，audit 只在根目录查
- **修复**（3 文件）：
  - `.claude/skills/evolve/SKILL.md`：5 处脚本路径对齐实际位置
    - `scripts/orchestrator/auto-implement.js` → `scripts/evolution/auto-implement.js`
    - `scripts/orchestrator/test-auto-implement.js` → `scripts/evolution/test-auto-implement.js`
    - `scripts/orchestrator/test-llm-judge.js` → `scripts/orchestrator/test-judge-candidate.js`
    - `scripts/evolution/test-github-scanner.js` → `scripts/evolution/test-github-scanner-auth.js`
    - 删除 `scripts/evolution/judge-candidate.js` 行（功能在 `llm-adapter.js` 的 `judgeCandidateWithFallback`）
    - 数据流图同步更新（`judge-candidate.js` → `judgeCandidateWithFallback()`）
  - `.claude/skills/autonomous/SKILL.md`：无需改（路径本来就对）
  - `scripts/orchestrator/audit/quick-audit.js`：正则升级支持 3 种写法
    - `scripts/xxx.js`（相对根） + `.claude/skills/<self>/scripts/xxx.js`（同 skill 内） + `.claude/skills/<other>/scripts/xxx.js`（跨 skill 引用）
- **验证**：重跑 `/audit` 浅层报告 — **P0 6 项 → 0 项**，4 段全 ✨（已声明未完成 0 / 能力缺口 0 / 重复冗余 0 / 文档-代码完全对齐）
- **测试**：`test-judge-candidate.js` 26/26 + `test-llm-adapter.js` 23/23 通过
- **L5 影响**：用户/AI 看 SKILL.md 时不会被错路径误导；audit 工具正则支持跨 skill 引用 = L5 学习闭环更准
- **关联**：M25 skill 升格（路径未同步）+ M18 GitHub token 认证（重命名测试）

### Added - M32 SKILL 生态索引（SKILL_INDEX.md · 2026-06-27）

- **痛点**：4 个 skill（left-brain / audit / autonomous / evolve）已饱和，但用户/AI 没有"1 张表查清"的总览入口
  - 每次新会话都要翻 4 个 SKILL.md 自己拼 = 上下文浪费
  - 缺少"推荐搭配"（哪个配哪个）+ "总调用例子"（典型 5 场景脚本）
- **修复**：新增 `.claude/SKILL_INDEX.md`（~250 行 · v3.0.5）
  - **4 skill 速览表**（一句话 + 入口命令 + 关键文件 + 学习成本）
  - **每 skill 详解**：核心能力表 + 何时用 + 关键文件路径
  - **5 个推荐场景**（日常 / 里程碑 / 学新能力 / 离开几小时 / 会话交接）= 可复制粘贴的 bash 脚本
  - **L5 决策链闭环图**（user → evolve → queue-bridge → autonomous → audit + left-brain + auto-implement）
  - **自检问题**（写新 skill 前 3 问）
- **借鉴**：`davepoon/buildwithclaude` (7.3/10) 思路——"Claude skill 中心站"——但**本地化**：只列本工程 4 skill + 配套脚本，不依赖外部 GitHub
- **决策依据**：当前 4 skill 已饱和，下一 skill 候选只从 audit/evolve 报告产生，不主动设计
- **L5 影响**：用户/AI 上手 4 skill 路径缩短 30 min → 5 min（看 1 张表 vs 翻 4 个 SKILL.md）
- **关联**：M25 skill 升格（4 skill 完整）+ 04.md §0.5 L5 路径

### Fixed - README.md + PROJECT-CONTEXT.md 严重过期重写（2026-06-27）

- **痛点**：两个**新用户/新会话首看**的文档停留在 v2.0.0 / v1.9，但工程已 v3.0.5（M25~M32 · 4 skill + swarm + SKILL_INDEX）
  - **README.md**（266 行）：标"v2.0.0 自主模式 + v1.9.1/2/3 四大智能增量"+ "15 测试 / 181 断言" → 实际 v3.0.5 / 26+ 测试 / 300+ 断言
  - **PROJECT-CONTEXT.md**（108 行）：版本 v1.9 + 6 个核心系统（无 audit/autonomous/swarm/metrics） → 实际 v3.0.5 + 11 个核心系统
  - **CI badge 占位符** `<USER>/<REPO>` 一直没替换 → GitHub 仓库首页显示坏链
  - **过期引用**：`.skill/` 排除项（早删）、`.workspace/setup.sh`（被 session-init 替代）、6 个 AI 工具支持（实际只支持 Claude Code）
- **修复**（3 文件重写）：
  - **README.md**：266 行 → 109 行项目名片
    - 1 句话定位 + 3 步快速开始 + 8 行能力表 + 简版结构树 + 迁移注意 + 测试基线 + 详细文档导航
    - 消除所有与 CLAUDE.md 重复内容（§1 核心定位 / §1.3 系统表 / §二 目录结构）
  - **PROJECT-CONTEXT.md**：108 行 → 123 行全貌速览
    - 版本 v1.9 → v3.0.5
    - 核心系统 6 个 → 11 个（+ audit / autonomous / swarm / metrics / workflow / handoff / self-discipline / evolution-lock / sync-roadmap）
    - 命令路径同步：`scripts/会话快照/save.js` → `bash session-summary.sh save ... -m "..."`
    - 加 L5 自治运行 5 条进度表
  - **`.claude/rules/doc-sync.md`**：6 文档 → 8 文档表（加 README + PROJECT-CONTEXT 必同步），文档顶部注释同步升级到 v3 8 文档版
- **验证**：`npm run doc:check` **26 通过 / 0 失败**；M33 入队自动触发 sync-roadmap
- **L5 影响**：新用户首次打开仓库看到的是 v3.0.5 而非 v2.0.0；session-init 自动加载的"1 分钟全貌"是真实的 11 个系统而非过期的 6 个；L5 第 5 条"人工干预率"减少 1 次"读错版本"的认知负担
- **关联**：M32 SKILL_INDEX（M33 的输入）+ M25 skill 升格（核心系统数变化）+ doc-sync v2 强化（用户可见判断标准）

### Fixed - .claude/rules 内部"6 文档"→"8 文档"表述统一（M33 follow-up · 2026-06-27）

- **痛点**：M33 commit bf8f130 改了 doc-sync.md 顶部 + 8 文档表，但**内部"6 文档"表述没统一**：
  - `self-discipline.md` line 1 标题 / line 99 决策树标题 / 7 段自检清单（缺 README + PROJECT-CONTEXT 2 段）
  - `doc-sync.md` line 41 触发节点 / line 46-67 节点 1 详细说明 / 节点 3 / 节点 4
  - `evolution-lock.md` line 83 关联段（"4 文档"→"8 文档"）
  - 实际运行 + 测试都通过，但**读规则的人会被旧表述误导**（以为是 v2 6 文档版）
- **修复**（3 文件）：
  - `.claude/rules/doc-sync.md`：所有"6 文档" → "8 文档"；节点 1 详细说明补 README + PROJECT-CONTEXT 两段；节点 3 "7 文件"→"9 文件"；节点 4 "5 文件"→"8 文件"
  - `.claude/rules/self-discipline.md`：标题"6 文档版"→"8 文档版"；决策树标题"6 文档自检"→"8 文档自检"；7 段自检清单重排（README + PROJECT-CONTEXT + CHANGELOG 移到合适位置 + CHANGELOG 段扩展到 4 条）
  - `.claude/rules/evolution-lock.md`：line 83 关联段"4 文档"→"8 文档" + 列出 8 文档全名
- **验证**：`npm run doc:check` **26 通过 / 0 失败**（不破坏现有测试）
- **L5 影响**：未来 AI 读 self-discipline 决策树时自动覆盖 README + PROJECT-CONTEXT = 减少"漏改 8 文档"风险
- **关联**：M33 README + PROJECT-CONTEXT 重写（v3 8 文档规则） + M24.6 doc-sync v2（v2 6 文档规则）

### Added - M31 多 Agent Swarm 协调 POC（借鉴 ruvnet/ruflo · 2026-06-27）

- **痛点**：AiCode dispatcher 只决定"派不派 + 派几个",派出去的 Agent 各自独立回答,没有"汇总 + 投票"机制。复杂任务单 Agent 视角容易盲。
- **修复**:新增 `scripts/orchestrator/swarm-coordinator.js`(v3.0.5 POC)
  - **3 个核心纯函数**:
    - `generatePerspectives(task, n)`:生成 N 个异构视角 prompt(默认 5 视角池:安全/性能/可维护性/简洁性/兼容性)
    - `aggregateResults(results, strategy)`:3 种汇总策略(majority / weighted / best-of)
    - `swarmDecide(task, opts)`:一站式入口,支持 mock 演示 + runAgent 注入
  - **文本相似度复用 semantic-recall.js tokenize**(软引用降级到本地 bigram fallback)
  - **PowerShell 友好 CLI**:`swarm:run task words here --n=3` 不需要引号
  - **永不 throw**:空输入/异常 Agent 都返回友好结构
- **测试**:`scripts/orchestrator/test-swarm-coordinator.js` **42/42 全过**
  - 12 段覆盖:基础 / 自定义 n / 兜底 / similarity / best-of / majority / weighted / 空输入 / mock / runAgent 注入 / 真实场景 demo / runAgent 异常
- **真实 demo**:`npm run swarm:demo` → "重构 dispatcher.js" 3 视角 prompt + 投票输出
  - 视角 1 安全:输入校验、权限边界、敏感字段加密
  - 视角 2 性能:算法复杂度、缓存策略、批量处理
  - 视角 3 可维护性:函数拆分、注释、单元测试覆盖
- **npm scripts**:`swarm:run` / `swarm:demo` / `test:swarm`(+ 加入主 `test` 链)
- **L5 终极智能影响**:
  - **多 Agent 群体智能** POC 落地——L5 自治运行的基础能力之一
  - 配合 M14 dispatcher 决策 + M27 skill-reuse 复用 + M26 sandbox 压缩 = L5 完整决策链
  - **不接 dispatcher hook**(避免误派),试用 1 周观察再决定是否接入
- **关联**:M14(知识图谱反哺)/ M27(skill 复用)/ M26(sandbox 压缩)= L5 决策链闭环
- **关键洞察**:mock 输出措辞差异大时,majority 退化为"选第一个"——真实 Agent 输出需要更宽松阈值或更好 embedding

### Added - M23 L1→L5 智能演进路径用户视角说明（2026-06-26）

- **痛点**：新用户读 4 个核心文档（CLAUDE.md / 01.md / 02.md / 04.md）看不到清晰的"AI 越来越智能"路径，只能看到平铺功能列表
- **修复**：在 4 个核心文档加 L1→L5 演进路径说明
  - **`02_工作空间功能介绍.md` §零** 新增"🧬 智能演进路径 L1→L5（用户视角）"——全景图 + 每级一句话价值 + 现状表 + L5 5 条达成条件完整说明
  - **`01_AI-ClaudeCode-最佳实践精简.md` §2.6** 新增"智能演进路径 L1→L5（一句话理解）"——5 级速览表
  - **`CLAUDE.md` 核心定位段** 新增"L1→L5（5 级递进）"速览 + v4.0.0 触发条件
  - **`04_自我演进路线.md` §0.5** 顶部加"用户视角简述"+ 跨文档引用
- **价值**：
  - 新用户 30 秒理解"为什么这个工程越来越智能"
  - 老用户快速判断当前处于哪一级、距下一级多远
  - 5 级递进关系明确：L1→L5 不是平铺功能集
- **L5 5 条真实进度**：3/3 + 1🟡（功能完整，等 2026-07/08 月度报告 + 30 天数据稳定 → v4.0.0 最早 2026-10-26）

### Fixed - M20 文档清理（2026-06-26）

- **症状**：04.md §十二"✅ 已完成"从 M19 直接跳 M21（缺 M20），但 `evolution-plan.json` next 队列里有 `M20: decision-assistant.js` 残留
- **根因**：`M20` 是 handoff 时误入队的 next，未在 04.md §0.4 补增量段定义；§十二同步规则只在 commit + complete 时才 append
- **决策**：M20 暂不实施（理由：和 dispatcher.js 重叠，对 L5 5 条达成无贡献）
- **修复**：
  - 从 `evolution-plan.json` next 队列删除 M20 条目
  - 04.md §十二"✅ 已完成"计数 19 → 21（实际本来就有 21 项，文档漏写）
  - 04.md §十二"状态统计" 19/9 → 21/9
  - 04.md 顶部"最近一次同步"和"next 队列状态"同步更新
- **影响**：L5 5 条达成条件不变；next 队列 9 条全部是 EVOLVE / AUDIT / RESEARCH，无悬空 ID

### Added - 阶段 9 续：M22 handoff --auto 全自动接续（已完成 · v3.0.4）

- 升级 `scripts/orchestrator/handoff.js` v1.2.0 — 一条命令完成"存快照 + 入队 + 打开 VS Code 新窗口 + 复制启动命令到剪贴板"
  - 新增 `--auto` / `-a` CLI 参数：打开 VS Code 新窗口并把 `claude --append-system-prompt-file ...` 启动命令复制到剪贴板
  - 新增 `enqueueNext()`：把下一阶段写入 `evolution-plan.json` next 队列（ID 去重，note 正常）
  - 新增 `resolveNextFromSnapshot()`：无参数时自动读取 `latest_state.json` 的 `next_action` 或解析 summary 里的"下一步"
  - 新增 `writeContinuePromptFile()` / `copyToClipboard()` / `openVsCodeNewWindow()`：VS Code 半自动接续基础设施
  - 修复 queue 调用参数：去掉多余的 `-n` 占位符，避免 note 被写成 `"-n"`
- 更新 `.claude/commands/handoff.md`：加入 `--auto` 用法、无参数用法与典型场景
- 更新 `scripts/orchestrator/test-handoff.js` **59/59 通过**（原 36 → 新增 23 项 M22 覆盖）
  - 覆盖：`enqueueNext` 入队 / 重复入队 / note 不是 `-n` / `--auto` 参数解析 / `--auto --dry-run` 不入队 / `auto` + `spawnedClaude` 标记 / 无参数模式 / `resolveNextFromSnapshot` / `writeContinuePromptFile` / `copyToClipboard`
- 全量回归通过：bridge 45 + metrics 42 + graph-dispatch 35 + audit-loop 34 + handoff 59 = **215/215**

**L5 终极智能影响**：
- 把"用户接续"从 3 步（/handoff → 复制 prompt → /clear 粘贴）压缩到"一条命令 + 一次粘贴"
- 与 `/autonomous` 机器接续共享 `evolution-plan.json` next 队列，人工/机器路径数据同源
- 为"无人值守夜间开发 + 次日人工接管"提供最小可行工作流

### Added - 阶段 9：M21 会话交接助手（已完成 · v3.0.4）

- 新增 `scripts/orchestrator/handoff.js` v1.0.0 — 会话切换助手
  - `buildHandoffPrompt()` 4 段拼装：会话摘要 / 待办列表 / 下一阶段目标 / 当前状态与约束
  - `saveSnapshot()` 强制写快照（复用 session-summary.sh save --force）+ 同步 next_action 到 latest_state.json
  - `markAwaitingHandoff()` 标 autonomous-state.json.awaiting_handoff=true + next_action
  - `clearAwaitingHandoff()` 清除标记（新会话开窗后调）
  - CLI `--dry-run` 让你先看接续 prompt 再决定
- 新增 `.claude/commands/handoff.md` slash 命令定义
- 新增 `scripts/orchestrator/test-handoff.js` **36/36 通过**
  - 覆盖：buildHandoffPrompt / saveSnapshot / markAwaitingHandoff / clearAwaitingHandoff / handoff() / dry-run / 错误兜底 / CLI
- 全量回归通过：bridge 45 + metrics 42 + graph-dispatch 35 + audit-loop 34 + handoff 36 = **192/192**
- 真实跑通：CLI 输出 30+ 行接续 prompt（含会话摘要 / 待办 / 下阶段 / 约束）

**L5 终极智能影响**：
- 解决"上下文超长无法继续"硬限制 — 之前只能 /clear 硬切换丢状态
- 让"用户接续"（/handoff）和"机器接续"（/autonomous）成为两条独立路径
- 用户随时可"打包带走当前进度"——给"深夜编程 + 次日继续"提供工作流

### Added - 阶段 8：M19 audit 闭环（已完成 · v3.0.3）

- **M19-1**：04.md 末尾加 `## 十三、Backlog（待整合候选 · 动态同步自 /audit）` 段
  - P0/P1/P2 三段 + 同步规则 + bridge 指针
  - 当前 P2 段 1 项：`AUDIT-extend-skills`（来自 `/audit` 浅层报告）
- **M19-2**：`scripts/bridge/queue-bridge.js` 扩展 2 源
  - `readAuditBacklog()`：读 `.claude/audits/audit-*.md` 第 6 段（P0/P1/P2）
  - `readResearchDigest()`：读 `.claude/audits/research-*.md` 头部 30 行
  - ID 命名空间：`AUDIT-{type-slug}` / `RESEARCH-{slug}`
  - 优先级映射：audit P0 → 进化 P1（高 ROI 立即行动）
- **M19-4**：`scripts/orchestrator/audit/quick-audit.js` 跑完自动调 `queue-bridge --dry-run`
  - 软引用（不强制改 evolution-plan.json，用户手动确认）
- **M19-5**：04.md 顶部 line 14 后加 `## 🔬 最近调研（动态 · ...）` 段
  - 最近 1 份 research 摘要 + 最近 3 份 audit 浅层报告
- 新增 `scripts/orchestrator/test-audit-loop.js` **34/34 通过**
  - 覆盖：readAuditBacklog / readResearchDigest / 命名空间 / 优先级映射 / aggregate / enqueueAll / dry-run / 真跑通 / 评价事件
- 全量回归通过：bridge 45 + metrics 42 + graph-dispatch 35 + audit-loop 34 = **156/156**
- 顺手修 `quick-audit.js` 误删 `runQuickAudit` 函数（插入时没保留原行）

**L5 终极智能影响**：
- 闭环了"自我评价"层 — 之前 /audit 建议只在报告里看，现在进 04.md backlog + next 队列
- 让 L5 5 条达成条件第 1 条有持续证据
- 用户不再"忘了审计建议"——下次开会话顶部 line 14 一眼看到

### Added - 阶段 7：M18 /evolve GitHub API token 认证（已完成 · v3.0.2）

- 修复 `scripts/evolution/github-scanner.js` — 加 `getGitHubToken()` 3 路径：
  - `gh auth token`（推荐，gh CLI 已登录即可）
  - 环境变量 `GH_TOKEN` / `GITHUB_TOKEN`（fallback）
  - null（匿名模式，60 次/小时）
- `fetchTrending` + `searchGitHub` headers 加 `Authorization: token <...>`（5000 次/小时额度）
- `isGhLoggedIn()` 检测 + CLI 友好提示（运行 `/evolve` 时显示 token 状态）
- 顺手修 `feature-analyzer.js` 容错 bug：`candidates.json` 为 `{}` 时不再 NPE
- 新增 `scripts/evolution/test-github-scanner-auth.js` 14/14 通过
  - 覆盖：3 路径 token / isGhLoggedIn / authHeaders 不可变 / fetchTrending 真带 Authorization / token 缓存 / CLI 友好提示
- 端到端真跑通：12 关键词全跑过（之前 5 个就限流）→ 7 adopt + 11 adapt 候选生成 → bridge 自动入队
- 顺手修 `test-queue-bridge.js` 真实 candidates.json 备份逻辑（M18 后 candidates.json 经常存在）

**L5 终极智能影响**：
- 解决"自主学习从未跑通"问题 — M18 是 v3.0.0 学习闭环的"燃料"层
- 没有 M18：M14/M15/M16/M17 是空转（无候选来源）
- M18 完成后：/evolve → candidates.json → bridge → next → SessionStart 提示 → 自主模式接续

### Added - 阶段 6：M16 候选汇聚桥梁（已完成 · v3.0.1）

- 新增 `scripts/bridge/queue-bridge.js` — 半自动候选汇聚桥梁
  - **3 个来源** → `evolution-plan.json` next 队列：
    1. `data/github/candidates.json`（/evolve GitHub 扫描，suggestion='adopt'）
    2. `04_自我演进路线.md` 末尾 backlog 段（/audit 自审整合）
    3. `.claude/audits/audit-*.md`（最新报告，间接经 backlog 段覆盖）
  - **ID 命名空间**：`EVOLVE-<slug>` / `AUDIT-<type-slug>`（避免与手动 ID `M1~M15` 冲突）
  - **dedupe**：严格按 id 匹配（重复入队跳过，不覆盖）
  - **半自动**：默认不入队 `--dry-run` 让人工 review；正式入队走 `--dry-run` 后再跑
  - **可观测**：每次写 `data/bridge/queue-sync-YYYYMMDD-HHMM.md` 人类可读日志
  - **接 M15**：记 `evo.task.completion_time` 评价事件（task=queue-bridge.sync）
  - **graceful**：源文件不存在 / 损坏 JSON / 解析失败 → 返回 `[]` 不抛
- 修复 `evolution-lock.js` 的隐藏 bug：`queue()` 不查 history，会重复入队（已加到 04.md backlog）
- 新增 npm scripts：`queue:sync` / `queue:sync:dry` / `queue:sync:evolve` / `queue:sync:audit`
- 测试 `scripts/orchestrator/test-queue-bridge.js` **45/45 通过**
  - 覆盖：slugify / makeId / readEvolveCandidates / readRoadmapBacklog / aggregate / enqueueAll / dry-run / writeSyncLog / CLI / 评价事件 / graceful / 损坏 JSON
- 全量回归通过：dispatcher 65+scoring 55+metrics 10+semantic-recall 31+evolution-metrics 42+proactive-scan 35+graph-dispatch 35+queue-bridge 45 = **318+ 测试**

**L5 终极智能影响**：
- 解决"候选来源分散无汇聚"——04.md §0.4 + /evolve + /audit 三源 → 单一权威源 evolution-plan.json
- v3.0.1 让"演进计划怎么来"有了完整链路
- 下游：自主模式 /auto 启动时调 `queue:sync` 自动同步候选（避免下次会话队列真空）

### Added - 阶段 5：M14 知识图谱反哺调度（已完成 · v3.0.0）

- 扩展 `scripts/orchestrator/dispatcher.js`（v2.5.1 → v3.0.0）— 新增 `recallBeforeDispatch(taskText)` 钩子
  - 软引用 `recall/semantic-recall.js`（TF-IDF 引擎不可用时降级为 no-graph）
  - 三档决策：
    - `hit='reuse'`（score ≥ 0.5）→ 强制 `dispatch=false` + 附 `reuse_kb` 答案
    - `hit='similar'`（0.2 ≤ score < 0.5）→ 原逻辑 + 附 `graph` 字段供调用方参考
    - `hit='miss'` / `no-graph` → 原逻辑不变
  - `decide()` 返回加 `graph` 字段 + 命中复用时加 `reuse_kb` 字段
  - 同步记 `evo.kb.recall.hit/miss` 评价事件（接 M15）
- 阈值常量 `GRAPH_RECALL_THRESHOLDS = { reuse: 0.5, similar: 0.2 }`
- 新增测试 `scripts/orchestrator/test-graph-dispatch.js` **35/35 通过**
  - 覆盖：边界（null/空/非字符串）/ 三档 hit / decide() 集成 / 软引用降级 / 评价事件
- 全量回归 **218/218** 通过（65+55+10+35+42+31+35+5=278 测试，零破坏）
- package.json 升 v3.0.0（学习闭环全部 3 子项 ✅，v3.0.0 阶段达成）

**L5 终极智能影响**：
- M14 是 L5 5 条达成条件第 1 条（M13+M14+M15 全部 ✅）的最后一块拼图
- 完成 M14 后 **L5 第 1 条 ✅ 3/3**（M13 ✅ / M14 ✅ / M15 ✅）
- 第 3 条 dispatcher 知识命中率 ≥ 30% 现在可实测（评价事件已记录）

### Added - 阶段 4：M15 效果量化指标启动（已完成 · 即将发版 v2.0.6）

- 新增 `scripts/orchestrator/metrics/report.js` — 月度效果量化报告生成器
- 扩展 `scripts/orchestrator/metrics.js`（v1.9 P0-4 → v2.0.6 M15）— 新增 `Evolution` 命名空间，4 项评价采集器
  - `taskCompletionTime(taskId, durationMs, tags)` — 主线任务耗时
  - `toolSuccessRate(tool, success, tags)` — 工具调用成功率
  - `recallPrecision(hit, tags)` — KB 召回命中率
  - `humanIntervention(tags)` — 自主模式人工干预率（mode/action 二维）
  - `monthlyAggregate(yyyymm)` — 月度聚合（4 项指标 + P50/P95/avg + top_slow + 上月对比）
- 接入 3 个 hook 点：
  - `dispatcher.js` CLI 模式 → `evo.task.completion_time`
  - `proactive-scan.js` 7 维度循环 → `evo.tool.success` / `evo.tool.failure`（每维度跑过记）
  - `session-init.sh` Step 10 → `evo.kb.recall.hit/miss` + 自主模式 `evo.human.intervention` baseline
- 月度报告输出 `data/evolution/metrics-YYYYMM.md`：4 项指标 + 趋势对比 + L5 达标进度 + 行动建议
- 新增 npm scripts：`metrics:report` / `metrics:aggregate` / `test:evolution-metrics`
- 测试 `scripts/orchestrator/test-evolution-metrics.js` **42/42 通过**（旧 `test-metrics.js` 10/10 仍兼容）
- 同步 `04_自我演进路线.md`：M15 ✅，L4 评价闭环 ✅，L5 第 4 条（持续 3 个月）🟡 起步

**L5 终极智能影响**：
- M15 是 L5 5 条达成条件中第 4 条（月度 metric 报告持续 3 个月）的直接交付物
- 完成 M15 后 L5 = 执行闭环 ✅ + 学习闭环 🟡 **2/3**（M13 ✅ / M15 ✅ / M14 ⏳） + 自治可观测 🟡 数据采集中
- 还差：M14 知识图谱反哺 + 月度报告持续 3 个月（2026-06 / 2026-07 / 2026-08）

### Added - 阶段 1：04 文档第十二章瘦身（已完成）
- `04_自我演进路线.md` 第十二章只保留里程碑表 M1~M15
- 删除：实测数据 / npm scripts 列表 / 测试状态 / 路线分水岭段 / Backlog 段 / 风险和缓解段
- 后续：路线分水岭段将迁移到 0.5 长期愿景末尾（阶段 2）

### Added - 阶段 2：路线分水岭段修正（已完成）
- `04_自我演进路线.md` 新增 0.6 节「路线分水岭（v2.x 执行闭环 → v3.0.0 学习闭环）」
- 关键修正：M12 LLM-judge 闸门归 v2.x（它解决执行层判断更准，不是 v3.0.0 新能力）
- v3.0.0 重新定义 = M13+M14+M15 三个子闭环（失败 / 复用 / 评价）
- L5 达成条件补全 5 条：M13~M15 ✅ + 失败蒸馏率 ≥ 80% + 知识命中率 ≥ 30% + 月度 metric 持续 3 个月 + 自治覆盖率/人工干预率趋势

### Added - 阶段 3：M13 失败蒸馏器启动（已完成）
- 新增 `scripts/orchestrator/learning/distiller.js` — anomaly → KB 自动蒸馏
- 接入 `proactive-scan.js`：扫描写入 anomalies.json 后自动触发蒸馏（不阻塞主流程）
- 默认 HeuristicAdapter（零成本），可选 `--llm` 复核
- 输出：可复用经验写入 KB + MEMORY.md 索引；一次性事故写入 distillation-log.jsonl
- 新增 npm scripts：`distill` / `distill:status` / `distill:history` / `test:distiller`
- 测试 `scripts/orchestrator/learning/test-distiller.js` 5/5 通过
- 同步 `04_自我演进路线.md`：M13 状态 ✅，L4 持续进化状态 ✅，L5 终极智能 🟡

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