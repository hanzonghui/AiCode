#!/bin/bash
# 感知队列入队辅助脚本
# 用法: enqueue.sh "要记忆的内容"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
QUEUE_FILE="${SKILL_DIR}/memory/perceive_queue.txt"

mkdir -p "$(dirname "$QUEUE_FILE")"
echo "$*" >> "$QUEUE_FILE"
echo "✅ 已加入感知队列: $*"
