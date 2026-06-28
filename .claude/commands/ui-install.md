---
name: ui-install
description: 🎨 一键安装 shadcn + Tailwind + v0 UI 模板 — 让 Claude 30 秒产出 Next.js 完整项目
---

# /ui-install · M36A ui-skill-installer

> 一键安装对标 GitHub 主流 UI 模板。**5 大场景**：landing / dashboard / chat / admin / portfolio。

## 用法

```
/ui-install "做个 SaaS 后台"         → 默认输出到 ./ui-out-<timestamp>
/ui-install "landing page" --out ./marketing
/ui-install "做个聊天页面" --dry-run   → 预览不写盘
```

5 大场景关键词自动识别：landing / dashboard / chat / admin / portfolio。

## 自动执行的动作

1. 扫描 GitHub 上 shadcn-ui/ui + vercel/next.js + vercel/ai-chatbot 3 仓 templates
2. 关键词匹配 + LLM-judge 选最佳模板
3. v0-adapter 生成设计 token（当前 stub heuristic，M41 真实接入 v0.dev API）
4. 输出 Next.js 15 + React 19 + Tailwind v4 完整脚手架（8 个文件）
5. 自动生成 test-init.js（验证 `npm install && npm run build` 通过）

## 典型场景

| 场景 | 输入 | 产物 |
|:-----|:-----|:-----|
| SaaS 后台 | `/ui-install "做个 SaaS 后台"` | dashboard 模板 + recharts |
| 落地页 | `/ui-install "marketing landing page"` | landing 模板 + hero/pricing/footer |
| AI 聊天 | `/ui-install "AI chat 页面"` | chat 模板 + AI SDK + streaming |
| 管理后台 | `/ui-install "Crm admin panel"` | admin 模板 + react-hook-form + zod |
| 作品集 | `/ui-install "个人 portfolio"` | portfolio 模板 + framer-motion |

## 与 X / Y / Z 的关系

- **vs handoff**：handoff 管"会话接续"，ui-install 管"项目初始化"
- **vs evolve**：evolve 扫描 GitHub 入队候选，ui-install 落地具体模板
- **vs audit**：audit 是事后审查，ui-install 是事前生成

## 接续 prompt 模板

如果脚手架生成失败，下一轮可以说：

```
M36A ui-skill-installer 脚手架失败在 <scene>，报错 <msg>，请：
1. 用 explorer 探查 <scene> 模板路径是否还存在于 GitHub
2. 用 planner 调整 scaffolder 容错
3. 重跑 test-ui-installer.js 验证
```