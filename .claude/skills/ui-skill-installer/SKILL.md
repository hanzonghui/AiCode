---
name: ui-skill-installer
displayName: 🎨 M36A UI Skill Installer — 一键安装 shadcn + Tailwind + v0 模板
version: 1.0.0
description: >
  让 Claude 一键安装对标 GitHub 主流 UI 模板。5 大场景（landing / dashboard / chat / admin / portfolio）
  从 shadcn-ui/ui + vercel/next.js + vercel/ai-chatbot 抽取，配合 v0-adapter（当前 stub，M41 真实接入）
  输出设计 token + 完整 Next.js 15 + React 19 + Tailwind v4 脚手架。
tags: [ui, frontend, shadcn, tailwind, nextjs, scaffold, v0, m36a]
author: 韩宗辉
icon: 🎨
---

# M36A ui-skill-installer

> **状态**：✅ v1.0 已实现（M36A · 2026-06-28）
> **目标**：补齐终极愿景（05.md）的"UI 构建"短板
> **关联**：[05-智能体进化终极愿景.md](../../../05-智能体进化终极愿景.md) 阶段 1 · [04_自我演进路线.md](../../../04_自我演进路线.md) §0.4

---

## 🎯 一句话

> **`/ui-install "做个 SaaS 后台"`** → 30 秒得到 Next.js 15 + shadcn + Tailwind + 设计 token 的完整可运行项目

---

## 🚀 5 步流程

1. **扫描 GitHub**（template-scanner.js）→ 3 仓 templates 目录 → 内存清单 + 离线缓存
2. **关键词 / LLM-judge 选模板**（template-judge.js）→ 5 大场景关键词匹配 → top-1
3. **生成设计 token**（v0-adapter.js）→ 当前 stub heuristic，M41 真实接入 v0.dev API
4. **脚手架生成**（template-scaffolder.js）→ 8 个文件（package.json + tailwind.config + tsconfig + app/page.tsx + test-init.js ...）
5. **测试 + 文档**（test-ui-installer.js）→ 14+ 单元 + 集成测试，离线跑通

---

## 🛡 安全约束

- 不动 `scripts/orchestrator/`、`scripts/evolution/`、`scripts/mcp/`、`.claude/`
- 目标目录默认 `AI-【3】-项目开发/<project>/`，已存在报错
- v0 stub 输出有 `[STUB]` 前缀，避免误以为是真实生成
- 永不在用户仓库内自动 `git init` / `commit`

---

## 🔗 集成点

| 现有系统 | 集成方式 |
|:---------|:---------|
| **evolution-lock.js** | 大型任务前 acquire，完成 complete |
| **dispatcher.js** | 复杂需求（5+ 文件）派 sub-agent |
| **left-brain memos** | 完成后 enqueue 一条 KB，下次 recall 命中 |
| **llm-adapter.js** | template-judge 直接 require，零适配 |
| **autonomous mode** | `always` 模式下批量串行执行 |

---

## 📋 验收

- ✅ 14+ 测试通过（test-ui-installer.js）
- ✅ 5 大场景都能脚手架
- ✅ `--dry-run` 模式跳过写盘
- ✅ npm script `npm run ui-install` 可用
- ✅ `/ui-install` 命令在 `.claude/commands/ui-install.md`