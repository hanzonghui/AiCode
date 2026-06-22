#!/bin/bash
# PreToolUse hook — 追踪 tool 调用频率

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="${SKILL_DIR}/memory/logs"
mkdir -p "$LOGS_DIR"

TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_use_name":"[^"]*"' | head -1 | sed 's/.*"//')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

case "$TOOL_NAME" in
    "Skill"|"Agent"|"Bash"|"Edit"|"Write")
        echo "${TIMESTAMP} | ${TOOL_NAME}" >> "${LOGS_DIR}/tool_usage.log"
        tail -500 "${LOGS_DIR}/tool_usage.log" > "${LOGS_DIR}/tool_usage.log.tmp"
        mv "${LOGS_DIR}/tool_usage.log.tmp" "${LOGS_DIR}/tool_usage.log"
        ;;
esac
exit 0
