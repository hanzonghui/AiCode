#!/usr/bin/env node
/**
 * full-audit.js — /audit skill v1.0.0 深度扫描引擎（v2.0.2）
 *
 * 触发方式：
 *   - 手动：node scripts/orchestrator/audit/full-audit.js
 *   - 通过：/audit full
 *
 * 作用：
 *   - 在浅层 quick-audit 基础上,生成"深度调研任务清单"
 *   - 每个任务对应派 1 个 explorer 子代理并发扫一个子系统
 *   - 输出 JSON 清单,可被 Claude Code runtime 通过 Agent tool 调度
 *
 * 设计原则：
 *   - 永远不写代码文件
 *   - 永不 throw
 *   - 不在 Node 里调 LLM（深度"派子代理"由 Claude Code runtime 在 /audit full 时执行）
 *   - 此脚本只负责"生成任务清单"+ "汇总结果"
 *
 * @since v2.0.2 (2026-06-25)
 * @source 04_自我演进路线.md §0.4 增量 P0-6
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const QUICK_AUDIT = require('./quick-audit');

// 深度调研子系统清单（每个会派 1 个 explorer 子代理并发扫描）
const SUBSYSTEMS = [
  {
    id: 'dispatcher',
    name: '智能调度器',
    paths: ['scripts/orchestrator/dispatcher.js', 'scripts/orchestrator/test-*.js'],
    focus: ['调度决策逻辑', '复杂度评分', '派 Agent 数量', '失败兜底'],
  },
  {
    id: 'reflection',
    name: '自我反思',
    paths: ['scripts/orchestrator/reflection/'],
    focus: ['自检规则', '二次采样', '高风险判定'],
  },
  {
    id: 'proactive',
    name: '主动发现问题',
    paths: ['scripts/orchestrator/proactive/'],
    focus: ['7 维度 anomaly 扫描', 'auto-fix 修复', 'cron 报告', 'LLM advisor'],
  },
  {
    id: 'evolution',
    name: '自我进化',
    paths: ['scripts/evolution/'],
    focus: ['GitHub 扫描', '评估器', 'auto-implement 安全闸门'],
  },
  {
    id: 'planning',
    name: '任务规划',
    paths: ['scripts/orchestrator/planning/'],
    focus: ['plan 检测', 'plan-bridge 派子会话'],
  },
  {
    id: 'workflow',
    name: '个人 workflow',
    paths: ['scripts/orchestrator/workflow/'],
    focus: ['observer 事件', 'pattern-miner 关联规则', 'suggestion-engine 启发式'],
  },
  {
    id: 'left-brain',
    name: '左脑记忆',
    paths: ['.claude/skills/left-brain/'],
    focus: ['remember/recall/graph', 'snapshot', 'memos'],
  },
  {
    id: 'recall',
    name: '向量语义检索',
    paths: ['scripts/orchestrator/recall/'],
    focus: ['TF-IDF', 'embedding 检索', 'RAG 索引'],
  },
  {
    id: 'autonomous',
    name: '自主模式',
    paths: ['scripts/orchestrator/autonomous.js', 'scripts/orchestrator/autonomous-runner.js'],
    focus: ['single/always 模式', '快照切换', 'runner 循环', '安全边界'],
  },
];

// ── 工具函数 ─────────────────────────────────────────

function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return null; }
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 生成深度调研任务清单 ─────────────────────────────

function generateTasks() {
  return SUBSYSTEMS.map(s => ({
    id: s.id,
    name: s.name,
    paths: s.paths.map(p => path.join(WORKSPACE_ROOT, p)),
    pathsRelative: s.paths,
    focus: s.focus,
    promptTemplate: `你是 explorer 子代理,负责深度调研 AiCode 工程的 "${s.name}" 子系统。

调研目标路径:
${s.paths.map(p => '- ' + p).join('\n')}

重点关注:
${s.focus.map(f => '- ' + f).join('\n')}

返回结构化报告(JSON),包含:
{
  "subsystem": "${s.id}",
  "summary": "子系统一句话定位",
  "codeMetrics": { "fileCount": N, "lineCount": N, "testCount": N },
  "architecture": "架构描述(关键模块 + 数据流)",
  "strengths": ["优点 1", "优点 2"],
  "weaknesses": ["不足 1", "不足 2"],
  "risks": ["风险 1"],
  "suggestions": [
    { "type": "P0/P1/P2", "title": "...", "detail": "...", "effort": "..." }
  ],
  "relatedFiles": ["path1:line1", "path2:line2"]
}

约束:
- 不写代码文件,只读 + 分析
- 遵守 .claudeignore,不读 archives/snapshots/data/github
- 返回 JSON,长度 < 3000 字`,
  }));
}

// ── 汇总结果 ────────────────────────────────────────

function aggregateResults(subResults) {
  const allSuggestions = [];
  const allRisks = [];
  let totalStrengths = 0;

  for (const r of subResults) {
    if (!r) continue;
    for (const s of r.suggestions || []) {
      allSuggestions.push({ ...s, subsystem: r.subsystem });
    }
    for (const risk of r.risks || []) {
      allRisks.push({ risk, subsystem: r.subsystem });
    }
    totalStrengths += (r.strengths || []).length;
  }

  // 按 P0/P1/P2 排序
  allSuggestions.sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2 };
    // 用 ?? 而不是 ||,因为 0 是 falsy 会触发 || 走默认值 99
    const rankA = order[a.type] ?? 99;
    const rankB = order[b.type] ?? 99;
    return rankA - rankB;
  });

  return {
    totalSubsystems: subResults.filter(Boolean).length,
    totalStrengths,
    totalSuggestions: allSuggestions.length,
    totalRisks: allRisks.length,
    suggestions: allSuggestions,
    risks: allRisks,
  };
}

// ── 格式化报告（汇总视角） ───────────────────────────

function formatReport(tasks, quickResult, aggregated) {
  const lines = [];

  lines.push(`# 🔍 AiCode 深度审计报告（${quickResult.generatedAt}）`);
  lines.push('');
  lines.push(`> 由 \`/audit full\` skill v1.0.0 生成 | 模式: 深度全量 | 工程版本: v${quickResult.profile.version}`);
  lines.push(`> 子系统数: ${tasks.length} | 由 explorer 子代理并发调研`);
  lines.push('');

  // 浅层摘要
  lines.push('## 📊 浅层摘要（quick-audit 已完成）');
  lines.push('');
  lines.push(`- 版本: v${quickResult.profile.version}`);
  lines.push(`- skill/command/script: ${quickResult.profile.skillCount}/${quickResult.profile.commandCount}/${quickResult.profile.scriptCount}`);
  lines.push(`- 浅层能力缺口: ${quickResult.gaps.length} 项`);
  lines.push(`- 浅层重复: ${quickResult.dups.length} 项`);
  lines.push('');

  // 深度任务清单
  lines.push(`## 🎯 深度调研任务清单（${tasks.length} 个子系统）`);
  lines.push('');
  for (const t of tasks) {
    lines.push(`### ${t.id} — ${t.name}`);
    lines.push(`- **关注点**: ${t.focus.join(' / ')}`);
    lines.push(`- **路径**: ${t.pathsRelative.join(', ')}`);
    lines.push('');
  }

  // 汇总结果（如果已聚合）
  if (aggregated) {
    lines.push('## 💡 汇总优化建议');
    lines.push('');
    lines.push(`- 子系统数: ${aggregated.totalSubsystems}`);
    lines.push(`- 优点: ${aggregated.totalStrengths}`);
    lines.push(`- 建议: ${aggregated.totalSuggestions}`);
    lines.push(`- 风险: ${aggregated.totalRisks}`);
    lines.push('');
    if (aggregated.suggestions.length) {
      lines.push('### 建议列表');
      lines.push('');
      for (let i = 0; i < Math.min(aggregated.suggestions.length, 30); i++) {
        const s = aggregated.suggestions[i];
        lines.push(`${i + 1}. **[${s.type}] [${s.subsystem}]** ${s.title}`);
        if (s.detail) lines.push(`   - ${s.detail}`);
      }
      if (aggregated.suggestions.length > 30) {
        lines.push(`   ... 还有 ${aggregated.suggestions.length - 30} 项`);
      }
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## ⚙️ 深度模式说明');
  lines.push('');
  lines.push('- **本脚本生成任务清单,不直接执行 explorer 子代理**');
  lines.push('- **/audit full 命令在 Claude Code runtime 里读取任务清单,通过 Agent tool 派子代理并发执行**');
  lines.push('- **每次 /audit full 重新生成新清单,旧结果保留在 .claude/audits/audit-*-deep.md**');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*报告时间: ${quickResult.generatedAt} | 工程版本: v${quickResult.profile.version} | 审计者: Claude (/audit skill v1.0.0 deep mode)*`);

  return lines.join('\n');
}

// ── 主入口 ───────────────────────────────────────────

function runDeepAudit() {
  const generatedAt = timestamp();
  const quickResult = QUICK_AUDIT.runQuickAudit();
  const tasks = generateTasks();

  return {
    generatedAt,
    quickResult,
    tasks,
    aggregated: aggregateResults([]), // 空数组,等待 runtime 填入
  };
}

// ── CLI 入口 ─────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'tasks';

  try {
    if (cmd === 'tasks' || cmd === 'plan') {
      const result = runDeepAudit();
      const content = formatReport(result.tasks, result.quickResult, null);
      console.log(content);
    } else if (cmd === 'json') {
      const result = runDeepAudit();
      console.log(JSON.stringify({
        generatedAt: result.generatedAt,
        taskCount: result.tasks.length,
        tasks: result.tasks,
        quickSummary: {
          profile: result.quickResult.profile,
          gaps: result.quickResult.gaps.length,
          dups: result.quickResult.dups.length,
        },
      }, null, 2));
    } else if (cmd === 'help') {
      console.log(`/audit full 深度扫描引擎 v1.0.0

用法:
  node full-audit.js tasks    # 输出任务清单 + 浅层摘要（默认）
  node full-audit.js json     # 输出 JSON（任务清单 + 浅层概要）
  node full-audit.js help     # 帮助

工作流:
  1. /audit full 命令在 Claude Code runtime 调用本脚本
  2. 生成 N 个子系统的深度调研任务清单
  3. Claude Code runtime 用 Agent tool 并发派 N 个 explorer 子代理
  4. 子代理返回 JSON 结果
  5. /audit full 把结果汇总 + 整合到 04 backlog`);
    } else {
      console.error(`未知命令: ${cmd}（支持: tasks / json / help）`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ full-audit 异常: ${e.message}`);
  }
  process.exit(0);
}

module.exports = {
  runDeepAudit,
  generateTasks,
  aggregateResults,
  formatReport,
  SUBSYSTEMS,
};