#!/usr/bin/env node
/**
 * cron-report.js 单元测试
 * 验证日报/周报生成、聚合、delta、持久化、CLI 入口
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  runDaily,
  runWeekly,
  clearReports,
  loadReports,
  generateReport,
  aggregateWeeklyReport,
  formatReport,
  formatStatus,
  REPORT_FILE,
} = require('./cron-report');

let pass = 0, fail = 0;
const fails = [];

function assert(cond, name, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// 备份/恢复 REPORT_FILE
const BACKUP_FILE = `${REPORT_FILE}.test-backup`;

function backupReports() {
  try {
    if (fs.existsSync(REPORT_FILE)) {
      fs.copyFileSync(REPORT_FILE, BACKUP_FILE);
    }
  } catch {}
}

function restoreReports() {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, REPORT_FILE);
      fs.unlinkSync(BACKUP_FILE);
    } else {
      try { fs.unlinkSync(REPORT_FILE); } catch {}
    }
  } catch {}
}

backupReports();

// 每个 section 前清空，保证独立
function resetReports() {
  try { fs.unlinkSync(REPORT_FILE); } catch {}
}

// ==================== 1. generateReport 日报结构 ====================
section('generateReport 日报结构');

{
  resetReports();
  const report = generateReport('daily');
  assert(report.type === 'daily', 'type 为 daily');
  assert(typeof report.id === 'string' && report.id.startsWith('daily-'), 'id 格式正确');
  assert(typeof report.timestamp === 'string', 'timestamp 存在');
  assert(typeof report.total === 'number', 'total 是数字');
  assert(typeof report.error === 'number', 'error 是数字');
  assert(typeof report.warning === 'number', 'warning 是数字');
  assert(typeof report.info === 'number', 'info 是数字');
  assert(Array.isArray(report.findings), 'findings 是数组');
  assert(report.delta === null, '首次报告 delta 为 null');
}

// ==================== 2. runDaily 持久化 ====================
section('runDaily 持久化');

{
  resetReports();
  const { report, saved, reports } = runDaily();
  assert(saved, '保存成功');
  assert(reports.length === 1, '历史只有 1 条');
  assert(reports[0].id === report.id, '保存的是同一条');
  assert(fs.existsSync(REPORT_FILE), 'REPORT_FILE 已生成');
}

// ==================== 3. delta 计算 ====================
section('delta 计算');

{
  resetReports();
  const r1 = {
    id: 'daily-1',
    type: 'daily',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    total: 0, error: 0, warning: 0, info: 0, findings: [],
  };

  const r2 = {
    id: 'daily-2',
    type: 'daily',
    timestamp: new Date().toISOString(),
    total: 3, error: 1, warning: 2, info: 0, findings: [],
    delta: {
      totalDelta: 3,
      errorDelta: 1,
      warningDelta: 2,
      infoDelta: 0,
      previousAt: r1.timestamp,
    },
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify([r2, r1], null, 2));

  const loaded = loadReports();
  assert(loaded.length === 2, '两条历史');
  assert(loaded[0].delta !== undefined, '新报告有 delta');
  assert(loaded[0].delta.totalDelta === 3, 'totalDelta 正确');
  assert(loaded[0].delta.errorDelta === 1, 'errorDelta 正确');
  assert(loaded[0].delta.warningDelta === 2, 'warningDelta 正确');
  assert(loaded[0].delta.previousAt === r1.timestamp, 'previousAt 指向上次');
}

// ==================== 4. 周报聚合 ====================
section('周报聚合');

{
  resetReports();
  const now = Date.now();
  const dailyReports = [
    {
      id: 'daily-1',
      type: 'daily',
      timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      total: 2,
      error: 1,
      warning: 1,
      info: 0,
      findings: [
        { dimension: 'uncommitted', severity: 'error', message: '改动 A' },
        { dimension: 'todo-accumulate', severity: 'warning', message: 'TODO B' },
      ],
    },
    {
      id: 'daily-2',
      type: 'daily',
      timestamp: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      total: 1,
      error: 0,
      warning: 1,
      info: 0,
      findings: [
        { dimension: 'uncommitted', severity: 'error', message: '改动 A' }, // 重复
        { dimension: 'stale-files', severity: 'warning', message: '旧文件 C' },
      ],
    },
    // 8 天前的日报，不应被聚合
    {
      id: 'daily-old',
      type: 'daily',
      timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      total: 1,
      error: 1,
      warning: 0,
      info: 0,
      findings: [
        { dimension: 'ci-status', severity: 'error', message: '旧 CI 警报' },
      ],
    },
  ];
  fs.writeFileSync(REPORT_FILE, JSON.stringify(dailyReports, null, 2));

  const weekly = aggregateWeeklyReport();
  assert(weekly.type === 'weekly', 'type 为 weekly');
  assert(weekly.findings.length === 3, '去重后剩 3 个 findings（改动 A, TODO B, 旧文件 C）');
  assert(weekly.total === 3, 'total 正确');
  assert(weekly.error === 1, 'error 只算 1 个不重复的 error');
  assert(weekly.warning === 2, 'warning 两个不重复');
  assert(Array.isArray(weekly.aggregatedFrom), 'aggregatedFrom 是数组');
  assert(weekly.aggregatedFrom.includes('daily-1'), '包含 daily-1');
  assert(weekly.aggregatedFrom.includes('daily-2'), '包含 daily-2');
  assert(!weekly.aggregatedFrom.includes('daily-old'), '不包含 8 天前的日报');
}

// ==================== 5. runWeekly 持久化 + 裁剪 ====================
section('runWeekly 持久化 + 裁剪');

{
  resetReports();
  runDaily();
  const { report, reports } = runWeekly();
  assert(report.type === 'weekly', '生成周报');
  assert(reports.some(r => r.type === 'weekly'), '历史含周报');
  assert(reports.some(r => r.type === 'daily'), '历史含日报');
}

// ==================== 6. 历史裁剪 ====================
section('历史裁剪');

{
  resetReports();
  const oldReports = [];
  for (let i = 0; i < 35; i++) {
    oldReports.push({
      id: `daily-${i}`,
      type: 'daily',
      timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      total: 0, error: 0, warning: 0, info: 0, findings: [],
    });
  }
  for (let i = 0; i < 15; i++) {
    oldReports.push({
      id: `weekly-${i}`,
      type: 'weekly',
      timestamp: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      total: 0, error: 0, warning: 0, info: 0, findings: [],
    });
  }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(oldReports, null, 2));

  runDaily();
  const reports = loadReports();
  const dailyCount = reports.filter(r => r.type === 'daily').length;
  const weeklyCount = reports.filter(r => r.type === 'weekly').length;
  assert(dailyCount <= 31, `日报保留 ≤31（新增 1 + 旧 30），实际 ${dailyCount}`);
  assert(weeklyCount <= 13, `周报保留 ≤13（旧 12 + 新增可能 0），实际 ${weeklyCount}`);
}

// ==================== 7. formatReport 输出 ====================
section('formatReport 输出');

{
  const healthy = formatReport({
    type: 'daily',
    timestamp: new Date().toISOString(),
    total: 0, error: 0, warning: 0, info: 0,
    findings: [],
    delta: null,
  });
  assert(healthy.includes('✨') || healthy.includes('健康'), '健康状态输出');
  assert(healthy.includes('首次报告'), '首次报告提示');

  const issues = formatReport({
    type: 'daily',
    timestamp: new Date().toISOString(),
    total: 3,
    error: 1,
    warning: 1,
    info: 1,
    findings: [
      { dimension: 'uncommitted', severity: 'error', message: '改动' },
      { dimension: 'todo-accumulate', severity: 'warning', message: 'TODO' },
      { dimension: 'stale-files', severity: 'info', message: '旧文件' },
    ],
    delta: { totalDelta: 2, errorDelta: 1, warningDelta: 0, infoDelta: 1, previousAt: new Date().toISOString() },
  });
  assert(issues.includes('🔍'), '含问题标题');
  assert(issues.includes('🔴'), '含 error 图标');
  assert(issues.includes('🟡'), '含 warning 图标');
  assert(issues.includes('🟢'), '含 info 图标');
  assert(issues.includes('较上次'), '含 delta');

  // compact 模式不展示详细 findings
  const compact = formatReport({
    type: 'daily',
    timestamp: new Date().toISOString(),
    total: 1, error: 1, warning: 0, info: 0,
    findings: [{ dimension: 'uncommitted', severity: 'error', message: '改动' }],
    delta: null,
  }, true);
  assert(!compact.includes('[uncommitted]'), 'compact 不展示 finding 详情');
}

// ==================== 8. formatStatus ====================
section('formatStatus');

{
  resetReports();
  const empty = formatStatus(loadReports());
  assert(empty.includes('暂无'), '空状态提示');

  runDaily();
  runWeekly();
  const status = formatStatus(loadReports());
  assert(status.includes('历史报告'), '含历史数量');
  assert(status.includes('日报') || status.includes('📅'), '含日报');
  assert(status.includes('周报') || status.includes('📊'), '含周报');
}

// ==================== 9. clearReports ====================
section('clearReports');

{
  resetReports();
  runDaily();
  assert(loadReports().length > 0, '清空前有数据');
  const { cleared } = clearReports();
  assert(cleared, '清空成功');
  assert(loadReports().length === 0, '清空后无数据');
}

// ==================== 10. CLI 入口 ====================
section('CLI 入口');

{
  resetReports();
  const outDaily = execFileSync('node', ['cron-report.js', 'daily'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outDaily.includes('日报') || outDaily.includes('主动扫描') || outDaily.includes('健康'), 'daily 命令输出', `out=${outDaily.slice(0, 80)}`);
}

{
  resetReports();
  // 先造两条日报再跑周报
  runDaily();
  runDaily();
  const outWeekly = execFileSync('node', ['cron-report.js', 'weekly'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outWeekly.includes('周报'), 'weekly 命令输出', `out=${outWeekly.slice(0, 80)}`);
}

{
  const outStatus = execFileSync('node', ['cron-report.js', 'status'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outStatus.includes('历史报告'), 'status 命令输出', `out=${outStatus.slice(0, 80)}`);
}

{
  const outClear = execFileSync('node', ['cron-report.js', 'clear'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outClear.includes('已清空'), 'clear 命令输出', `out=${outClear.slice(0, 80)}`);
}

// 非法命令 exit 1
{
  let code = 0;
  try {
    execFileSync('node', ['cron-report.js', 'invalid-cmd'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 1, '未知命令 exit 1', `code=${code}`);
}

// ==================== 11. 永不 throw 契约 ====================
section('永不 throw 契约');

{
  let code = 0;
  try {
    execFileSync('node', ['cron-report.js', 'daily'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, 'daily 始终 exit 0', `code=${code}`);
}

// ==================== 清理 + 恢复 ====================
restoreReports();

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 cron-report 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);
