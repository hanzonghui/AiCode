# 🧠 左脑 - Claude Code 记忆增强系统

> 自动记忆 + 知识图谱 + 语义搜索 + 上下文注入 + Token 监控

## 🚀 快速开始

### 安装

Skill 已自动安装到 `.claude/skills/left-brain/`

### 初始化

```bash
# 运行初始化脚本
bash ~/.claude/skills/left-brain/scripts/left-brain.sh status
```

### 基本使用

```bash
# 记忆知识
bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "项目A用的是Spring Boot 3.2"

# 搜索知识
bash ~/.claude/skills/left-brain/scripts/left-brain.sh recall "项目A"

# 查看监控面板
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
```

## 📁 目录结构

```
.claude/skills/left-brain/
├── SKILL.md                    # Skill 定义文件
├── README.md                   # 本文件
├── memory/
│   ├── MEMORY.md               # 知识索引
│   ├── knowledge/              # 知识条目
│   │   ├── KB-20260621-001.md
│   │   └── ...
│   ├── associations/           # 关联数据
│   └── logs/                   # 日志
└── scripts/
    ├── left-brain.sh           # 核心脚本
    └── token-monitor.sh        # Token 监控
```

## 🎯 核心功能

### 1. 自动记忆

当对话中出现以下信息时，自动提取并存储：

- **事实类** — 时间、地点、人物、数字
- **决策类** — "决定用..."、"选择了..."
- **偏好类** — "我喜欢..."、"习惯用..."
- **项目类** — 项目名、技术栈、进度

### 2. 语义搜索

支持三种搜索模式：

1. **精确匹配** — 关键词直接匹配
2. **分类搜索** — 按类别筛选
3. **关联搜索** — 2跳关联发现

### 3. 知识图谱

自动构建知识关联网络：

```
项目A ─── 技术栈 ─── Spring Boot
  │                    │
  └── 负责人 ─── 小王 ──┘
```

### 4. Token 监控

实时统计：

- 知识库大小
- 分类分布
- 最近访问
- 系统状态

## 🔧 集成到 CLAUDE.md

在项目的 `CLAUDE.md` 中添加：

```markdown
## 🧠 左脑记忆系统

每次新会话开始时，自动执行：

1. 读取 `~/.claude/skills/left-brain/memory/MEMORY.md` 获取知识索引
2. 当用户提到相关话题时，自动读取对应知识文件
3. 记住对话中有价值的信息，使用以下命令：

\`\`\`bash
# 记忆知识
bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "内容"

# 搜索知识
bash ~/.claude/skills/left-brain/scripts/left-brain.sh recall "关键词"

# 查看监控
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
\`\`\`
```

## 📊 与原版左脑对比

| 功能 | 原版左脑 | Claude Code 版 |
|:-----|:---------|:---------------|
| 自动记忆 | ✅ | ✅ |
| 知识图谱 | ✅ | ✅ |
| 语义搜索 | ✅ | ✅ (简化版) |
| 上下文注入 | ✅ | ✅ (通过CLAUDE.md) |
| Token 监控 | ✅ (浮动窗口) | ✅ (命令行) |
| 平台 | WorkBuddy | Claude Code |
| 加密狗 | 需要 | 不需要 |
| 费用 | 付费 | 免费 |

## 💡 使用技巧

### 1. 养成记忆习惯

在对话中主动说"记住：xxx"，或者让 AI 自动判断。

### 2. 定期查看 Dashboard

```bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
```

### 3. 清理过期知识

定期检查知识库，删除不再相关的条目。

## 🐛 故障排查

### 问题：搜索不到知识

检查知识文件是否存在：

```bash
ls -la ~/.claude/skills/left-brain/memory/knowledge/
```

### 问题：脚本无法执行

确保有执行权限：

```bash
chmod +x ~/.claude/skills/left-brain/scripts/*.sh
```

## 📝 更新日志

### v1.0 (2026-06-21)
- 初始版本
- 实现基本记忆功能
- 实现语义搜索
- 实现 Token 监控
