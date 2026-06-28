#!/usr/bin/env node
/**
 * verify-runner-subprocess.js — 端到端验证 runner 子进程能正确执行阶段
 *
 * 验证 3 个关键机制：
 *   1. buildStagePrompt 输出含全部强制标记（防 BUG #2 复现）
 *   2. claude -p 子进程可正常退出并返回 exit code
 *   3. complete-stage 调用会正确更新 stage 状态
 *
 * @since v3.0.6 (2026-06-28) — 验证阶段产物
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const {
  buildStagePrompt,
  resolveClaudeBin,
  markStageCompleted,
  loadSnapshot,
  saveSnapshot,
  AUTONOMOUS_STATE_FILE,
  SNAPSHOT_FILE,
} = require('./autonomous-runner');

let pass = 0;
let total = 0;
function check(name, cond) {
  total++;
  if (cond) {
    pass++;
    console.log('  ✅', name);
  } else {
    console.log('  ❌', name);
  }
}

// ── 验证 1：buildStagePrompt 输出含全部强制标记 ──
function verifyPrompt() {
  console.log('\n━━━ [1] buildStagePrompt 强制标记验证（防 BUG #2）');
  const snap = {
    summary: 'verify test',
    autonomous_state: { enabled: true },
    stage: { current: 'test-stage', completed: [], next: 'next-stage' },
    next_action: 'next-stage',
  };
  const prompt = buildStagePrompt(snap);
  check('含 AUTONOMOUS RUNNER DIRECTIVE 标题', prompt.includes('AUTONOMOUS RUNNER DIRECTIVE'));
  check('含 "Do not ask for clarification"', prompt.includes('Do not ask for clarification'));
  check('含 "not a new session"', prompt.includes('not a new session'));
  check('含 [1] LOAD CONTEXT 步骤', prompt.includes('[1] LOAD CONTEXT'));
  check('含 [5] EXIT 步骤', prompt.includes('[5] EXIT'));
  check('含 "critical" 标记（第 4 步）', prompt.includes('critical'));
  check('含 "runner will fail without this"', prompt.includes('runner will fail without this'));
  check('含 complete-stage 命令路径', prompt.includes('autonomous-runner.js complete-stage'));
  check('含 session-summary.sh save 指令', prompt.includes('session-summary.sh save'));
  check('含失败快照路径（兜底）', prompt.includes('save a failure snapshot'));
  check('含 git push 禁令', prompt.includes('DO NOT run git push'));
  check('prompt 长度合理（1000-5000 字符）', prompt.length > 1000 && prompt.length < 5000);
}

// ── 验证 2：claude -p 子进程返回正常 exit code（不退化为 null）──
async function verifyClaudeSubprocess() {
  console.log('\n━━━ [2] claude -p 子进程 exit code 验证');
  const bin = resolveClaudeBin();
  console.log('  bin:', bin);

  // 用最简单的 echo 任务验证退出码
  const child = spawn(bin, ['-p', '--permission-mode', 'auto'], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  if (child.stdin) {
    child.stdin.write('echo "VERIFICATION_OK"');
    child.stdin.end();
  }

  const result = await new Promise((resolve) => {
    let stdout = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: null, signal: 'SIGTERM', timeout: true });
    }, 90000);
    child.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      resolve({ code, signal, stdout: stdout.trim().substring(0, 200) });
    });
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({ code: -1, signal: null, error: err.message });
    });
  });

  console.log('  退出:', JSON.stringify(result));
  check('claude -p 子进程正常退出（code=0，不是 null）', result.code === 0);
  check('没有 timeout', !result.timeout);
  check('没有 ENOENT 错误', !result.error || !result.error.includes('ENOENT'));
}

// ── 验证 3：complete-stage 调用更新 stage 状态 ──
function verifyCompleteStage() {
  console.log('\n━━━ [3] complete-stage 状态机验证');

  // 备份真实快照
  const original = fs.existsSync(SNAPSHOT_FILE)
    ? fs.readFileSync(SNAPSHOT_FILE, 'utf8')
    : null;

  try {
    // 写一个 in_progress 快照
    saveSnapshot({
      summary: 'verify test',
      stage: {
        current: 'verify-stage',
        status: 'in_progress',
        completed: [],
        next: null,
        failure_count: 0,
      },
      next_action: null,
    });

    markStageCompleted('next-verify-stage');

    const after = loadSnapshot();
    check('stage.current 已清空', after.stage.current === null);
    check('stage.status = completed', after.stage.status === 'completed');
    check('stage.next = next-verify-stage', after.stage.next === 'next-verify-stage');
    check('stage.completed 含 verify-stage', after.stage.completed.includes('verify-stage'));
    check('stage.failure_count = 0', after.stage.failure_count === 0);
    check('snapshot.next_action 同步更新', after.next_action === 'next-verify-stage');
  } finally {
    // 恢复真实快照
    if (original !== null) {
      fs.writeFileSync(SNAPSHOT_FILE, original);
    }
  }
}

// ── 主入口 ──
async function main() {
  try {
    verifyPrompt();
    await verifyClaudeSubprocess();
    verifyCompleteStage();

    console.log('\n' + '━'.repeat(40));
    console.log(`🎉 验证通过: ${pass} / ${total}`);
    process.exit(pass === total ? 0 : 1);
  } catch (e) {
    console.error('\n❌ 验证异常:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();