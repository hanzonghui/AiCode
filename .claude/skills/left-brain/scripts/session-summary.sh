#!/bin/bash
# 🧠 左脑会话摘要管理脚本
# 用法: session-summary.sh <command> [args]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SESSIONS_DIR="${SKILL_DIR}/memory/sessions"
SUMMARY_FILE="${SESSIONS_DIR}/latest_summary.md"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"

mkdir -p "$SESSIONS_DIR"

save_summary() {
    local summary="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local session_id=$(date '+%Y%m%d-%H%M%S')
    local session_file="${SESSIONS_DIR}/session_${session_id}.md"

    if [ -f "$SUMMARY_FILE" ]; then
        local prefix=$(echo "$summary" | head -c 50)
        if grep -qF "$prefix" "$SUMMARY_FILE" 2>/dev/null; then
            echo "📝 内容与最新摘要相似，跳过重复保存"
            return
        fi
    fi

    cat > "$session_file" << EOF
---
session_id: ${session_id}
saved_at: ${timestamp}
type: session_summary
---
# 会话摘要
## 对话内容
${summary}
## 关键决策
<!-- 由 AI 在保存前填充 -->
## 待办事项
<!-- 由 AI 在保存前填充 -->
## 下次继续
<!-- 由 AI 在保存前填充 -->
EOF

    cp "$session_file" "$SUMMARY_FILE"
    echo "✅ 会话摘要已保存: ${session_id}"

    # M8 联动: 自动写 state-snapshot（向后兼容 --next 参数）
    local next_action=""
    local snapshot_args=("$summary")
    while [ $# -gt 0 ]; do
        case "$1" in
            -m|--next)
                next_action="$2"
                snapshot_args+=("-m" "$2")
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    if [ -f "${SCRIPT_DIR}/state-snapshot.js" ]; then
        node "${SCRIPT_DIR}/state-snapshot.js" save "${snapshot_args[@]}" 2>&1 | head -5 || true
    fi
}

load_summary() {
    # M8 优先: 加载 state-snapshot（更丰富），如果不存在 fallback 到旧摘要
    if [ -f "${SCRIPT_DIR}/state-snapshot.js" ]; then
        local snap_out=$(node "${SCRIPT_DIR}/state-snapshot.js" load 2>/dev/null)
        if [ -n "$snap_out" ]; then
            echo "$snap_out"
            return
        fi
    fi

    if [ -f "$SUMMARY_FILE" ]; then
        local content=$(grep -A 100 '## 对话内容' "$SUMMARY_FILE" | head -20)
        local decisions=$(grep -A 10 '## 关键决策' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5)
        local todos=$(grep -A 10 '## 待办事项' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5)
        local next=$(grep -A 10 '## 下次继续' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5)
        echo "📝 上次会话摘要已加载"
        [ -n "$decisions" ] && echo "  关键决策: $decisions"
        [ -n "$todos" ] && echo "  待办事项: $todos"
    else
        echo "📝 暂无历史会话摘要"
    fi
}

case "${1:-}" in
    save)
        shift
        save_summary "$@"
        ;;
    load)
        load_summary
        ;;
    list)
        echo "📋 会话记录列表"
        ls -1t "$SESSIONS_DIR"/session_*.md 2>/dev/null | head -10 | while read f; do
            id=$(basename "$f" .md | sed 's/session_//')
            time=$(grep 'saved_at:' "$f" | sed 's/saved_at: //' 2>/dev/null)
            echo "  - $id ($time)"
        done
        ;;
    cleanup)
        local days=${2:-30}
        find "$SESSIONS_DIR" -name "session_*.md" -mtime +"$days" -delete 2>/dev/null
        echo "🧹 已清理 ${days} 天前的会话记录"
        ;;
    *)
        echo "用法: session-summary.sh <save|load|list|cleanup> [args]"
        ;;
esac
