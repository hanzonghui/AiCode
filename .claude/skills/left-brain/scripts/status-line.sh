#!/bin/bash
# 状态栏脚本 — 显示 context 水位、知识条目、时间
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"

kcount=$(ls -1 "$KNOWLEDGE_DIR"/*.md 2>/dev/null | wc -l)
time=$(date '+%H:%M')

if [ "$kcount" -gt 50 ]; then
  echo "🧠${kcount} ⚠️ /compact | ${time}"
elif [ "$kcount" -gt 20 ]; then
  echo "🧠${kcount} ℹ️ | ${time}"
else
  echo "🧠${kcount} | ${time}"
fi
