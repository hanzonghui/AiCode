#!/bin/bash
# 会话摘要自动保存脚本 -- 在 Stop hook 中执行

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"
SESSIONS_DIR="${SKILL_DIR}/memory/sessions"
SUMMARY_FILE="${SESSIONS_DIR}/latest_summary.md"
SNAPSHOT_DIR="${SESSIONS_DIR}/snapshots"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE_STR=$(date '+%Y%m%d')
TIME_STR=$(date '+%H%M%S')
GUARD_FILE="${SKILL_DIR}/memory/.stop_hook_guard"

mkdir -p "$SNAPSHOT_DIR"

if [ -f "$GUARD_FILE" ]; then
    rm -f "$GUARD_FILE"
    exit 0
fi

if [ -f "$SUMMARY_FILE" ]; then
    saved_time=$(grep 'saved_at:' "$SUMMARY_FILE" 2>/dev/null | sed 's/saved_at: //')
    if [ -n "$saved_time" ]; then
        saved_ts=$(date -d "$saved_time" +%s 2>/dev/null || echo 0)
        now_ts=$(date +%s)
        if [ "$saved_ts" != "0" ] && [ $((now_ts - saved_ts)) -lt 300 ]; then
            exit 0
        fi
    fi
fi

recent_knowledge=""
for file in $(ls -1t "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | head -10); do
    file_time=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null || echo 0)
    now_time=$(date +%s)
    age=$((now_time - file_time))
    if [ $age -lt 3600 ]; then
        id=$(basename "$file" .md)
        content=$(grep -E '^content:' "$file" | sed 's/^content: //')
        recent_knowledge="${recent_knowledge}- [$id] ${content}\n"
    fi
done

queue_content=""
if [ -f "${SKILL_DIR}/memory/perceive_queue.txt" ] && [ -s "${SKILL_DIR}/memory/perceive_queue.txt" ]; then
    queue_content=$(cat "${SKILL_DIR}/memory/perceive_queue.txt")
fi

if [ -z "$recent_knowledge" ] && [ -z "$queue_content" ]; then
    exit 0
fi

SNAPSHOT_FILE="${SNAPSHOT_DIR}/snapshot_${DATE_STR}_${TIME_STR}.md"
cat > "$SNAPSHOT_FILE" << EOFINNER
---
session_id: ${DATE_STR}-${TIME_STR}
saved_at: ${TIMESTAMP}
type: auto_snapshot
---
# 自动会话快照
**保存时间**: ${TIMESTAMP}
## 本次会话新增/修改的知识
$(echo -e "$recent_knowledge")
## 未处理的感知队列
${queue_content:-"(空)"}
EOFINNER

if [ ! -f "$SUMMARY_FILE" ] || ! grep -q "type: session_summary" "$SUMMARY_FILE" 2>/dev/null; then
    cp "$SNAPSHOT_FILE" "$SUMMARY_FILE"
fi

> "${SKILL_DIR}/memory/perceive_queue.txt" 2>/dev/null
exit 0
