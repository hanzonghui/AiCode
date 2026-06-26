# AI 自我约束（Self-Discipline · 6 文档版）

> **作用**：让 AI 在完成改动后**自动**保存快照、更新文档、写 KB，**不需要用户提醒**。
> **完整规范**：[`scripts/orchestrator/自我约束规范.md`](../../scripts/orchestrator/自我约束规范.md)
> **最后更新**：2026-06-26（v2 6 文档自检决策树 + 1 快照 0 commit 根除）

---

## 🚦 核心流程

改动完成后按级别自动收尾：

| 级别 | 触发 | 自动动作 |
|:-----|:-----|:---------|
| 🟢 微小 | typo/注释 | 跳过 |
| 🟡 小 | bug fix/参数 | **0 先存快照** + 测试 + KB + **CHANGELOG** |
| 🔴 大 | 新功能/架构 | **0 先存快照** + 测试 + KB + **同步 6 文档 + CHANGELOG**（详见 [doc-sync](doc-sync.md) v2 6 文档版） |
| 🏁 里程碑 | v1.X 完成 | **0 先存快照** + 测试 + KB + **同步 7 文档 + CHANGELOG**（含 package.json version）+ 全局归档 |

> 🚨 **2026-06-26 强化（v2 双规则）**：
>
> 1. **"文档更新"从 4 文档升级到 6 文档**（[doc-sync v2](doc-sync.md)）— 01.md + 02.md 也必同步
> 2. **"快照"已从可选项明确为 commit 前必跑**（动作 0）— 杜绝 1 快照 0 commit
>
> 失败教训：
> - 2026-06-25：完成 4 commit（04 真实化 / doc-sync 串联 / 01-02 补全 / B 方案正交化），全程没主动调 `save.js` → 1 快照 0 commit
> - **2026-06-26（M24 触发）**：完成 M24 4 子模块（教程 + 自愈 + 双向桥 + 同步脚本），**只同步了 04.md / CHANGELOG / CLAUDE.md，没同步 01.md / 02.md**。用户从 01/02 看 M24 — 看不到。根因：doc-sync v1 规则只列 4 文档，未强制 01/02。修复：v2 加 01/02 + 加 6 文档自检清单。
> - **2026-06-27（M29 触发）**：在 01.md 速查主表加了一长串 `node handoff.js` 命令变体、决策树、4 层 fallback 实现细节。**用户根本不需要看这些** —— `/handoff` 一句话就够。根因：把"实现细节字典"塞进了"用户速查主表"（违反 M24 文档职责正交化原则）。修复：本规则"避免过度工程化"段。

---

## 🎯 避免过度工程化（v3 强化 · 2026-06-27）

> **核心原则**：**用户用得上的留，用不上的删**。每多写一行用户文档 = 多一份维护成本 + 多一处迷惑点。

### 4 文档职责正交化（再强调）

| 文档 | 职责 | 粒度 | 用户场景 |
|:-----|:-----|:-----|:---------|
| **`01.md` §三** | 速查主表 | **一句话 + 一行命令** | 扫一眼就懂 |
| **`.claude/commands/`** | 命令字典 | 完整参数 + 例子 | 写命令时查 |
| **`02.md` §2.X** | 功能字典 | 章节级（实现 + 用法 + 测试）| 深入了解某能力 |
| **`.claude/handoff/TUTORIAL.md`** | 场景教程 | 真实场景 + 决策树 | 不知道用什么时翻 |

**违反案例**（2026-06-27 M29 修复前）：
```bash
# ❌ 错：01.md 速查表塞了 5 种命令变体 + 4 节点决策树 + 实现细节
node scripts/orchestrator/handoff.js
node scripts/orchestrator/handoff.js --auto
node scripts/orchestrator/handoff.js "今天做 M22" "M23: 文档清理" --auto
node scripts/orchestrator/handoff.js --runner
node scripts/orchestrator/handoff.js --resume
npm run roadmap:sync:status
npm run roadmap:sync:dry
npm run roadmap:sync
+ 日常用法决策树（4 节点 ASCII 图）
+ M29 新增能力（4 层 fallback 解释）
```

```bash
# ✅ 对：01.md 只留用户真正会用的
/handoff           # 🌟 一句话就够，不用写标题
/handoff --auto    # + 开 VS Code 新窗口 + 复制启动命令
```

**判断标准**（写文档前问 3 问）：
1. **用户会用这个吗？** —— 99% 的命令变体用户不会直接用，他们只输入 `/handoff`
2. **这属于"速查"还是"字典"？** —— 速查 = 一行；字典 = 完整章节
3. **多写这行能帮用户吗？** —— 不能 = 删

### 写到错误文档的迹象

- 01.md 出现 3 行以上代码块 → 拆到 commands/*.md 或 02.md
- 01.md 出现 ASCII 决策树 → 删或拆到 TUTORIAL.md
- 01.md 出现"实现细节" / "M_N 新增能力" → 拆到 02.md
- 用户问"这为啥写这些" → 99% 是过度工程化

### 决策表（写在哪个文档）

| 内容类型 | 写到哪 | 例 |
|:---------|:-------|:---|
| 用户最常用的一行命令 | 01.md §三 | `/handoff` |
| 完整命令参数 + flags | `.claude/commands/handoff.md` | 5 种变体全列 |
| 实现细节 / 子模块 / 测试 | 02.md §2.X | "4 层 fallback 解析" |
| 真实场景教程 | `.claude/handoff/TUTORIAL.md` | "晚 12 点想睡觉" |
| 路线图 / 状态 | 04.md §十二 | M1-M29 表 |
| 改了什么 + 为什么 | CHANGELOG.md | "M29 智能标题" |

### 自动检测（doc-sync 增强候选）

写入前问自己：这段内容是给"用户用"还是"开发者维护"？
- 用户用 → 01.md（一行）
- 开发者维护 → 02.md / 04.md / commands/*.md（详细）

> **下次违规参考**：M29 完成后 01.md 一度 27 行命令代码块 → 用户反馈"看不懂" → 简化到 2 行。**用户用不上 = 不写**。

---

## 🔴 动作 4a：6 文档自检决策树（🔴 大 / 🏁 级别必跑）

> **触发条件**：完成一个增量（Mn）/ 子模块（A+B+C+D）/ 里程碑（Mx）/ 发版（vX.Y.0）
> **位置**：commit 前最后一步（动作 5）
> **依据**：[doc-sync v2](doc-sync.md) §必同步的 6 个根目录文档

### 自检清单（按文件顺序）

```bash
# 1. CHANGELOG.md — 源事实
□ 顶部 [Unreleased] 段有本次增量条目
□ 含 "### Added - M_N ..." 或 "### Fixed - ..."
□ 含"测试 N/N 通过"行
□ 含"Files" 段（修改/新增清单）

# 2. 01_AI-ClaudeCode-最佳实践精简.md — 用户速查主表（🔴 大 必做）
□ §三 速查表新增命令/能力行（新增 handoff/runner/roadmap:sync 等）
□ §二 行为约定新增条款（如有）
□ §十一 "📌 副本" 段（如用户操作类）

# 3. 02_工作空间功能介绍.md — 功能字典（🔴 大 必做）
□ §2.X 新增功能章节（与 2.20~2.25 同级）
□ §现状速览表追加 M_N 行
□ 关联命令/文件路径对得上

# 4. 04_自我演进路线.md — 状态汇总（🔴 大 必做）
□ §0.4 增量段：⏳ 计划中 → ✅ 已完成 + 写实现细节 + L5 影响
□ §十二 里程碑表追加 M_N 行
□ 顶部"最近一次同步"时间更新
□ 顶部"next 队列状态"摘要更新
□ §十二 ⏳ 段（如已完成移出 → sync-roadmap 自动）
□ §十二 状态统计（已完成/计划中/合计 3 行）数字对

# 5. 03_版本迭代计划.md — 整体进度（🔴 大 必做）
□ 第四节 P0/P1 状态：⏳ → ✅
□ 顶部"当前版本"字段（如发版）

# 6. CLAUDE.md — 启动导航（🔴 大 必做）
□ 工作空间结构树（如新增/删除/重命名文件）
□ 核心能力表（如新增能力）
□ 快速操作表（如新增命令）
□ 规则文件清单（如新增 .claude/rules/*.md）

# 7. package.json — 发版专属（🏁 里程碑 + 发版）
□ version 字段更新
```

### 自检问题（最后 3 问）

> 1. 用户从 `01.md §三` 能看到我新增的命令吗？
> 2. 用户从 `02.md §2.X` 能看到我新增的功能章节吗？
> 3. 用户从 `CLAUDE.md 顶部` 能看到我新增的能力吗？

> 任一答否 → 必同步 → 回到上面 6 文档清单补全。

### 跳过条件（仅当"用户完全不可见"时）

- ✅ 跳过 01/02/CLAUDE：纯内部重构（函数重命名/变量提取/不改变命令和章节）
- ✅ 跳过 02：不影响用户可见的内部模块
- ❌ 不跳过 CHANGELOG：即使微小改动也写 CHANGELOG
- ❌ 不跳过 04：状态汇总永远必做

> 跳过时必须在 commit 消息中说明"用户不可见，跳过 01/02/CLAUDE"。

### 自动化兜底

- `scripts/orchestrator/test-doc-sync.js` — 验证 6 文档日期一致性 + 01/02 必含 M_N 段
- `npm run doc:check` — 手动检查漂移
- `proactive-scan.js` 7 维度之一 `doc-drift` — SessionStart 自动跑

---

## 🎯 完整动作清单（参考）

| # | 动作 | 触发级别 | 来源 |
|:--|:-----|:---------|:-----|
| 0 | commit 前**先存快照**（防 1 快照 0 commit）| 🟡+/必做 | v1 强化（2026-06-25）|
| 1 | 写测试（test-first 闸门）| 🟡+/必做 | v1 |
| 2 | 写 KB（左脑 memory）| 🟡+/必做 | v1 |
| 3 | commit（带规范 message）| 🟡+/必做 | v1 |
| 4a | **6 文档自检 + 同步** | 🔴 大/必做 | **v2 强化（2026-06-26 M24 触发）** |
| 4b | 全局归档（如里程碑）| 🏁 必做 | v1 |
| 5 | 完成回执（汇报 commit hash）| 🟡+/必做 | v1 |

---

## 🔗 关联

- [`.claude/rules/doc-sync.md`](doc-sync.md) — v2 6 文档版同步规则
- [`.claude/rules/auto-perceive.md`](auto-perceive.md) — 自动记忆
- [`.claude/rules/behavior.md`](behavior.md) — 总行为约定
- [`.claude/rules/cost-control.md`](cost-control.md) — 成本控制 + Git 工作流
- [`scripts/orchestrator/自我约束规范.md`](../../scripts/orchestrator/自我约束规范.md) — 完整决策树
- [`scripts/orchestrator/test-doc-sync.js`](../../scripts/orchestrator/test-doc-sync.js) — 6 文档一致性测试
