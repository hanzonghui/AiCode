---
name: remember
description: 快速记忆知识点到左脑知识库
---

根据用户输入的内容，执行以下步骤：

1. 如果用户提供了具体内容，直接记忆：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh remember "用户提供的内容"
   ```

2. 如果用户没有提供内容，自动检测当前上下文（最近讨论的项目、决策、偏好等），提炼为知识后记忆

3. 记忆后显示关联的知识图谱：
   ```
   bash .claude/skills/left-brain/scripts/left-brain.sh graph
   ```
