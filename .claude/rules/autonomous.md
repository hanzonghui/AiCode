# 🤖 自主模式规则

> **作用**：规范 Claude 在 `/autonomous` 自主模式 ON 期间的行为，确保每个选题独立、token 可控、状态可恢复。
> **关联**：[[autonomous-mode]]（左脑记忆）
> **创建日期**：2026-06-25

---

## 1. 选题完成后的强制快照

每次完成一个阶段/选题功能后，**必须**保存一次快照，不受"30 分钟"常规间隔限制。

```bash
bash .claude/skills/left-brain/scripts/session-summary.sh save "[已完成] 选题X: 一句话摘要；下一步: 选题Y"
```

快照内容必须包含：
- 刚完成的选题名称 + 关键交付物
- 测试状态
- commit hash（如果已 commit）
- 下一个考虑的选题

---

## 2. 进入下一个选题前的上下文清理

在保存完当前快照后、执行下一个选题前，**必须**清理上下文：

```bash
/clear
```

清理后，Claude 应：
1. 重新加载 `session-summary.sh load` 恢复上次状态
2. 读取 `autonomous-state.json` 确认自主模式仍为 ON
3. 从决策快照或记忆中读取"下一个选题"
4. 按新选题独立推进

**为什么清理**：
- 防止上一个选题的上下文污染下一个选题的判断
- 控制 token 消耗（长上下文会降智 + 费钱）
- 让每个选题有清晰的起点，便于失败回退

---

## 3. 进度持久化

自主模式下产生的决策、plan、中间状态必须落盘到 `.claude/skills/left-brain/memory/`：

| 文件 | 内容 |
|:-----|:-----|
| `autonomous-state.json` | 开关状态 + 安全边界 |
| `autonomous-decision-YYYYMMDD-NNN.json` | 每次选题决策记录 |
| `sessions/latest_state.json` | 完整工作现场 |
| `sessions/latest_summary.md` | 人类可读的会话摘要 |

---

## 4. 失败与重试

- 单个选题失败 → 先保存失败快照 → 再尝试最多 5 次
- 连续 5 次失败 → 自动停止自主模式并汇报
- 任何失败都不应污染主分支工作目录

---

## 5. 禁止项

自主模式下**不做**：
- `git push` 到远程
- 删除分支 / 删除文件
- 修改主工作目录外文件
- 不保存快照就切换选题

---

## 6. 关闭规则

用户执行 `/autonomous-stop` 或 `/autonomous toggle` 时：
1. 立即保存最终快照
2. 把 `autonomous-state.json` 中 `enabled` 改为 `false`
3. 汇总本次自主模式完成的选题列表

---

## 7. Token 控制

- 每个选题尽量控制在独立短上下文内完成
- 进入新选题前 `/clear` 是强制步骤，不是可选优化
- 大选题（>3 天）必须拆分成子选题，每个子选题完成后保存快照 + 清理上下文
