# 项目上下文速览（1 分钟掌握全貌）

> **用途**：新会话启动时自动加载（`session-init.sh` top-list 包含本文件），快速建立项目心智模型，避免扫描整个仓库浪费 token。
> **更新时间**：2026-06-27
> **版本**：v3.0.5（M25~M32 · 4 skill 升格 + swarm 协调 + SKILL 索引）
> **加载方式**：session-init 自动加载（≈ 100 行 · token 友好）

---

## 一句话定位

**AiCode 是一个 Claude Code 客户端 Agent 增强工程**——不增强 Claude 大模型本身，而是通过 **L1→L5 5 级智能增量**（L1 工具能用 → L5 自治运行），让同样的 Claude 模型发挥出 2-10 倍效率。

> **核心哲学**（2026-06-24 用户最高指令）：所有工作围绕"智能演进"。git 管理 / 多用户 / 权限 / 团队产品化等均非核心，评估新功能先问"这能帮 Claude 变智能吗"。

---

## 11 个核心系统

| 系统 | 入口 | 一句话 | 阶段 |
|:-----|:-----|:-------|:----:|
| **🧠 left-brain** | `bash .claude/skills/left-brain/scripts/left-brain.sh remember/recall` | 跨会话记忆 + 知识图谱 + 语义搜索 + Token 监控 | L2 ✅ |
| **🔍 audit** | `/audit` 或 `node scripts/orchestrator/audit/quick-audit.js` | 工程健康度自查（6 段浅层报告 + 4 维度 P0/P1/P2 建议）| L4 |
| **🤖 autonomous** | `/autonomous single\|always` | 自主模式（4 种：single/always/toggle/off）| L5 ✅ |
| **🧬 evolve** | `/evolve run\|scan\|analyze\|candidates\|implement` | GitHub 扫描 + TF-IDF + LLM-judge + 入队 | L4 ✅ |
| **🐝 swarm** | `npm run swarm:demo` 或 `npm run swarm:run 任务 --n=3` | 多 Agent 异构视角 + 投票汇总（M31 POC）| L5 |
| **📊 metrics** | `node scripts/orchestrator/metrics/report.js` | 月度报告（4 指标：耗时/成功率/KB 召回/人工干预）| L4 |
| **📋 workflow** | `/workflow` / `/workflow learn` | 学用户工作模式，主动建议下一步 | L4 |
| **🔄 handoff** | `/handoff` 或 `node scripts/orchestrator/handoff.js` | 会话交接（自动快照 + 接续 prompt）| L4 |
| **🛡️ self-discipline** | (自动) | 完成改动后自动收尾（测试/快照/KB/6 文档同步）| L4 |
| **🔒 evolution-lock** | `node scripts/orchestrator/evolution-lock.js status\|queue\|complete` | 防止多窗口同时改 04/CLAUDE/CHANGELOG 导致漂移 | P0-0 |
| **🌳 sync-roadmap** | `node scripts/orchestrator/sync-roadmap.js` | 自动同步 04.md §十二 ⏳ 段 + evolution-plan.json | M24-D |

---

## 关键目录

```
AiCode/
├── .claude/                         # Claude Code 配置
│   ├── rules/                       # 行为规则（9 个：auto-perceive / behavior / cost-control / doc-sync / evolution-lock / git-branch / self-discipline / session-memory / autonomous）
│   ├── skills/                      # 🆕 4 个 skill (v3.0.5 M25 升格)
│   │   ├── left-brain/              # 🧠 跨会话记忆
│   │   ├── audit/                   # 🔍 工程自查
│   │   ├── autonomous/              # 🤖 自主模式
│   │   └── evolve/                  # 🧬 自我进化
│   ├── commands/                    # 斜杠命令（23 个）
│   ├── SKILL_INDEX.md               # 🆕 M32 4 skill 速览 + 5 场景脚本
│   ├── hooks/                       # SessionStart / PreToolUse / PostToolUse
│   └── memory/                      # 左脑 KB + 会话快照 + evolution-plan.json
│
├── scripts/
│   ├── orchestrator/                # 智能调度 + audit + 自主 + handoff + swarm + ...
│   ├── evolution/                   # evolve 主入口 + github-scanner + auto-implement
│   ├── mcp/                         # 本地 MCP server (filesystem / sqlite / fetch)
│   ├── parallel/                    # worktree 并行
│   └── bridge/                      # 候选汇聚桥梁（M16）
│
├── data/                            # 工作空间数据（gitignore）
│   ├── github/candidates.json       # evolve 候选
│   └── evolution/metrics-*.md       # 月度报告
│
├── benchmarks/                      # 真实任务性能基准
└── archives/                        # 全局归档（gitignore）
```

---

## 11 个常用命令

```bash
# 测试（25+ 文件 / 300+ 断言全过）
npm test
npm run doc:check                  # 6 文档一致性（M24.6）

# 左脑记忆（L2 核心）
bash .claude/skills/left-brain/scripts/left-brain.sh remember "..."
bash .claude/skills/left-brain/scripts/left-brain.sh recall "关键词"

# 4 大 skill 入口
/audit                              # 工程健康度自查
/autonomous single                  # 自主模式单阶段
/evolve run                         # GitHub 扫描 + LLM-judge

# 会话交接（M21-M29）
/handoff                            # 无参数自动生成标题 + 下一阶段
/handoff "..." --auto               # 开 VS Code 新窗口 + 复制启动命令

# Swarm 协调（M31 POC）
npm run swarm:demo                  # 3 视角（安全/性能/可维护性）+ 投票输出
npm run swarm:run 重构 dispatcher.js --n=3

# 工作流智能化
/workflow learn                     # 学工作模式
/workflow status                    # 看建议

# 月度报告
node scripts/orchestrator/metrics/report.js

# 快照
bash .claude/skills/left-brain/scripts/session-summary.sh save "..." -m "..."
```

---

## 重要规则（5 条）

1. **按需读取** — 不主动遍历整个目录（`.claudeignore` 排除 archives/ snapshots/ data/github/）
2. **批量读取前确认** — 多文件先列清单让用户确认
3. **优先搜索** — 用 Glob/Grep 而非盲目遍历
4. **新任务 = 新 session** — 除非强关联；30 分钟触顶就 `/compact`
5. **完成改动后自动收尾** — 测试 + 快照 + KB + 6 文档同步（按改动级别 🟢🟡🔴🏁）

---

## 文件命名规范

- 用户可见文件：中文名（`01_AI-ClaudeCode-最佳实践精简.md`）
- CC 内部引用：英文名（`swarm-coordinator.js`）
- 斜杠命令、钩子：英文路径（`.claude/commands/handoff.md`）

---

## 注意事项

- `.claudeignore` 已排除 `archives/`、`.claude/snapshots/`、`data/github/trending.json` 等
- 需要读这些目录时，用户会明确说明
- 不要主动扫描整个仓库（CLAUDE.md 启动协议 §6 明确禁止）

---

## L5 自治运行 5 条达成（2026-06-27 现状）

| # | 条件 | 状态 |
|:-:|:-----|:----:|
| 1 | M13+M14+M15 全部 ✅ | ✅ M13 ✅ + M15 ✅ + **M14 ✅** |
| 2 | 失败蒸馏率 ≥ 80% | 🟡 待实测 |
| 3 | dispatcher 知识命中率 ≥ 30% | 🟡 待采集 |
| 4 | 月度 metric 报告持续 3 个月 | 🟡 第 1 个月 |
| 5 | 自治覆盖率 + 人工干预率 v3.0.0 起趋势 | 🟡 待采集 |

> v4.0.0 最早发版窗口 **2026-10-26**（需 2026-07/08 月度报告 + 30 天数据稳定）

---

*详细说明见 `CLAUDE.md`、`01_AI-ClaudeCode-最佳实践精简.md`、`02_工作空间功能介绍.md`、`04_自我演进路线.md`*