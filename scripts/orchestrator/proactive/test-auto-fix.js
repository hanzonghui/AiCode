#!/usr/bin/env node
/**
 * auto-fix.js 单元测试
 * 验证 4 个 fix 函数 + 保守模式 + 完整模式 + dry-run + 安全过滤 + CLI
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  autoFixConservative,
  autoFixFull,
  formatReport,
  fixUncommitted,
  fixTestCoverage,
  fixDepsOutdated,
  fixCandidatePending,
  PROPOSAL_FILE,
} = require('./auto-fix');

(async () => {

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

function clearProposals() {
  try { fs.unlinkSync(PROPOSAL_FILE); } catch {}
}

// ==================== 1. fixUncommitted 安全过滤 ====================
section('Fix 1: uncommitted 安全过滤');

// AI 工作目录文件 → 跳过
{
  const r = fixUncommitted(false);
  // 当前工作区有 scripts/orchestrator/ 改动，应被过滤
  if (r.skipped && r.reason && r.reason.includes('AI 工作目录')) {
    assert(true, 'AI 工作目录文件被跳过');
  } else if (r.committed !== undefined) {
    assert(false, 'AI 工作目录不应被自动 commit', `got committed=${r.committed}`);
  } else {
    assert(r.skipped || r.committed !== undefined, '返回结构正常', JSON.stringify(r));
  }
}

// dry-run 不真 commit
{
  const r = fixUncommitted(true);
  assert(r.dryRun === true || r.skipped, 'dry-run 模式不真 commit', JSON.stringify(r));
}

// ==================== 2. fixTestCoverage ====================
section('Fix 2: test-coverage');

{
  const r = await fixTestCoverage(false, false);
  assert(typeof r === 'object', '返回对象');
  if (r.proposed !== undefined) {
    assert(Array.isArray(r.sample), 'sample 是数组');
    assert(r.sample.length > 0, 'sample 非空', JSON.stringify(r));
  } else if (r.skipped) {
    assert(true, '无 coverage 问题时跳过', r.reason);
  }
}

// dry-run 不写 proposal
clearProposals();
{
  await fixTestCoverage(true, false);
  assert(!fs.existsSync(PROPOSAL_FILE), 'dry-run 不写 fix-proposals.json');
}

// 真实模式应写 proposal（如果有问题）
{
  await fixTestCoverage(false, false);
  if (fs.existsSync(PROPOSAL_FILE)) {
    const proposals = JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf8'));
    const cov = proposals.find(p => p.dimension === 'test-coverage');
    assert(cov !== undefined, '写入 test-coverage proposal');
    assert(cov.status === 'pending', 'status 是 pending');
    assert(cov.action.includes('测试') || cov.action.includes('test'), 'action 描述含测试');
  }
}

// LLM 模式会附加建议
clearProposals();
{
  const r = await fixTestCoverage(false, true);
  if (r.proposed !== undefined) {
    assert(r.llmAdvice !== undefined, 'LLM 模式含 llmAdvice');
    assert(r.llmAdvice.ok === true, 'llmAdvice 成功');
    assert(typeof r.llmAdvice.advice === 'string', 'advice 是字符串');
    assert(r.llmAdvice.advice.length > 0, 'advice 非空');

    const proposals = JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf8'));
    const cov = proposals.find(p => p.dimension === 'test-coverage');
    assert(cov && cov.reason.includes('LLM 建议'), 'proposal reason 含 LLM 建议');
  }
}

// ==================== 3. fixDepsOutdated ====================
section('Fix 3: deps-outdated');

{
  const r = await fixDepsOutdated(false, false);
  assert(typeof r === 'object', '返回对象');
  if (r.proposed !== undefined) {
    assert(Array.isArray(r.sample), 'sample 是数组');
  } else if (r.skipped) {
    assert(true, '无 deps 问题时跳过', r.reason);
  }
}

// dry-run 不写 proposal
clearProposals();
{
  await fixDepsOutdated(true, false);
  assert(!fs.existsSync(PROPOSAL_FILE), 'dry-run 不写 fix-proposals.json');
}

// LLM 模式附加建议
clearProposals();
{
  const r = await fixDepsOutdated(false, true);
  if (r.proposed !== undefined) {
    assert(r.llmAdvice !== undefined, 'LLM 模式含 llmAdvice');
    assert(r.llmAdvice.ok === true, 'llmAdvice 成功');
  }
}

// ==================== 4. fixCandidatePending ====================
section('Fix 4: candidate-pending');

{
  const r = await fixCandidatePending(false, false);
  assert(typeof r === 'object', '返回对象');
  if (r.proposed !== undefined) {
    assert(typeof r.target === 'string', 'target 是字符串');
  } else if (r.skipped) {
    assert(true, '无候选时跳过', r.reason);
  } else if (r.error) {
    assert(true, 'implementer 加载失败时记 error', r.error);
  }
}

// dry-run 不写 proposal
clearProposals();
{
  await fixCandidatePending(true, false);
  assert(!fs.existsSync(PROPOSAL_FILE), 'dry-run 不写 fix-proposals.json');
}

// LLM 模式附加建议
clearProposals();
{
  const r = await fixCandidatePending(false, true);
  if (r.proposed !== undefined) {
    assert(r.llmAdvice !== undefined, 'LLM 模式含 llmAdvice');
    assert(r.llmAdvice.ok === true, 'llmAdvice 成功');
  }
}

// ==================== 5. autoFixConservative ====================
section('保守模式: autoFixConservative');

clearProposals();
{
  const r = autoFixConservative();
  assert(r.mode === 'conservative', 'mode 正确');
  assert(typeof r.timestamp === 'string', '含 timestamp');
  assert(typeof r.results === 'object', '含 results');
  assert(typeof r.proposalsAdded === 'number', '含 proposalsAdded');
  assert(r.results.uncommitted !== undefined, 'uncommitted 有结果');
  // 保守模式应不直接动 test-coverage / deps-outdated / candidate-pending
  assert(r.results['test-coverage'] === undefined, '保守模式不跑 test-coverage');
  assert(r.results['deps-outdated'] === undefined, '保守模式不跑 deps-outdated');
  assert(r.results['candidate-pending'] === undefined, '保守模式不跑 candidate-pending');
}

// dry-run 模式
{
  const r = autoFixConservative({ dryRun: true });
  assert(r.dryRun === true, 'dryRun 字段正确');
}

// ==================== 6. autoFixFull ====================
section('完整模式: autoFixFull');

clearProposals();
{
  const r = await autoFixFull();
  assert(r.mode === 'full', 'mode 正确');
  assert(typeof r.results === 'object', '含 results');
  // 完整模式 4 项全跑
  assert(r.results.uncommitted !== undefined, '跑 uncommitted');
  assert(r.results['test-coverage'] !== undefined, '跑 test-coverage');
  assert(r.results['deps-outdated'] !== undefined, '跑 deps-outdated');
  assert(r.results['candidate-pending'] !== undefined, '跑 candidate-pending');
}

// ==================== 7. formatReport ====================
section('formatReport');

{
  const r = formatReport({
    mode: 'conservative',
    dryRun: false,
    timestamp: new Date().toISOString(),
    results: {
      uncommitted: { committed: 5, message: 'auto-fix: 5 files' },
      skipped: { skipped: true, reason: 'no changes' },
    },
    proposalsAdded: 2,
  });
  assert(r.includes('Auto-fix'), '含标题');
  assert(r.includes('✅') || r.includes('committed'), '含 commit 结果');
  assert(r.includes('proposals'), '含 proposals 提示');
}

// ==================== 8. 永不 throw 契约 ====================
section('永不 throw');

{
  let code = 0;
  try {
    execFileSync('node', ['auto-fix.js', '--auto'], { cwd: __dirname, stdio: 'pipe' });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, '--auto 始终 exit 0', `code=${code}`);
}

{
  let code = 0;
  try {
    execFileSync('node', ['auto-fix.js'], { cwd: __dirname, stdio: 'pipe' });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, '完整模式始终 exit 0', `code=${code}`);
}

{
  let code = 0;
  try {
    execFileSync('node', ['auto-fix.js', '--dry-run'], { cwd: __dirname, stdio: 'pipe' });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, 'dry-run 始终 exit 0', `code=${code}`);
}

// ==================== 9. CLI --list ====================
section('CLI: --list');

clearProposals();
{
  const out = execFileSync('node', ['auto-fix.js', '--list'], { cwd: __dirname, encoding: 'utf8', stdio: 'pipe' });
  assert(out.includes('无 pending') || out.includes('proposals'), '--list 有输出');
}

// 写入假 proposal 再 list
{
  fs.writeFileSync(PROPOSAL_FILE, JSON.stringify([
    { id: 'test-1', timestamp: new Date().toISOString(), dimension: 'test-coverage', action: '补测试', reason: 'coverage 低', status: 'pending' },
  ]));
  const out = execFileSync('node', ['auto-fix.js', '--list'], { cwd: __dirname, encoding: 'utf8', stdio: 'pipe' });
  assert(out.includes('test-coverage'), '--list 显示 proposal');
  assert(out.includes('补测试'), '--list 显示 action');
}

// ==================== 清理 ====================
clearProposals();

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 auto-fix 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);

})();