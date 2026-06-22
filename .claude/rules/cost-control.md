---
description: 成本控制、Token消耗、上下文压缩、Git/PR 工作流规则
---

<important if="对话超过5轮或上下文接近40%">

## 💰 成本控制

- 每 5 轮对话后执行 `/compact` 压缩上下文
- 每 5 轮后执行 `left-brain.sh dashboard` 查看统计
- 文件按需读取，不盲目遍历目录
- 输出精炼，不冗长
- `/compact` 加 hint 优于自动触发：`/compact focus on [当前任务]，drop [已完成/无关内容]`
- context 达到 ~300-400k tokens（约 40%）时降智，应主动建议 `/compact` 或新建 session
- **new task = new session**，除非强关联否则不延长当前 session
- **rewind > correct** — 发现错误方向时双击 Esc 或 `/rewind` 回退到错误前重新 prompt。不要在错误基础上纠错，这会污染 context
- **`/compact` vs `/clear`** — compact 有损但有 momentum（适合中途）；clear 重置但精准控制（适合切换任务前）
- 使用 `/context` 查看当前 context 使用量，`/usage` 查看 plan 限制

## 📏 Git / PR 工作流

- **PR 保持小且聚焦** — 一个功能一个 PR，p50 约 118 行变更。小 PR 易审查易回退
- **始终 squash merge** — 保持线性历史，一个功能一个 commit。方便 git revert 和 git bisect
- **频繁 commit** — 任务完成即 commit，至少每小时一次

</important>
