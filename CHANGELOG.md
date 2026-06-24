# Changelog

> 所有版本变更记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

### 🤖 Added - 自主模式规则补充（autonomous.md）

**背景**：自主模式下完成一个选题后直接进入下一个选题，缺少强制快照和上下文清理，导致 token 消耗增加、上下文污染。

- 新增 `.claude/rules/autonomous.md`
  - 每个阶段/选题完成后 **必须保存快照**（不受 30 分钟间隔限制）
  - 进入下一个选题前 **必须保存进度**（含下一个考虑的选题）
  - 保存后立即 **`/clear` 清理上下文**，再加载状态执行下一个选题
  - 目的：控制 token 消耗 + 防止上下文污染 + 保持选题起点清晰
- 更新 `04_自我演进路线.md` 自主模式段，引用 `.claude/rules/autonomous.md`
- 更新 `CLAUDE.md` 规则文件清单，新增 `autonomous.md` 行

### Files

- 新增：
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