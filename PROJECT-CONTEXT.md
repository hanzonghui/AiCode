# 项目上下文速览

> **用途**：新会话启动时先读这个文件，快速了解项目全貌，避免扫描整个仓库浪费 token。
> **更新时间**：2026-06-23
> **版本**：v1.8

---

## 一句话定位

**AiCode 是一个 Claude Code 客户端 Agent 增强工程**——不增强 Claude 大模型本身，而是通过调度、记忆、工具、工作流、自动化，让 Claude Code 发挥出 5-10 倍效率。

---

## 核心系统（6 个）

| 系统 | 入口 | 一句话 |
|:-----|:-----|:-------|
| 智能调度 | `/dispatch`、PreToolUse 钩子 | 复杂任务自动派 2-3 个 Agent 并行 |
| 快照系统 | `scripts/会话快照/save.js` | 会话备份，下次 1 秒接上 |
| 三级检查点 | `plan-snapshot.js` / `global-archive.sh` | 计划 → 迭代 → 归档 |
| 左脑记忆 | `left-brain.sh remember/recall` | 跨会话知识沉淀与搜索 |
| MCP 工具 | `.claude/mcp.json` | filesystem + sqlite + fetch 本地 server |
| 自我进化 | `/evolve run` | 每日扫描 GitHub 学习并实现新能力 |

---

## 关键目录

```
AiCode/
├── .claude/               # Claude Code 配置
│   ├── rules/             # 行为规则
│   ├── commands/          # 斜杠命令
│   ├── agents/            # 子代理定义
│   ├── skills/left-brain/ # 左脑记忆系统
│   └── snapshots/         # 会话快照（已排除，需要时手动读）
├── scripts/               # 核心脚本
│   ├── evolution/         # v1.8 自我进化系统
│   ├── orchestrator/      # 智能调度器
│   ├── parallel/          # worktree 并行
│   ├── mcp/               # 本地 MCP server
│   └── 会话快照/           # 快照系统
├── data/                  # 工作空间数据
│   ├── workspace.db       # SQLite 数据库
│   └── github/            # 进化系统数据
├── benchmarks/            # 性能基准
├── archives/              # 全局归档（已排除）
└── .workspace/            # 环境适配
```

---

## 常用命令

```bash
# 测试
npm test

# 智能调度
/dispatch 任务
/parallel 3 任务

# 快照
node scripts/会话快照/save.js "标题" "标签" -m "下一步"

# 左脑记忆
bash .claude/skills/left-brain/scripts/left-brain.sh remember "内容"
bash .claude/skills/left-brain/scripts/left-brain.sh recall "关键词"

# 自我进化
/evolve run
/evolve watch
/evolve report
```

---

## 重要规则

1. **按需读取** — 不主动遍历整个目录
2. **批量读取前确认** — 多文件先列清单让用户确认
3. **优先搜索** — 用 Glob/Grep 而非盲目遍历
4. **新任务 = 新 session** — 除非强关联
5. **完成改动后自动收尾** — 测试 + 快照 + KB + 文档（按改动级别）

---

## 文件命名规范

- 用户可见文件：中文名
- CC 内部引用：英文名
- 斜杠命令、钩子：英文路径

---

## 注意事项

- `.claudeignore` 已排除 `archives/`、`.skill/`、`.qoder/`、`.claude/snapshots/` 等大目录
- 需要读这些目录时，用户会明确说明
- 不要主动读取 `data/github/trending.json`（较大，除非做进化相关任务）

---

*详细说明见 `CLAUDE.md`、`01_AI-ClaudeCode-最佳实践精简.md`、`02_工作空间功能介绍.md`*
