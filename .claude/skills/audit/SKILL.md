---
name: audit
description: 工程自查/复盘 — 快速分析当前 AiCode 工程的健康度，发现不足和改进点，输出报告并可一键整合到 04 自我演进路线 + 自动开 todo
---

> 让你（用户）定期"重新评价" AiCode 工程，找到新的不足和改进空间。
> 区别于 `/autofix`（修具体技术债）和 `/cron-report`（看 anomaly 日报）—— `/audit` 是**周期性战略复盘**：从工程整体看哪里走偏、哪里缺位、哪里有更聪明的做法。

## 用法

```bash
/audit             # 浅层快速（1-2 分钟）→ 输出报告 + 询问
/audit full        # 深度全量（5-10 分钟，派 explorer 子代理并发扫各子系统）
/audit --to-04     # 把上次报告自动整合到 04 文档（无需重跑）
/audit --to-todo   # 把"待优化项"自动建为 TaskCreate 任务
```

## 流程（4 步，每步询问）

### Step 1：分析（脚本 + 文档交叉读）

读以下 4 类源数据（**不扫描整个仓库**，遵守 `.claudeignore`）：

| 源 | 读什么 | 提取什么 |
|:---|:-------|:---------|
| **根目录文档** | `CHANGELOG.md`（顶部 Unreleased）、`04_自我演进路线.md`（0.4 增量 + 0.5 愿景 + 12 章里程碑）、`03_版本迭代计划.md`（P0/P1 进度）、`CLAUDE.md`、`PROJECT-CONTEXT.md` | 已声明目标 vs 实际进度差 |
| **代码骨架** | `package.json` scripts 段、`.claude/skills/`、`scripts/orchestrator/`、`scripts/evolution/`、`scripts/mcp/` 顶层目录、`.claude/commands/` | 能力覆盖度、未实现 hook、未跑测试 |
| **git 状态** | `git log --oneline -20`、`git status` 是否有未提交 | 最近节奏、未完成 backlog |
| **左脑 + 知识图谱** | `.claude/skills/left-brain/memory/MEMORY.md`、autonomous-state.json、cron-reports.json | 用户偏好/决策/过往反思 |

**触发快速执行**：
```bash
node scripts/orchestrator/audit/quick-audit.js
```

脚本输出 6 段结构化 JSON + 人类可读报告：
1. **工程画像**（版本号、规模、最后活动）
2. **已完成核心能力**（从 .claude/skills / commands / scripts 提取）
3. **已声明但未完成**（CHANGELOG Unreleased + 04 计划 vs 实际代码）
4. **能力缺口**（CLAUDE.md 写的能力 vs 实际可用性，例如命令缺失文件、SKILL 引用断裂）
5. **重复/冗余**（重复的 npm script、过时的规则、未跑通的测试）
6. **优化建议**（按"投入产出比"排序，分 P0/P1/P2）

### Step 2：输出报告（终端即时）

```markdown
# 🔍 AiCode 工程审计报告（YYYY-MM-DD HH:MM）

## 1. 工程画像
- 版本：v2.0.1
- 最后 commit：8344cfa（~2 小时前）
- 代码规模：X 个 .js / Y 个 .md / Z 个 skill
- 自治模式：OFF（默认）

## 2. ✅ 已完成核心能力（X 项）
- 智能调度（/dispatch）
- 自主模式（/autonomous）
- ...（按重要性列 5-10 项）

## 3. ⚠️ 已声明但未完成（N 项）
| 声明 | 期望位置 | 实际状态 | 差距 |
|:-----|:---------|:---------|:-----|
| 04 §0.4 M12 LLM-judge 闸门 | v3.0.0 P0-1 | ⏳ 计划中 | 未开工 |
| CLAUDE.md 提到 /auto-review | 快速操作表 | ❌ 缺命令文件 | 命令不存在 |

## 4. 🕳 能力缺口（M 项）
- /auto-review 在 CLAUDE.md 出现但 .claude/commands/ 无对应文件
- 04 文档第 8 章提及 "知识图谱反哺调度" 但 dispatcher.js 无相关 hook
- ...

## 5. 🔁 重复/冗余（K 项）
- `test:evolution` 在 scripts 中出现 2 次（行 8 和 66）
- `autonomous:start` 与 `autonomous:single` 几乎重叠

## 6. 💡 优化建议（按 ROI 排序）

### 🔴 P0（1-2 天能做完）
1. **[命令补全]** 新增 /auto-review 命令文件（CLAUDE.md 已引用）
2. **[去重]** 合并重复 npm script

### 🟡 P1（一周内）
1. **[闭环] M12 LLM-judge 闸门**（增量已规划 0 行代码）
2. ...

### 🟢 P2（远期）
1. ...

---

❓ **下一步：是否把上述优化项整合到 04_自我演进路线.md？**
- (1) 整合到 04 → 我会把 P0 转为"增量"，P1 转为"v3.0 候选"，P2 转附录
- (2) 跳过，只输出建议
- (3) 自定义（指定哪些要整合）
```

### Step 3：询问是否整合到 04 文档

按用户选择执行：

| 选项 | 动作 |
|:-----|:-----|
| 1 全部整合 | 把 6 段写入 `04_自我演进路线.md` 末尾"📋 待优化 backlog"段，标 ⏳ 计划中 |
| 2 跳过 | 只在终端展示，不落盘 |
| 3 自定义 | 列出条目编号让用户挑 |

**整合格式**（写入 04.md 末尾的 backlog）：

```markdown
## 📋 待优化 Backlog（来自 /audit YYYY-MM-DD）

### P0（紧急）
- [ ] 增量 M16：补 /auto-review 命令文件（CLAUDE.md 引用断链）
- [ ] 增量 M17：去重 package.json scripts（test:evolution × 2）

### P1（重要）
- [ ] v3.0 候选：M12 LLM-judge 闸门
- ...

### P2（远期）
- [ ] 知识图谱反哺 dispatcher.js（远期调研）
- ...

### 元数据
- 审计时间：2026-06-25 12:30
- 工程版本：v2.0.1
- 审计者：Claude（/audit skill v1.0.0）
```

### Step 4：询问是否开始优化

整合完成后再次询问：

```
❓ **是否现在开始执行某个/某些优化项？**
- (1) 全部 P0 → 自动建 todo 任务 + 准备开工
- (2) 选 X 项 → 你指定条目编号
- (3) 暂不开始 → 只把报告 + backlog 留下，下次再说
- (4) 进入自主模式 → 把 backlog 全部交给 /autonomous always 处理
```

> **绝不自动动手改代码**。所有优化项必须用户明确批准才执行。

---

## 安全约束

- **不修改任何代码**（/audit 只读 + 写文档）
- **不删任何文件**（/audit 永远不加 `--rm`）
- **不写 commit**（整合到 04.md 是写文件，不 commit —— 让用户决定何时一起 commit）
- **遵守 .claudeignore**（不读 archives/、data/github/、snapshots/ 等）
- **Token 友好**（浅层模式 < 5K tokens / 深度模式 < 50K tokens）

## 数据位置

| 文件 | 作用 |
|:-----|:-----|
| `scripts/orchestrator/audit/quick-audit.js` | 浅层扫描引擎（Step 1） |
| `scripts/orchestrator/audit/full-audit.js` | 深度扫描引擎（/audit full） |
| `scripts/orchestrator/audit/test-quick-audit.js` | 浅层扫描测试 |
| `04_自我演进路线.md` | 末尾 backlog 写入点（Step 3） |
| `.claude/skills/audit/SKILL.md` | 本文件 |

## 与其他命令的协作

| 命令 | 关系 |
|:-----|:-----|
| `/autofix` | 修**当下**技术债（uncommitted / test-coverage / deps）— /audit 找**长期**方向缺口 |
| `/cron-report` | 看 **anomaly 日报**（每日 cron 跑）— /audit 看 **能力全景**（按需跑） |
| `/workflow` | 建议**下一步具体动作**（基于行为模式）— /audit 建议**长期方向**（基于能力缺口） |
| `/secondary-review` | 复查**单次高风险改动**— /audit 复查**整个工程** |
| `/evolve run` | 从 GitHub 学**新能力**— /audit 发现**现有能力缺口** |

> 一句话：**/autofix 修眼前，/cron-report 报异常，/workflow 推一步，/audit 看全局。**

## 关联

- `scripts/orchestrator/audit/`（v2.0 P0-6）
- `04_自我演进路线.md` §0.4（待同步新增 P0-6 增量）
- `CHANGELOG.md`（待同步）
- `CLAUDE.md` 快速操作表（待同步新增 /audit 行）
