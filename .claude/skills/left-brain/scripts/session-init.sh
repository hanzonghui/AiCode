#!/bin/bash
# 🧠 左脑会话初始化脚本
# 新会话开始时自动执行
#
# 模式（环境变量 SESSION_INIT_MODE）：
#   fast (默认) — Step 2/3 跳过全文，只显示存在/数量（30 秒内启动）
#   full        — 跑全部步骤（调试 / 排查问题时用）
# 用法：
#   SESSION_INIT_MODE=full bash .claude/skills/left-brain/scripts/session-init.sh

SESSION_INIT_MODE="${SESSION_INIT_MODE:-fast}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SESSIONS_DIR="${SKILL_DIR}/memory/sessions"
KNOWLEDGE_DIR="${SKILL_DIR}/memory/knowledge"
SUMMARY_FILE="${SESSIONS_DIR}/latest_summary.md"
MEMORY_FILE="${SKILL_DIR}/memory/MEMORY.md"

echo "🧠 左脑会话初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# P0-0 演进治理：启动时检查演进锁状态
echo "🔒 Step 0: 演进计划锁状态（P0-0 元能力）"
WORKSPACE_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/evolution-lock.js" ]; then
  LOCK_OUTPUT=$(cd "$WORKSPACE_ROOT" && node scripts/orchestrator/evolution-lock.js status 2>/dev/null || echo "⚠️ 锁引擎暂时不可用")
  echo "$LOCK_OUTPUT" | sed 's/^/  /'
  # 如果锁被占用且不是当前会话，提示
  if echo "$LOCK_OUTPUT" | grep -q "锁被占用"; then
    echo ""
    echo "  ⚠️ 检测到其他窗口在演进锁内，本会话应聚焦当前任务或询问是否等/换任务"
  fi
else
  echo "  ⚠️ evolution-lock.js 未找到（P0-0 未部署）"
fi
echo ""

# M24-B: handoff 状态自愈 — 清理 stale awaiting_handoff（handoff 后 > 2h 未接续）
echo "🤝 Step 0.5: handoff 状态自愈（M24-B）"
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/handoff.js" ]; then
  HANDOFF_CLEANUP=$(cd "$WORKSPACE_ROOT" && node -e "const h=require('./scripts/orchestrator/handoff.js'); const r=h.clearAwaitingHandoffIfStale(2); console.log(JSON.stringify(r))" 2>/dev/null)
  if [ -n "$HANDOFF_CLEANUP" ]; then
    CLEANED=$(echo "$HANDOFF_CLEANUP" | grep -o '"cleared":[a-z]*' | cut -d: -f2)
    if [ "$CLEANED" = "true" ]; then
      echo "  🧹 已清理 stale awaiting_handoff: $HANDOFF_CLEANUP"
    else
      REASON=$(echo "$HANDOFF_CLEANUP" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
      echo "  ✅ 无需清理（$REASON）"
    fi
  else
    echo "  ⏭️  handoff.js 暂时不可用，跳过清理"
  fi
else
  echo "  ⚠️ handoff.js 未找到"
fi
echo ""

echo "📚 Step 1: 加载知识索引"
if [ -f "$MEMORY_FILE" ]; then
    knowledge_count=$(grep -E '知识总数:' "$MEMORY_FILE" | sed 's/.*知识总数: //')
    echo "  知识条目: ${knowledge_count:-0}"
else
    echo "  知识条目: 0"
fi
echo ""

echo "📝 Step 2: 加载上次会话摘要（模式: ${SESSION_INIT_MODE}）"
if [ -f "$SUMMARY_FILE" ]; then
    if [ "$SESSION_INIT_MODE" = "fast" ]; then
        # fast 模式：只显示摘要存在 + 第一行标题
        echo "  ✅ 上次会话摘要存在（用 SESSION_INIT_MODE=full 查看完整）"
        head -1 "$SUMMARY_FILE" | sed 's/^/    /'
    else
        echo "  ✅ 找到上次会话摘要"
        grep -A 100 '## 对话内容' "$SUMMARY_FILE" | head -20
        if grep -q '## 关键决策' "$SUMMARY_FILE"; then
            grep -A 10 '## 关键决策' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5
        fi
        if grep -q '## 待办事项' "$SUMMARY_FILE"; then
            grep -A 10 '## 待办事项' "$SUMMARY_FILE" | grep -E '^\s*[-·]' | head -5
        fi
    fi
else
    echo "  📝 暂无历史会话摘要"
fi
echo ""

echo "🔗 Step 3: 加载相关知识（模式: ${SESSION_INIT_MODE}）"
if [ -d "$KNOWLEDGE_DIR" ]; then
    if [ "$SESSION_INIT_MODE" = "fast" ]; then
        # fast 模式：只显示 KB 数量（不进 ls/head）
        kb_count=$(ls -1 "${KNOWLEDGE_DIR}"/*.md 2>/dev/null | wc -l)
        echo "  ✅ 知识库就绪（${kb_count} 条 KB · 详细见 /status 或 evolution-plan.json）"
    else
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
fi
echo ""

echo "⚙️ Step 4: 系统状态"
echo "  日期: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  知识库: $KNOWLEDGE_DIR"
echo "  会话记录: $SESSIONS_DIR"
echo ""

# v2.0 P0-5: 记录会话开始事件
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-cli.js" ]; then
    SESSION_ID="session_$(date '+%Y%m%d-%H%M%S')"
    node "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-cli.js" record session_start "{\"source\":\"session-init\"}" "{\"session\":\"$SESSION_ID\"}" >/dev/null 2>&1
fi

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

echo "💡 Step 9: workflow 主动建议（v2.0 P0-5）"
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-cli.js" ]; then
    node "$WORKSPACE_ROOT/scripts/orchestrator/workflow/workflow-cli.js" suggest 2>/dev/null || echo "  ⚠️ 建议引擎暂时不可用"
else
    echo "  ⚠️ workflow-cli.js 未找到"
fi
echo ""

# v2.0.6 M15: 评价闭环 — 记录 KB 召回命中 + 自主模式人工干预 baseline
echo "📊 Step 10: 评价指标采集（v2.0.6 M15 Evolution Metrics）"
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/scripts/orchestrator/metrics.js" ]; then
  # 1. KB 召回：session-init 启动即一次"召回"——knowledge dir 有内容算 hit
  if [ -d "$KNOWLEDGE_DIR" ] && [ "$(ls -A "$KNOWLEDGE_DIR" 2>/dev/null)" ]; then
    KB_HIT="true"
    KB_COUNT=$(ls -1 "$KNOWLEDGE_DIR"/*.md 2>/dev/null | wc -l)
    echo "  ✅ KB 召回命中（$KB_COUNT 条知识）"
  else
    KB_HIT="false"
    echo "  ⚠️ KB 召回未命中（knowledge 目录为空）"
  fi

  # 2. 自主模式人工干预：若 enabled=true 记一次 intervention 事件
  HUMAN_MODE="normal"
  HUMAN_ACTION="none"
  AUTON_STATE="${SKILL_DIR}/memory/autonomous-state.json"
  if [ -f "$AUTON_STATE" ]; then
    AUTON_ENABLED=$(node -e "try{const s=require(process.argv[1]);process.stdout.write(s.enabled?'true':'false')}catch{process.stdout.write('false')}" "$AUTON_STATE" 2>/dev/null)
    if [ "$AUTON_ENABLED" = "true" ]; then
      HUMAN_MODE="autonomous"
      HUMAN_ACTION="session_start"
      AUTON_MODE=$(node -e "try{const s=require(process.argv[1]);process.stdout.write(s.mode||'always')}catch{process.stdout.write('always')}" "$AUTON_STATE" 2>/dev/null)
      echo "  🤖 自主模式开启中（$AUTON_MODE）— 记一次人工干预基线"
    fi
  fi

  # 3. 写入 metrics.jsonl（写失败不影响主流程）
  node -e "
const Metrics = require(process.argv[1]);
const { Evolution: Evo } = Metrics;
if (Evo) {
  Evo.recallPrecision(process.argv[2] === 'true', { source: 'session-init' });
  if (process.argv[3] === 'autonomous') {
    Evo.humanIntervention({ mode: 'autonomous', action: process.argv[4] || 'session_start' });
  }
}
" "$WORKSPACE_ROOT/scripts/orchestrator/metrics.js" "$KB_HIT" "$HUMAN_MODE" "$HUMAN_ACTION" 2>/dev/null
fi
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 初始化完成！"
