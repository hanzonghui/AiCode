#!/bin/bash
# 🧠 左脑核心脚本
# 用法: left-brain.sh <command> [args]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
MEMORY_DIR="${SKILL_DIR}/memory"
KNOWLEDGE_DIR="${MEMORY_DIR}/knowledge"
ASSOCIATIONS_DIR="${MEMORY_DIR}/associations"
LOGS_DIR="${MEMORY_DIR}/logs"

mkdir -p "$KNOWLEDGE_DIR" "$ASSOCIATIONS_DIR" "$LOGS_DIR"

generate_id() {
    local date_str=$(date '+%Y%m%d')
    local count=$(ls -1 "${KNOWLEDGE_DIR}/KB-${date_str}-"*.md 2>/dev/null | wc -l)
    count=$((count + 1))
    printf "KB-%s-%03d" "$date_str" "$count"
}

find_related() {
    local content="$1"
    local related_ids=""
    local match_count=0
    local max_related=5
    local new_keywords=$(echo "$content" | grep -oE '[一-龥]{2,}|[a-zA-Z0-9]{2,}' | sort -u | grep -vE '^(系统|功能|这个|那个|使用|一个|可以|我们|需要|没有|不是|什么|知道|问题|方式|这些|那些|时候)$')

    for file in "${KNOWLEDGE_DIR}"/*.md; do
        [ -f "$file" ] || continue
        local file_id=$(basename "$file" .md)
        local file_content=$(grep -E '^content:' "$file" | sed 's/^content: //')
        local file_keywords=$(grep -E '^keywords:' "$file" | sed 's/^keywords: //;s/\[//;s/\]//;s/,/ /g')
        local overlap=0
        for kw in $new_keywords; do
            kw=$(echo "$kw" | xargs)
            [ -z "$kw" ] && continue
            if echo "$file_keywords $file_content" | grep -qi "$kw"; then
                overlap=$((overlap + 1))
            fi
        done
        if [ $overlap -ge 1 ] && [ $match_count -lt $max_related ]; then
            if [ -n "$related_ids" ]; then
                related_ids="${related_ids}, ${file_id}"
            else
                related_ids="${file_id}"
            fi
            match_count=$((match_count + 1))
        fi
    done
    echo "$related_ids"
}

update_graph() {
    local new_id="$1"
    local related_ids="$2"
    local graph_file="${ASSOCIATIONS_DIR}/graph.json"

    if [ ! -f "$graph_file" ]; then
        echo '{"nodes":[],"edges":[]}' > "$graph_file"
    fi

    local content=$(grep -E '^content:' "${KNOWLEDGE_DIR}/${new_id}.md" | sed 's/^content: //')
    local category=$(grep -E '^category:' "${KNOWLEDGE_DIR}/${new_id}.md" | sed 's/^category: //')

    if ! grep -q "\"id\": \"${new_id}\"" "$graph_file"; then
        local node_entry="{\"id\":\"${new_id}\",\"content\":\"${content}\",\"category\":\"${category}\"}"
        if grep -q '"nodes":\[' "$graph_file"; then
            if grep -q '"nodes":\[\]' "$graph_file"; then
                sed -i "s/\"nodes\":\[/\"nodes\":[${node_entry}/" "$graph_file"
            else
                sed -i "s/\(\"nodes\":\[[^]]*\)\]/\1,${node_entry}]/" "$graph_file"
            fi
        fi
    fi

    if [ -n "$related_ids" ]; then
        local OLD_IFS="$IFS"
        IFS=','
        read -ra RELATED <<< "$related_ids"
        IFS="$OLD_IFS"
        for rid in "${RELATED[@]}"; do
            rid=$(echo "$rid" | xargs)
            [ -z "$rid" ] && continue
            if ! grep -qE "\"source\":\"${new_id}\".*\"target\":\"${rid}\"|\"source\":\"${rid}\".*\"target\":\"${new_id}\"" "$graph_file"; then
                local edge_entry="{\"source\":\"${new_id}\",\"target\":\"${rid}\",\"type\":\"related\"}"
                if grep -q '"edges":\[' "$graph_file"; then
                    if grep -q '"edges":\[\]' "$graph_file"; then
                        sed -i "s/\"edges\":\[/\"edges\":[${edge_entry}/" "$graph_file"
                    else
                        sed -i "s/\(\"edges\":\[[^]]*\)\]/\1,${edge_entry}]/" "$graph_file"
                    fi
                fi
            fi
        done
    fi
}

graph_search() {
    local matched_ids="$1"
    local graph_file="${ASSOCIATIONS_DIR}/graph.json"
    [ -f "$graph_file" ] || return

    echo ""
    echo "🔗 关联图谱扩散"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local edge_lines=$(grep -oE '"source":"[^"]*","target":"[^"]*"' "$graph_file" 2>/dev/null)
    local hop1_ids=""
    for mid in $matched_ids; do
        while IFS= read -r edge; do
            local src=$(echo "$edge" | sed 's/.*"source":"\([^"]*\)".*/\1/')
            local tgt=$(echo "$edge" | sed 's/.*"target":"\([^"]*\)".*/\1/')
            if [ "$src" = "$mid" ] && ! echo "$hop1_ids $matched_ids" | grep -q "$tgt"; then
                hop1_ids="$hop1_ids $tgt"
            fi
            if [ "$tgt" = "$mid" ] && ! echo "$hop1_ids $matched_ids" | grep -q "$src"; then
                hop1_ids="$hop1_ids $src"
            fi
        done <<< "$edge_lines"
    done

    hop1_ids=$(echo "$hop1_ids" | tr ' ' '\n' | sort -u | tr '\n' ' ')
    local hop_count=0
    for hid in $hop1_ids; do
        hid=$(echo "$hid" | xargs)
        [ -z "$hid" ] && continue
        local hfile="${KNOWLEDGE_DIR}/${hid}.md"
        if [ -f "$hfile" ]; then
            local hcontent=$(grep -E '^content:' "$hfile" | sed 's/^content: //')
            hop_count=$((hop_count + 1))
            echo "  → $hid: $hcontent"
        fi
    done
    if [ $hop_count -eq 0 ]; then
        echo "  (无关联节点)"
    fi
}

remember() {
    local content="$*"
    local id=$(generate_id)
    local file="${KNOWLEDGE_DIR}/${id}.md"
    local timestamp=$(date '+%Y-%m-%dT%H:%M:%S')
    local related_ids=$(find_related "$content")
    local keywords=$(echo "$content" | grep -oE '[一-龥]{2,}|[a-zA-Z][a-zA-Z0-9]+' | head -5 | tr '\n' ',' | sed 's/,$//')

    local category="其他"
    if echo "$content" | grep -qE '不要|不对|错了|纠正|喜欢|讨厌|偏好|习惯'; then
        category="偏好"
    elif echo "$content" | grep -qE '决定|选择|方案|确认'; then
        category="决策"
    elif echo "$content" | grep -qE '时间|日期|地点|会议|年会'; then
        category="事件"
    elif echo "$content" | grep -qE '人|小王|小李|领导|同事|负责'; then
        category="人物"
    elif echo "$content" | grep -qE '项目|开发|代码|技术|框架|API'; then
        category="技术"
    fi

    cat > "$file" << EOF
---
id: $id
content: $content
category: $category
keywords: [$keywords]
source: 对话自动提取
confidence: 0.9
learned_at: $timestamp
last_accessed: $timestamp
access_count: 0
related: [$related_ids]
---
# $(echo "$content" | head -c 50)
$content
EOF

    update_graph "$id" "$related_ids"

    echo "✅ 已记忆: $id"
    echo "📝 内容: $content"
    echo "🏷️ 分类: $category"
    echo "🔑 关键词: $keywords"
    if [ -n "$related_ids" ]; then
        echo "🔗 关联: $related_ids"
    fi
}

recall() {
    local query="$*"
    local found=0
    local matched_ids=""

    echo "🧠 搜索结果: $query"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📌 精确匹配"

    for file in "${KNOWLEDGE_DIR}"/*.md; do
        if [ -f "$file" ] && grep -qi "$query" "$file"; then
            found=$((found + 1))
            local id=$(basename "$file" .md)
            local content=$(head -20 "$file" | grep -E '^content:' | sed 's/^content: //')
            local category=$(head -20 "$file" | grep -E '^category:' | sed 's/^category: //')
            matched_ids="$matched_ids $id"
            if [ "$category" = "偏好" ]; then
                echo "  $found. ⭐ [$id] [偏好] $content"
            else
                echo "  $found. [$id] $content"
            fi
        fi
    done

    if [ $found -eq 0 ]; then
        echo "  (无精确匹配)"
    fi

    echo ""
    echo "🔗 关联搜索"
    for file in "${KNOWLEDGE_DIR}"/*.md; do
        if [ -f "$file" ]; then
            local keywords=$(grep -E '^keywords:' "$file" | sed 's/^keywords: //')
            if echo "$keywords" | grep -qi "$query"; then
                local id=$(basename "$file" .md)
                echo "  - $id"
            fi
        fi
    done

    if [ -n "$matched_ids" ]; then
        graph_search "$matched_ids"
    fi
}

preference() {
    local content="$*"
    remember "$content"
    echo ""
    echo "💡 已存储偏好/纠正，下次遇到类似场景会自动参考"
}

graph() {
    local graph_file="${ASSOCIATIONS_DIR}/graph.json"
    echo "🧠 知识图谱"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    if [ -f "$graph_file" ]; then
        local node_count=$(grep -o '"id":"KB-' "$graph_file" | wc -l)
        local edge_count=$(grep -o '"type":"related"' "$graph_file" | wc -l)
        echo "📊 统计"
        echo "  节点数: $node_count"
        echo "  边数: $edge_count"
        echo ""
        if [ $edge_count -gt 0 ]; then
            echo "🔗 关联关系"
            grep -oE '"source":"[^"]*","target":"[^"]*"' "$graph_file" | while IFS= read -r edge; do
                local src=$(echo "$edge" | sed 's/.*"source":"\([^"]*\)".*/\1/')
                local tgt=$(echo "$edge" | sed 's/.*"target":"\([^"]*\)".*/\1/')
                echo "  $src ←→ $tgt"
            done
        fi
    else
        echo "📝 暂无图谱数据"
    fi
}

list() {
    local page=${1:-1}
    local per_page=10
    local start=$(( (page - 1) * per_page + 1 ))
    local end=$((page * per_page))

    echo "🧠 知识库列表 (第 $page 页)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local count=0
    for file in "${KNOWLEDGE_DIR}"/*.md; do
        if [ -f "$file" ]; then
            count=$((count + 1))
            if [ $count -ge $start ] && [ $count -le $end ]; then
                local id=$(basename "$file" .md)
                local content=$(head -20 "$file" | grep -E '^content:' | sed 's/^content: //')
                local category=$(head -20 "$file" | grep -E '^category:' | sed 's/^category: //')
                echo "$count. [$id] [$category] $content"
            fi
        fi
    done
    echo ""
    echo "共 $count 条知识"
}

dashboard() {
    echo "🧠 左脑 Token 监控面板"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local knowledge_count=$(ls -1 "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    echo "📚 知识库状态"
    echo "  知识条目数: $knowledge_count"

    echo ""
    echo "📊 分类分布"
    local tech=$(grep -l "category: 技术" "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    local people=$(grep -l "category: 人物" "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    local decision=$(grep -l "category: 决策" "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    local event=$(grep -l "category: 事件" "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    local preference=$(grep -l "category: 偏好" "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    echo "  技术: $tech"
    echo "  人物: $people"
    echo "  决策: $decision"
    echo "  事件: $event"
    echo "  偏好: $preference"

    local graph_file="${ASSOCIATIONS_DIR}/graph.json"
    if [ -f "$graph_file" ]; then
        local node_count=$(grep -o '"id":"KB-' "$graph_file" | wc -l)
        local edge_count=$(grep -o '"type":"related"' "$graph_file" | wc -l)
        echo ""
        echo "🔗 知识图谱"
        echo "  节点数: $node_count"
        echo "  边数: $edge_count"
    fi

    echo ""
    echo "📝 最近访问 (前5条)"
    ls -1t "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | head -5 | while read file; do
        local id=$(basename "$file" .md)
        echo "  - $id"
    done

    echo ""
    echo "⚙️ 系统信息"
    echo "  日期: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  知识库路径: $KNOWLEDGE_DIR"

    echo ""
    echo "📏 Context 水位估算"
    local kb_size=$((knowledge_count * 1))
    local claude_size=0
    for f in "${SKILL_DIR}/../../CLAUDE.md" "${SKILL_DIR}/../../rules"/*.md "${SKILL_DIR}/../../commands"/*.md "${SKILL_DIR}/../../agents"/*.md; do
        [ -f "$f" ] && claude_size=$((claude_size + $(wc -c < "$f") ))
    done
    local rules_kb=$((claude_size / 1024))
    echo "  📄 CLAUDE.md + rules/commands/agents: ~${rules_kb}KB"
    echo "  🧠 知识条目: ~${kb_size}KB"
    local total=$((rules_kb + kb_size))
    echo "  📊 总可用上下文: ~${total}KB"

    if [ $knowledge_count -gt 50 ]; then
        echo "  ⚠️ 知识条目超过50条，建议 /compact"
    elif [ $knowledge_count -gt 20 ]; then
        echo "  ℹ️ 知识条目增长中，注意 context 水位"
    else
        echo "  ✅ Context 状态良好"
    fi
}

status() {
    echo "🧠 左脑系统状态"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "✅ 系统组件"
    echo "  SKILL.md: $([ -f "${SKILL_DIR}/SKILL.md" ] && echo '✓' || echo '✗')"
    echo "  记忆目录: $([ -d "$KNOWLEDGE_DIR" ] && echo '✓' || echo '✗')"
    echo "  关联目录: $([ -d "$ASSOCIATIONS_DIR" ] && echo '✓' || echo '✗')"
    echo "  日志目录: $([ -d "$LOGS_DIR" ] && echo '✓' || echo '✗')"
    echo ""
    echo "📊 数据统计"
    local knowledge_count=$(ls -1 "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
    echo "  知识条目: $knowledge_count"

    local graph_file="${ASSOCIATIONS_DIR}/graph.json"
    if [ -f "$graph_file" ]; then
        local node_count=$(grep -o '"id":"KB-' "$graph_file" | wc -l)
        local edge_count=$(grep -o '"type":"related"' "$graph_file" | wc -l)
        echo "  图谱节点: $node_count"
        echo "  图谱边数: $edge_count"
    fi

    echo ""
    echo "🔧 版本: v2.0"
    echo "📅 日期: $(date '+%Y-%m-%d %H:%M:%S')"
}

case "$1" in
    remember)
        shift
        remember "$@"
        ;;
    recall|search)
        shift
        recall "$@"
        ;;
    preference|correct)
        shift
        preference "$@"
        ;;
    graph)
        shift
        graph "$@"
        ;;
    list)
        shift
        list "$@"
        ;;
    dashboard|stats)
        dashboard
        ;;
    status)
        status
        ;;
    *)
        echo "🧠 左脑 - Claude Code 记忆增强系统"
        echo ""
        echo "用法: left-brain.sh <command> [args]"
        echo ""
        echo "命令:"
        echo "  remember <内容>      记忆知识"
        echo "  recall <关键词>      搜索知识"
        echo "  preference <内容>    存储偏好/纠正"
        echo "  graph                显示知识图谱"
        echo "  list [页码]          列出所有知识"
        echo "  dashboard            显示监控面板"
        echo "  status               系统状态"
        ;;
esac
