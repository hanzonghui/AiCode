# 项目记忆库

> 最后更新：2026-06-23
> 定位：Claude Code 专用记忆（AiCode 工程层）。用户背景等通用信息看左脑知识库。

---

## 核心信息

- **项目路径**：`H:\AI-han\AiCode`
- **GitHub 仓库**：https://github.com/hanzonghui/AiCode
- **当前分支**：`main`
- **工程定位**：可移植的 Claude Code 增强工作空间
- **当前版本**：v1.8（2026-06-23 已全量提交并推送到 GitHub）

---

## 核心功能模块

| 模块 | 一句话作用 | 入口 |
|:-----|:----------|:-----|
| **智能调度器** | 自动分析任务复杂度，按需派发 1-3 个子代理 | `/dispatch`、`/parallel` |
| **左脑记忆系统** | 跨会话自动记忆 + 知识图谱 + 语义搜索 | `/remember`、`/status`、`left-brain.sh` |
| **自我进化系统** | 每日扫描 GitHub 爆款 Claude 项目并自动实现 | `/evolve run`、`/evolve watch` |
| **并行执行** | 基于 git worktree 多分支同时干活 | `scripts/parallel/worktree-parallel.sh` |
| **本地 MCP** | 本地 filesystem/sqlite/fetch 工具 | `scripts/mcp/` |
| **会话快照** | 一键保存/恢复会话上下文 | `scripts/会话快照/` |
| **项目自动化** | 一句话创建项目脚手架 | `/new-project` |
| **自动化工作流** | 测试→简化→审查→提交 | `/go`、`/qa`、`/code-review` |

---

## 关键决策

- **成本控制**：每 5 轮对话建议 `/compact`；大文件/归档目录已加入 `.claudeignore`
- **任务隔离**：新任务建议 `/clear` 或开新 session
- **Git 工作流**：小 commit、功能分组、最终 squash merge
- **自我约束**：改动后按级别自动收尾（测试 + 快照 + KB + 文档）
- **外部学习**：每日/定期运行 `/evolve`，防止闭门造车
- **数据管理**：`data/workspace.db` 和 `data/github/` 为运行时数据，已加入 `.gitignore`，不提交

---

## 常用命令

```bash
# 智能调度
/dispatch <任务>
/parallel <N> <任务>

# 记忆系统
left-brain.sh remember "..."
left-brain.sh recall "关键词"
left-brain.sh dashboard

# 自我进化
npm run evolve:scan      # 只扫描 GitHub
npm run evolve:analyze   # 只分析候选
npm run evolve           # 完整流程
npm run trend            # 检查已实现特性是否过时

# 测试与归档
npm test
npm run benchmark
npm run archive

# 会话快照
node scripts/会话快照/save.js "标题" "标签"
```

---

## 当前状态（2026-06-23）

- ✅ v1.8 功能全部完成，101/101 测试通过
- ✅ 本地 3 个 commit 已推送到 GitHub `hanzonghui/AiCode`
- ✅ `.claudeignore` 已排除大文件/归档目录
- ⏳ `data/github/` 待生成（运行 `npm run evolve:scan`）
- ⏳ `.claude/memory.md` 已更新为当前工程专用内容

---

## TODO

- [ ] 观察 30 天后 `access_count` 是否被使用，如无使用考虑删除
- [ ] 验证自我进化系统首次扫描结果
- [ ] 根据实际使用频率裁剪不常用功能
- [ ] 将 `test-analyzer.js` 纳入 `npm test`

---

## 文档索引

- 总纲：`README.md`、`CLAUDE.md`
- 行为约定：`AI-ClaudeCode-最佳实践精简.md`
- 自我约束：`scripts/orchestrator/自我约束规范.md`
- 工作空间说明：`工作空间功能介绍.md`
- 进化系统设计：`自我进化循环系统设计.md`
- 版本迭代：`版本迭代计划.md`
- 左脑系统：`.claude/skills/left-brain/memory/MEMORY.md`
