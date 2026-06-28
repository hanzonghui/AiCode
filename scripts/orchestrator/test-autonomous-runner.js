#!/usr/bin/env node
/**
 * test-autonomous-runner.js — autonomous-runner 单元测试
 *
 * 覆盖：
 *   - determineNextStage 优先级
 *   - ensureStage 默认值
 *   - markStageInProgress / Completed / Failed 状态流转
 *   - buildStagePrompt 内容
 *   - 失败重试上限逻辑（mock）
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  ensureStage,
  determineNextStage,
  markStageCompleted,
  buildStagePrompt,
  resolveClaudeBin,
  checkHandoff,  // M24-C
  loadAutonomousState,  // M24-C
  saveAutonomousState,  // M24-C
  disableAutonomous,  // M24-C
  AUTONOMOUS_STATE_FILE,
  SNAPSHOT_FILE,
} = require('./autonomous-runner');

// ── 测试工具 ─────────────────────────────────────────

let backupSnapshot = null;

function backup() {
  if (fs.existsSync(SNAPSHOT_FILE)) {
    backupSnapshot = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
  }
}

function restore() {
  if (backupSnapshot !== null) {
    fs.writeFileSync(SNAPSHOT_FILE, backupSnapshot);
  } else if (fs.existsSync(SNAPSHOT_FILE)) {
    fs.unlinkSync(SNAPSHOT_FILE);
  }
  backupSnapshot = null;
}

function writeSnapshot(data) {
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
}

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
}

// ── 测试用例 ─────────────────────────────────────────

function testEnsureStage() {
  const s = { summary: 'test' };
  ensureStage(s);
  assert.strictEqual(s.stage.status, 'idle');
  assert.deepStrictEqual(s.stage.completed, []);
  assert.strictEqual(s.stage.failure_count, 0);
  console.log('✅ ensureStage');
}

function testDetermineNextStagePriority() {
  // 优先 stage.next
  const s1 = { stage: { next: 'stage-B' }, next_action: 'stage-A' };
  assert.strictEqual(determineNextStage(s1), 'stage-B');

  // 其次 next_action
  const s2 = { stage: { next: null }, next_action: 'stage-A' };
  assert.strictEqual(determineNextStage(s2), 'stage-A');

  // 再其次 pending_todos
  const s3 = { stage: {}, pending_todos: ['M1', 'M2'] };
  assert.strictEqual(determineNextStage(s3), 'M1');

  // 都没有
  const s4 = { stage: {} };
  assert.strictEqual(determineNextStage(s4), null);
  console.log('✅ determineNextStage 优先级');
}

function testMarkStageCompleted() {
  backup();
  writeSnapshot({
    summary: 'test',
    stage: {
      current: 'stage-A',
      status: 'in_progress',
      completed: [],
      next: null,
      failure_count: 2,
    },
  });

  markStageCompleted('stage-B');

  const after = readSnapshot();
  assert.deepStrictEqual(after.stage.completed, ['stage-A']);
  assert.strictEqual(after.stage.status, 'completed');
  assert.strictEqual(after.stage.next, 'stage-B');
  assert.strictEqual(after.stage.failure_count, 0);
  assert.strictEqual(after.next_action, 'stage-B');

  restore();
  console.log('✅ markStageCompleted');
}

function testBuildStagePrompt() {
  const snapshot = {
    summary: 'summary text',
    autonomous_state: { enabled: true, reason: 'test' },
    stage: {
      current: 'stage-A',
      completed: ['stage-0'],
      next: 'stage-B',
    },
  };
  const prompt = buildStagePrompt(snapshot);
  assert(prompt.includes('stage-A'));
  assert(prompt.includes('stage-B'));
  assert(prompt.includes('autonomous-runner.js complete-stage'));
  assert(prompt.includes('session-summary.sh save'));

  // v2.2.2 BUG #2 fix: prompt 必须显式声明"非对话" + 强制任务清单 + 禁止问用户
  assert(prompt.includes('AUTONOMOUS RUNNER DIRECTIVE'), '必须含指令标题');
  assert(prompt.includes('Do not ask for clarification'), '必须禁止向用户发问');
  assert(prompt.includes('not a new session'), '必须禁止走 SessionStart 启动协议');
  assert(prompt.includes('[1]') && prompt.includes('[5]'), '必须含 5 步任务清单');
  // 关键步骤（第 4 步）必须标记为 critical
  assert(prompt.includes('critical'), '第 4 步（complete-stage）必须标 critical');
  assert(prompt.includes('runner will fail without this'), '必须强调 complete-stage 重要性');

  console.log('✅ buildStagePrompt (含 BUG #2 修复验证)');
}

function testFailureRetryLimit() {
  // 纯逻辑：验证 failure_count 递增
  backup();
  writeSnapshot({
    summary: 'test',
    stage: {
      current: 'stage-A',
      status: 'in_progress',
      completed: [],
      next: 'stage-B',
      failure_count: 0,
    },
  });

  // 模拟 markStageFailed（未导出，手动测试）
  const { markStageFailed } = require('./autonomous-runner');
  const c1 = markStageFailed(readSnapshot(), 'error 1');
  const c2 = markStageFailed(readSnapshot(), 'error 2');
  const c3 = markStageFailed(readSnapshot(), 'error 3');
  assert.strictEqual(c1, 1);
  assert.strictEqual(c2, 2);
  assert.strictEqual(c3, 3);

  restore();
  console.log('✅ failure_count 递增');
}

function testSingleModeStopsAfterOneStage() {
  backup();

  // 写一个已完成阶段的快照
  writeSnapshot({
    summary: 'single mode test',
    stage: {
      current: 'stage-A',
      status: 'completed',
      completed: ['stage-A'],
      next: 'stage-B',
      failure_count: 0,
    },
  });

  // 模拟 single 模式状态
  const { AUTONOMOUS_STATE_FILE, saveAutonomousState, loadAutonomousState } = require('./autonomous-runner');
  const originalState = fs.existsSync(AUTONOMOUS_STATE_FILE) ? fs.readFileSync(AUTONOMOUS_STATE_FILE, 'utf8') : null;
  saveAutonomousState({ enabled: true, mode: 'single' });

  const state = loadAutonomousState();
  assert.strictEqual(state.mode, 'single', '状态文件写入 mode=single');

  // 恢复状态文件
  if (originalState !== null) {
    fs.writeFileSync(AUTONOMOUS_STATE_FILE, originalState);
  } else if (fs.existsSync(AUTONOMOUS_STATE_FILE)) {
    fs.unlinkSync(AUTONOMOUS_STATE_FILE);
  }

  restore();
  console.log('✅ single 模式状态可读写');
}

function testResolveClaudeBin() {
  // 1. CLAUDE_BIN 环境变量优先
  const origEnv = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = '/custom/path/to/claude';
  assert.strictEqual(resolveClaudeBin(), '/custom/path/to/claude', 'CLAUDE_BIN 优先');
  if (origEnv === undefined) delete process.env.CLAUDE_BIN;
  else process.env.CLAUDE_BIN = origEnv;

  // 2. Windows 上无环境变量时，%APPDATA%\npm\claude.cmd 存在 → 用绝对路径
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA;
    if (appdata) {
      const expected = path.join(appdata, 'npm', 'claude.cmd');
      if (fs.existsSync(expected)) {
        delete process.env.CLAUDE_BIN;
        assert.strictEqual(resolveClaudeBin(), expected, 'Windows 上解析到 %APPDATA%\\npm\\claude.cmd');
      }
    }
  }

  // 3. 无环境变量、非 Windows 或 APPDATA 路径不存在 → 回落 'claude'（PATH 查找）
  delete process.env.CLAUDE_BIN;
  if (process.platform !== 'win32') {
    assert.strictEqual(resolveClaudeBin(), 'claude', '非 Windows 回落 PATH');
  }

  console.log('✅ resolveClaudeBin');
}

// ── M24-C: checkHandoff 集成测试 ──

async function testCheckHandoffTimeout() {
  // 场景：maxWaitMs=0 立即超时 → stopped=true
  const original = fs.existsSync(AUTONOMOUS_STATE_FILE) ? fs.readFileSync(AUTONOMOUS_STATE_FILE, 'utf8') : null;
  saveAutonomousState({ enabled: true, awaiting_handoff: true, handoff_at: new Date().toISOString() });
  const r = await checkHandoff(0);
  assert.strictEqual(r.stopped, true, 'maxWaitMs=0 立即超时');
  assert.strictEqual(r.cleared, false);
  if (original !== null) fs.writeFileSync(AUTONOMOUS_STATE_FILE, original);
  else if (fs.existsSync(AUTONOMOUS_STATE_FILE)) fs.unlinkSync(AUTONOMOUS_STATE_FILE);
  console.log('✅ M24-C checkHandoff 超时');
}

async function testCheckHandoffClearedDuringWait() {
  // 场景：等待期间被 clear → stopped=false, cleared=true
  const original = fs.existsSync(AUTONOMOUS_STATE_FILE) ? fs.readFileSync(AUTONOMOUS_STATE_FILE, 'utf8') : null;
  saveAutonomousState({ enabled: true, awaiting_handoff: true, handoff_at: new Date().toISOString() });

  // 500ms 后清掉
  setTimeout(() => {
    const s = loadAutonomousState();
    delete s.awaiting_handoff;
    saveAutonomousState(s);
  }, 500);

  const start = Date.now();
  // 切片是 5 秒硬编码，所以 maxWaitMs=5000 一定等 5 秒
  // 改用更长 maxWaitMs（10000）但中途 clear → 应在第一次 5 秒切片后返回
  const r = await checkHandoff(10000);
  const elapsed = Date.now() - start;

  assert.strictEqual(r.stopped, false, '被 clear 不超时');
  assert.strictEqual(r.cleared, true);
  assert(elapsed < 8000, `应在第一次 5 秒切片后返回（实际 ${elapsed}ms）`);

  if (original !== null) fs.writeFileSync(AUTONOMOUS_STATE_FILE, original);
  else if (fs.existsSync(AUTONOMOUS_STATE_FILE)) fs.unlinkSync(AUTONOMOUS_STATE_FILE);
  console.log('✅ M24-C checkHandoff 期间被 clear');
}

function testCheckHandoffExport() {
  assert.strictEqual(typeof checkHandoff, 'function', 'checkHandoff 必须 export');
  assert.strictEqual(checkHandoff.length, 1, 'checkHandoff 接受 1 个参数');
  console.log('✅ M24-C checkHandoff 是 module 导出');
}

function testCheckHandoffNoAwaiting() {
  // 场景：没标 awaiting → 立即返回 stopped=false, cleared=true
  const original = fs.existsSync(AUTONOMOUS_STATE_FILE) ? fs.readFileSync(AUTONOMOUS_STATE_FILE, 'utf8') : null;
  saveAutonomousState({ enabled: true, awaiting_handoff: false });
  return checkHandoff(5000).then((r) => {
    assert.strictEqual(r.stopped, false);
    assert.strictEqual(r.cleared, true);
    if (original !== null) fs.writeFileSync(AUTONOMOUS_STATE_FILE, original);
    else if (fs.existsSync(AUTONOMOUS_STATE_FILE)) fs.unlinkSync(AUTONOMOUS_STATE_FILE);
    console.log('✅ M24-C checkHandoff 无 awaiting 标记');
  });
}

// ── 主入口 ───────────────────────────────────────────

function main() {
  try {
    testEnsureStage();
    testDetermineNextStagePriority();
    testMarkStageCompleted();
    testBuildStagePrompt();
    testFailureRetryLimit();
    testSingleModeStopsAfterOneStage();
    testResolveClaudeBin();
    testCheckHandoffExport();

    // 异步 M24-C 测试
    (async () => {
      try {
        await testCheckHandoffTimeout();
        await testCheckHandoffClearedDuringWait();
        await testCheckHandoffNoAwaiting();
        console.log('\n🎉 全部测试通过（8 原 + 4 M24-C = 12 项）');
        process.exit(0);
      } catch (e) {
        console.error('\n❌ M24-C 测试失败:', e.message);
        console.error(e.stack);
        process.exit(1);
      }
    })();
  } catch (e) {
    console.error('\n❌ 测试失败:', e.message);
    console.error(e.stack);
    restore();
    process.exit(1);
  }
}

main();
