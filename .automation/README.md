# 自动化项目创建系统

> 一句话创建项目 + 配置 6 个 AI 工具 + 可选自动开发

## 快速开始

### 方式 1：Claude Code 内（推荐）

在 Claude Code 中输入 `/new-project`，按提示操作即可。

### 方式 2：Bash 脚本

```bash
cd /path/to/workspace

# 仅生成脚手架（零 AI 成本）
bash .automation/new-project.sh my-api -t springboot

# 脚手架 + 提供需求文档
bash .automation/new-project.sh my-api -t springboot -r requirements.md

# 脚手架 + 自动开发（调用 Claude Code）
bash .automation/new-project.sh my-api -t springboot -r requirements.md -d
```

## 参数说明

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `<项目名>` | 必填，英文+数字+连字符 | - |
| `-t, --type` | 项目类型 | plain |
| `-r, --req` | 需求文档路径 | 无 |
| `-d, --dev` | 自动调用 Claude 开发 | 否 |
| `--skip-git` | 不初始化 git | 否 |
| `--tools` | 指定工具（默认 all） | all |

## 支持的项目类型

| 类型 | 技术栈 |
|:-----|:-------|
| `springboot` | Java 21 + Spring Boot 3.x + Maven |
| `springboot-java8` | Java 8 + Spring Boot 2.x + Maven |
| `springboot-ai` | Java 21 + Spring Boot 3.x + Spring AI Alibaba |
| `springboot-langchain` | Java 21 + Spring Boot 3.x + LangChain4j |
| `python` | Python 3.11+ + FastAPI / Flask |
| `nodejs` | Node.js 20+ + Express / NestJS |
| `plain` | 纯项目（无特定框架） |

## 生成的文件

每个新项目自动生成 6 个 AI 工具指令文件：

| 文件 | 工具 | 加载方式 |
|:-----|:-----|:---------|
| `CLAUDE.md` | Claude Code | 自动 |
| `AGENTS.md` | ZCode / 通用 | 自动 |
| `.cursorrules` | Cursor | 自动 |
| `.lingma/instructions.md` | 通义灵码 | 自动 |
| `.qoderrules` | Qoder | 自动 |
| `.minimaxrc` | MiniMax Code | 自动 |

所有文件引用根目录 `01_AI-ClaudeCode-最佳实践精简.md`，改一处全生效。

## 目录结构

```
.automation/
├── new-project.sh          ← 主脚本
├── README.md               ← 本文件
└── templates/              ← 模板文件
    ├── CLAUDE.md.tmpl
    ├── AGENTS.md.tmpl
    ├── .cursorrules.tmpl
    ├── .lingma-instructions.md.tmpl
    ├── .qoderrules.tmpl
    ├── .minimaxrc.tmpl
    └── dev-prompt.md.tmpl
```

## 自动开发流程

使用 `-d` 参数时，脚本会：

1. 渲染 `dev-prompt.md.tmpl` 为完整开发 prompt
2. 调用 `claude -p --dangerously-skip-permissions` 非交互模式
3. Claude 读取 REQUIREMENTS.md，按步骤完成开发
4. 完成后项目可直接运行

**注意**：自动开发消耗 Token（MIMO 计费），简单项目建议手动开发。
