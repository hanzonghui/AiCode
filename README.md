# AiCode — Claude Code 客户端 Agent 增强工程

> **v3.0.5** · 一个**会自己调度、自己记忆、自己审计、自己进化**的 Claude Code 工作空间。
> **26+ 个测试文件 / 300+ 项断言全过**，L1→L5 5 级智能增量路径打通（L4 ✅ / L5 🟡 3/5）。

**定位**：我们**不增强 Claude 大模型本身**，而是增强 **Claude Code 客户端 Agent** —— 通过调度 / 记忆 / 工具 / 工作流 / 自动化，让同样的 Claude 模型发挥出 2-10 倍效率。

---

## 🚀 3 步快速开始

```bash
git clone <your-fork>.git && cd AiCode
bash .workspace/setup.sh     # 一键适配当前环境（生成 .workspace/workspace.env）
npm test                     # 跑 26+ 个测试文件 / 300+ 项断言，确认环境正常
```

然后启动 Claude Code：

```bash
claude
```

**就这样。** Claude Code 会自动读取 `CLAUDE.md`（启动导航） + `PROJECT-CONTEXT.md`（1 分钟全貌） + `session-init.sh`（左脑 KB + 快照）。

---

## ✨ 你会获得什么能力

| 能力 | 效果 | 对应 Skill |
|:-----|:-----|:----------:|
| 🧠 **左脑记忆** | 跨会话知识沉淀 + 知识图谱 + 语义搜索 | `left-brain` |
| 🔍 **工程自查** | 1-2 分钟发现 P0 缺口 / 重复 / 漂移 | `audit` |
| 🤖 **自主模式** | 离开几小时让 Claude 自己跑增量 | `autonomous` |
| 🧬 **自我进化** | 每日扫描 GitHub 学习爆款 Claude 项目 | `evolve` |
| 🐝 **多 Agent Swarm** | 复杂任务多视角分析 + 投票汇总 | `swarm-coordinator` |
| 📋 **会话交接** | 上下文 40% 时一键 `/handoff` 换窗口 | `handoff` |
| 📊 **效果量化** | 月度报告：耗时 / 成功率 / KB 召回 / 人工干预 | `metrics` |
| 🛡️ **自动收尾** | 改完代码自动测试 + 快照 + KB + 6 文档同步 | `self-discipline` |

> **L1→L5 智能演进路径**：L1 工具能用 ✅ → L2 记得住 ✅ → L3 会决策 ✅ → L4 会学习 ✅ → L5 自治运行 🟡
> **4 个 Skill 速览**：`.claude/SKILL_INDEX.md`（1 张表 + 5 场景脚本 · v3.0.5 M32）

---

## 📂 工程结构（顶层）

```
AiCode/
├── CLAUDE.md                    ⭐ 启动导航（新会话第一件事）
├── PROJECT-CONTEXT.md           ⭐ 1 分钟项目全貌（session-init 自动加载）
├── 01_AI-ClaudeCode-最佳实践精简.md    用户速查主表
├── 02_工作空间功能介绍.md               功能字典（每能力一节）
├── 04_自我演进路线.md                   自我进化 + 智能演进纲领
├── CHANGELOG.md                 ⭐ 版本变更记录
│
├── .claude/
│   ├── SKILL_INDEX.md           🆕 4 skill 速览 + 5 场景脚本
│   ├── skills/                  4 skill：left-brain / audit / autonomous / evolve
│   ├── rules/                   9 个行为规则文件
│   ├── commands/                23 个斜杠命令
│   └── hooks/                   SessionStart / PreToolUse / PostToolUse
│
├── scripts/
│   ├── orchestrator/            智能调度 / audit / 自主 / handoff / swarm / metrics
│   ├── evolution/               evolve 主入口 + github-scanner + auto-implement
│   ├── mcp/                     本地 MCP server
│   └── bridge/                  候选汇聚桥梁
│
├── data/                        工作空间数据（gitignore）
└── benchmarks/                  真实任务性能基准
```

---

## ⚠️ 迁移注意（2026-06-25 修复）

`.claude/settings.local.json` 里的所有 hooks **必须使用相对路径**（`scripts/...` 或 `.claude/...`），**禁止使用绝对路径**（如 `H:/AI-han/AiCode/...`）。绝对路径会导致别人 clone 本工程时 SessionStart 报"没有这样的文件或目录"错误。

```bash
grep -n "H:\|/c/Users\|/Users/" .claude/settings.local.json
```

输出应为空。如有匹配项，改成相对路径即可。

---

## 🧪 测试基线（v3.0.5）

```text
npm test                    # 26+ 测试文件 / 300+ 断言全过
npm run doc:check           # 6 文档一致性检查（M24.6）
npm run benchmark           # 并行 vs 串行（详见 benchmarks/result.md）
```

测试环境基线：

| 项目 | 当前环境 |
|:-----|:---------|
| OS | Windows 10 Pro (10.0.19045) |
| Shell | Git Bash / PowerShell 5.1 |
| Node.js | v24.16.0 |
| Claude Code | 最新版（`npm i -g @anthropic-ai/claude-code`）|

> 数字会随机器 / 网络 / 磁盘 IO 波动。建议在新机器上跑 `npm test` 重新建立基线。

---

## 📖 详细文档（按角色选）

| 我是 | 先看 | 然后看 |
|:-----|:-----|:-------|
| **🆕 完全新用户** | `CLAUDE.md` 启动协议 | `PROJECT-CONTEXT.md` 全貌 → `02.md` 功能字典 |
| **👤 普通用户** | `01.md §三` 速查主表 | `.claude/commands/` 命令字典 |
| **🔧 开发者** | `CLAUDE.md` 工作空间结构 | `04.md §0.4` 增量定义 |
| **🧠 想知道 AI 怎么变聪明** | `02.md §零` L1→L5 | `04.md §0.5` 长期愿景 |

---

## 🎯 项目核心哲学

> **2026-06-24 用户最高指令**：本工程的核心目标是 **智能演进**（围绕 04 纲领 4 大智能增量 L1→L5 路径）。git 管理 / 多用户 / 权限 / 审计 / 团队产品化等**均非核心**。评估任何新功能/任务时，先问"这能帮 Claude 变智能吗？"→ 否则降级或拒绝。

---

*维护：每完成一个 milestone (Mx) 同步更新到 v3.x.y；详见 `CHANGELOG.md` · 仓库作者：韩宗辉 · 个人工程，不开 PR / 不 push 远程*