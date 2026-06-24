# Changelog

> 所有版本变更记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [v1.9.1] - 2026-06-24

### 🧠 Changed - 智能演进：自我反思（增量 A）

v1.9.1 是 v1.9 之后的"**智能增量首发版**"，围绕用户终极愿景"让 Claude 日常开发越来越智能、越来越主动"启动。
**核心理念**：把"用户当裁判"改为"AI 写完代码自己检查"。

### Added - 自我反思引擎（4 个内置规则）

| 规则 | 触发 | 检测 |
|:-----|:-----|:-----|
| `code-completeness` | Edit/Write *.js | console.log 残留 / debugger 断点 / 大括号不匹配 |
| `test-trigger` | Edit/Write 非 test-*.js | 提醒对应 test 文件是否需更新 |
| `todo-scan` | Edit/Write *.js | TODO/FIXME/XXX/HACK 标记 |
| `doc-version` | Edit/Write *.md | 过时版本号（v1.0/v1.5/v1.2 等）|

### Changed

- **PostToolUse hook** 从占位改为调用 `self-reflect.js`（永不阻塞主流程）
- **`session-init.sh`** Step 5 顶部展示最近 5 条反思反馈
- **04 自我进化循环系统设计文档**：升级为"自我进化+智能演进纲领"，加入核心使命 + 三大智能增量路线

### Files

- 新增：`scripts/orchestrator/reflection/self-reflect.js`（核心引擎）
- 新增：`scripts/orchestrator/reflection/test-self-reflect.js`（38/38 通过）
- 修改：`.claude/skills/left-brain/scripts/posttool-hook.sh`（接入自检）
- 修改：`.claude/skills/left-brain/scripts/session-init.sh`（顶部展示反馈）
- 修改：`04_自我进化循环系统设计.md`（增量 A 标完成）
- 修改：`package.json`（npm test 接入）
- 修改：`.gitignore`（排除 reflections.jsonl）

### 真实运行效果

- 捕获 2 条反思：console.log 残留 + TODO×1
- Step 5 顶部正确显示反思条目
- npm test 全部通过（19 个测试文件）

### 下一步

- 增量 B：智能任务规划（planner 升级 + plan/act 协议）
- 增量 C：主动发现问题（SessionStart anomaly scan）

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