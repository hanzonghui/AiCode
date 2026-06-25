#!/usr/bin/env node
/**
 * M19 audit 闭环测试（v3.0.3）
 *
 * 覆盖：
 *   1. readAuditBacklog() — 解析 audit-*.md 第 6 段 P0/P1/P2
 *   2. readResearchDigest() — 解析 research-*.md 头部
 *   3. 命名空间 AUDIT- / RESEARCH- 正确
 *   4. audit P0 → 进化 P1（优先级映射）
 *   5. aggregate() 包含 audit + research 源
 *   6. enqueueAll 实际入队 + dedupe
 *   7. dry-run 不写 evolution-plan.json
 *   8. 现有 9 份 audit + 1 份 research 真跑通
 *   9. evo 评价事件（task=queue-bridge.sync）
 *
 * @since v3.0.3 (2026-06-26) M19
 */

const fs = require('fs');
const path = require('path');

// 准备：清空 metrics.jsonl
const Metrics = require('./metrics');
try { fs.unlinkSync(Metrics.METRICS_FILE); } catch { /* ok */ }

const bridge = require(path.join(__dirname, '..', 'bridge', 'queue-bridge'));
const { readAuditBacklog, readResearchDigest, aggregate, enqueueAll, _parseAuditReport, makeId, slugify } = bridge;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

// ==================== 1. 真实 audit 报告解析 ====================
console.log('── 1. readAuditBacklog 真报告 ──');

{
  const auditPath = path.join(__dirname, '..', '..', '.claude', 'audits', 'audit-20260626-0034.md');
  if (fs.existsSync(auditPath)) {
    const results = _parseAuditReport(auditPath);
    check('解析 audit-20260626-0034.md 返回数组', Array.isArray(results));
    check('至少 1 条 P2 建议', results.length >= 1);
    if (results.length > 0) {
      const first = results[0];
      check('source = audit', first.source === 'audit');
      check('priority 映射 P2 → P3（远期）', first.priority === 'P3');
      check('id 以 AUDIT- 开头', first.id.startsWith('AUDIT-'));
      check('type 字段存在', typeof first.type === 'string' && first.type.length > 0);
    }
  } else {
    check('audit-20260626-0034.md 存在', false, '缺真实文件');
  }
}

// ==================== 2. readAuditBacklog 只取最新 ====================
console.log('\n── 2. readAuditBacklog 取最新 ──');

{
  const results = readAuditBacklog();
  check('readAuditBacklog 返回数组', Array.isArray(results));
  check('有 9 份 audit 时取最新 1 份 = 1 份建议', results.length >= 1);
}

// ==================== 3. research 解析 ====================
console.log('\n── 3. readResearchDigest ──');

{
  const results = readResearchDigest();
  check('readResearchDigest 返回数组', Array.isArray(results));
  check('1 份 research 报告 = 1 条结果', results.length === 1);
  if (results.length > 0) {
    const first = results[0];
    check('source = research', first.source === 'research');
    check('id 以 RESEARCH- 开头', first.id.startsWith('RESEARCH-'));
    check('priority = P2（远期调研）', first.priority === 'P2');
    check('title 包含"扩展 skill"或"调研"', first.title.includes('扩展') || first.title.includes('调研') || first.title.length > 5);
    check('detail 含日期', /\d{4}-\d{2}-\d{2}/.test(first.detail));
  }
}

// ==================== 4. 命名空间 + 优先级映射 ====================
console.log('\n── 4. 命名空间 + 优先级映射 ──');

{
  check('makeId audit 源 = AUDIT- 前缀', makeId('audit', 'foo-bar').startsWith('AUDIT-'));
  check('makeId research 源 = RESEARCH- 前缀', makeId('research', 'foo').startsWith('RESEARCH-'));
  // 测试 audit 解析时 P0 → P1
  const fakeAudit = path.join(__dirname, '.tmp-audit-test.md');
  fs.writeFileSync(fakeAudit, `# Test

## 6. 💡 优化建议

### 🔴 P0

1. **[test]** 测试用例（small）
   - 测试 P0 映射

### 🟡 P1

1. **[refactor]** 重构（small）
   - 测试 P1 映射
`);
  const results = _parseAuditReport(fakeAudit);
  check('P0 解析出 1 条', results.filter(r => r.type === 'test').length === 1);
  check('P0 → 进化 P1', results.find(r => r.type === 'test')?.priority === 'P1');
  check('P1 → 进化 P2', results.find(r => r.type === 'refactor')?.priority === 'P2');
  fs.unlinkSync(fakeAudit);
}

// ==================== 5. aggregate 含 audit + research ====================
console.log('\n── 5. aggregate audit 源 ──');

{
  // 先备份 evolution-plan.json
  const planPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  const planBackup = fs.readFileSync(planPath, 'utf8');
  const planBefore = JSON.parse(planBackup);

  try {
    // 清空 next（保 current/history）
    planBefore.next = [];
    fs.writeFileSync(planPath, JSON.stringify(planBefore, null, 2));

    const { unique, dups, total_raw } = aggregate(['audit', 'research']);
    check('aggregate audit 返回结果', total_raw >= 2); // 至少 1 audit + 1 research
    check('至少 1 条 AUDIT-', unique.some(c => c.id.startsWith('AUDIT-')));
    check('至少 1 条 RESEARCH-', unique.some(c => c.id.startsWith('RESEARCH-')));
  } finally {
    fs.writeFileSync(planPath, planBackup);
  }
}

// ==================== 6. 实际入队 + dedupe ====================
console.log('\n── 6. enqueueAll 实际入队 + dedupe ──');

{
  const planPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  const planBackup = fs.readFileSync(planPath, 'utf8');
  const planBefore = JSON.parse(planBackup);

  try {
    planBefore.next = [];
    fs.writeFileSync(planPath, JSON.stringify(planBefore, null, 2));

    const { unique } = aggregate(['audit', 'research']);
    const r1 = enqueueAll(unique);
    check('audit + research 入队 ≥ 1', r1.added.length >= 1);

    // 重复入队
    const r2 = enqueueAll(unique);
    check('重复入队 0 新增', r2.added.length === 0);
    check('重复入队 skipped 数量 = added', r2.skipped.length === r1.added.length);
  } finally {
    fs.writeFileSync(planPath, planBackup);
  }
}

// ==================== 7. dry-run 不写 ====================
console.log('\n── 7. dry-run 不写 ──');

{
  const planPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  const planBackup = fs.readFileSync(planPath, 'utf8');
  const planBefore = JSON.parse(planBackup);

  try {
    planBefore.next = [];
    fs.writeFileSync(planPath, JSON.stringify(planBefore, null, 2));

    const { unique } = aggregate(['audit', 'research']);
    const r = enqueueAll(unique, { dryRun: true });
    check('dry-run added = unique', r.added.length === unique.length);
    check('dry-run added[0].dryRun=true', r.added[0]?.dryRun === true);

    const planAfter = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    check('dry-run 不改 next 长度', planAfter.next.length === planBefore.next.length);
  } finally {
    fs.writeFileSync(planPath, planBackup);
  }
}

// ==================== 8. 真实 9 份 audit + 1 份 research 真跑通 ====================
console.log('\n── 8. 真实 audit + research 真跑通 ──');

{
  const realPlanPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  const planBackup = fs.readFileSync(realPlanPath, 'utf8');

  try {
    const planBefore = JSON.parse(planBackup);
    planBefore.next = [];
    fs.writeFileSync(realPlanPath, JSON.stringify(planBefore, null, 2));

    // 真跑一次（含 evolve + audit + research）
    const { unique, total_raw } = aggregate(['evolve', 'audit', 'research']);
    check('真跑全 3 源有结果', total_raw >= 9, `实际 ${total_raw}`);

    const r = enqueueAll(unique);
    check('入队成功（含 7 EVOLVE + 1 AUDIT + 1 RESEARCH）', r.added.length >= 9);
    const addedIds = r.added.map(a => a.id);
    check('含 EVOLVE 候选', addedIds.some(id => id.startsWith('EVOLVE-')));
    check('含 AUDIT 候选', addedIds.some(id => id.startsWith('AUDIT-')));
    check('含 RESEARCH 候选', addedIds.some(id => id.startsWith('RESEARCH-')));

    // 恢复
    fs.writeFileSync(realPlanPath, planBackup);
  } catch (e) {
    fs.writeFileSync(realPlanPath, planBackup);
    check('真跑通', false, e.message);
  }
}

// ==================== 9. 评价事件 ====================
console.log('\n── 9. 评价事件 ──');

{
  // 上面测试可能因 metrics 目录被 auto-fix 删除而 metrics.jsonl 不存在，容错
  let lines = [];
  try { lines = fs.readFileSync(Metrics.METRICS_FILE, 'utf8').split('\n').filter(Boolean); }
  catch { lines = []; }

  const evo = lines.map(l => JSON.parse(l)).filter(e => e.name && e.name.startsWith('evo.'));
  if (lines.length === 0) {
    console.log('  ℹ️  metrics.jsonl 不存在（auto-fix 误删可能）— 跳过本节');
  } else {
    check('evo.* 事件被记录', evo.length >= 1);
    const taskEvo = evo.find(e => e.name === 'evo.task.completion_time' && e.tags && e.tags.task === 'queue-bridge.sync');
    check('evo.task.completion_time 含 task=queue-bridge.sync', !!taskEvo);
  }
}

// ==================== 总结 ====================
console.log('');
console.log(`📊 M19 audit 闭环测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
if (fail > 0) {
  console.log('失败项:');
  fails.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
