---
description: 每次里程碑 / 增量 / 重大决策完成后，必须同步根目录下 6 个核心文档（CLAUDE/01/02/04/CHANGELOG/package.json），防止用户文档漂移
---

# 📚 文档同步规则（Doc Sync · 6 文档版）

> **作用**：里程碑或增量完成后，强制同步根目录下 6 个核心文档 + `CHANGELOG.md`，**避免用户文档出现"功能已交付但文档未提"的状态漂移**。
> **触发节点**：每个里程碑（M1~Mn）/ 增量（A~G / A+B+C+D 子模块）/ 大版本发版（vX.Y.0）/ 路线图重写。
> **创建日期**：2026-06-25（v1 4 文档）｜ **2026-06-26 强化（v2 6 文档）**：补 01.md 必同步 + npm script + 用户可见判断标准
> **背景**：
> - 2026-06-25：04 文档 0.4 节 增量 E/F/G 已写"🆕 计划中"，但实际 M6/M7/M8 早已交付
> - **2026-06-26**：完成 M24 handoff 链路下一增强（A+B+C+D · 教程 + 自愈 + 双向桥 + 同步脚本），但 01.md / 02.md 整段没提 M24 任何子模块，**用户从这两个主入口文档看不到 M24**。同类问题不能再发生。

> 🚨 **2026-06-26 强化**：本规则被 `self-discipline.md` 决策树在 **🔴 大 / 🏁 里程碑** 级别**强制触发**（动作 4a = 6 文档自检），不再由 AI 自由判断。
> - 引用位置：`.claude/rules/self-discipline.md` 表格 + `scripts/orchestrator/自我约束规范.md` 决策树
> - 跳过条件：仅当明确判定"用户完全不可见"时（如纯内部重构，且不改变任何命令/章节/段），并在 commit 消息中说明

---

## 🎯 必须同步的 6 个根目录文档

| # | 文档 | 路径 | 同步内容 | 同步时机 |
|:--|:-----|:-----|:---------|:--------|
| 1 | **用户速查主表** | `01_AI-ClaudeCode-最佳实践精简.md` | §三 速查表新增命令/能力行、§二 行为约定新增条款 | **🔴 大** 必做（用户最常看的入口） |
| 2 | **工作空间说明** | `02_工作空间功能介绍.md` | §2.X 新增功能章节、§现状速览表追加 | **🔴 大** 必做（功能字典） |
| 3 | **演进路线** | `04_自我演进路线.md` | 0.4 节增量状态、第十二章里程碑表、顶部"升级时间" | **🔴 大** 必做 |
| 4 | **版本计划** | `03_版本迭代计划.md` | 第四节 P0/P1 完成状态、第七节发版流程记录 | **🔴 大** 必做 |
| 5 | **CLAUDE.md** | `CLAUDE.md` | 工作空间结构树、核心能力表、规则文件清单、快速操作 | **🔴 大** 必做 |
| 6 | **CHANGELOG.md** | `CHANGELOG.md` | **每次必写**（放最顶部的 Unreleased 段） | **🟡 小** 也必做 |
| 7 | `package.json` | `package.json` | version 字段 | **🏁 里程碑** + 发版 |

> 原则：
> - **`CHANGELOG.md` 是源事实**（代码已完成→就写条目）
> - **`04.md` / `03.md` 是状态汇总** → 反向同步 CHANGELOG
> - **`CLAUDE.md` / `01.md` / `02.md` 是用户可见层** → **🔴 大** 必做
> - 纯内部重构（不改命令/不改章节/不改段）→ 跳过用户文档，但**仍然写 CHANGELOG**

---

## 🚦 触发节点（强制同步 6 文档）

### 节点 1：完成一个增量（Mn / A+B+C+D 子模块）

```bash
# 提交后立即同步（6 文件并行）
# 1. CHANGELOG.md - 顶部 Unreleased 段
# 2. 01.md - §三 速查表 + §二 行为约定（如新增命令/能力）
# 3. 02.md - §2.X 新功能章节 + §现状速览表
# 4. 04.md - §0.4 增量段 + §十二 里程碑表
# 5. 03.md - 第四节 P0/P1 状态
# 6. CLAUDE.md - 工作空间结构 / 核心能力表 / 快速操作 / 规则清单
```

### 节点 2：完成一个里程碑（Mx）

```bash
# 同节点 1，但升级到 03.md 整体进度概览 + CLAUDE.md 核心能力表
```

### 节点 3：发版（vX.Y.0 → git tag）

```bash
# 7 文件全同步（含 package.json）
# 1. CHANGELOG.md - Unreleased → 正式版本号 + 日期
# 2-6. 同节点 1
# 7. package.json - version 字段
```

### 节点 4：路线图重写

```bash
# 5 文件全部同步，CLAUDE.md 顶部"启动协议"段也要重审
```

---

## 🛠 同步操作清单

### 1. 改 `01_AI-ClaudeCode-最佳实践精简.md`

```markdown
# §三 速查主表：新增命令行
| handoff 接续（机器接续） | `node handoff.js "..." --runner` | 离开时让 runner 循环跑 |
| handoff 接续（人工接管） | `node handoff.js --resume` | runner 跑一半想换人 |
| 路线图同步 | `npm run roadmap:sync` | 04.md §十二 ⏳ 段 漂移时 |
| 路线图同步预览 | `npm run roadmap:sync:dry` | 看完再决定 |
| 路线图同步状态 | `npm run roadmap:sync:status` | 看 next 队列和 04.md 是否一致 |

# §二 行为约定：新增子项
- M24 起 handoff 加状态自愈 + 双向桥 + 同步脚本
```

### 2. 改 `02_工作空间功能介绍.md`

```markdown
# §2.X 新增章节
### 2.X M24 handoff 链路下一增强

**目标**：handoff 从"能用"做到"好用+智能"，根除 04.md 漂移
**子模块**：A 教程化 / B 状态自愈 / C 双向桥 / D 同步脚本

# §现状速览表追加
| **M24** | handoff 链路下一增强（A+B+C+D） | v3.0.5 | ✅ 已完成 |
```

### 3. 改 `04_自我演进路线.md`

```markdown
# 增量段格式
#### 增量 M_N：名称 ✅ 已完成（M_N · vX.Y.0 · YYYY-MM-DD）
**现状** + **已实现** + **实现细节** + **验收** + **L5 影响**

# 里程碑表追加
| M_N | 任务名 | ✅ 已完成 | YYYY-MM-DD | vX.Y.0 关键说明 |
```

### 4. 改 `03_版本迭代计划.md`

```markdown
# P0/P1 状态：⏳ → ✅
# 顶部"当前版本"字段
```

### 5. 改 `CHANGELOG.md`

```markdown
## [Unreleased]
### Added - M_N ...
### Fixed - ...
### Files
### 关联
```

### 6. 改 `CLAUDE.md`

```markdown
# 工作空间结构树
# 核心能力表
# 快速操作表
# 规则文件清单
```

---

## 🔍 "用户可见变化"判断标准（避免漏改）

> **关键问题**：AI 总说"这个用户看不到"——但用户从主入口文档看不到 = **用户可见**。

| 改动类型 | 用户可见？ | 必同步文档 |
|:---------|:----------:|:----------|
| 新增 slash 命令（/handoff / /sync-roadmap）| ✅ **是** | 01 + 02 + CLAUDE |
| 新增 CLI 参数（--runner / --resume）| ✅ **是** | 01 + 02 + CLAUDE |
| 新增 npm script（roadmap:sync）| ✅ **是** | 01 + CLAUDE |
| 新增核心文件（TUTORIAL.md / sync-roadmap.js）| ✅ **是** | 02 + 04（路径）|
| 修改既有命令行为（默认参数）| ✅ **是** | 01 + 02 + CLAUDE |
| 新增子模块（A+B+C+D）| ✅ **是** | 02 + 04 + CHANGELOG |
| 新增 bug 修复（用户能遇到）| ✅ **是** | CHANGELOG + 02（如影响行为）|
| 纯内部重构（函数重命名/变量提取）| ❌ **否** | CHANGELOG only |
| 测试代码 | ❌ **否** | CHANGELOG only |
| `.gitignore` 调整 | ❌ **否** | CHANGELOG only |

**自检问题**（commit 前必问）：
1. 用户从 `01.md §三` 能看到我新增的命令吗？
2. 用户从 `02.md §2.X` 能看到我新增的功能章节吗？
3. 用户从 `CLAUDE.md 顶部` 能看到我新增的能力吗？

> 任一答否 → 必同步。

---

## 🤖 AI 自动检测（增量 C 集成 + M24-D 增强）

> **集成位置**：`scripts/orchestrator/proactive/proactive-scan.js` 的 7 维度之一
> **维度名**：`doc-drift`（候选维度，v2.x 启用）
> **检测逻辑**：
>
> 1. 读 `CHANGELOG.md` 最近 1 个版本号 + 日期
> 2. 读 `04_自我演进路线.md` 顶部"最近一次同步"日期
> 3. 读 `04_自我演进路线.md` 第十二章里程碑表最后一行日期
> 4. 读 `03_版本迭代计划.md` 顶部"当前版本"字段
> 5. 比对：CHANGELOG 日期 > 04/03 日期 → 漂移
> 6. 扫 04.md 0.4 节是否有 "🆕 计划中" 关键词（每出现一次 +1 漂移点）
> 7. **M24-D 起**：扫 01.md / 02.md 是否有 M_N 段（CHANGELOG 里有但 01/02 没有 → 漂移）
> 8. 输出 anomaly 报告

**触发频率**：SessionStart 时跑（参考增量 C 的 5 分钟缓存）

**配套脚本**：
- `npm run doc:check` — 手动检查漂移
- `scripts/orchestrator/test-doc-sync.js` — 自动化测试（验证 6 文档日期一致性 + 01/02 必含 M_N 段）

---

## ✅ 自我约束（Self-Discipline 联动）

> 文档同步是 **🏁 里程碑** 级别动作的必选项，对应 `.claude/rules/self-discipline.md` 的"文档更新"动作。

| 级别 | 同步要求 |
|:-----|:---------|
| 🟢 微小 | ❌ 跳过 |
| 🟡 小 | ✅ 仅 CHANGELOG |
| 🔴 大 | ✅ 必做 6 文档：CHANGELOG + 01 + 02 + 04 + 03 + CLAUDE |
| 🏁 里程碑 | ✅ 必做 7 文档：🔴 6 文档 + package.json version |

**违反该规则**：
- AI 完成的代码与用户文档不一致 → 增量 A 自我反思会捕获（"CHANGELOG 与 04.md 状态冲突"）
- 主动扫描会提示（"文档漂移 anomaly"）
- 用户审查时会发现 → 信任损耗
- `test-doc-sync.js` 会 fail → 0 破坏硬性兜底

---

## 📋 维护清单

- [x] 创建规则文件（2026-06-25 v1）
- [x] **v2 强化（2026-06-26 M24）**：01.md 必同步 + 6 文档表 + 用户可见判断标准
- [ ] 集成到 proactive-scan.js 7 维度（增量 C 扩展）
- [x] **写测试 `test-doc-sync.js`（验证 6 文档日期一致性 + 01/02 必含 M_N 段）** — M24.6
- [x] **加 npm script `npm run doc:check`（手动检查漂移）** — M24.6
- [x] **self-discipline 决策树补"文档同步"分支（6 文档自检清单）** — M24.6

---

## 🔗 关联

- `.claude/rules/self-discipline.md` — 收尾决策树（6 文档自检）
- `.claude/rules/auto-perceive.md` — 自动记忆（含"同步完成"事件）
- `04_自我演进路线.md` 0.4 节 — 增量定义源
- `03_版本迭代计划.md` — 版本号源
- `CHANGELOG.md` — 事实源
- `01_AI-ClaudeCode-最佳实践精简.md` §三 — 用户速查主表
- `02_工作空间功能介绍.md` §2.X — 完整功能字典
- `scripts/orchestrator/test-doc-sync.js` — 6 文档一致性测试
- `scripts/orchestrator/sync-roadmap.js` — 04.md 自动同步
