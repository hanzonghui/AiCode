# AI 自我约束（Self-Discipline）

> **作用**：让 AI 在完成改动后**自动**保存快照、更新文档、写 KB，**不需要用户提醒**。
> **完整规范**：[`scripts/orchestrator/自我约束规范.md`](../../scripts/orchestrator/自我约束规范.md)
> **最后更新**：2026-06-25（明确 doc-sync 串联：🔴 大 / 🏁 级别强制同步 4 文档 + CHANGELOG）

---

## 🚦 核心流程

改动完成后按级别自动收尾：

| 级别 | 触发 | 自动动作 |
|:-----|:-----|:---------|
| 🟢 微小 | typo/注释 | 跳过 |
| 🟡 小 | bug fix/参数 | 测试 + 快照 + KB |
| 🔴 大 | 新功能/架构 | 测试 + 快照 + KB + **同步 4 文档 + CHANGELOG**（详见 [doc-sync](doc-sync.md)） |
| 🏁 里程碑 | v1.X 完成 | 测试 + 快照 + KB + **同步 4 文档 + CHANGELOG**（详见 [doc-sync](doc-sync.md)）+ 全局归档 |

> 🚨 **2026-06-25 强化**："文档更新"已从模糊词明确为**强制同步 `04_自我演进路线.md` + `03_版本迭代计划.md` + `CLAUDE.md` + `02_工作空间功能介绍.md` + `CHANGELOG.md`**，见 `.claude/rules/doc-sync.md`。原因：增量 E/F/G 完成后 04 文档 L4 仍写"✅ 已达"——文档漂移再次发生。
>
> **自动检测**：增量 C 的 proactive-scan 已有 doc-drift 维度候选（C 节末尾"AI 自动检测"段），M13 失败蒸馏器落地后会自动接上。

**详见**：[`scripts/orchestrator/自我约束规范.md`](../../scripts/orchestrator/自我约束规范.md)（完整决策树 + 失败路径）