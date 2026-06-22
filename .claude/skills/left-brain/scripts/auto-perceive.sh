#!/bin/bash
# 自动感知兜底脚本 -- 在 Stop hook 中执行

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
QUEUE_FILE="${SKILL_DIR}/memory/perceive_queue.txt"
GUARD_FILE="${SKILL_DIR}/memory/.stop_hook_guard"

if [ -f "$GUARD_FILE" ]; then
    rm -f "$GUARD_FILE"
    exit 0
fi

if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
    ITEMS=$(cat "$QUEUE_FILE")
    ITEM_COUNT=$(wc -l < "$QUEUE_FILE")
    echo "⚠️ 感知队列中有 ${ITEM_COUNT} 条待记忆项:" >&2
    echo "$ITEMS" >&2
    echo "处理: bash .claude/skills/left-brain/scripts/left-brain.sh remember '内容'" >&2
    touch "$GUARD_FILE"
    exit 2
else
    exit 0
fi
