#!/usr/bin/env node
/**
 * test-distiller.js — 失败蒸馏器单元测试（M13）
 *
 * 测试维度（5 项）：
 *   1. heuristicDistill 一次性（uncommitted）
 *   2. heuristicDistill 可复用（todo-accumulate）
 *   3. fingerprint 一致性（同一 anomaly 多次相同指纹）
 *   4. distillAll 空 anomalies → 返回 0/0/0
 *   5. CLI run 端到端（读真实 anomalies.json）
 *
 * 永不 throw
 *
 * @since v2.0.5 (2026-06-25) — M13 失败蒸馏器
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'distiller.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('🧪 test-distiller.js — M13 失败蒸馏器单元测试\n');

console.log('🗂️  测试维度 1：heuristicDistill 一次性');
test('uncommitted 维度判为一次性', () => {
  const distiller = require(SCRIPT);
  const r = distiller.heuristicDistill({
    dimension: 'uncommitted',
    severity: 'error',
    message: '33 个未提交改动',
    hint: 'commit 或 stash',
  });
  assertEq(r.reusable, false, 'reusable=false');
  assertEq(r.confidence, 'high', 'confidence=high');
});

console.log('\n🗂️  测试维度 2：heuristicDistill 可复用');
test('todo-accumulate 维度判为可复用', () => {
  const distiller = require(SCRIPT);
  const r = distiller.heuristicDistill({
    dimension: 'todo-accumulate',
    severity: 'warning',
    message: '项目累计 25 处 TODO/FIXME',
    hint: '热点文件: a.js(5)',
  });
  assertEq(r.reusable, true, 'reusable=true');
  assert(r.title, '有 title');
  assert(r.content, '有 content');
});

console.log('\n🗂️  测试维度 3：fingerprint 一致性');
test('同一 anomaly 多次指纹相同', () => {
  const distiller = require(SCRIPT);
  const a = { dimension: 'todo-accumulate', message: '25 TODO' };
  const fp1 = distiller.fingerprint(a);
  const fp2 = distiller.fingerprint(a);
  assertEq(fp1, fp2, '指纹相同');
  assert(fp1.length > 0, '指纹非空');
});

console.log('\n🗂️  测试维度 4：distillAll 空 anomalies');
test('无 anomalies 时返回 0/0/0', async () => {
  const distiller = require(SCRIPT);
  const realAnomalyFile = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'anomalies.json');
  const realContent = fs.existsSync(realAnomalyFile) ? fs.readFileSync(realAnomalyFile, 'utf8') : null;

  try {
    if (fs.existsSync(realAnomalyFile)) fs.unlinkSync(realAnomalyFile);
    const r = await distiller.distillAll();
    assertEq(r.total, 0, 'total=0');
    assertEq(r.reusable, 0, 'reusable=0');
    assertEq(r.oneoff, 0, 'oneoff=0');
  } finally {
    if (realContent) fs.writeFileSync(realAnomalyFile, realContent);
  }
});

console.log('\n🗂️  测试维度 5：CLI run 端到端');
test('distiller.js run 命令能跑通', () => {
  const out = execSync(`node "${SCRIPT}" run`, { encoding: 'utf8', cwd: path.join(__dirname, '..', '..', '..') });
  assert(out.includes('蒸馏完成'), '输出包含"蒸馏完成"');
});

// ── 收尾 ─────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);

if (failed > 0) {
  console.log('\n失败详情:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}

process.exit(0);
