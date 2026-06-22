---
description: 会话记忆、跨会话续接、智能丢弃策略
---

<important if="会话中包含项目上下文、技术决策、待办事项等需要跨会话记忆的内容">

## 📋 会话记忆

### 启动协议（每次新会话）
```bash
# 1. 初始化左脑
bash .claude/skills/left-brain/scripts/session-init.sh
# 2. 加载上次会话摘要
bash .claude/skills/left-brain/scripts/session-summary.sh load
```

### 会话结束前
```bash
bash .claude/skills/left-brain/scripts/session-summary.sh save "摘要内容"
```

> Stop hook 已配置 auto-save.sh 兜底自动保存

### 定期自动保存（每10轮）
每10轮对话保存一次快照：
```bash
bash .claude/skills/left-brain/scripts/session-summary.sh save "自动快照: [简要总结本轮对话内容]"
```

### 管理命令
```bash
# 查看所有会话
bash .claude/skills/left-brain/scripts/session-summary.sh list
# 清理旧会话（保留最近30天）
bash .claude/skills/left-brain/scripts/session-summary.sh cleanup 30
```

## 🧠 智能会话记忆

### 核心流程
```
自动加载 → 静默保留 → 3轮判断 → 智能丢弃
```

| 轮次 | 逻辑 | 动作 |
|:-----|:-----|:-----|
| 第1-2轮 | 无论用户问什么 | 保留摘要不显示 |
| 第3轮 | 判断话题是否相关 | 相关→保留；不相关→丢弃 |
| 第4轮+ | 如果摘要还在 | 继续判断，最多保留5轮 |

### 相关性标准

**保留**的迹象：
- 用户内容与摘要主题直接关联
- 用户提到摘要中的关键词（项目名、技术、人物等）
- 用户在继续待办事项

**丢弃**的迹象：
- 用户开启全新话题
- 连续3轮没有提及摘要内容

</important>
