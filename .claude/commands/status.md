---
name: status
description: 查看左脑系统状态 + 知识图谱 + 最近知识
---

执行以下命令并展示结果：

1. 系统状态：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh status
   ```

2. 监控面板：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh dashboard
   ```

3. 知识图谱：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh graph
   ```

4. 如果用户提供了关键词，额外执行搜索：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh recall "关键词"
   ```
