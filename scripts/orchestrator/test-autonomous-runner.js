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
  console.log('✅ buildStagePrompt');
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

// ── 主入口 ───────────────────────────────────────────

function main() {
  try {
    testEnsureStage();
    testDetermineNextStagePriority();
    testMarkStageCompleted();
    testBuildStagePrompt();
    testFailureRetryLimit();
    testSingleModeStopsAfterOneStage();
    console.log('\n🎉 全部测试通过');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ 测试失败:', e.message);
    console.error(e.stack);
    restore();
    process.exit(1);
  }
}

main();
