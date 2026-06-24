# /secondary-review

查看并管理二次采样队列（增量 A 方案 B）。

## 用法

```
/secondary-review status         # 查看队列
/secondary-review clear          # 清空队列
/secondary-review approve <id>   # 批准某条复查
/secondary-review reject <id>    # 拒绝某条复查
```

## 说明

- 当 Claude 修改高风险文件（dispatcher.js、self-reflect.js、package.json、CLAUDE.md、04.md、03.md、.claude/rules/ 等）时，会自动加入队列
- 队列文件：`.claude/skills/left-brain/memory/secondary-review-queue.json`
- 当前实现：只标记 + 排队，真正的二次采样由用户或另一个 Claude 实例完成
- 未来可扩展：自动调用子 agent 或 LLM judge 进行复查

## 关联

- `scripts/orchestrator/reflection/secondary-review.js`
- `scripts/orchestrator/reflection/self-reflect.js`
- `04_自我演进路线.md` §0.4 增量 A 方案 B
