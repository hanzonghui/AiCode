#!/usr/bin/env node
/**
 * auto-implement.js 单元测试
 * 验证: 安全闸门 / 路径黑名单 / 列表 / CLI / 干跑 / 状态
 *
 * @since v2.2.0 — 增量 F / M7
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AI = require('./auto-implement');
const {
  evaluateSafety,
  checkPathSafety,
  listExecutable,
  SAFETY,
  loadCandidates,
} = AI;

// 路径常量
const ROOT = path.join(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, 'data', 'evolution', 'auto-implement-state.json');
const TASKS_FILE = path.join(ROOT, 'data', 'evolution', 'auto-tasks.json');
const LOG_FILE = path.join(ROOT, 'data', 'evolution', 'auto-implement-log.json');

let pass = 0, fail = 0;
const fails = [];
function assert(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push({ name, detail }); console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

// ==================== 1. evaluateSafety 闸门 ====================
section('1. 安全闸门 evaluateSafety');

(async () => {
  // composite_score 不够
  const r1 = await evaluateSafety({ composite_score: 5.0, estimated_effort: 'small', suggestion: 'adopt' });
  assert(!r1.allowed && /composite/.test(r1.reason), 'composite=5 被拒');

  // effort=medium 被拒
  const r2 = await evaluateSafety({ composite_score: 8.0, estimated_effort: 'medium', suggestion: 'adopt' });
  assert(!r2.allowed && /effort/.test(r2.reason), 'effort=medium 被拒');

  // effort=large 被拒
  const r3 = await evaluateSafety({ composite_score: 8.0, estimated_effort: 'large', suggestion: 'adopt' });
  assert(!r3.allowed, 'effort=large 被拒');

  // suggestion=skip 被拒
  const r4 = await evaluateSafety({ composite_score: 9.0, estimated_effort: 'small', suggestion: 'skip' });
  assert(!r4.allowed && /suggestion/.test(r4.reason), 'suggestion=skip 被拒');

  // 包含禁用依赖（reason 兼容旧"forbidden dep"前缀 + 新"禁止依赖"启发式关键字）
  const r5 = await evaluateSafety({
    composite_score: 9.0, estimated_effort: 'small', suggestion: 'adopt',
    name: 'foo/bar', description: 'uses @anthropic-ai/sdk'
  });
  assert(!r5.allowed && /forbidden dep|禁止依赖/.test(r5.reason), '含 @anthropic-ai 被拒');

  // 全过
  const r6 = await evaluateSafety({
    composite_score: 8.0, estimated_effort: 'small', suggestion: 'adopt',
    name: 'foo/bar', description: 'simple tool'
  });
  assert(r6.allowed, 'small+adopt+无禁用依赖 → 通过');

  // 兼容 score 字段
  const r7 = await evaluateSafety({ score: 8.0, effort: 'small', suggestion: 'adapt' });
  assert(r7.allowed, '兼容 score/effort 字段名');

  // M12 LLM-judge 来源标记
  assert(typeof r6.source === 'string', 'evaluateSafety 返回 source 字段（llm/hard）');
  assert(r6.source === 'hard' || r6.source === 'llm', `source 字段有效（${r6.source}）`);
})();

// ==================== 2. 路径黑名单 ====================
section('2. 路径黑名单 checkPathSafety');

{
  const r1 = checkPathSafety(['scripts/evolution/foo.js', 'docs/readme.md']);
  assert(r1.safe, '普通文件安全');

  const r2 = checkPathSafety(['.claude/skills/foo.js']);
  assert(!r2.safe && r2.violations.length === 1, '.claude/ 黑名单命中');

  const r3 = checkPathSafety(['scripts/orchestrator/dispatcher.js']);
  assert(!r3.safe, 'dispatcher.js 黑名单命中');

  const r4 = checkPathSafety(['package.json']);
  assert(!r4.safe, 'package.json 黑名单命中');

  const r5 = checkPathSafety(['CLAUDE.md']);
  assert(!r5.safe, 'CLAUDE.md 黑名单命中');

  const r6 = checkPathSafety(['04_自我演进路线.md']);
  assert(!r6.safe, '04 路线图黑名单命中');

  const r7 = checkPathSafety(['CHANGELOG.md']);
  assert(!r7.safe, 'CHANGELOG 黑名单命中');

  const r8 = checkPathSafety(['package.json', 'scripts/orchestrator/dispatcher.js']);
  assert(!r8.safe && r8.violations.length === 2, '多违规同时检测');
}

// ==================== 3. loadCandidates 双源 ====================
section('3. 双源候选加载');

{
  // 临时写入 auto-tasks.json 测试
  const tmpTasks = path.join(ROOT, 'data', 'evolution', '.test-tasks.json');
  if (fs.existsSync(TASKS_FILE)) {
    fs.copyFileSync(TASKS_FILE, tmpTasks);
  }
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify({
      tasks: [{ name: 'self/foo', composite_score: 8.5, estimated_effort: 'small', suggestion: 'adopt', description: 'test' }]
    }));
    const items = loadCandidates();
    assert(items.length >= 1, `加载到 ${items.length} 个候选`);
    const fromTask = items.find(i => i.source === 'auto-task' && i.name === 'self/foo');
    assert(fromTask, 'auto-task 来源被识别');
  } finally {
    // 恢复
    if (fs.existsSync(tmpTasks)) {
      fs.copyFileSync(tmpTasks, TASKS_FILE);
      fs.unlinkSync(tmpTasks);
    } else if (fs.existsSync(TASKS_FILE)) {
      fs.unlinkSync(TASKS_FILE);
    }
  }
}

// ==================== 4. listExecutable 过滤 ====================
section('4. listExecutable 过滤');

async function runListExecutableTest() {
  // 用 1 个临时 task 跑
  const tmpTasks = path.join(ROOT, 'data', 'evolution', '.test-tasks.json');
  if (fs.existsSync(TASKS_FILE)) {
    fs.copyFileSync(TASKS_FILE, tmpTasks);
  }
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify({
      tasks: [
        { name: 'safe/task', composite_score: 8.5, estimated_effort: 'small', suggestion: 'adopt', description: 'safe' },
        { name: 'unsafe/low', composite_score: 5.0, estimated_effort: 'small', suggestion: 'adopt', description: 'low score' },
        { name: 'unsafe/medium', composite_score: 9.0, estimated_effort: 'medium', suggestion: 'adopt', description: 'medium' },
        { name: 'unsafe/skip', composite_score: 9.0, estimated_effort: 'small', suggestion: 'skip', description: 'skip' },
      ]
    }));
    // listExecutable 是 async（M12 LLM-judge 接入后），需要 await
    const list = await listExecutable();
    assert(list.length === 1 && list[0].name === 'safe/task', `只通过 1 个（实际 ${list.length}）`);
    assert(list[0].composite_score >= 7.0, '通过项 composite >= 7.0');
  } finally {
    if (fs.existsSync(tmpTasks)) {
      fs.copyFileSync(tmpTasks, TASKS_FILE);
      fs.unlinkSync(tmpTasks);
    } else if (fs.existsSync(TASKS_FILE)) {
      fs.unlinkSync(TASKS_FILE);
    }
  }
}

// ==================== 5. CLI ====================
section('5. CLI');

{
  // status
  const out1 = execFileSync('node', [path.join(__dirname, 'auto-implement.js'), 'status'], { encoding: 'utf8' });
  assert(out1.includes('auto-implement 状态') && out1.includes('连续失败'), 'CLI status 输出');

  // list
  const out2 = execFileSync('node', [path.join(__dirname, 'auto-implement.js'), 'list'], { encoding: 'utf8' });
  assert(out2.includes('可自动实现的候选'), 'CLI list 输出');

  // help
  const out3 = execFileSync('node', [path.join(__dirname, 'auto-implement.js'), '--help'], { encoding: 'utf8' });
  assert(out3.includes('安全边界') && out3.includes('composite_score'), 'CLI help 输出安全边界');

  // run --auto --dry-run
  const out4 = execFileSync('node', [path.join(__dirname, 'auto-implement.js'), 'run', '--auto', '--dry-run'], { encoding: 'utf8' });
  assert(out4.includes('DRY-RUN') || out4.includes('没有可自动实现'), 'CLI dry-run 不实际执行');
}

// ==================== 6. 连续失败保护 ====================
section('6. 连续失败保护');

{
  // 写入 consecutive_fails = 5，验证 run 直接被拒
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpState = STATE_FILE + '.bak';
  if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, tmpState);
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ consecutive_fails: 5, total_runs: 0, auto_done: [] }));
    let blocked = false;
    try {
      execFileSync('node', [path.join(__dirname, 'auto-implement.js'), 'run', '--auto'], { encoding: 'utf8' });
    } catch (e) {
      blocked = true;
      assert(/连续失败/.test(e.stderr || e.stdout || ''), '连续失败>=3 直接拒绝');
    }
    assert(blocked, 'run 在高连续失败时被拒');

    // reset 后可恢复
    const out5 = execFileSync('node', [path.join(__dirname, 'auto-implement.js'), 'reset'], { encoding: 'utf8' });
    assert(out5.includes('已重置为 0'), 'reset 后计数清零');
  } finally {
    if (fs.existsSync(tmpState)) {
      fs.copyFileSync(tmpState, STATE_FILE);
      fs.unlinkSync(tmpState);
    } else if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  }
}

// ==================== 7. implementOne dry-run ====================
async function test7() {
  section('7. implementOne dry-run');
  const r = await AI.implementOne({
    name: 'test/foo', composite_score: 8.0, estimated_effort: 'small',
    suggestion: 'adopt', description: 'test', source: 'test',
  }, { dryRun: true });
  assert(r.success && r.dryRun, 'dry-run 成功且不实际执行');
}

// ==================== 汇总 ====================
console.log(`\n${'━'.repeat(40)}`);
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败详情:');
  fails.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail || ''}`));
  process.exit(1);
}
console.log('✅ 全部通过');

// 异步测试在文件末尾需要包 async IIFE（Node ESM 检测）
test7().then(() => runListExecutableTest()).then(() => {
  console.log(`\n📊 最终: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) {
    fails.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail || ''}`));
    process.exit(1);
  }
  console.log('✅ 全部通过（含 async 测试）');
}).catch(err => {
  console.error('❌ 测试异常:', err.message);
  process.exit(1);
});