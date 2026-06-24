# Changelog

> 所有版本变更记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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