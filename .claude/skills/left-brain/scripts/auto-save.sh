#!/bin/bash
# 会话摘要自动保存脚本 -- 在 Stop hook 中执行（v2.0 - 读取配置）

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
CONFIG_FILE="${SKILL_DIR}/../../../snapshot-config.json"

mkdir -p "$SNAPSHOT_DIR"

# Guard file：auto-perceive.sh 已提醒时，不再执行保存
if [ -f "$GUARD_FILE" ]; then
    rm -f "$GUARD_FILE"
    exit 0
fi

# 读取快照配置
MODE="milestone"
MIN_INTERVAL=30
if [ -f "$CONFIG_FILE" ]; then
    MODE=$(grep -oE '"mode"\s*:\s*"[^"]+"' "$CONFIG_FILE" 2>/dev/null | sed 's/.*:"\([^"]*\)".*/\1/')
    MIN_INTERVAL=$(grep -oE '"minIntervalMinutes"\s*:\s*[0-9]+' "$CONFIG_FILE" 2>/dev/null | sed 's/.*://' | tr -d ' ')
    MODE=${MODE:-milestone}
    MIN_INTERVAL=${MIN_INTERVAL:-30}
fi

# mode=off 时完全跳过
if [ "$MODE" = "off" ]; then
    exit 0
fi

# mode=manual 时，Stop hook 自动调用跳过（只有显式 save.js 才保存）
if [ "$MODE" = "manual" ]; then
    exit 0
fi

# 最小间隔检查（仅 Stop hook 自动保存）
if [ -f "$SUMMARY_FILE" ]; then
    saved_time=$(grep 'saved_at:' "$SUMMARY_FILE" 2>/dev/null | sed 's/saved_at: //')
    if [ -n "$saved_time" ]; then
        saved_ts=$(date -d "$saved_time" +%s 2>/dev/null || echo 0)
        now_ts=$(date +%s)
        if [ "$saved_ts" != "0" ] && [ $((now_ts - saved_ts)) -lt $((MIN_INTERVAL * 60)) ]; then
            exit 0
        fi
    fi
fi

# 收集最近 1 小时内的新增/修改知识
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

# mode=milestone 时，只在有明确“完成/里程碑”迹象才保存（Stop hook 里很难判断，保守跳过）
# 这里把 Stop hook 自动快照降级为只保存知识增量，不更新 ROOT 索引
if [ "$MODE" = "milestone" ]; then
    # 简单启发：如果队列里有“完成/里程碑”字样，或者最近知识包含 milestone 标签，才保存
    if ! echo "$recent_knowledge $queue_content" | grep -qiE '完成|里程碑|交付|done|milestone|verified|completed'; then
        exit 0
    fi
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

# 快照清理：保留最近 30 个
SNAP_COUNT=$(ls -1 "${SNAPSHOT_DIR}/snapshot_"*.md 2>/dev/null | wc -l)
if [ "$SNAP_COUNT" -gt 30 ]; then
    TO_DELETE=$((SNAP_COUNT - 30))
    ls -1t "${SNAPSHOT_DIR}/snapshot_"*.md 2>/dev/null | tail -n "$TO_DELETE" | while read old; do
        rm -f "$old"
    done
fi

exit 0
