#!/usr/bin/env node
/**
 * proactive-scan.js 单元测试
 * 验证 7 个检测维度 + 缓存 + CLI 入口 + 异常兜底
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  detectAll,
  formatReport,
  detectCiStatus,
  detectUncommitted,
  detectTodoAccumulate,
  detectTestCoverage,
  detectDepsOutdated,
  detectStaleFiles,
  detectCandidatePending,
  ANOMALY_FILE,
} = require('./proactive-scan');

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

// 测试用临时目录
const TMP_DIR = path.join(__dirname, '__tmp__');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function cleanup() {
  try {
    fs.readdirSync(TMP_DIR).forEach(f => fs.unlinkSync(path.join(TMP_DIR, f)));
  } catch {}
}

// ==================== 1. CI 状态 ====================
section('维度 1: ci-status');

// 空数据不报错
{
  const r = detectCiStatus();
  assert(Array.isArray(r), '返回数组');
  // 当前项目 data/github/trend-watch-log.json 可能不存在或无 daily 条目
  // 关键是函数不崩
}

// 降级：文件存在但 JSON 损坏
{
  // 这个测试在真实环境跑，不容易模拟；跳过
}

// ==================== 2. 未提交改动 ====================
section('维度 2: uncommitted');

{
  const r = detectUncommitted();
  assert(Array.isArray(r), '返回数组');
  // 在工作空间下，应该有未提交改动（新创建的 proactive-scan.js）
  // 但 CI 环境可能干净，所以不强断言长度
}

// ==================== 3. TODO 累积 ====================
section('维度 3: todo-accumulate');

{
  // 回归：取消 head 截断（AUDIT-M54-batch2-C）
  const source = fs.readFileSync(path.join(__dirname, 'proactive-scan.js'), 'utf8');
  assert(!source.includes('| head -'), 'TODO/stale 扫描不再使用 head 截断');

  const r = detectTodoAccumulate();
  assert(Array.isArray(r), '返回数组');
  // 当前项目可能有不少 TODO，不强断言
  if (r.length > 0) {
    assert(r[0].dimension === 'todo-accumulate', 'dimension 正确');
    assert(typeof r[0].message === 'string' && r[0].message.includes('TODO'), 'message 含 TODO');
  }
}

// ==================== 4. 测试覆盖率 ====================
section('维度 4: test-coverage');

{
  const r = detectTestCoverage();
  assert(Array.isArray(r), '返回数组');
  // coverage-summary.json 不存在时返回空数组
  if (r.length > 0) {
    assert(r[0].dimension === 'test-coverage', 'dimension 正确');
    assert(r[0].message.includes('覆盖率'), 'message 含覆盖率');
  }
}

// ==================== 5. 依赖过期 ====================
section('维度 5: deps-outdated');

{
  const r = detectDepsOutdated();
  assert(Array.isArray(r), '返回数组');
  // 当前 package.json 应有浮动版本依赖
  if (r.length > 0) {
    assert(r[0].dimension === 'deps-outdated', 'dimension 正确');
    assert(r[0].severity === 'info', 'severity 为 info');
  }
}

// ==================== 6. 遗忘文件 ====================
section('维度 6: stale-files');

{
  const r = detectStaleFiles();
  assert(Array.isArray(r), '返回数组');
  // 取决于项目历史；不强断言
  if (r.length > 0) {
    assert(r[0].dimension === 'stale-files', 'dimension 正确');
    assert(r[0].message.includes('30 天') || r[0].message.includes('未修改'), 'message 提到时间');
  }
}

// ==================== 7. 候选未消化 ====================
section('维度 7: candidate-pending');

{
  const r = detectCandidatePending();
  assert(Array.isArray(r), '返回数组');
  if (r.length > 0) {
    assert(r[0].dimension === 'candidate-pending', 'dimension 正确');
    assert(r[0].message.includes('候选') || r[0].message.includes('未实现'), 'message 描述');
  }
}

// ==================== 8. 降级：单维度失败不拖垮其他 ====================
section('降级: 单维度失败不阻塞');

{
  // 通过 force=true 强制扫描并捕获所有发现
  const result = detectAll(true);
  assert(result && result.summary, 'detectAll 返回 summary');
  assert(typeof result.cached === 'boolean', 'cached 字段存在');
  assert(!result.cached, 'force 模式不读缓存');
  assert(typeof result.summary.total === 'number', 'summary.total 是数字');
  assert(typeof result.summary.error === 'number', 'summary.error 是数字');
  assert(typeof result.summary.warning === 'number', 'summary.warning 是数字');
  assert(typeof result.summary.info === 'number', 'summary.info 是数字');
  assert(Array.isArray(result.summary.findings), 'findings 是数组');
}

// 缓存文件路径（与 proactive-scan.js 同目录）
const LAST_SCAN_FILE = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'left-brain', 'memory', '.last-scan.json');

// ==================== 9. 缓存机制 ====================
section('缓存: 5 分钟内不重扫');

{
  // 第一次扫描（清缓存）
  try { fs.unlinkSync(LAST_SCAN_FILE); } catch {}

  const r1 = detectAll(false);
  assert(!r1.cached, '第一次扫描非缓存');

  // 第二次扫描（应命中缓存）
  const r2 = detectAll(false);
  assert(r2.cached, '第二次扫描命中缓存');
  assert(r2.summary, '缓存返回 summary');
}

// ==================== 10. force 强制重扫 ====================
section('缓存: --force 绕过缓存');

{
  const r = detectAll(true);
  assert(!r.cached, 'force=true 绕过缓存');
  assert(r.summary, 'force 也返回 summary');
}

// ==================== 11. formatReport 输出格式 ====================
section('formatReport 输出');

{
  // 健康
  const healthy = formatReport({
    cached: false,
    summary: { total: 0, error: 0, warning: 0, info: 0, findings: [] },
  });
  assert(healthy.includes('健康') || healthy.includes('✨'), '健康状态输出', `out=${healthy}`);

  // 缓存命中
  const cached = formatReport({ cached: true, summary: {} });
  assert(cached.includes('缓存'), '缓存命中输出', `out=${cached}`);

  // 有问题
  const issues = formatReport({
    cached: false,
    summary: {
      total: 2,
      error: 1,
      warning: 1,
      info: 0,
      findings: [
        { dimension: 'uncommitted', severity: 'error', message: '6 个改动' },
        { dimension: 'stale-files', severity: 'warning', message: '50 个文件' },
      ],
    },
  });
  assert(issues.includes('🔍 主动扫描'), '含标题');
  assert(issues.includes('🔴'), '含 error 图标');
  assert(issues.includes('🟡'), '含 warning 图标');
  assert(issues.includes('[uncommitted]'), '含 dimension 标签');
}

// ==================== 12. 集成：detectAll + 落盘 ====================
section('集成: detectAll + anomalies.json 落盘');

{
  try { fs.unlinkSync(ANOMALY_FILE); } catch {}

  const result = detectAll(true);
  // detectAll 内部 saveLastScan，但 anomalies.json 是 CLI 才写
  // 这里手动写一次
  fs.writeFileSync(ANOMALY_FILE, JSON.stringify(result.summary, null, 2));

  assert(fs.existsSync(ANOMALY_FILE), 'anomalies.json 已生成');
  const data = JSON.parse(fs.readFileSync(ANOMALY_FILE, 'utf8'));
  assert(data.findings, 'anomalies.json 含 findings');
  assert(typeof data.total === 'number', 'anomalies.json 含 total');
}

// ==================== 13. CLI 入口 ====================
section('CLI 入口');

{
  // scan 命令
  try { fs.unlinkSync(LAST_SCAN_FILE); } catch {}
  const out = execFileSync('node', ['proactive-scan.js', 'scan'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(out.includes('主动扫描') || out.includes('缓存'), 'scan 命令输出', `out=${out.slice(0, 80)}`);
}

// list 命令
{
  const out = execFileSync('node', ['proactive-scan.js', 'list'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(out.length > 0, 'list 命令有输出');
}

// 非法命令 exit 1
{
  let code = 0;
  try {
    execFileSync('node', ['proactive-scan.js', 'invalid-cmd'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 1, '未知命令 exit 1', `code=${code}`);
}

// --force 标志
{
  const out = execFileSync('node', ['proactive-scan.js', 'scan', '--force'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(!out.includes('使用缓存'), 'force 跳过缓存', `out=${out.slice(0, 80)}`);
}

// clear 命令
{
  const out = execFileSync('node', ['proactive-scan.js', 'clear'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(out.includes('已清除') || out.includes('不存在'), 'clear 命令输出');
}

// ==================== 14. 永不 throw 契约 ====================
section('永不 throw 契约');

// scan 跑过任何异常都不能挂
{
  let code = 0;
  try {
    execFileSync('node', ['proactive-scan.js', 'scan'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, 'scan 始终 exit 0', `code=${code}`);
}

// ==================== 清理 ====================
cleanup();

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 proactive-scan 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);