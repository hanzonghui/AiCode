#!/bin/bash
# PostToolUse hook — 智能增量 A + B + C 入口（v1.9.1 → v3.0.8）
#
# 触发：每次 Claude 调用工具后（Edit/Write/Agent 等）
# 作用：并行跑三个智能引擎，永不阻塞主流程
#   A. self-reflect.js — 自我反思（4 规则自检）
#   B. plan-detect.js  — 智能任务规划检测（识别 [plan] 块）
#   C. workflow-observer.js — 自动埋点 file_modified / command_run / test_run / commit
#
# 设计原则：永不阻塞主流程（任何异常都 exit 0）
# @since v1.9.1 (2026-06-24)
# @updated v3.0.8 (2026-07-01) 新增引擎 C

# 通过 git 找仓库根（最可靠，跨平台）
WORKSPACE_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)

# 把 stdin 保存一份给多个引擎用（cat 只能消费一次）
INPUT=$(cat)

# 引擎 A：自我反思
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/reflection/self-reflect.js" ]; then
  echo "$INPUT" | node "$WORKSPACE_ROOT/scripts/orchestrator/reflection/self-reflect.js" 2>/dev/null
fi

# 引擎 B：智能规划检测
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/planning/plan-detect.js" ]; then
  echo "$INPUT" | node "$WORKSPACE_ROOT/scripts/orchestrator/planning/plan-detect.js" detect 2>/dev/null
fi

# 引擎 C：workflow-observer 自动埋点（Edit|Write → file_modified）
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-observer.js" ]; then
  TMPFILE=$(mktemp)
  echo "$INPUT" > "$TMPFILE"
  node "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-observer.js" record-posttool "$TMPFILE" 2>/dev/null
  # 引擎 D：evolution-lock L3 allowed_docs 强制校验
  if [ -f "$WORKSPACE_ROOT/scripts/orchestrator/evolution-lock.js" ]; then
    node "$WORKSPACE_ROOT/scripts/orchestrator/evolution-lock.js" guard-posttool "$TMPFILE" 2>/dev/null
  fi
  rm -f "$TMPFILE"
fi

exit 0