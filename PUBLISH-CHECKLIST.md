# 本地发布检查清单

> 把工作空间拷贝到新机器前，按此清单确认可用。

## 环境要求

- [ ] Node.js >= 18（推荐 22+，因为 sqlite MCP server 用 node:sqlite）
- [ ] Git
- [ ] Claude Code CLI (`claude`)
- [ ] Bash（Windows 用 Git Bash）

## 发布前检查

- [ ] `npm test` 全部通过
- [ ] `npm run benchmark` 能跑出结果
- [ ] `bash .workspace/setup.sh` 无报错
- [ ] `.claude/mcp.json` 路径匹配新机器
- [ ] `00_ROOT_快速加载会话.md` 是最新快照索引

## 拷贝到新机器后

```bash
# 1. 运行适配脚本
bash .workspace/setup.sh

# 2. 验证测试
npm test

# 3. 验证 MCP
npm run test:mcp

# 4. 启动 Claude Code
claude
```

## 已知限制

- **不推远端**：GitHub Actions CI 配置已写，但需推送到 GitHub 才生效
- **MCP 路径**：v1.7.1 起由 `setup.sh` 自动生成，新机器运行 setup.sh 即可，无需手动替换
- **真实子进程隔离**：受 Claude Code 内核限制，当前用 Agent 工具模拟并行
- **真实 LLM**：`llm-adapter.js` 已预留接口，需装 SDK + 提供 API key
- **中文路径**：v1.7.1 已将个人资料中的中文目录（AI-【0-4】）移出核心工程，核心仓库不再依赖中文路径

## 版本

- 当前：v1.7.1
- 最后更新：2026-06-23
