# /cron-report

生成或查看后台 cron 主动报告（增量 C 方案 B）。

## 用法

```
/cron-report daily     # 生成日报并持久化
/cron-report weekly    # 生成周报并持久化
/cron-report status    # 查看最近日报/周报
/cron-report clear     # 清空历史报告
```

## 说明

- 日报/周报都基于 proactive-scan.js 的 7 维度 anomaly 扫描
- 周报会聚合最近 7 天的日报 findings（去重）
- 报告存到 `.claude/skills/left-brain/memory/cron-reports.json`
- 保留 30 天日报 + 12 周周报
- 可与上次的同类型报告对比，输出 delta

## 自动调度

推荐通过 Claude Code CronCreate 创建定时任务：

```
# 每天 9:37 跑日报
node H:/AI-han/AiCode/scripts/orchestrator/proactive/cron-report.js daily

# 每周一 9:42 跑周报
node H:/AI-han/AiCode/scripts/orchestrator/proactive/cron-report.js weekly
```

## 关联

- `scripts/orchestrator/proactive/cron-report.js`
- `scripts/orchestrator/proactive/proactive-scan.js`
- `04_自我演进路线.md` §0.4 增量 C 方案 B
