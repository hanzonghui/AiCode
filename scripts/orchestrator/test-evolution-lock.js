#!/usr/bin/env node
/**
 * test-evolution-lock.js — evolution-lock.js 单元测试
 *
 * 测试维度（10 项）：
 *   1. loadState 默认值（无文件时返回 DEFAULT_STATE）
 *   2. saveState 原子写入（.tmp + rename）
 *   3. status 空状态
 *   4. acquire 成功 + 写 current
 *   5. acquire 冲突（同 current.id 占用，stale=false）
 *   6. acquire 接管 stale 锁（locked_at 超过 5 分钟）
 *   7. release 成功（清 current）
 *   8. release id 不匹配
 *   9. complete 成功（写 history + 清 current）
 *  10. queue 成功 + 重复 id 跳过
 *  11. peek 三档状态（current/next/history 都能查到）
 *  12. CLI 端到端（init / status / acquire / queue）
 *
 * 永不 throw：所有测试 try/catch 包裹，失败 → exit 1
 *
 * @since v2.0.4 (2026-06-25) — P0-0 演进治理基础设施
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 临时目录（每个测试用例独立）
const TMP_ROOT = path.join(__dirname, '.test-evolution-lock');
const SCRIPT = path.join(__dirname, 'evolution-lock.js');

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

function setupTmp() {
  const dir = path.join(TMP_ROOT, `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup() {
  if (fs.existsSync(TMP_ROOT)) {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}

// ── 主流程 ─────────────────────────────────────────

console.log('🧪 test-evolution-lock.js — P0-0 演进锁单元测试\n');
console.log('🗂️  测试维度 1：loadState 默认值');
test('无文件时返回 DEFAULT_STATE 形态', () => {
  const dir = setupTmp();
  process.env.MEMORY_DIR_OVERRIDE = dir; // hack：让 evolution-lock 读 TMP 目录
  // evolution-lock.js 用的是 path.join(WORKSPACE_ROOT, ...)，不能 override
  // 所以我们用真状态文件做隔离：备份 → 改 → 恢复
  const realStateFile = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  const realStateExists = fs.existsSync(realStateFile);
  const realStateContent = realStateExists ? fs.readFileSync(realStateFile, 'utf8') : null;

  try {
    // 删除真文件
    if (realStateExists) fs.unlinkSync(realStateFile);
    const lock = require(SCRIPT);
    const s = lock.loadState();
    assertEq(s.schema_version, 1, 'schema_version 缺省');
    assertEq(s.current, null, 'current 缺省 null');
    assert(Array.isArray(s.next), 'next 是数组');
    assert(Array.isArray(s.history), 'history 是数组');
  } finally {
    // 恢复
    if (realStateContent) {
      fs.writeFileSync(realStateFile, realStateContent);
    }
  }
});

console.log('\n🗂️  测试维度 2：saveState 原子写入');
test('saveState 创建 .tmp 后 rename', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    const s = { schema_version: 1, current: null, next: [], history: [], updated_at: null };
    lock.saveState(s);
    assert(fs.existsSync(realStateFile), '状态文件应存在');
    const restored = JSON.parse(fs.readFileSync(realStateFile, 'utf8'));
    assertEq(restored.schema_version, 1, '内容正确');
    // 临时文件应已清理
    assert(!fs.existsSync(realStateFile + '.tmp'), '.tmp 文件应已清理');
  } finally {
    if (realStateContent) {
      fs.writeFileSync(realStateFile, realStateContent);
    }
  }
});

console.log('\n🗂️  测试维度 3：status 空状态');
test('无锁时 status 返回 locked=false', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    const s = lock.status();
    assertEq(s.locked, false, 'locked=false');
    assertEq(s.current, null, 'current=null');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 4：acquire 成功');
test('空闲时 acquire 写入 current', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    const r = lock.acquire('M13-test', 'test-owner', { title: '测试阶段' });
    assertEq(r.acquired, true, 'acquired=true');
    const s = lock.loadState();
    assert(s.current !== null, 'current 不为 null');
    assertEq(s.current.id, 'M13-test', 'id 正确');
    assertEq(s.current.owner, 'test-owner', 'owner 正确');
    assert(s.current.locked_at, 'locked_at 有值');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 5：acquire 冲突');
test('锁占用时 acquire 失败（非 stale）', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.acquire('M13-existing', 'owner-A');
    const r = lock.acquire('M14-other', 'owner-B');
    assertEq(r.acquired, false, 'acquired=false');
    assert(r.reason.includes('M13-existing'), 'reason 包含占用的 id');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 6：acquire 接管 stale');
test('stale 锁可被新 acquire 接管', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    // 手工写入一个 stale 锁（locked_at 6 分钟前）
    const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    lock.saveState({
      schema_version: 1,
      current: { id: 'M13-stale', title: 'stale', owner: 'old-owner', locked_at: staleTime },
      next: [],
      history: [],
      updated_at: staleTime,
    });
    const r = lock.acquire('M13-stale', 'new-owner');
    assertEq(r.acquired, true, 'stale 锁可被接管');
    const s = lock.loadState();
    assertEq(s.current.owner, 'new-owner', 'owner 已更新');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 7：release 成功');
test('release 清空 current', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.acquire('M13', 'owner-A');
    const r = lock.release();
    assertEq(r.released, true, 'released=true');
    const s = lock.loadState();
    assertEq(s.current, null, 'current 已清空');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 8：release id 不匹配');
test('release 指定 id 不匹配 current 失败', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.acquire('M13', 'owner-A');
    const r = lock.release('M14-other');
    assertEq(r.released, false, 'released=false');
    assert(r.reason.includes('id 不匹配'), 'reason 包含 "id 不匹配"');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 9：complete');
test('complete 写 history + 清 current', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.acquire('M13', 'owner-A');
    const r = lock.complete('M13', '完成测试');
    assertEq(r.completed, true, 'completed=true');
    const s = lock.loadState();
    assertEq(s.current, null, 'current 已清空');
    assertEq(s.history.length, 1, 'history 写入 1 条');
    assertEq(s.history[0].id, 'M13', 'history id 正确');
    assertEq(s.history[0].summary, '完成测试', 'summary 正确');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 10：queue + 重复跳过');
test('queue 追加 + 重复 id 跳过', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    const r1 = lock.queue('M14', '测试标题');
    assertEq(r1.queued, true, '首次 queue 成功');
    const r2 = lock.queue('M14', '重复标题');
    assertEq(r2.queued, false, '重复 id 跳过');
    const s = lock.loadState();
    assertEq(s.next.length, 1, 'next 只有 1 条');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 11：peek 三档');
test('peek 能查 current/next/history', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.queue('M14', '候选阶段');
    lock.acquire('M13', 'owner-A');
    lock.complete('M13', 'M13 完成');
    // 此时 M13 应在 history，current 为空，M14 在 next
    const m14 = lock.peek('M14');
    assert(m14 !== null, 'M14 能查到');
    assertEq(m14.status, 'queued', 'M14 状态 queued');
    const m13 = lock.peek('M13');
    assert(m13 !== null, 'M13 能查到');
    assertEq(m13.status, 'completed', 'M13 状态 completed');
    const none = lock.peek('M99-notexist');
    assertEq(none, null, '不存在的 id 返回 null');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 12：CLI 端到端');
test('init / status / acquire / queue / release CLI 跑通', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    // init
    execSync(`node "${SCRIPT}" init`, { stdio: 'pipe' });
    assert(fs.existsSync(realStateFile), 'init 创建文件');
    // status
    const out1 = execSync(`node "${SCRIPT}" status`, { encoding: 'utf8' });
    assert(out1.includes('锁空闲'), 'status 显示空闲');
    // queue
    execSync(`node "${SCRIPT}" queue M99-test "测试候选"`, { stdio: 'pipe' });
    // acquire
    const out2 = execSync(`node "${SCRIPT}" acquire M99-test cli-owner "测试阶段"`, { encoding: 'utf8' });
    assert(out2.includes('锁已获取'), 'acquire CLI 成功');
    // status
    const out3 = execSync(`node "${SCRIPT}" status`, { encoding: 'utf8' });
    assert(out3.includes('M99-test'), 'status 显示持有 id');
    // release
    const out4 = execSync(`node "${SCRIPT}" release`, { encoding: 'utf8' });
    assert(out4.includes('锁已释放'), 'release CLI 成功');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 13：isAllowedDoc 匹配规则');
test('精确路径、目录前缀、不匹配、空限制都正确', () => {
  const lock = require(SCRIPT);
  assertEq(lock.isAllowedDoc('scripts/foo.js', ['scripts/foo.js']), true, '精确路径通过');
  assertEq(lock.isAllowedDoc('scripts/foo.js', ['other/**']), false, '不同目录拒绝');
  assertEq(lock.isAllowedDoc('scripts/bar/baz.js', ['scripts/bar/**']), true, '/** 匹配子文件');
  assertEq(lock.isAllowedDoc('scripts/bar', ['scripts/bar/**']), true, '/** 也匹配目录本身');
  assertEq(lock.isAllowedDoc('scripts/barx/baz.js', ['scripts/bar/**']), false, '前缀相似但不同目录拒绝');
  assertEq(lock.isAllowedDoc('any.js', []), true, '空 allowed_docs 放行');
  assertEq(lock.isAllowedDoc(null, ['x.js']), true, '无法识别路径时放行');
  assertEq(lock.isAllowedDoc('a\\b\\c.js', ['a/b/c.js']), true, '反斜杠归一化后匹配');
});

console.log('\n🗂️  测试维度 14：guardPostToolUse 校验');
test('有锁时允许/拒绝 allowed_docs 正确', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    lock.acquire('M-guard', 'guard-owner', {
      title: 'guard 测试',
      allowed_docs: ['allowed.js', 'dir/**'],
    });
    assertEq(
      lock.guardPostToolUse({ tool_use_name: 'Edit', tool_input: { file_path: 'allowed.js' } }),
      null,
      '允许文件返回 null'
    );
    assertEq(
      lock.guardPostToolUse({ tool_use_name: 'Write', tool_input: { file_path: 'dir/sub/x.js' } }),
      null,
      '目录前缀内文件返回 null'
    );
    const v = lock.guardPostToolUse({ tool_use_name: 'Edit', tool_input: { file_path: 'forbidden.js' } });
    assert(v !== null, '不允许文件触发违规');
    assertEq(v.lock_id, 'M-guard', '违规记录当前锁 id');
    assertEq(v.file_path, 'forbidden.js', '违规记录文件路径');
    assertEq(
      lock.guardPostToolUse({ tool_use_name: 'Bash', tool_input: { command: 'rm -rf /' } }),
      null,
      '非 Edit/Write 工具不校验'
    );
    // 清锁后放行
    lock.release();
    assertEq(
      lock.guardPostToolUse({ tool_use_name: 'Edit', tool_input: { file_path: 'forbidden.js' } }),
      null,
      '无锁时放行'
    );
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
});

console.log('\n🗂️  测试维度 15：CLI acquire --allowed-docs');
test('acquire 命令支持 --allowed-docs 并写入 current', () => {
  const lock = require(SCRIPT);
  const realStateFile = lock.STATE_FILE;
  const realStateContent = fs.existsSync(realStateFile) ? fs.readFileSync(realStateFile, 'utf8') : null;
  try {
    if (fs.existsSync(realStateFile)) fs.unlinkSync(realStateFile);
    const out = execSync(`node "${SCRIPT}" acquire M-cli-docs cli-owner "测试" --allowed-docs a.js,b/**`, { encoding: 'utf8' });
    assert(out.includes('allowed_docs=[a.js, b/**]'), 'CLI 输出显示 allowed_docs');
    const s = lock.loadState();
    assert(s.current !== null, 'current 已写入');
    assertEq(s.current.id, 'M-cli-docs', 'id 正确');
    assertEq(s.current.allowed_docs.length, 2, 'allowed_docs 2 条');
    assertEq(s.current.allowed_docs[0], 'a.js', '第一条正确');
    assertEq(s.current.allowed_docs[1], 'b/**', '第二条正确');
  } finally {
    if (realStateContent) fs.writeFileSync(realStateFile, realStateContent);
  }
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
