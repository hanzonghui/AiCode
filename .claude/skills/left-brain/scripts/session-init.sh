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

echo "🔍 Step 5: 自我反思反馈（v1.9.1+ 智能增量 A）"
REFLECTION_FILE="${SKILL_DIR}/memory/reflections.jsonl"
if [ -f "$REFLECTION_FILE" ] && [ -s "$REFLECTION_FILE" ]; then
    count=$(wc -l < "$REFLECTION_FILE")
    echo "  📋 上次会话自检反馈: ${count} 条（显示最近 5 条）"
    tail -5 "$REFLECTION_FILE" | while IFS= read -r line; do
        # 用 node 解析 JSON（更可靠，Windows 上 python 转义坑多）
        echo "$line" | node -e "
let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{
  try {
    const d = JSON.parse(s);
    const icon = {error:'🔴',warning:'🟡',info:'🟢'}[d.severity] || '🟢';
    console.log('    ' + icon + ' [' + d.rule + '] ' + d.file_path + ': ' + d.message);
  } catch { console.log('    ' + s.slice(0, 80)); }
});
" 2>/dev/null
    done
else
    echo "  ✨ 无历史反馈（上次会话自检全过，或还没触发过）"
fi
echo ""

echo "🔍 Step 6: 主动发现问题（v1.9.1+ 智能增量 C）"
ANOMALY_FILE="${SKILL_DIR}/memory/anomalies.json"
if [ -f "$ANOMALY_FILE" ] && [ -s "$ANOMALY_FILE" ]; then
    # 用 node 解析并格式化（避免 jq/grep 转义坑）
    node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const s = data;
if (!s || s.total === 0) {
  console.log('  ✨ 项目状态健康（7 维度全过）');
  process.exit(0);
}
const parts = [];
if (s.error > 0) parts.push('🔴' + s.error);
if (s.warning > 0) parts.push('🟡' + s.warning);
if (s.info > 0) parts.push('🟢' + s.info);
console.log('  📋 主动扫描结果: ' + s.total + ' 项问题（' + parts.join(' / ') + '）');
for (const f of s.findings || []) {
  const icon = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🟢';
  console.log('    ' + icon + ' [' + f.dimension + '] ' + f.message);
  if (f.hint) console.log('       💡 ' + f.hint);
}
" "$ANOMALY_FILE" 2>/dev/null
else
    echo "  ✨ 暂无主动扫描结果（运行 evolution-hook 或 proactive-scan.js scan 生成）"
fi
echo ""

echo "🔍 Step 7: 二次采样队列（v2.0.1 增量 A 方案 B）"
QUEUE_FILE="${SKILL_DIR}/memory/secondary-review-queue.json"
if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
    node -e "
const fs = require('fs');
const queue = JSON.parse(fs.readFileSync(process.argv[1], 'utf8') || '[]');
if (queue.length === 0) {
  console.log('  ✅ 二次采样队列为空');
  process.exit(0);
}
const pending = queue.filter(i => i.status === 'pending');
console.log('  📋 二次采样队列: ' + queue.length + ' 条（' + pending.length + ' 条待复查）');
for (const item of queue.slice(0, 5)) {
  const icon = item.status === 'pending' ? '⏳' : item.status === 'approved' ? '✅' : '❌';
  console.log('    ' + icon + ' [' + item.id + '] ' + item.file_path);
  for (const r of item.reasons || []) {
    console.log('       ⚠️ ' + r);
  }
}
if (queue.length > 5) console.log('    ... 还有 ' + (queue.length - 5) + ' 条');
" "$QUEUE_FILE" 2>/dev/null
else
    echo "  ✅ 二次采样队列为空（无高风险改动待复查）"
fi
echo ""

echo "🔍 Step 8: cron 报告（v2.0.1 增量 C 方案 B）"
REPORT_FILE="${SKILL_DIR}/memory/cron-reports.json"
if [ -f "$REPORT_FILE" ] && [ -s "$REPORT_FILE" ]; then
    node -e "
const fs = require('fs');
const reports = JSON.parse(fs.readFileSync(process.argv[1], 'utf8') || '[]');
if (reports.length === 0) {
  console.log('  ✨ 暂无 cron 报告');
  process.exit(0);
}
const daily = reports.filter(r => r.type === 'daily').slice(0, 3);
const weekly = reports.filter(r => r.type === 'weekly').slice(0, 2);
console.log('  📋 cron 历史报告: ' + reports.length + ' 条');
for (const r of daily.concat(weekly)) {
  const icon = r.error > 0 ? '🔴' : r.warning > 0 ? '🟡' : '🟢';
  console.log('    ' + icon + ' [' + r.type + '] ' + r.timestamp.slice(0, 19) + '  total=' + r.total);
}
" "$REPORT_FILE" 2>/dev/null
else
    echo "  ✨ 暂无 cron 报告（运行 npm run cron:report:daily 生成）"
fi
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 初始化完成！"
