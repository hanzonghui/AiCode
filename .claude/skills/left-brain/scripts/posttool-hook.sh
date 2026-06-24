#!/bin/bash
# PostToolUse hook — 自我反思引擎（v1.9.1 智能增量 A）
#
# 触发：每次 Claude 调用 Edit/Write 工具后
# 作用：调用 self-reflect.js 对修改的文件做轻量自检
#       4 个规则：代码完整性 / 测试触发 / TODO 扫描 / 文档版本号
#       反馈写入 .claude/skills/left-brain/memory/reflections.jsonl
#       下次 SessionStart 顶部展示
#
# 设计原则：永不阻塞主流程（任何异常都 exit 0）
# @since v1.9.1 (2026-06-24)

# 通过 git 找仓库根（最可靠，跨平台）
WORKSPACE_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)

if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/reflection/self-reflect.js" ]; then
  cat | node "$WORKSPACE_ROOT/scripts/orchestrator/reflection/self-reflect.js" 2>/dev/null
fi

exit 0
