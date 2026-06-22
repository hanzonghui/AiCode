#!/bin/bash
# Setup hook — 新会话自动加载 MEMORY.md + 最近知识（仅首次加载）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
MEMORY_FILE="${SKILL_DIR}/memory/MEMORY.md"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"
START_MARKER="${SKILL_DIR}/memory/.session_started"

if [ -f "$START_MARKER" ]; then
    echo "⚡ 会话继续中 | 输入 /status 查看状态"
    exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧠 左脑系统已就绪"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"

bash "${SKILL_DIR}/scripts/session-init.sh" 2>/dev/null

if [ -f "$MEMORY_FILE" ]; then
    echo ""
    echo "📚 记忆索引:"
    sed -n '2,10p' "$MEMORY_FILE"
fi

echo ""
echo "📝 最近知识:"
ls -1t "$KNOWLEDGE_DIR"/*.md 2>/dev/null | head -5 | while read file; do
    [ -f "$file" ] || continue
    id=$(basename "$file" .md)
    content=$(head -20 "$file" | grep -E '^content:' | sed 's/^content: //')
    echo "  ▪ $id: $content"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "命令: /remember  /status  /compact-hint  /go"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"

touch "$START_MARKER"
