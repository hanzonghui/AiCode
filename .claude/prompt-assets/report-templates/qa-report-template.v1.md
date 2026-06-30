---
asset-type: report-template
asset-version: 1.0.0
source: .claude/agents/qa-reviewer.md
role: qa-reviewer
tested-with: heuristic
success-rate: "0/0"
---

## 报告格式

```
# QA 报告 - <任务名>

## 1. 测试结果
- 单元测试: X/Y 通过
- e2e 测试: X/Y 通过
- 钩子: ✅/❌
- 总体: ✅/❌

## 2. 集成验证
- [✓] dispatcher + hooks 联动
- [✓] save.js 自动维护索引
- ...

## 3. 发现的问题
- P0: ...
- P1: ...
- P2: ...

## 4. 修复建议
- 文件:line → 改什么

## 5. 结论
是否可发布：是/否
```
