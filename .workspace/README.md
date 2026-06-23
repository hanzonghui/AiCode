# 个人工作空间 — 移植指南

> 把这个目录搬到任何机器上，5 分钟内即可开始工作

---

## 搬迁步骤

### 1. 拷贝目录

把整个 `AiCode` 目录拷贝到新机器（U盘 / 网盘 / git 均可）。

### 2. 运行适配脚本

```bash
cd /path/to/AiCode
bash .workspace/setup.sh
```

脚本会自动：
- 检测当前路径，写入 `.workspace/workspace.env`
- 检查目录结构，缺失的自动创建
- 安装 npm 依赖（`npm install`）
- 检测已安装的 AI 工具
- 输出适配报告

### 3. 安装缺失工具（如有）

```bash
# Claude Code（必需）
npm install -g @anthropic-ai/claude-code

# Node.js（如缺失）
# 去 https://nodejs.org 下载安装

# Java + Maven（如需 Java 项目）
# 去 https://adoptium.net 下载安装
```

### 4. 验证

```bash
cd /path/to/AiCode
npm test              # 全部测试通过
npm run benchmark     # benchmark 能跑
npm run test:mcp      # MCP server 正常
```

---

## 目录结构

```
AiCode/
├── .workspace/              ← 适配脚本（运行一次即可）
├── .automation/             ← 项目自动化脚本
├── .ai-memory/              ← 跨 IDE 共享记忆
├── .claude/                 ← Claude Code 配置 + MCP
├── 01_AI-ClaudeCode-最佳实践精简.md        ← AI 行为约定
├── CLAUDE.md                ← Claude Code 指令
├── 02_工作空间功能介绍.md       ← v1.7+ 功能介绍
├── AI-【3】-项目开发/        ← 个人项目
├── AI-【4】-公司项目/        ← 公司项目（git clone）
├── archives/                ← 全局归档
├── data/                    ← 本地数据库
├── benchmarks/              ← 性能测试
└── scripts/                 ← 工作空间脚本
```

## 使用须知

- **个人项目**放 `AI-【3】-项目开发/`
- **公司项目**放 `AI-【4】-公司项目/`，每个项目独立 git 管理
- **AI 约定**统一在 `01_AI-ClaudeCode-最佳实践精简.md`，改一处全生效
- **MCP 路径**在新机器上需更新 `.claude/mcp.json` 中的绝对路径
- **搬家后**只需运行 `setup.sh`，所有路径自动适配

## 发布检查

详见根目录 `PUBLISH-CHECKLIST.md`。
