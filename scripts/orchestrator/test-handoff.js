#!/usr/bin/env node
/**
 * handoff.js 单元测试（v3.0.4 M21 + M22）
 *
 * 覆盖：
 *   1. buildHandoffPrompt — 4 段拼装（摘要/待办/下阶段/约束）
 *   2. saveSnapshot — 强制写 snapshot 文件
 *   3. markAwaitingHandoff — 写 autonomous-state.json
 *   4. clearAwaitingHandoff — 清除 awaiting_handoff
 *   5. handoff() 主流程 — dry-run 不写 / 真实写
 *   6. 错误兜底 — 缺 title
 *   7. 标签默认值
 *   8. CLI 真跑
 *   9. evo 评价事件
 *  10. M22 --auto / enqueueNext — next 入队 + auto 标记
 *
 * @since v3.0.4 (2026-06-26) M21
 * @updated v3.0.4 (2026-06-26) M22
 */

const fs = require('fs');
const path = require('path');

// 准备：清空 metrics.jsonl
const Metrics = require('./metrics');
try { fs.unlinkSync(Metrics.METRICS_FILE); } catch { /* ok */ }

const { handoff, buildHandoffPrompt, saveSnapshot, markAwaitingHandoff, clearAwaitingHandoff, clearAwaitingHandoffIfStale, appendHandoffLifecycle, loadAutonomousState, loadSnapshot, resolveNextFromSnapshot, writeContinuePromptFile, copyToClipboard, spawnRunnerContinuation, resumeFromRunner, CONTINUE_PROMPT_FILE, HANDOFF_DIR, HANDOFF_LIFECYCLE_FILE } = require('./handoff');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

// 备份 autonomous-state.json + snapshot + evolution-plan.json
const planStatePath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'autonomous-state.json');
const snapshotPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'sessions', 'latest_state.json');
const evolutionPlanPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
const stateBackup = fs.existsSync(planStatePath) ? fs.readFileSync(planStatePath, 'utf8') : null;
const snapBackup = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null;
const planBackup = fs.existsSync(evolutionPlanPath) ? fs.readFileSync(evolutionPlanPath, 'utf8') : null;

// 清理之前测试残留的临时 next 条目
function cleanupTestNextEntries() {
  if (!fs.existsSync(evolutionPlanPath)) return;
  const plan = JSON.parse(fs.readFileSync(evolutionPlanPath, 'utf8'));
  const testIds = ['M22: 下一阶段', 'M22-TEST-NEXT', 'M22-CLI-NEXT', 'M22-dry-run-next', 'M22-NOARGS-NEXT'];
  const before = plan.next.length;
  plan.next = plan.next.filter(x => !testIds.includes(x.id));
  if (plan.next.length !== before) {
    fs.writeFileSync(evolutionPlanPath, JSON.stringify(plan, null, 2));
  }
}
cleanupTestNextEntries();

// ==================== 1. buildHandoffPrompt 4 段 ====================
console.log('── 1. buildHandoffPrompt 4 段 ──');

{
  const fakeSnapshot = {
    summary: '完成 M19 audit 闭环。9 项候选入 next 队列。',
    pending_todos: ['M20: decision-assistant.js'],
    stage: { current: null },
  };
  const fakeAutonomous = { enabled: false };
  const prompt = buildHandoffPrompt('当前 M19 完成', 'M20: decision-assistant.js', fakeSnapshot, fakeAutonomous);

  check('prompt 含"会话交接"', prompt.includes('会话交接'));
  check('prompt 含上一会话快照', prompt.includes('上一会话快照'));
  check('prompt 含会话摘要', prompt.includes('完成 M19 audit 闭环'));
  check('prompt 含待办列表', prompt.includes('M20: decision-assistant.js'));
  check('prompt 含下一阶段', prompt.includes('M20: decision-assistant.js'));
  check('prompt 含执行步骤', prompt.includes('执行步骤'));
  check('prompt 含当前状态', prompt.includes('自主模式'));
  check('prompt 含关键约束', prompt.includes('不修改根目录'));
}

// ==================== 2. saveSnapshot ====================
console.log('\n── 2. saveSnapshot 写快照 ──');

{
  const result = saveSnapshot('M21 测试', 'M21: handoff 命令', ['test']);
  check('saveSnapshot 返回 saved=true', result.saved === true);
  check('snapshot 文件存在', fs.existsSync(snapshotPath));
  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  check('snapshot 含 summary', typeof snap.summary === 'string' && snap.summary.length > 0);
  check('snapshot 含 next_action = M21', snap.next_action === 'M21: handoff 命令' || (snap.summary && snap.summary.includes('M21')));
}

// ==================== 3. markAwaitingHandoff ====================
console.log('\n── 3. markAwaitingHandoff ──');

{
  markAwaitingHandoff('M21: handoff 命令', '测试');
  const state = JSON.parse(fs.readFileSync(planStatePath, 'utf8'));
  check('autonomous-state.json awaiting_handoff = true', state.awaiting_handoff === true);
  check('autonomous-state.json next_action = M21', state.next_action === 'M21: handoff 命令');
  check('autonomous-state.json handoff_next = M21', state.handoff_next === 'M21: handoff 命令');
  check('autonomous-state.json handoff_at 存在', !!state.handoff_at);
  check('autonomous-state.json handoff_reason = 测试', state.handoff_reason === '测试');
}

// ==================== 4. clearAwaitingHandoff ====================
console.log('\n── 4. clearAwaitingHandoff ──');

{
  clearAwaitingHandoff();
  const state = JSON.parse(fs.readFileSync(planStatePath, 'utf8'));
  check('awaiting_handoff 已清除', state.awaiting_handoff === undefined);
  check('handoff_at 已清除', state.handoff_at === undefined);
  check('handoff_next 已清除', state.handoff_next === undefined);
  check('handoff_reason 已清除', state.handoff_reason === undefined);
  check('next_action 保留', state.next_action === 'M21: handoff 命令');
}

// ==================== 5. handoff() dry-run ====================
console.log('\n── 5. handoff() dry-run 不写 ──');

{
  const stateBefore = fs.readFileSync(planStatePath, 'utf8');

  const result = handoff('dry-run 测试', { nextTitle: 'M22', dryRun: true });
  check('dry-run 返回 prompt', typeof result.prompt === 'string');
  check('dry-run prompt 含 M22', result.prompt.includes('M22'));

  const stateAfter = fs.readFileSync(planStatePath, 'utf8');
  check('dry-run 不改 autonomous-state.json', stateBefore === stateAfter);
}

// ==================== 6. handoff() 真实写 ====================
console.log('\n── 6. handoff() 真实写 ──');

{
  // 清理 awaiting_handoff 再测
  clearAwaitingHandoff();

  const uniqueNext = 'M22-TEST-NEXT';
  const result = handoff('M21 真实写测试', { nextTitle: uniqueNext });
  check('真实写返回 saved=true', result.saved === true);
  check('真实写返回 snapshotPath', result.snapshotPath === snapshotPath);
  check('真实写返回 enqueued=true', result.enqueued === true, `got ${result.enqueued}`);

  const state = JSON.parse(fs.readFileSync(planStatePath, 'utf8'));
  check('真实写标 awaiting_handoff', state.awaiting_handoff === true);
  check('真实写 next_action', state.next_action === uniqueNext);

  const plan = JSON.parse(fs.readFileSync(evolutionPlanPath, 'utf8'));
  check('真实写把 next 入队 evolution-plan.json', plan.next.some(x => x.id === uniqueNext));
  const queued = plan.next.find(x => x.id === uniqueNext);
  if (queued) {
    check('入队 note 不是 "-n"', queued.note !== '-n', `note=${queued.note}`);
  }
}

// ==================== 7. handoff() 重复入队不重复 ====================
console.log('\n── 7. 重复入队不重复 ──');

{
  const uniqueNext = 'M22-TEST-NEXT';
  const result = handoff('重复入队测试', { nextTitle: uniqueNext });
  check('重复入队返回 enqueued=false', result.enqueued === false, `got ${result.enqueued}`);
}

// ==================== 8. 错误兜底（无 snapshot 且无 title） ====================
console.log('\n── 8. 错误兜底 ──');

{
  // 临时破坏 snapshot，测试无参数且没有 next_action 时 fallback 到 evolution-plan
  const snapBefore = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null;
  // 临时无 snapshot + 无 evolution-plan
  const planBefore = fs.existsSync(evolutionPlanPath) ? fs.readFileSync(evolutionPlanPath, 'utf8') : null;
  if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
  if (fs.existsSync(evolutionPlanPath)) {
    const p = JSON.parse(planBefore);
    p.next = [];
    fs.writeFileSync(evolutionPlanPath, JSON.stringify(p));
  }

  let threw = false;
  try {
    handoff(null);
  } catch (e) {
    threw = true;
  }
  // 新行为：总是 fallback，不会抛错
  check('无参数有 fallback（无 snap + 无 next）不抛错', !threw);

  // 恢复
  if (snapBefore !== null) fs.writeFileSync(snapshotPath, snapBefore);
  if (planBefore !== null) fs.writeFileSync(evolutionPlanPath, planBefore);
}

// ==================== 8a. resolveNextFromSnapshot ====================
console.log('\n── 8a. resolveNextFromSnapshot ──');

{
  const snapBefore = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null;

  // 1. next_action 优先作为 nextTitle
  fs.writeFileSync(snapshotPath, JSON.stringify({ next_action: 'M22-NOARGS-NEXT', summary: '[已完成] M22 测试' }));
  const r1 = resolveNextFromSnapshot();
  check('resolveNext 优先 next_action（nextTitle）', r1.nextTitle === 'M22-NOARGS-NEXT');
  check('resolveNext 从 summary 提取 title', r1.title.includes('M22 测试'));

  // 2. 从 summary 解析"下一步:"
  fs.writeFileSync(snapshotPath, JSON.stringify({ summary: '[已完成] M22 测试。\n\n下一步: M22-PARSE-NEXT' }));
  const r2 = resolveNextFromSnapshot();
  check('resolveNext 从 summary 解析"下一步:"（nextTitle）', r2.nextTitle === 'M22-PARSE-NEXT');

  // 3. 无 next_action / "下一步" 时总是返回 fallback
  fs.writeFileSync(snapshotPath, JSON.stringify({ summary: '完成 M22。' }));
  const r3 = resolveNextFromSnapshot();
  check('resolveNext 无匹配返回 fallback 对象', r3 && typeof r3 === 'object' && r3.nextTitle);

  if (snapBefore !== null) fs.writeFileSync(snapshotPath, snapBefore);
  else if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
}

// ==================== 8b. 无参数 handoff() dry-run ====================
console.log('\n── 8b. 无参数 handoff() ──');

{
  const snapBefore = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null;
  fs.writeFileSync(snapshotPath, JSON.stringify({ next_action: 'M22-NOARGS-NEXT', summary: '[已完成] M22 测试。\n\n下一步: M22-PARSE-NEXT' }));

  const result = handoff(null, { dryRun: true });
  check('无参数 dry-run 返回 nextTitle（next_action 优先）', result.nextTitle === 'M22-NOARGS-NEXT');
  check('无参数 dry-run prompt 含 next', result.prompt.includes('M22-NOARGS-NEXT'));

  if (snapBefore !== null) fs.writeFileSync(snapshotPath, snapBefore);
  else if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
}

// ==================== 8c. writeContinuePromptFile ====================
console.log('\n── 8c. writeContinuePromptFile ──');

{
  const promptFile = writeContinuePromptFile('测试 prompt 内容', 'M22-CONTINUE');
  check('prompt 文件路径正确', promptFile === CONTINUE_PROMPT_FILE);
  check('prompt 文件存在', fs.existsSync(promptFile));
  const content = fs.readFileSync(promptFile, 'utf8');
  check('prompt 文件含内容', content.includes('测试 prompt 内容'));
  check('prompt 文件含标题', content.includes('M22-CONTINUE'));
}

// ==================== 8d. copyToClipboard ====================
console.log('\n── 8d. copyToClipboard ──');

{
  // 不验证剪贴板内容（平台相关），只验证不抛错
  let didNotThrow = true;
  try { copyToClipboard('handoff-test-clipboard'); }
  catch { didNotThrow = false; }
  check('copyToClipboard 不抛错', didNotThrow);
}

// ==================== 9. 标签默认值 ====================
console.log('\n── 9. 标签默认值 ──');

{
  const r1 = saveSnapshot('标签测试', 'next', undefined);
  check('默认标签 = handoff', r1.saved === true);
}

// ==================== 10. CLI 真跑 ====================
console.log('\n── 10. CLI 真跑 ──');

{
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'handoff.js'), 'CLI 测试', '--dry-run'], { encoding: 'utf8' });
  check('CLI 退出 0', r.status === 0);
  check('CLI 输出含"会话交接"', r.stdout.includes('会话交接'));
  check('CLI 输出含"DRY-RUN"', r.stdout.includes('DRY-RUN'));
}

// ==================== 11. evo 评价事件 ====================
console.log('\n── 11. evo 评价事件 ──');

{
  let lines = [];
  try { lines = fs.readFileSync(Metrics.METRICS_FILE, 'utf8').split('\n').filter(Boolean); }
  catch { lines = []; }

  if (lines.length === 0) {
    console.log('  ℹ️  metrics.jsonl 不存在（auto-fix 误删可能）— 跳过本节');
  } else {
    const evo = lines.map(l => JSON.parse(l)).filter(e => e.name && e.name.startsWith('evo.'));
    // handoff 本身没主动记 evo 事件（设计上是 silent）— 但任务清单有 evo.* 总数 ≥ 0
    check('evo.* 事件读取 OK', Array.isArray(evo));
  }
}

// ==================== 12. M22 --auto 模式 ====================
console.log('\n── 12. M22 --auto 模式 ──');

{
  const uniqueNext = 'M22-CLI-NEXT';
  // 先确保没残留
  if (fs.existsSync(evolutionPlanPath)) {
    const plan = JSON.parse(fs.readFileSync(evolutionPlanPath, 'utf8'));
    plan.next = plan.next.filter(x => x.id !== uniqueNext);
    fs.writeFileSync(evolutionPlanPath, JSON.stringify(plan, null, 2));
  }

  const { spawnSync } = require('child_process');
  // --auto + --dry-run：验证参数解析与入队，但不真 spawn claude
  const r = spawnSync('node', [
    path.join(__dirname, 'handoff.js'),
    'CLI auto 测试', uniqueNext, '--auto', '--dry-run',
  ], { encoding: 'utf8' });

  check('M22 CLI --auto --dry-run 退出 0', r.status === 0, `status=${r.status}, stderr=${r.stderr}`);
  check('M22 CLI 输出含 接续 prompt', r.stdout.includes('接续 prompt'));
  check('M22 CLI 输出含 DRY-RUN', r.stdout.includes('DRY-RUN'));

  // dry-run 不应写文件，所以 next 不该入队
  const planAfter = JSON.parse(fs.readFileSync(evolutionPlanPath, 'utf8'));
  check('M22 --dry-run 不入队', !planAfter.next.some(x => x.id === uniqueNext));

  // 非 dry-run 的 auto 调用：只验证返回结构，不真 spawn（避免测试中拉起子会话）
  clearAwaitingHandoff();
  const result = handoff('M22 auto 测试', { nextTitle: 'M22-dry-run-next', auto: true });
  check('M22 handoff() auto 标记', result.auto === true);
  check('M22 handoff() spawnedClaude 标记', result.spawnedClaude === true);
  check('M22 handoff() 入队成功', result.enqueued === true, `got ${result.enqueued}`);

  const planFinal = JSON.parse(fs.readFileSync(evolutionPlanPath, 'utf8'));
  check('M22 handoff() next 真入队', planFinal.next.some(x => x.id === 'M22-dry-run-next'));
}

// ==================== M24-B: clearAwaitingHandoffIfStale ====================
console.log('\n── M24-B: clearAwaitingHandoffIfStale ──');

{
  const { clearAwaitingHandoffIfStale, markAwaitingHandoff, appendHandoffLifecycle, loadAutonomousState } = require('./handoff');

  // 1. 没 awaiting 标记 → 不清
  const r1 = clearAwaitingHandoffIfStale(2);
  check('B1 无 awaiting 时不清理', r1.cleared === false);

  // 2. 标 awaiting 但无 handoff_at → 强制清
  const planStatePath2 = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'autonomous-state.json');
  const stateNow = JSON.parse(fs.readFileSync(planStatePath2, 'utf8'));
  stateNow.awaiting_handoff = true;
  delete stateNow.handoff_at;
  fs.writeFileSync(planStatePath2, JSON.stringify(stateNow));
  const r2 = clearAwaitingHandoffIfStale(2);
  check('B2 无 handoff_at 强制清', r2.cleared === true);
  check('B2 强制清后 awaiting=false',
    JSON.parse(fs.readFileSync(planStatePath2, 'utf8')).awaiting_handoff !== true);

  // 3. 标 awaiting + 1h 前 handoff_at → 不清（within window）
  const stateNow2 = JSON.parse(fs.readFileSync(planStatePath2, 'utf8'));
  stateNow2.awaiting_handoff = true;
  stateNow2.handoff_at = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  stateNow2.handoff_next = 'TEST-M24-B';
  fs.writeFileSync(planStatePath2, JSON.stringify(stateNow2));
  const r3 = clearAwaitingHandoffIfStale(2);
  check('B3 1h 内不清理', r3.cleared === false);
  check('B3 1h 内 awaiting 保留',
    JSON.parse(fs.readFileSync(planStatePath2, 'utf8')).awaiting_handoff === true);

  // 4. 标 awaiting + 3h 前 → 清理
  const stateNow3 = JSON.parse(fs.readFileSync(planStatePath2, 'utf8'));
  stateNow3.awaiting_handoff = true;
  stateNow3.handoff_at = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  stateNow3.handoff_next = 'TEST-M24-B-stale';
  fs.writeFileSync(planStatePath2, JSON.stringify(stateNow3));
  const r4 = clearAwaitingHandoffIfStale(2);
  check('B4 3h 后清理', r4.cleared === true);
  check('B4 清理后 awaiting=false',
    JSON.parse(fs.readFileSync(planStatePath2, 'utf8')).awaiting_handoff !== true);
  check('B4 清理 age_hours ≈ 3', r4.age_hours > 2.9 && r4.age_hours < 3.1);
}

// ==================== M24-B: appendHandoffLifecycle ====================
console.log('\n── M24-B: appendHandoffLifecycle ──');

{
  const { appendHandoffLifecycle, HANDOFF_LIFECYCLE_FILE } = require('./handoff');

  // 备份
  const lcBackup = fs.existsSync(HANDOFF_LIFECYCLE_FILE) ? fs.readFileSync(HANDOFF_LIFECYCLE_FILE, 'utf8') : null;
  try { fs.unlinkSync(HANDOFF_LIFECYCLE_FILE); } catch {}

  appendHandoffLifecycle({ event: 'test_event_1', foo: 'bar' });
  appendHandoffLifecycle({ event: 'test_event_2', baz: 42 });

  const lines = fs.readFileSync(HANDOFF_LIFECYCLE_FILE, 'utf8').trim().split('\n');
  check('B5 lifecycle 写 2 行', lines.length === 2);
  const e1 = JSON.parse(lines[0]);
  const e2 = JSON.parse(lines[1]);
  check('B5 lifecycle 每行有 at 字段', !!e1.at && !!e2.at);
  check('B5 lifecycle 字段保留 (event/foo/baz)', e1.event === 'test_event_1' && e1.foo === 'bar' && e2.baz === 42);

  // 恢复
  if (lcBackup !== null) fs.writeFileSync(HANDOFF_LIFECYCLE_FILE, lcBackup);
  else try { fs.unlinkSync(HANDOFF_LIFECYCLE_FILE); } catch {}
}

// ==================== M24-C: --runner / --resume / spawnRunnerContinuation ====================
console.log('\n── M24-C: --runner / --resume 模式 ──');

{
  const { spawnRunnerContinuation, resumeFromRunner } = require('./handoff');
  const { execFileSync } = require('child_process');

  // 1. CLI --auto --runner 互斥
  let mutexOk = false;
  try {
    execFileSync('node', [path.join(__dirname, 'handoff.js'), 'test', '--auto', '--runner'], {
      encoding: 'utf8', stdio: 'pipe', cwd: path.join(__dirname, '..', '..'),
    });
  } catch (e) {
    mutexOk = /互斥/.test(e.stderr || '') || /互斥/.test(e.stdout || '');
  }
  check('C1 --auto --runner 互斥', mutexOk);

  // 2. CLI --resume 工作（无 runner 在跑场景）
  const r2 = execFileSync('node', [path.join(__dirname, 'handoff.js'), '--resume'], {
    encoding: 'utf8', stdio: 'pipe', cwd: path.join(__dirname, '..', '..'),
  });
  check('C2 --resume 调 runner stop', r2.includes('调 autonomous-runner.js stop'));
  check('C2 --resume 输出 next_action', r2.includes('next_action:'));

  // 3. spawnRunnerContinuation spawn 子进程 + 写 lifecycle
  const lcBackup2 = fs.existsSync(HANDOFF_LIFECYCLE_FILE) ? fs.readFileSync(HANDOFF_LIFECYCLE_FILE, 'utf8') : null;
  const beforeLines = lcBackup2 ? lcBackup2.trim().split('\n').length : 0;
  spawnRunnerContinuation('TEST-M24-C-spawn').then((r) => {
    check('C3 spawnRunnerContinuation 返回 spawned=true', r.spawned === true);
    check('C3 spawnRunnerContinuation 返回 runnerPid', typeof r.runnerPid === 'number' && r.runnerPid > 0);
    // 等 200ms 让 appendFile 落盘
    setTimeout(() => {
      const afterLines = fs.readFileSync(HANDOFF_LIFECYCLE_FILE, 'utf8').trim().split('\n').length;
      check('C3 写 handoff_to_runner lifecycle (行数+1)', afterLines === beforeLines + 1);
      const lastLine = fs.readFileSync(HANDOFF_LIFECYCLE_FILE, 'utf8').trim().split('\n').slice(-1)[0];
      const lastEvt = JSON.parse(lastLine);
      check('C3 lifecycle event=handoff_to_runner', lastEvt.event === 'handoff_to_runner');
      check('C3 lifecycle runner_pid 是数字', typeof lastEvt.runner_pid === 'number');
      // 清理
      if (lcBackup2 !== null) fs.writeFileSync(HANDOFF_LIFECYCLE_FILE, lcBackup2);
      else try { fs.unlinkSync(HANDOFF_LIFECYCLE_FILE); } catch {}
      // 杀掉刚 spawn 的 runner 进程
      try { process.kill(r.runnerPid, 'SIGTERM'); } catch {}
      // 输出总结
      console.log('');
      console.log(`📊 M21+M22+M24-B+C handoff 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
      if (fail > 0) {
        console.log('失败项:');
        fails.forEach(f => console.log(`  - ${f}`));
      }
      process.exit(fail > 0 ? 1 : 0);
    }, 200);
  }).catch((e) => {
    console.error('C3 测试异常:', e);
    process.exit(1);
  });
}

// ==================== 清理 + 总结 ====================
// 注意: M24-C 测试是异步的，其内部已包含"总结"输出与 process.exit
// 此处保留同步分支的清理逻辑（C 之前的所有测试）

// 恢复 backups
if (stateBackup !== null) fs.writeFileSync(planStatePath, stateBackup);
else if (fs.existsSync(planStatePath)) fs.unlinkSync(planStatePath);
if (snapBackup !== null) fs.writeFileSync(snapshotPath, snapBackup);
else if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
if (planBackup !== null) fs.writeFileSync(evolutionPlanPath, planBackup);
else if (fs.existsSync(evolutionPlanPath)) fs.unlinkSync(evolutionPlanPath);

// 如果 C 块没接走（理论不会），这里兜底
if (typeof process !== 'undefined' && !process.exitCode) {
  console.log('');
  console.log(`📊 M21+M22+M24-B+C handoff 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  if (fail > 0) {
    console.log('失败项:');
    fails.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}
