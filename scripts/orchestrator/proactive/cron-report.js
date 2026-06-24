#!/usr/bin/env node
/**
 * cron-report.js — 增量 C 方案 B：后台 cron 主动报告
 *
 * 触发方式：
 *   - 手动：node scripts/orchestrator/proactive/cron-report.js daily
 *   - 手动：node scripts/orchestrator/proactive/cron-report.js weekly
 *   - cron：由 Claude Code CronCreate 调度（推荐）
 *
 * 作用：
 *   - 在 SessionStart 之外，定时主动扫描项目 anomaly
 *   - 生成日报/周报并持久化到 cron-reports.json
 *   - 新会话启动时 session-init 可读取最近报告
 *   - 与上次同类型报告对比，输出 delta（问题变多/变少）
 *
 * 设计原则：
 *   - 永不阻塞主流程
 *   - 单报告失败不污染历史
 *   - 保留 30 天日报 + 12 周周报
 *   - 纯规则，不调 LLM（轻量）
 *
 * @since v2.0.1 (2026-06-25)
 * @source 04_自我演进路线.md §0.4 增量 C 方案 B
 */

const fs = require('fs');
const path = require('path');
const { detectAll } = require('./proactive-scan');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const REPORT_FILE = path.join(MEMORY_DIR, 'cron-reports.json');

const MAX_DAILY_REPORTS = 30;
const MAX_WEEKLY_REPORTS = 12;

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function loadReports() {
  if (!fs.existsSync(REPORT_FILE)) return [];
  try {
    const data = JSON.parse(readFileSafe(REPORT_FILE) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveReports(reports) {
  try {
    ensureDir(MEMORY_DIR);
    fs.writeFileSync(REPORT_FILE, JSON.stringify(reports, null, 2));
    return true;
  } catch {
    return false;
  }
}

function computeDelta(type, currentSummary) {
  const reports = loadReports();
  const sameType = reports
    .filter(r => r.type === type && r.total !== undefined)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (sameType.length === 0) return null;

  const last = sameType[0];
  return {
    totalDelta: (currentSummary.total || 0) - (last.total || 0),
    errorDelta: (currentSummary.error || 0) - (last.error || 0),
    warningDelta: (currentSummary.warning || 0) - (last.warning || 0),
    infoDelta: (currentSummary.info || 0) - (last.info || 0),
    previousAt: last.timestamp,
  };
}

function pruneReports(reports) {
  const daily = reports
    .filter(r => r.type === 'daily')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, MAX_DAILY_REPORTS);

  const weekly = reports
    .filter(r => r.type === 'weekly')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, MAX_WEEKLY_REPORTS);

  // 保留未知类型（防御性）
  const others = reports.filter(r => r.type !== 'daily' && r.type !== 'weekly');

  return [...daily, ...weekly, ...others].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

// ── 报告生成 ─────────────────────────────────────────

function generateReport(type) {
  const result = detectAll(true); // force scan
  const summary = result.summary || {};

  const report = {
    id: `${type}-${Date.now()}`,
    type,
    timestamp: new Date().toISOString(),
    total: summary.total || 0,
    error: summary.error || 0,
    warning: summary.warning || 0,
    info: summary.info || 0,
    findings: (summary.findings || []).map(f => ({
      dimension: f.dimension,
      severity: f.severity,
      message: f.message,
      hint: f.hint,
      timestamp: f.timestamp,
    })),
    delta: computeDelta(type, summary),
  };

  return report;
}

function aggregateWeeklyReport() {
  const reports = loadReports();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentDaily = reports.filter(
    r => r.type === 'daily' && new Date(r.timestamp) >= sevenDaysAgo
  );

  const aggregatedFindings = [];
  const seen = new Set();

  for (const r of recentDaily) {
    for (const f of r.findings || []) {
      const key = `${f.dimension}|${f.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        aggregatedFindings.push(f);
      }
    }
  }

  const summary = {
    total: aggregatedFindings.length,
    error: aggregatedFindings.filter(f => f.severity === 'error').length,
    warning: aggregatedFindings.filter(f => f.severity === 'warning').length,
    info: aggregatedFindings.filter(f => f.severity === 'info').length,
    findings: aggregatedFindings,
    aggregatedFrom: recentDaily.map(r => r.id),
  };

  const report = {
    id: `weekly-${Date.now()}`,
    type: 'weekly',
    timestamp: new Date().toISOString(),
    ...summary,
    delta: computeDelta('weekly', summary),
  };

  return report;
}

// ── 报告格式化 ───────────────────────────────────────

function formatDelta(delta) {
  if (!delta) return '（首次报告，无对比）';

  const parts = [];
  if (delta.totalDelta !== 0) {
    parts.push(`总计 ${delta.totalDelta > 0 ? '+' : ''}${delta.totalDelta}`);
  }
  if (delta.errorDelta !== 0) {
    parts.push(`错误 ${delta.errorDelta > 0 ? '+' : ''}${delta.errorDelta}`);
  }
  if (delta.warningDelta !== 0) {
    parts.push(`警告 ${delta.warningDelta > 0 ? '+' : ''}${delta.warningDelta}`);
  }
  if (delta.infoDelta !== 0) {
    parts.push(`信息 ${delta.infoDelta > 0 ? '+' : ''}${delta.infoDelta}`);
  }

  if (parts.length === 0) return '与上次持平';
  return `较上次: ${parts.join(' / ')}`;
}

function formatReport(report, compact = false) {
  const lines = [];
  const typeLabel = report.type === 'daily' ? '📅 日报' : '📊 周报';
  const dateStr = new Date(report.timestamp).toLocaleString('zh-CN');

  lines.push(`${typeLabel} | ${dateStr}`);

  const parts = [];
  if (report.error > 0) parts.push(`🔴错误 ${report.error}`);
  if (report.warning > 0) parts.push(`🟡警告 ${report.warning}`);
  if (report.info > 0) parts.push(`🟢信息 ${report.info}`);

  if (parts.length === 0) {
    lines.push('✨ 项目状态健康（7 维度全过）');
  } else {
    lines.push(`🔍 ${report.total} 项问题: ${parts.join(' / ')}`);
  }

  lines.push(`📈 ${formatDelta(report.delta)}`);

  if (!compact && report.findings && report.findings.length > 0) {
    for (const f of report.findings.slice(0, 10)) {
      const icon = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🟢';
      lines.push(`  ${icon} [${f.dimension}] ${f.message}`);
    }
    if (report.findings.length > 10) {
      lines.push(`  ... 还有 ${report.findings.length - 10} 项`);
    }
  }

  return lines.join('\n');
}

function formatStatus(reports) {
  if (reports.length === 0) {
    return '📭 暂无 cron 报告（先跑 daily/weekly）';
  }

  const latestDaily = reports.find(r => r.type === 'daily');
  const latestWeekly = reports.find(r => r.type === 'weekly');
  const lines = [];

  lines.push(`📚 历史报告: ${reports.length} 条`);
  if (latestDaily) {
    lines.push('');
    lines.push(formatReport(latestDaily, true));
  }
  if (latestWeekly) {
    lines.push('');
    lines.push(formatReport(latestWeekly, true));
  }

  return lines.join('\n');
}

// ── 主入口 ───────────────────────────────────────────

function runDaily() {
  const report = generateReport('daily');
  const reports = pruneReports([report, ...loadReports()]);
  const saved = saveReports(reports);
  return { report, saved, reports };
}

function runWeekly() {
  const report = aggregateWeeklyReport();
  const reports = pruneReports([report, ...loadReports()]);
  const saved = saveReports(reports);
  return { report, saved, reports };
}

function clearReports() {
  const saved = saveReports([]);
  return { cleared: saved };
}

// ── CLI 入口 ─────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'daily';

  try {
    if (cmd === 'daily') {
      const { report } = runDaily();
      console.log(formatReport(report));
    } else if (cmd === 'weekly') {
      const { report } = runWeekly();
      console.log(formatReport(report));
    } else if (cmd === 'status') {
      console.log(formatStatus(loadReports()));
    } else if (cmd === 'clear') {
      const { cleared } = clearReports();
      console.log(cleared ? '✅ 已清空 cron 报告历史' : '⚠️ 清空失败');
    } else {
      console.error(`未知命令: ${cmd}（支持: daily / weekly / status / clear）`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ cron-report 异常: ${e.message}`);
  }
  process.exit(0);
}

module.exports = {
  runDaily,
  runWeekly,
  clearReports,
  loadReports,
  generateReport,
  aggregateWeeklyReport,
  formatReport,
  formatStatus,
  REPORT_FILE,
};
