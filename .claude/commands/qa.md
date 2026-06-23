---
name: qa
description: 跑 QA 验证 - 单元测试 + e2e + 钩子 + 集成验证 + 报告
---

# /qa - 质量验证

跑完整 QA 流程并输出报告。

## 执行流程

```bash
# 1. 单元测试
node scripts/orchestrator/test-dispatcher.js

# 2. e2e 测试
node scripts/orchestrator/test-e2e.js

# 3. 钩子测试
echo '{"tool_name":"UserPromptSubmit","tool_input":{"prompt":"排查 BUG"}}' | node scripts/orchestrator/hooks/dispatch-decision.js

# 4. Token 监控
node scripts/orchestrator/token-monitor.js stats

# 5. 集成验证（派 QA 子代理）
Agent(subagent_type="general-purpose", prompt="作为 QA 工程师，跑全部测试并输出报告")
```

## 输出格式

```
# QA 报告

## 测试结果
- 单元测试: 17/17 ✅
- e2e 测试: 11/11 ✅
- 钩子: ✅
- 总体: ✅

## 集成验证
- ✅ dispatcher → hooks 联动
- ✅ save.js → 00_ROOT_快速加载会话.md 联动
- ✅ token-monitor 统计准确

## 发现
- 无新问题

## 结论
可发布: 是
```

## 关联文档

- `.claude/agents/qa-reviewer.md` - QA 子代理定义
- `scripts/orchestrator/test-dispatcher.js` - 单元测试
- `scripts/orchestrator/test-e2e.js` - e2e 测试