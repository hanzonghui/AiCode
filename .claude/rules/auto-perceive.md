---
description: 自动感知、纠正学习、知识记忆规则
---

<important if="用户提到任何事实、决策、项目、偏好、人物关系、纠正等信息">

## 🧠 自动感知规则

每次回复时，检查用户消息是否包含以下信息类型，必须在下轮回复前执行记忆操作：

| 信息类型 | 触发关键词 | 样例 | 操作 |
|:---------|:-----------|:-----|:-----|
| 事实信息 | 日期、时间、地点、人物、数字 | "年会定在12月25号" | `left-brain.sh remember "..."` |
| 技术决策 | 决定用、选择了、确认、方案 | "决定用Spring Boot 3.2" | `left-brain.sh remember "..."` |
| 项目信息 | 项目名、技术栈、进度、模块 | "项目A用Vue3+Element" | `left-brain.sh remember "..."` |
| 用户偏好 | 我喜欢、习惯用、总是、不要 | "我喜欢用IntelliJ" | `left-brain.sh remember "..."` |
| 人物关系 | 负责、对接、汇报、协作 | "小王负责前端" | `left-brain.sh remember "..."` |
| 用户纠正 | 不对、错了、不是这样、别这样 | "不对，应该用PostgreSQL" | `left-brain.sh preference "纠正:..."` |

> 不方便执行 bash 时使用感知队列：`enqueue.sh "要记忆的内容"`
> Stop hook 会在你停止时提醒处理

## 纠正学习规则

当用户表达否定/纠正时：
1. 立即存储：`left-brain.sh preference "纠正: [用户说的原话]"`
2. 触发词：不对、错了、不是这样、别这样、我不要、换个方式、重来、不喜欢、不要用、应该是、我更喜欢、习惯用、之前说错了
3. 后续类似场景先 recall 搜索相关偏好知识并遵守

## 🚫 What NOT to save（不该存的清单）

> **来源**：Anthropic Claude Code 官方 Cowork auto-memory 规范（asgeirtj/system_prompts_leaks::claude-cowork-dispatch.md `# auto memory` 段），2026-06-28 提炼到本规则。

**以下 5 类信息坚决不写进左脑 KB**——即使用户明确要求：

1. **代码模式 / 约定 / 架构 / 文件路径 / 项目结构** — `Read` / `Grep` / `Glob` 可即时派生
2. **Git 历史 / 最近改动 / 谁改了什么** — `git log` / `git blame` 是权威源
3. **调试方案 / 修复配方** — 修复已在代码里，commit message 已有上下文
4. **CLAUDE.md 已写过的内容** — 已固化到规则文件，重复存储 = 漂移
5. **临时任务细节** — 进行中的工作 / 临时状态 / 当前会话上下文（属于 plan 或 task，不属于 memory）

> **判断技巧**：用户说"记住这个"时，反问自己——**"这事过 3 个月还记得吗？还能从代码/git/规则反推吗？"** 两个都否 = 值得存；任一是 = 不存。

> **强约束**：如果用户要存的是以上 5 类，**礼貌拒绝 + 解释**（"这条 git log 能查到，存了反而冗余"），不为了讨好而存。

</important>
