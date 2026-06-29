#!/usr/bin/env node
/**
 * test-plan-bridge-stale.js — plan-bridge stale 自动恢复 + OS 锁测试
 *
 * 验证 M54 batch 2 D:
 *   1) rescueStaleExecutings: 超 30 分钟 executing → 自动回退 approved
 *   2) rescueStaleExecutings: 未超时不打扰
 *   3) acquireLock / releaseLock: 单进程 OK
 *   4) acquireLock: 持有中再调返回 false
 *   5) releaseLock 后再调 acquireLock 返回 true
 *   6) executePlan 启动自动调 rescueStaleExecutings
 *
 * 策略：用 tmp 目录隔离 pending-plans.json，结束后清理
 *
 * @since v3.0.9 (2026-06-30)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PB = require('./plan-bridge');

let pass = 0, fail = 0;
const fails = [];

function assert(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push({ name, detail }); console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── 隔离 pending-plans.json 到 tmp 目录 ─────────────
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-bridge-stale-'));
const MEMORY_DIR_TMP = path.join(TMP_DIR, 'memory');
fs.mkdirSync(MEMORY_DIR_TMP, { recursive: true });
const TMP_PENDING = path.join(MEMORY_DIR_TMP, 'pending-plans.json');
const TMP_EXEC_LOG = path.join(MEMORY_DIR_TMP, 'plan-execution-log.json');
const TMP_LOCK = path.join(MEMORY_DIR_TMP, 'plan-bridge.lock');

// 备份原文件 + 替换为 tmp
const origPlansFile = PB.EXECUTION_LOG_FILE ? path.join(MEMORY_DIR_TMP, 'pending-plans.json') : null;
// 直接覆盖 plan-bridge.js 模块内部的 PENDING_PLANS_FILE 引用需要 module 重新设计
// 改：直接读写 tmp 文件 + 调模块（模块函数都是用 PENDING_PLANS_FILE 常量，临时改写文件）
// 简化：直接用模块的 loadPlans/savePlans 不行（内部用常量）— 改用文件注入：

// 注入：备份 pending-plans.json 到 tmp，调模块前覆盖，调完恢复
const REAL_PENDING = path.join(path.dirname(PB.EXECUTION_LOG_FILE), 'pending-plans.json');
const REAL_BACKUP = REAL_PENDING + '.stale-test-backup';
const REAL_EXEC_LOG = PB.EXECUTION_LOG_FILE;
const REAL_LOCK = PB.LOCK_FILE;
const REAL_BACKUP_LOG = REAL_EXEC_LOG + '.stale-test-backup';
const REAL_BACKUP_LOCK = REAL_LOCK + '.stale-test-backup';

function setupTmp() {
  // 备份真实文件（若存在）
  if (fs.existsSync(REAL_PENDING)) fs.copyFileSync(REAL_PENDING, REAL_BACKUP);
  if (fs.existsSync(REAL_EXEC_LOG)) fs.copyFileSync(REAL_EXEC_LOG, REAL_BACKUP_LOG);
  if (fs.existsSync(REAL_LOCK)) fs.copyFileSync(REAL_LOCK, REAL_BACKUP_LOCK);
  // 写测试 fixtures
  fs.writeFileSync(REAL_PENDING, JSON.stringify([], null, 2));
  if (!fs.existsSync(REAL_EXEC_LOG)) fs.writeFileSync(REAL_EXEC_LOG, JSON.stringify({ executions: [] }, null, 2));
}

function restoreReal() {
  if (fs.existsSync(REAL_BACKUP)) {
    fs.copyFileSync(REAL_BACKUP, REAL_PENDING);
    fs.unlinkSync(REAL_BACKUP);
  } else if (fs.existsSync(REAL_PENDING)) {
    fs.unlinkSync(REAL_PENDING);
  }
  if (fs.existsSync(REAL_BACKUP_LOG)) {
    fs.copyFileSync(REAL_BACKUP_LOG, REAL_EXEC_LOG);
    fs.unlinkSync(REAL_BACKUP_LOG);
  }
  if (fs.existsSync(REAL_BACKUP_LOCK)) {
    fs.copyFileSync(REAL_BACKUP_LOCK, REAL_LOCK);
    fs.unlinkSync(REAL_BACKUP_LOCK);
  }
  // 确保锁清空
  if (fs.existsSync(REAL_LOCK)) fs.unlinkSync(REAL_LOCK);
}

function readPlans() {
  return JSON.parse(fs.readFileSync(REAL_PENDING, 'utf8'));
}
function writePlans(plans) {
  fs.writeFileSync(REAL_PENDING, JSON.stringify(plans, null, 2));
}

// ── 测试 1: stale 超 30 分钟自动回退 ──────────────
section('1. rescueStaleExecutings: 超 30 分钟 → 回退 approved');
setupTmp();
try {
  const now = Date.now();
  const staleAt = new Date(now - 35 * 60 * 1000).toISOString(); // 35 分钟前
  writePlans([
    {
      id: 'TEST-stale-plan',
      status: 'executing',
      executing_at: staleAt,
      plan: { task: 'test stale', goal: 'g', steps: [] },
    },
    {
      id: 'TEST-fresh-plan',
      status: 'executing',
      executing_at: new Date(now - 5 * 60 * 1000).toISOString(), // 5 分钟前（不超）
      plan: { task: 'fresh', goal: 'g', steps: [] },
    },
  ]);
  const r = PB.rescueStaleExecutings();
  const plans = readPlans();
  const stale = plans.find(p => p.id === 'TEST-stale-plan');
  const fresh = plans.find(p => p.id === 'TEST-fresh-plan');
  assert(r.rescued.length === 1, 'rescued 数组含 1 条', `got ${JSON.stringify(r.rescued)}`);
  assert(r.rescued[0] === 'TEST-stale-plan', 'rescued 是 stale 那个');
  assert(stale.status === 'approved', 'stale 计划 status = approved', `got ${stale.status}`);
  assert(!stale.executing_at, 'stale 计划 executing_at 已清空');
  assert(stale.stale_warning && /35/.test(stale.stale_warning), 'stale 警告含分钟数', `got ${stale.stale_warning}`);
  assert(fresh.status === 'executing', 'fresh 计划保持 executing（未超时）', `got ${fresh.status}`);
} catch (e) { fail++; console.log(`  ❌ 测试 1 异常: ${e.message}`); }

// ── 测试 2: 边界 — 正好 30 分钟 ─────────────────
section('2. 边界: 30 分钟前后差 1ms');
try {
  const now = Date.now();
  const justOver = new Date(now - 30 * 60 * 1000 - 1000).toISOString();
  const justUnder = new Date(now - 30 * 60 * 1000 + 5000).toISOString();
  writePlans([
    { id: 'A', status: 'executing', executing_at: justOver, plan: { task: 't', goal: 'g', steps: [] } },
    { id: 'B', status: 'executing', executing_at: justUnder, plan: { task: 't', goal: 'g', steps: [] } },
  ]);
  PB.rescueStaleExecutings();
  const plans = readPlans();
  assert(plans.find(p => p.id === 'A').status === 'approved', 'A (超 30min) 回退');
  assert(plans.find(p => p.id === 'B').status === 'executing', 'B (未超 30min) 保持');
} catch (e) { fail++; console.log(`  ❌ 测试 2 异常: ${e.message}`); }

// ── 测试 3: acquireLock + releaseLock 单进程 ─────
section('3. acquireLock / releaseLock 单进程');
try {
  // 先清掉可能残留
  if (fs.existsSync(REAL_LOCK)) fs.unlinkSync(REAL_LOCK);
  const a1 = PB.acquireLock();
  const a2 = PB.acquireLock();  // 已被自己持有
  PB.releaseLock();
  const a3 = PB.acquireLock();  // 释放后能再获得
  PB.releaseLock();
  assert(a1 === true, '首次 acquireLock = true');
  assert(a2 === false, '二次 acquireLock = false（已被持有）');
  assert(a3 === true, 'releaseLock 后 acquireLock = true');
} catch (e) { fail++; console.log(`  ❌ 测试 3 异常: ${e.message}`); }

// ── 测试 4: executePlan 启动自动调 rescueStale ────
section('4. executePlan 启动自动 rescue');
try {
  if (fs.existsSync(REAL_LOCK)) fs.unlinkSync(REAL_LOCK);
  const now = Date.now();
  const staleAt = new Date(now - 40 * 60 * 1000).toISOString();
  writePlans([
    {
      id: 'STALE-1',
      status: 'executing',
      executing_at: staleAt,
      plan: { task: 'stale', goal: 'g', steps: [] },
    },
    {
      id: 'NEW-APPROVED',
      status: 'approved',
      plan: { task: 'new', goal: 'g', steps: [{ text: 'noop' }] },
    },
  ]);
  // 调 executeLatest（无 claude CLI 时 steps 会失败但不影响状态检查）
  const r = PB.executeLatest({ dryRun: true });  // dryRun 跳过锁
  const plans = readPlans();
  const stale = plans.find(p => p.id === 'STALE-1');
  assert(stale.status === 'approved', 'executePlan 启动把 STALE-1 回退 approved', `got ${stale.status}`);
} catch (e) { fail++; console.log(`  ❌ 测试 4 异常: ${e.message}`); }

// ── 测试 5: lock 文件已存在时 executePlan 非 dry-run 应拒绝 ──
section('5. executePlan 非 dryRun 时锁被占 → 拒绝');
try {
  // 手动建一个陈旧锁（>35min 强制接管场景外）
  fs.writeFileSync(REAL_LOCK, JSON.stringify({ acquired_at: new Date().toISOString(), pid: 99999 }));
  writePlans([{
    id: 'LOCK-TEST',
    status: 'approved',
    plan: { task: 't', goal: 'g', steps: [{ text: 'noop' }] },
  }]);
  const r = PB.executeLatest({ dryRun: false });
  assert(!r.ok, 'executePlan 返回 ok=false', `got ok=${r.ok}`);
  assert(/锁/.test(r.error), '错误信息含"锁"', `got: ${r.error}`);
  fs.unlinkSync(REAL_LOCK);
} catch (e) { fail++; console.log(`  ❌ 测试 5 异常: ${e.message}`); }

// ── 清理 ─────────────────────────────────────────
restoreReal();
fs.rmSync(TMP_DIR, { recursive: true, force: true });

console.log(`\n────────────────────────────────────────`);
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('失败项:');
  fails.forEach(f => console.log(`  - ${f.name}: ${f.detail || ''}`));
  process.exit(1);
}
process.exit(0);