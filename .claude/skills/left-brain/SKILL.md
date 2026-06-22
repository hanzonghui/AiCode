---
name: left-brain
displayName: 🧠 左脑 — 记忆 + 推理 + 关联 + 感知
version: 1.0
description: >
  Claude Code 原生版左脑 = 自动记忆 + 知识图谱 + 语义搜索 + 上下文注入 + Token 监控。
  你说人话，它自动理解意图并处理。学习一次永久记住，图扩散挖隐藏关联，
  新会话自动加载相关知识，实时监控 Token 消耗。
tags:
  - memory
  - reasoning
  - knowledge-graph
  - auto-perception
  - token-monitor
author: 韩宗辉
icon: 🧠
---

# 🧠 左脑 — Claude Code 原生版

> **v1.0 · 自动记忆 · 知识图谱 · 语义搜索 · 上下文注入 · Token 监控**

---

## ⚡ 30 秒上手

```
/left-brain remember 公司年会定在12月25号，地点国际会议中心3楼
/left-brain recall 年会什么时候在哪里？
/left-brain analyze 分析这段数据：[粘贴数据]
/left-brain dashboard
```

---

## 🎯 核心命令

### 1. 记忆管理

```
/left-brain remember <内容>        → 自动提取并存储知识
/left-brain recall <关键词>        → 搜索相关知识
/left-brain search <关键词>        → 语义搜索（支持模糊匹配）
/left-brain graph <关键词>         → 知识图谱关联搜索（2跳）
/left-brain list [页码]            → 分页浏览所有记忆
/left-brain edit 旧文本|新文本     → 修改已存储的知识
/left-brain delete <关键词>        → 删除知识
```

### 2. 自动感知

```
/left-brain auto on/off            → 开启/关闭自动感知
/left-brain session                → 会话初始化（加载上下文）
```

### 3. 推理分析

```
/left-brain analyze <内容>         → 数据分析（数字/趋势/对比）
/left-brain summarize <内容>       → 文章总结
/left-brain associate <关键词>     → 关联推荐
```

### 4. Token 监控

```
/left-brain dashboard              → 显示 Token 消耗统计
/left-brain stats [天数]           → 查看历史统计
/left-brain cost                   → 计算费用
```

### 5. 系统管理

```
/left-brain status                 → 系统状态
/left-brain backup                 → 备份知识库
/left-brain restore                → 恢复知识库
```

---

## 🧠 自动记忆机制

### 触发条件

当检测到以下类型的信息时，自动提取并存储：

1. **事实类** — 时间、地点、人物、数字、事件
2. **决策类** — "决定用..."、"选择了..."、"最终方案是..."
3. **偏好类** — "我喜欢..."、"习惯用..."、"总是..."
4. **项目类** — 项目名、技术栈、进度、问题
5. **关系类** — 人物关系、团队结构、职责分工

### 存储格式

每条知识存储为独立的 markdown 文件：

```markdown
---
id: KB-20260621-001
content: 公司年会定在12月25号，地点国际会议中心3楼
category: 事件
keywords: [年会, 12月25日, 国际会议中心]
source: 对话自动提取
confidence: 0.95
learned_at: 2026-06-21T10:30:00
last_accessed: 2026-06-21T10:30:00
access_count: 0
related: []
---

# 公司年会

- 时间：12月25号
- 地点：国际会议中心3楼
```

### 去重机制

- 新知识与已有知识比较相似度
- 相似度 > 80%：更新旧条目，不新增
- 相似度 50-80%：作为关联条目存储
- 相似度 < 50%：新增独立条目

---

## 🔍 语义搜索

### 搜索算法

1. **关键词匹配** — 精确匹配标题和标签
2. **语义相似** — 基于内容向量相似度（TF-IDF 简化版）
3. **图扩散** — 从匹配节点出发，遍历关联节点（2跳）
4. **时间衰减** — 最近访问的知识排名更高

### 搜索结果格式

```
🧠 搜索结果：年会
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 精确匹配 (2条)
  1. [KB-20260621-001] 公司年会定在12月25号
     → 关联：年会筹备、场地预订、节目安排
  2. [KB-20260615-003] 年会预算5万元
     → 关联：年会、财务审批

🔗 关联知识 (3条)
  3. [KB-20260610-002] 12月是年底冲刺期
  4. [KB-20260608-005] 国际会议中心在CBD
  5. [KB-20260605-001] 小王负责活动策划
```

---

## 📊 Token 监控

### 统计维度

- **消耗量** — 输入/输出 token 数
- **节省量** — 通过记忆注入避免的重复说明
- **费用** — 按 Claude 定价计算
- **效率** — 每次对话的平均消耗

### Dashboard 输出

```
🧠 左脑 Token 监控面板
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 今日统计
  输入 Token:    125,430
  输出 Token:     45,670
  总计:          171,100
  预估费用:      ¥0.85

💡 节省统计
  记忆注入次数:    8 次
  避免重复说明:   ~15,000 tokens
  节省金额:       ¥0.075

📈 本周趋势
  周一: ████████ 180k
  周二: ██████ 140k
  周三: █████████ 200k
  周四: ███████ 160k
  周五: ██████████ 220k

🎯 效率指标
  对话次数:      23
  平均消耗:     7.4k/次
  记忆命中率:    34%
```

---

## 🔧 实现细节

### 目录结构

```
~/.claude/projects/<project>/memory/
├── MEMORY.md                    # 索引文件
├── knowledge/
│   ├── KB-20260621-001.md       # 知识条目
│   ├── KB-20260621-002.md
│   └── ...
├── associations/
│   └── graph.json               # 知识图谱关联数据
└── logs/
    ├── access.log               # 访问日志
    └── token_stats.json         # Token 统计
```

### 自动注入机制

在 CLAUDE.md 中添加：

```markdown
## 左脑记忆系统
每次新会话开始时，自动读取 memory/MEMORY.md 获取知识索引。
当用户提到相关话题时，自动读取对应知识文件注入上下文。
```

### Token 统计实现

通过 Bash 脚本调用 Claude Code 的内部 API 或解析日志文件，实时统计 token 消耗。

---

## 🚀 快速开始

### 首次使用

```
/left-brain session    → 初始化系统 + 加载上下文
```

### 日常使用

```
/left-brain remember 项目A用的是Spring Boot 3.2 + Vue3
/left-brain recall 项目A技术栈
/left-brain graph 项目A    → 查看关联知识
```

### 成本控制

```
/left-brain dashboard    → 实时查看消耗
/left-brain cost         → 计算今日费用
```

---

## ⚠️ Gotchas / 已知坑点

> 经验总结，避免重复踩坑。

### 环境兼容性

| 坑 | 表现 | 解决 |
|:---|:-----|:-----|
| Windows 上的 `jq` 坏掉了 | Node.js 装的 jq 缺 async 模块 | 用 grep+sed 替代 |
| `date -d` 在 Git Bash 上不可用 | Linux/macOS 语法不兼容 | 加 `2>/dev/null || echo 0` 兜底 |
| `stat -c` vs `stat -f` 差异 | Linux 用 -c，macOS 用 -f | 两者都试，其中一个会失败 |
| Shell 函数内 `local` 变量展开 | heredoc 中 local 不展开 | 用全局变量或 eval 前赋值 |

### 逻辑陷阱

| 坑 | 表现 | 解决 |
|:---|:-----|:-----|
| 关键词分类优先级 | "纠正:项目A用…" 含"项目"被归为技术 | 偏好匹配应排到技术前面 |
| 停用词过滤过重 | "项目" 被停用词过滤，关联推理失败 | 停用词只过滤真正的泛词 |
| sed 替换 JSON | 含 `/` 的路径导致 sed 失败 | 用 `|` 或其他分隔符替代 `/` |
| grep 中文匹配 | `[一-龥]` 范围在不同 shell 表现不同 | 测试确认在 Git Bash 中正常 |

### 设计局限

- **自动感知**依赖 AI 的 compliance，不是 100% 确定性的
- **图谱扩散**只有 1 跳（非真正的 2 跳全展开），减少 context 消耗
- **Token 监控**是估算值，无法精确获取 Claude Code 内部计数
- **语义搜索**实际是 grep 关键字匹配（非向量/NLP），文档描述偏理想

---

## 📝 注意事项

1. **记忆持久化** — 知识存储在项目 memory 目录，换会话不丢失
2. **隐私安全** — 所有数据本地存储，不上传任何服务器
3. **性能影响** — 知识库过大时搜索可能变慢，建议定期清理过期知识
4. **兼容性** — 完全兼容 Claude Code 原生能力，不需要额外依赖
