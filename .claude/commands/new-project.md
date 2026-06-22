# 新建项目

在 `AI-【3】-项目开发/` 下自动创建并开发项目。

## 工作流程

### Step 1：收集信息

向用户确认以下信息（如果已提供则跳过）：

1. **项目名称**（必填）：英文，小写+连字符，如 `rag-knowledge-base`
2. **项目类型**（可选）：springboot / springboot-ai / python / nodejs / plain（默认 plain）
3. **需求文档**（可选）：markdown 文件路径，或直接在对话中描述需求
4. **是否自动开发**（可选）：是/否（默认否，只生成脚手架）

### Step 2：创建脚手架

使用 Bash 调用脚本：

```bash
bash "${WORKSPACE_ROOT}/.automation/new-project.sh" <项目名> \
  -t <类型> \
  [-r <需求文档路径>] \
  --skip-dev
```

如果用户选择不自动开发，到此结束，输出项目路径和下一步操作。

### Step 3：自动开发（可选）

如果用户选择自动开发：

1. 读取需求文档（REQUIREMENTS.md 或用户对话中提供的需求）
2. 用 Agent 工具派发开发 agent：
   - 工作目录：`${WORKSPACE_ROOT}/AI-【3】-项目开发/<项目名>/`
   - Prompt：读取 AI-ClaudeCode-最佳实践精简.md 约定 + 需求文档 + 执行开发
3. 开发完成后运行构建验证
4. 向用户汇报结果

### Step 4：汇报

```markdown
## ✅ 项目创建完成

**项目名**: <名称>
**路径**: ${WORKSPACE_ROOT}/AI-【3】-项目开发/<名称>/
**技术栈**: <技术栈>

### 已生成
- CLAUDE.md / AGENTS.md / .cursorrules / .lingma/instructions.md
- .qoderrules / .minimaxrc / .claude/memory.md

### 下一步
用你习惯的 AI 工具打开项目目录即可。所有工具自动读取指令文件。
```

## 注意事项

- 项目名只能包含字母、数字、下划线和连字符
- 目标目录已存在则报错
- 需求文档会被复制为 REQUIREMENTS.md
