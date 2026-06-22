#!/bin/bash
# 🧠 左脑会话初始化脚本
# 新会话开始时自动执行

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SESSIONS_DIR="${SKILL_DIR}/memory/sessions"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"
SUMMARY_FILE="${SESSIONS_DIR}/latest_summary.md"
MEMORY_FILE="${SKILL_DIR}/memory/MEMORY.md"

echo "🧠 左脑会话初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📚 Step 1: 加载知识索引"
if [ -f "$MEMORY_FILE" ]; then
    knowledge_count=$(grep -E '知识总数:' "$MEMORY_FILE" | sed 's/.*知识总数: //')
    echo "  知识条目: ${knowledge_count:-0}"
else
    echo "  知识条目: 0"
fi
echo ""

echo "📝 Step 2: 加载上次会话摘要"
if [ -f "$SUMMARY_FILE" ]; then
    echo "  ✅ 找到上次会话摘要"
    grep -A 100 '## 对话内容' "$SUMMARY_FILE" | head -20
    if grep -q '## 关键决策' "$SUMMARY_FILE"; then
        grep -A 10 '## 关键决策' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5
    fi
    if grep -q '## 待办事项' "$SUMMARY_FILE"; then
        grep -A 10 '## 待办事项' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5
    fi
else
    echo "  📝 暂无历史会话摘要"
fi
echo ""

echo "🔗 Step 3: 加载相关知识"
if [ -d "$KNOWLEDGE_DIR" ]; then
    recent_files=$(ls -1t "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | head -5)
    if [ -n "$recent_files" ]; then
        echo "  最近访问的知识:"
        echo "$recent_files" | while read file; do
            id=$(basename "$file" .md)
            content=$(head -20 "$file" | grep -E '^content:' | sed 's/^content: //' | head -c 50)
            echo "    - $id: $content..."
        done
    fi
fi
echo ""

echo "⚙️ Step 4: 系统状态"
echo "  日期: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  知识库: $KNOWLEDGE_DIR"
echo "  会话记录: $SESSIONS_DIR"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 初始化完成！"
