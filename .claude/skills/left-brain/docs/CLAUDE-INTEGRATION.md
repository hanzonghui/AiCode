# 🧠 左脑集成指南

## 如何将左脑集成到你的 Claude Code 工作流

### 方案一：项目级集成（推荐）

在项目的 `CLAUDE.md` 中添加以下内容：

```markdown
## 🧠 左脑记忆系统

### 启动协议
每次新会话开始时，执行以下步骤：
1. 读取 `~/.claude/skills/left-brain/memory/MEMORY.md` 获取知识索引
2. 根据当前工作目录，加载相关知识

### 记忆命令
当需要记忆信息时，使用：
\`\`\`bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "内容"
\`\`\`

### 搜索命令
当需要查找信息时，使用：
\`\`\`bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh recall "关键词"
\`\`\`

### 监控命令
当需要查看统计时，使用：
\`\`\`bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
\`\`\`
```

### 方案二：全局集成

在 `~/.claude/CLAUDE.md` 中添加上述内容，这样所有项目都能使用左脑。

### 方案三：手动使用

不修改 CLAUDE.md，直接在对话中调用脚本：

```bash
# 记忆
bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "今天开了项目启动会"

# 搜索
bash ~/.claude/skills/left-brain/scripts/left-brain.sh recall "项目启动"

# 监控
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
```

## 🔍 自动感知实现

在 CLAUDE.md 中添加自动感知规则：

```markdown
### 自动感知规则

当检测到以下信息时，自动调用记忆命令：

1. **事实信息** — 包含日期、时间、地点、人物、数字
   → 自动调用: `bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "内容"`

2. **技术决策** — 包含"决定用"、"选择了"、"确认"、"方案"
   → 自动调用: `bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "决策内容"`

3. **项目信息** — 包含项目名、技术栈、进度
   → 自动调用: `bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "项目信息"`

4. **用户偏好** — 包含"我喜欢"、"习惯用"、"总是"、"不要"
   → 自动调用: `bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "偏好内容"`
```

## 📊 Token 监控集成

在 CLAUDE.md 中添加监控规则：

```markdown
### Token 监控

每 5 轮对话后，自动执行：
\`\`\`bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
\`\`\`
```

## 🎯 完整集成示例

以下是一个完整的 CLAUDE.md 集成示例：

```markdown
# 项目名称

## 🧠 左脑记忆系统

### 启动协议
1. 读取 `~/.claude/skills/left-brain/memory/MEMORY.md`
2. 加载相关知识到上下文

### 自动感知
当检测到有价值信息时，自动记忆：
- 事实信息 → `remember`
- 技术决策 → `remember`
- 项目信息 → `remember`
- 用户偏好 → `remember`

### 记忆命令
\`\`\`bash
bash ~/.claude/skills/left-brain/scripts/left-brain.sh remember "内容"
bash ~/.claude/skills/left-brain/scripts/left-brain.sh recall "关键词"
bash ~/.claude/skills/left-brain/scripts/left-brain.sh dashboard
\`\`\`

### 监控
每 5 轮对话自动显示统计
```

## ⚠️ 注意事项

1. **隐私安全** — 所有数据存储在本地，不会上传服务器
2. **性能影响** — 知识库过大时可能影响搜索速度
3. **兼容性** — 完全兼容 Claude Code 原生能力
4. **备份建议** — 定期备份 `~/.claude/skills/left-brain/memory/` 目录
