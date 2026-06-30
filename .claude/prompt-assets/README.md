# Prompt Assets

本目录存放可版本化、可复用的 prompt 组件，供 agents / commands / skills 组合使用。

## 目录结构

```
.claude/prompt-assets/
├── README.md
├── system-prompts/      # 系统提示词基座
├── phase-prompts/       # 阶段级 prompt（计划/执行/验证）
├── constraint-prompts/  # 约束/禁令片段
└── report-templates/    # 报告模板
```

##  frontmatter 约定

每个 asset 文件头部应包含：

```yaml
---
asset-type: system-prompt
asset-version: 1.0.0
source: .claude/agents/qa-reviewer.md
role: qa-reviewer
tested-with: heuristic
success-rate: "0/0"
---
```

## 组合方式

agent prompt 通过 `composed-from` 声明组合：

```yaml
---
name: qa-reviewer
composed-from:
  - .claude/prompt-assets/system-prompts/base-qa-system.v1.md
  - .claude/prompt-assets/constraint-prompts/read-only-constraint.v1.md
  - .claude/prompt-assets/report-templates/qa-report-template.v1.md
---
```

实际内容可由 `prompt-asset-manager.js compose` 动态拼合，也可在 agent 文件中直接引用（推荐保留直接引用作为 fallback）。

## 管理工具

```bash
npm run prompt-asset:list      # 列出所有 asset
npm run prompt-asset:diff      # 对比 asset 与引用它的文件
npm run prompt-asset:bump      # 升级版本号
npm run prompt-asset:compose   # 拼合指定 agent
```
