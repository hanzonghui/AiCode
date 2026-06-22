#!/bin/bash
# 🧠 左脑 Token 监控脚本
# 用法: token-monitor.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"

echo "🧠 左脑 Token 监控面板"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 统计知识条目数
KNOWLEDGE_COUNT=$(ls -1 "$KNOWLEDGE_DIR"/*.md 2>/dev/null | wc -l)
echo "📚 知识库状态"
echo "  知识条目数: $KNOWLEDGE_COUNT"

echo ""

# 显示最近访问的知识
echo "📝 最近访问的知识"
RECENT=$(ls -1t "$KNOWLEDGE_DIR"/*.md 2>/dev/null | head -5)
if [ -n "$RECENT" ]; then
    echo "$RECENT" | while read file; do
        filename=$(basename "$file" .md)
        content=$(head -20 "$file" | grep -E '^content:' | sed 's/^content: //' | head -c 50)
        echo "  - $filename: $content..."
    done
else
    echo "  (暂无)"
fi

echo ""
echo "📅 日期: $(date '+%Y-%m-%d %H:%M:%S')"
