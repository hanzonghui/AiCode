---
name: autofix
description: 触发完整自动修复（4 维度：uncommitted/commit、test-coverage 清单、deps-outdated 建议、candidate-pending implementer）
---

执行 auto-fix 引擎的**完整模式**（区别于 SessionStart 的保守模式）。

## 4 个修复维度

| 维度 | 动作 | 可逆 |
|:-----|:-----|:-----|
| `uncommitted` | 自动 `git add -A && commit` | ✅ revert |
| `test-coverage` | 生成"待测文件清单"到 `fix-proposals.json` | ✅ 只需补测试 |
| `deps-outdated` | 输出 `npm outdated` 建议 | ✅ 建议不改包 |
| `candidate-pending` | 调 implementer 链路生成 `IMPLEMENT-PROMPT.md` | ✅ 手动 implement |

## 执行

```bash
# 完整模式（含实际 commit）
node scripts/orchestrator/proactive/auto-fix.js

# LLM 辅助建议（为 test-coverage / deps-outdated / candidate-pending 生成 LLM 建议）
node scripts/orchestrator/proactive/auto-fix.js --llm

# 干跑模式（不写任何文件）
node scripts/orchestrator/proactive/auto-fix.js --dry-run

# LLM + 干跑
node scripts/orchestrator/proactive/auto-fix.js --llm --dry-run

# 仅看 fix-proposals 队列
node scripts/orchestrator/proactive/auto-fix.js --list
```

## 安全约束

- AI 工作目录文件（`scripts/orchestrator/`、`scripts/evolution/`、`scripts/mcp/`、`.claude/`）默认跳过自动 commit
- `.env` / `.key` / `node_modules` 文件绝不自动 commit
- 改动 > 50 文件不自动 commit（要求手动 review）
- 任何 fix 函数失败不影响其他

## 输出位置

- 实际 commit：git 历史
- 修复建议：`.claude/skills/left-brain/memory/fix-proposals.json`（gitignore 排除）

> SessionStart 跑的 `--auto` 模式**只动 uncommitted**，其他生成 proposal。
> `/autofix` 跑完整 4 维度。