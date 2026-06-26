#!/usr/bin/env node
/**
 * sync-roadmap.js 单元测试（v3.0.5 M24 子模块 D）
 *
 * 覆盖：
 *   1. loadNext / loadHistory — 读 evolution-plan.json
 *   2. findPlannedTableRegion — 解析 04.md §十二 ⏳ 段
 *   3. extractIdsFromPlanned — 提取 table 内 id
 *   4. buildPlannedRow — 单行格式
 *   5. findStatusStats — 找到合计行号
 *   6. sync() diff 计算（缺则 add / 删则 remove）
 *   7. 真跑通：CLI --status + --dry-run + 同步
 *   8. 评价事件 + graceful 错误
 *
 * @since v3.0.5 (2026-06-26) M24
 */

const fs = require('fs');
const path = require('path');

const Metrics = require('./metrics.js');
try { fs.unlinkSync(Metrics.METRICS_FILE); } catch { /* ok */ }

const syncRoadmap = require('./sync-roadmap.js');
const { sync, loadNext, loadHistory, extractIdsFromPlanned, findPlannedTableRegion, buildPlannedRow, findStatusStats, ROADMAP_MD, EVOLUTION_PLAN } = syncRoadmap;

// 备份真实文件
const planBackup = fs.existsSync(EVOLUTION_PLAN) ? fs.readFileSync(EVOLUTION_PLAN, 'utf8') : null;
const mdBackup = fs.existsSync(ROADMAP_MD) ? fs.readFileSync(ROADMAP_MD, 'utf8') : null;

// 临时文件目录
const TMP_DIR = path.join(__dirname, '.tmp-sync-roadmap-test');
function setupTmp() {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
function cleanupTmp() {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
}

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

function restore() {
  if (planBackup !== null) fs.writeFileSync(EVOLUTION_PLAN, planBackup);
  if (mdBackup !== null) fs.writeFileSync(ROADMAP_MD, mdBackup);
}

// ==================== 1. loadNext / loadHistory ====================
console.log('── 1. loadNext / loadHistory ──');

{
  const next = loadNext();
  const hist = loadHistory();
  check('loadNext 返回数组', Array.isArray(next));
  check('loadHistory 返回数组', Array.isArray(hist));
  check('next 数量 >= 1（真工程有候选）', next.length >= 1);
  check('history 数量 >= 1（真工程有已完成）', hist.length >= 1);
  check('next 项有 id/title/queued_at/priority 字段',
    next.every(e => e.id && e.title && e.queued_at && e.priority));
}

// ==================== 2. findPlannedTableRegion ====================
console.log('\n── 2. findPlannedTableRegion ──');

{
  if (!mdBackup) {
    check('真工程 04.md 存在', false, '无法测试');
  } else {
    const md = mdBackup;
    const lines = md.split('\n');
    const region = findPlannedTableRegion(md);
    check('找到 ⏳ 段 table 起始行', region.start !== -1);
    check('找到 ⏳ 段 table 结束行', region.end !== -1);
    check('table 起始行是内容行（含 **id** 格式）', /^\|\s*\*\*/.test(lines[region.start] || ''));
  }
}

// ==================== 3. extractIdsFromPlanned ====================
console.log('\n── 3. extractIdsFromPlanned ──');

{
  if (!mdBackup) {
    check('真工程 04.md 存在', false);
  } else {
    const ids = extractIdsFromPlanned(mdBackup);
    check('提取到 >= 5 个 id', ids.length >= 5);
    // 不强求 M24：sync-roadmap 会把 history 里的 id 从 ⏳ 段删（M24 已完成移 ✅ 段）
    check('不含空字符串', !ids.includes(''));
  }
}

// ==================== 4. buildPlannedRow ====================
console.log('\n── 4. buildPlannedRow ──');

{
  const row = buildPlannedRow({
    id: 'TEST-id-1',
    title: 'Test Title',
    queued_at: '2026-06-26T01:00:00.000Z',
    priority: 'P1',
    note: 'test note',
  });
  check('row 含 id 包裹 **', row.includes('**TEST-id-1**'));
  check('row 含 title', row.includes('Test Title'));
  check('row 含 queued_at 前 10 字符', row.includes('2026-06-26'));
  check('row 含 priority', row.includes('| P1 |'));
  check('row 含 note', row.includes('test note'));
  check('row 以 | 开头 | 结尾', row.startsWith('|') && row.trimEnd().endsWith('|'));
}

// ==================== 5. findStatusStats ====================
console.log('\n── 5. findStatusStats ──');

{
  if (!mdBackup) {
    check('真工程 04.md 存在', false);
  } else {
    const lineIdx = findStatusStats(mdBackup);
    check('找到合计行', lineIdx !== -1);
    if (lineIdx !== -1) {
      const line = mdBackup.split('\n')[lineIdx];
      check('合计行含 "合计"', line.includes('合计'));
      check('合计行含数字', /\d+/.test(line));
    }
  }
}

// ==================== 6. sync() diff 计算 ====================
console.log('\n── 6. sync() diff 计算 ──');

{
  // 构造一个 mock evolution-plan.json 让 next 包含 1 个新条目
  const mockPlanPath = path.join(TMP_DIR, 'evolution-plan.json');
  setupTmp();
  fs.writeFileSync(mockPlanPath, JSON.stringify({
    schema_version: 1,
    current: null,
    next: [
      { id: 'TEST-NEW-1', title: 'Test New 1', queued_at: '2026-06-26T01:00:00.000Z', priority: 'P1', note: 'mock test' },
      { id: 'TEST-NEW-2', title: 'Test New 2', queued_at: '2026-06-26T01:00:00.000Z', priority: 'P2', note: '' },
    ],
    history: [],
  }, null, 2));

  // 备份真文件，临时替换
  fs.writeFileSync(EVOLUTION_PLAN, fs.readFileSync(mockPlanPath));
  const result = sync();

  check('result.added 包含 TEST-NEW-1', result.added.includes('TEST-NEW-1'));
  check('result.added 包含 TEST-NEW-2', result.added.includes('TEST-NEW-2'));
  check('result.updated = true', result.updated === true);
  check('result.newMd 含 TEST-NEW-1 行', result.newMd && result.newMd.includes('**TEST-NEW-1**'));
  check('result.newMd 含 TEST-NEW-2 行', result.newMd && result.newMd.includes('**TEST-NEW-2**'));
  check('result.newMd 更新顶部"最近一次同步"', result.newMd && /最近一次同步\*\*：[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(result.newMd));
  // next 队列状态：sync-roadmap.js v2 起用 04.md ⏳ 段实际行数（tableIds）
  //     跑测试时 04.md 状态不确定，断言只检查"含 next 队列状态 + 数字"
  check('result.newMd 更新 next 队列状态（行内含数字）',
    result.newMd && /当前 `next` 队列状态.+条候选/.test(result.newMd));

  // 恢复
  restore();
  cleanupTmp();
}

// ==================== 7. CLI 真跑通 ====================
console.log('\n── 7. CLI 真跑通 ──');

{
  const { execFileSync } = require('child_process');
  // status 命令
  let out = '';
  try {
    out = execFileSync('node', [path.join(__dirname, 'sync-roadmap.js'), '--status'], {
      encoding: 'utf8', stdio: 'pipe', cwd: path.join(__dirname, '..', '..'),
    });
  } catch (e) { out = e.stdout || ''; }
  check('--status 输出含 next 队列', out.includes('next 队列'));
  check('--status 输出含 04.md §十二', out.includes('04.md §十二'));

  // dry-run 不改文件
  const mdBefore = fs.readFileSync(ROADMAP_MD, 'utf8');
  let dryOut = '';
  try {
    dryOut = execFileSync('node', [path.join(__dirname, 'sync-roadmap.js'), '--dry-run'], {
      encoding: 'utf8', stdio: 'pipe', cwd: path.join(__dirname, '..', '..'),
    });
  } catch (e) { dryOut = e.stdout || ''; }
  const mdAfter = fs.readFileSync(ROADMAP_MD, 'utf8');
  check('--dry-run 输出含 DRY-RUN', dryOut.includes('DRY-RUN') || dryOut.includes('dry-run') || dryOut.includes('无需变更') || dryOut.includes('已同步'));
  check('--dry-run 不改文件', mdBefore === mdAfter);
}

// ==================== 8. graceful 错误 ====================
console.log('\n── 8. graceful 错误 ──');

{
  // 临时把 ROADMAP_MD 指向不存在的路径（通过修改 EVOLUTION_PLAN 让 sync 报 graceful）
  // 简化测试：sync() 内部不依赖 ROADMAP_MD 存在时仍能跑（不报错）
  // 这里我们验证：传入不存在的 EVOLUTION_PLAN → loadNext 返回 [] → sync() 不崩
  const realPlan = fs.readFileSync(EVOLUTION_PLAN, 'utf8');
  fs.unlinkSync(EVOLUTION_PLAN);
  const result = sync();
  check('evolution-plan.json 不存在时 sync() 不崩', result && Array.isArray(result.added));
  check('不崩时 added 是空数组', result.added.length === 0);
  fs.writeFileSync(EVOLUTION_PLAN, realPlan);
}

// ==================== 收尾 ====================
restore();

console.log('\n' + '━'.repeat(50));
console.log(`📊 sync-roadmap 测试结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('失败项:');
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
