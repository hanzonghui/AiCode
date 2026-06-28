---
name: skill-install
description: 📦 一键搜索 + 安装 Claude skill — 自动评分 ≥ 7.0 + require 验证
---

# /skill-install · M36B skill-registry

> 对标 Codex "自动安装 skill" 能力。**M36C 过滤营销号低质内容**（评分 ≥ 7.0 才入队）。

## 用法

```
/skill-install "添加 chart 能力"       → 搜索 + 评分 + 安装 top-1
/skill-install list                    → 列出已安装 skill
/skill-install search "AI agent"       → 搜索但不装
/skill-install verify chart-skill      → 验证已安装 skill
/skill-install uninstall chart-skill   → 卸载
```

## 自动执行的动作

1. 扫描 GitHub 上 awesome-claude-skills / Prompt-Engineering-Guide / awesome-ai-agents 3 仓
2. **M36C 评分**（registry-judge.js）：来源 / 描述 / stars / URL / 禁依赖 5 维
3. **闸门**：评分 < 7.0 拒绝（防营销号）
4. 安装到 `.claude/skills/<name>/` + 写 SKILL.md frontmatter
5. **require() 验证**：失败自动回滚
6. 写 registry-state.json（含 checksum）

## 5 大评分维度

| 维度 | 规则 |
|:-----|:-----|
| 来源可信度 | github +1.5 / npm +0.5 / 其他 0 |
| 描述质量 | 长度 5-20 字符 +0.5，< 5 -2 |
| stars | >1000 +1.5 / >100 +1 / >10 +0.3 |
| URL 合法性 | github.com/npmjs.com 满分，其他 -0.5 |
| 禁依赖 | child_process.exec / unsafe-eval 一票否决 |

## 典型场景

| 场景 | 输入 | 自动安装 |
|:-----|:-----|:---------|
| 图表 | `/skill-install "chart"` | recharts / Tremor skill |
| 数据库 | `/skill-install "database"` | prisma / drizzle skill |
| 部署 | `/skill-install "deploy vercel"` | devops skill |
| 动画 | `/skill-install "animation"` | framer-motion skill |

## 与 X / Y / Z 的关系

- **vs ui-install**：ui-install 管"UI 模板脚手架"，skill-install 管"Claude skill 扩展能力"
- **vs evolve**：evolve 是发现候选（评分后入队 candidates.json），skill-install 是直接安装
- **vs M36C 营销号过滤**：评分 < 7.0 自动拒绝，不会污染 `.claude/skills/`

## 接续 prompt 模板

如果安装失败，下一轮可以说：

```
M36B skill-install 安装失败: <query> → 报错 <msg>，请：
1. 用 explorer 探查 awesome-claude-skills 是否还在线
2. 用 planner 调整 registry-scanner 容错
3. 重跑 test-registry.js 验证
```