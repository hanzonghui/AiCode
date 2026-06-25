# /audit

> 工程自查/复盘：让 Claude 周期性重新评价 AiCode 工程,发现能力缺口和改进点,输出报告并可一键整合到 04 自我演进路线。

## 用法

```
/audit             # 浅层快速（1-2 分钟,默认）
/audit full        # 深度全量（5-10 分钟,派 explorer 子代理并发扫描各子系统）
/audit --to-04     # 把上次报告自动整合到 04 文档（无需重跑）
/audit --to-todo   # 把"待优化项"自动建为 TaskCreate 任务
```

## 流程（4 步,每步询问）

1. **分析** — 读 4 类源数据（根目录文档 + 代码骨架 + git 状态 + 左脑知识图谱）
2. **输出报告** — 终端即时输出 6 段：工程画像 / 已完成 / 未完成 / 能力缺口 / 重复冗余 / 优化建议
3. **询问是否整合到 04 文档** — 写入 `04_自我演进路线.md` 末尾 backlog 段
4. **询问是否开始优化** — 全部 P0 / 选 X 项 / 暂不 / 交给 /autonomous always

详细规范见 `.claude/skills/audit/SKILL.md`

## 与其他命令的区别

| 命令 | 关注点 | 时机 |
|:-----|:-------|:-----|
| `/autofix` | 修**当下技术债**（uncommitted / test-coverage） | 每次改完代码 |
| `/cron-report` | 看 **anomaly 日报** | 每日 cron 自动 |
| `/workflow` | 建议**下一步具体动作** | 行为模式触发 |
| `/audit` | 复查**整个工程** | 每周/每月/里程碑前 |

## 关联

- 完整文档：`.claude/skills/audit/SKILL.md`
- 引擎：`scripts/orchestrator/audit/quick-audit.js`
- 路线：`04_自我演进路线.md` §0.4 P0-6
