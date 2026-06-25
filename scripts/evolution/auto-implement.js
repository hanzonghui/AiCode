#!/usr/bin/env node
/**
 * auto-implement.js — 进化闭环引擎（增量 F / M7）
 *
 * 核心目标：把 v1.8 手动进化升级为"自动闭环"
 *  流程: 扫描 → 评估 → 筛 small + composite≥阈值 → worktree → 调 Claude Agent 实现 → 测试 → 审查 → 合并
 *
 * 关键设计：
 *  - 复用 implementer.js 的 git/test/merge/rollback 工具（不重复造轮子）
 *  - 安全边界：4 道闸门（详见 evaluateSafety）
 *  - 失败处理：连续失败 3 次自动停 + 写 anomaly
 *  - 双源：candidates.json（GitHub）+ auto-tasks.json（自建）
 *  - 干跑模式：--dry-run，只输出计划不执行
 *
 * 用法:
 *   node auto-implement.js run --auto         # 自动模式（small effort 限定）
 *   node auto-implement.js run --auto --dry-run   # 只输出计划
 *   node auto-implement.js list               # 列出可自动实现的候选
 *   node auto-implement.js status             # 状态
 *   node auto-implement.js add-task <file>    # 添加自建任务
 *
 * @since v2.2.0 (2026-06-24) — 增量 F / M7
 * @source 04_自我演进路线.md §0.4 增量 F
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const { createBranch, mergeBranch, deleteBranch, hasUncommittedChanges, runTests, getCurrentBranch, gitExec } = require('./implementer');
const { judgeCandidateWithFallback } = require('../orchestrator/llm-adapter');

// ── 路径配置 ─────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data', 'github');
const EVOLUTION_DIR = path.join(WORKSPACE_ROOT, 'data', 'evolution');
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json');
const AUTO_TASKS_FILE = path.join(EVOLUTION_DIR, 'auto-tasks.json');
const ANOMALY_FILE = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory', 'anomalies.json');
const STATE_FILE = path.join(EVOLUTION_DIR, 'auto-implement-state.json');
const LOG_FILE = path.join(EVOLUTION_DIR, 'auto-implement-log.json');

const SAFETY = {
  MIN_COMPOSITE: 7.0,           // 综合分门槛
  ALLOWED_EFFORT: ['small'],    // 只允许 small effort
  MAX_CONSECUTIVE_FAILS: 3,     // 连续失败上限
  MAX_AUTO_PER_RUN: 3,          // 一次最多自动跑 N 个
  FORBIDDEN_PATH_PATTERNS: [    // 路径黑名单（任何匹配直接拒绝）
    /\.claude\//,
    /^scripts\/orchestrator\/dispatcher\.js$/,
    /^scripts\/orchestrator\/autonomous\.js$/,
    /^scripts\/orchestrator\/test-autonomous\.js$/,
    /^package\.json$/,
    /^CLAUDE\.md$/,
    /^04_自我演进路线\.md$/,
    /^CHANGELOG\.md$/,
  ],
  FORBIDDEN_DEPS: [             // 禁止引入的新依赖关键词
    '@anthropic-ai',
    'openai',
    '@xenova/transformers',
    'tensorflow',
    'pytorch',
  ],
};

// ── 工具函数 ──────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString(); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function readJSON(file, defaultVal = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return defaultVal; }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadState() { return readJSON(STATE_FILE, { consecutive_fails: 0, total_runs: 0, last_run: null, auto_done: [] }); }
function saveState(s) { writeJSON(STATE_FILE, s); }

function loadLog() { return readJSON(LOG_FILE, { entries: [] }); }
function logEntry(entry) {
  const log = loadLog();
  log.entries.push({ ...entry, timestamp: now() });
  // 保留最近 200 条
  log.entries = log.entries.slice(-200);
  writeJSON(LOG_FILE, log);
}

function writeAnomaly(type, detail) {
  const anomalies = readJSON(ANOMALY_FILE, { anomalies: [] });
  anomalies.anomalies = anomalies.anomalies || [];
  anomalies.anomalies.push({
    type,
    detail,
    source: 'auto-implement',
    detected_at: now(),
  });
  // 保留最近 50 条
  anomalies.anomalies = anomalies.anomalies.slice(-50);
  ensureDir(path.dirname(ANOMALY_FILE));
  writeJSON(ANOMALY_FILE, anomalies);
}

// ── 候选加载（双源） ──────────────────────────────────

function loadCandidates() {
  const cand = readJSON(CANDIDATES_FILE, { candidates: [] });
  const tasks = readJSON(AUTO_TASKS_FILE, { tasks: [] });
  const items = [];
  for (const c of (cand.candidates || [])) {
    items.push({ source: 'candidates', ...c });
  }
  for (const t of (tasks.tasks || [])) {
    items.push({ source: 'auto-task', ...t });
  }
  return items;
}

// ── 安全闸门 ──────────────────────────────────────────

/**
 * 硬阈值评估（同步，纯规则）。返回 { allowed, reason }
 * 这是 evaluateSafety 的"安全兜底"——任何 LLM-judge 失败或不可用时仍生效
 */
function evaluateSafetyHard(candidate) {
  // 闸门 1: composite_score
  const score = candidate.composite_score || candidate.score || 0;
  if (score < SAFETY.MIN_COMPOSITE) {
    return { allowed: false, reason: `composite_score ${score} < ${SAFETY.MIN_COMPOSITE}` };
  }

  // 闸门 2: estimated_effort
  const effort = (candidate.estimated_effort || candidate.effort || 'medium').toLowerCase();
  if (!SAFETY.ALLOWED_EFFORT.includes(effort)) {
    return { allowed: false, reason: `effort "${effort}" not in [${SAFETY.ALLOWED_EFFORT.join(',')}]` };
  }

  // 闸门 3: suggestion 必须是 adopt 或 adapt
  const sug = candidate.suggestion || 'adopt';
  if (!['adopt', 'adapt'].includes(sug)) {
    return { allowed: false, reason: `suggestion "${sug}" must be adopt/adapt` };
  }

  // 闸门 4: 候选描述里不能含禁止依赖
  const desc = `${candidate.name || ''} ${candidate.description || ''} ${candidate.summary || ''}`.toLowerCase();
  for (const dep of SAFETY.FORBIDDEN_DEPS) {
    if (desc.includes(dep.toLowerCase())) {
      return { allowed: false, reason: `forbidden dep "${dep}" mentioned` };
    }
  }

  return { allowed: true, reason: 'all gates passed' };
}

/**
 * 安全评估（async，M12 LLM-judge 闸门）
 * 双轨制：
 *   1. 先调 judgeCandidateWithFallback —— LLM 接受 → 走硬阈值最终把关；LLM 拒绝 → 直接拒
 *   2. LLM 不可用 / 抛错 → 降级到硬阈值（与 M7 行为完全一致，向后兼容）
 * 返回 { allowed, reason, source: 'llm'|'hard' }
 */
async function evaluateSafety(candidate) {
  const judge = await judgeCandidateWithFallback(candidate, {
    minComposite: SAFETY.MIN_COMPOSITE,
    allowedEffort: SAFETY.ALLOWED_EFFORT,
    forbiddenDeps: SAFETY.FORBIDDEN_DEPS,
  });

  // LLM 拒绝（一票否决）→ 不再走硬阈值
  if (judge.verdict === 'reject') {
    return {
      allowed: false,
      reason: `LLM-judge reject: ${judge.reasons.join('; ')}`,
      source: 'llm',
    };
  }

  // LLM 跳过（需人工确认）→ 走硬阈值（保守：宁可放过不可漏过）
  if (judge.verdict === 'skip') {
    // 跳过直接由硬阈值决定（如果硬阈值也拒，那就拒）
  }

  // LLM 接受 / 跳过 / 任何情况都过 → 走硬阈值最终把关
  const hard = evaluateSafetyHard(candidate);
  return { ...hard, source: 'hard' };
}

/**
 * 路径安全：候选声明的输出文件不能触碰黑名单
 */
function checkPathSafety(files = []) {
  const violations = [];
  for (const f of files) {
    for (const pat of SAFETY.FORBIDDEN_PATH_PATTERNS) {
      if (pat.test(f)) {
        violations.push({ file: f, pattern: pat.source });
        break;
      }
    }
  }
  return { safe: violations.length === 0, violations };
}

// ── 列出可自动实现的候选 ──────────────────────────────

async function listExecutable() {
  const items = loadCandidates();
  const executable = [];
  for (const item of items) {
    const safety = await evaluateSafety(item);
    if (safety.allowed) {
      executable.push({ ...item, _safety: safety.reason });
    }
  }
  // 排序: composite_score 降序
  executable.sort((a, b) => (b.composite_score || b.score || 0) - (a.composite_score || a.score || 0));
  return executable;
}

// ── Claude Agent 调用 ─────────────────────────────────

/**
 * 调 claude -p 子会话实现
 * 返回 { success, output, error }
 */
function callClaudeAgent(prompt, opts = {}) {
  const timeout = opts.timeout || 600000; // 10 分钟
  console.log(`  🤖 调 claude -p 实现（timeout ${timeout / 1000}s）...`);

  // claude 不在 PATH 时尝试 .cmd 扩展
  const candidates = ['claude', 'claude.cmd', 'npx.cmd', 'npx'];
  let lastError = null;
  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['-p', '--dangerously-skip-permissions', prompt], {
        encoding: 'utf8',
        timeout,
        cwd: WORKSPACE_ROOT,
        shell: true,  // Windows 必需
      });
      if (res.status === 0) {
        return { success: true, output: res.stdout || '' };
      }
      lastError = `exit ${res.status}: ${(res.stderr || res.stdout || '').slice(0, 200)}`;
    } catch (e) {
      lastError = e.message;
    }
  }
  return { success: false, error: `claude agent failed: ${lastError}` };
}

// ── 主流程：实现一个候选 ──────────────────────────────

async function implementOne(candidate, opts = {}) {
  const dryRun = opts.dryRun || false;
  const featureName = (candidate.name || candidate.feature || 'unknown').split('/').pop().replace(/[^a-zA-Z0-9-]/g, '-');
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 auto-implement: ${candidate.name || candidate.feature}`);
  console.log(`  source: ${candidate.source}`);
  console.log(`  composite_score: ${candidate.composite_score || candidate.score}`);
  console.log(`  effort: ${candidate.estimated_effort || candidate.effort}`);
  console.log(`  reason: ${candidate._safety || '(judging...)'}`);
  console.log(`${'='.repeat(60)}`);

  const safety = await evaluateSafety(candidate);
  if (!safety.allowed) {
    console.log(`  ⛔ 安全闸门拒绝: ${safety.reason} (source: ${safety.source})`);
    logEntry({ action: 'skip', candidate: candidate.name || candidate.feature, reason: safety.reason });
    return { success: false, reason: 'safety_rejected', detail: safety.reason };
  }

  // 干跑模式：只输出计划
  if (dryRun) {
    console.log('  🔍 DRY-RUN: 不实际执行');
    console.log(`  📋 计划:`);
    console.log(`    1. 创建分支 evolution/${featureName}-${today()}`);
    console.log(`    2. 调 claude -p 实现`);
    console.log(`    3. 跑 npm test`);
    console.log(`    4. 合并到当前分支`);
    return { success: true, dryRun: true };
  }

  // 检查工作区干净
  if (hasUncommittedChanges()) {
    console.log('  ⚠ 工作区有未提交改动，先 stash');
    try { gitExec('git stash'); } catch {}
  }

  // 1. 创建分支
  let branchName;
  try {
    branchName = createBranch(featureName);
    console.log(`  🌿 分支: ${branchName}`);
  } catch (e) {
    console.error(`  ❌ 创建分支失败: ${e.message}`);
    return { success: false, reason: 'branch_failed', detail: e.message };
  }

  try {
    // 2. 构造 prompt
    const prompt = buildPrompt(candidate);
    console.log(`  📝 Prompt 长度: ${prompt.length} 字符`);

    // 3. 调 Claude Agent
    const agentResult = callClaudeAgent(prompt);
    if (!agentResult.success) {
      throw new Error(`claude agent failed: ${agentResult.error}`);
    }
    console.log(`  ✅ Claude Agent 完成`);

    // 4. 路径安全检查
    const changedFiles = getChangedFiles();
    console.log(`  📁 改动文件: ${changedFiles.length} 个`);
    const pathCheck = checkPathSafety(changedFiles);
    if (!pathCheck.safe) {
      throw new Error(`path safety violation: ${JSON.stringify(pathCheck.violations)}`);
    }

    // 5. 跑测试
    const testOk = runTests();
    if (!testOk) {
      throw new Error('npm test failed');
    }

    // 6. 合并
    const merged = mergeBranch(branchName);
    if (!merged) {
      throw new Error('merge failed');
    }

    // 7. 记录
    const state = loadState();
    state.consecutive_fails = 0;
    state.total_runs += 1;
    state.last_run = now();
    state.auto_done = state.auto_done || [];
    state.auto_done.push({ feature: featureName, source: candidate.name || candidate.feature, branch: branchName, at: now() });
    // 保留最近 50 条
    state.auto_done = state.auto_done.slice(-50);
    saveState(state);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logEntry({ action: 'success', candidate: candidate.name || candidate.feature, branch: branchName, elapsed });
    console.log(`  ✅ 全部完成（${elapsed}s）`);
    return { success: true, branch: branchName, elapsed };

  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);

    // 回滚
    try {
      gitExec('git checkout ' + (getCurrentBranch() === branchName ? 'HEAD~0' : 'master'));
      // 简化：直接 checkout master
      try { gitExec('git checkout master 2>/dev/null || git checkout main 2>/dev/null'); } catch {}
      deleteBranch(branchName);
    } catch (e) {
      console.error(`  ⚠ 回滚失败: ${e.message}`);
    }

    const state = loadState();
    state.consecutive_fails = (state.consecutive_fails || 0) + 1;
    state.total_runs = (state.total_runs || 0) + 1;
    state.last_run = now();
    saveState(state);

    logEntry({ action: 'fail', candidate: candidate.name || candidate.feature, error: err.message });

    if (state.consecutive_fails >= SAFETY.MAX_CONSECUTIVE_FAILS) {
      writeAnomaly('auto-implement:too-many-fails', `连续失败 ${state.consecutive_fails} 次，自动停止`);
      console.error(`  🛑 连续失败 ${state.consecutive_fails} 次，停止自动模式`);
    }

    return { success: false, reason: 'implementation_failed', detail: err.message };
  }
}

// ── Prompt 构造 ──────────────────────────────────────

function buildPrompt(candidate) {
  return `# auto-implement 任务

## 目标
为 AiCode 工作空间实现一个 GitHub 候选特性。

## 候选信息
- 名称: ${candidate.name || candidate.feature || 'unknown'}
- 描述: ${candidate.description || candidate.summary || '无'}
- 综合分: ${candidate.composite_score || candidate.score}/10
- 建议: ${candidate.suggestion || 'adopt'}
- 估计投入: ${candidate.estimated_effort || candidate.effort || 'small'}

## 实现要求
1. 零依赖优先（不引新 npm 包）
2. 复用现有基础设施（左脑、调度器、MCP、hooks）
3. 代码放 scripts/ 下合适子目录
4. 必须写测试 test-*.js（与现有风格一致）
5. 必须更新 CHANGELOG.md
6. commit 用 feat(): 风格

## 安全约束（绝对红线）
- ⛔ 不修改 .claude/ 下任何文件
- ⛔ 不修改 CLAUDE.md / 04 / CHANGELOG 之外的根级 md
- ⛔ 不修改 package.json（除非为了加 test 脚本）
- ⛔ 不修改 dispatcher.js / autonomous.js 核心
- ⛔ 不删除任何文件

## 完成后
- npm test 全过
- git add + commit
- 不要 push

## 项目导航
- CLAUDE.md（启动必读）
- 04_自我演进路线.md（智能演进纲领）
- scripts/orchestrator/（已有模块参考）
- scripts/orchestrator/recall/（M6 范例）

请开始实现。
`;
}

// ── 工具：获取当前分支改动的文件 ──────────────────────

function getChangedFiles() {
  try {
    const out = gitExec('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only');
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ── CLI ──────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  if (cmd === 'list') {
    const list = await listExecutable();
    console.log(`\n📋 可自动实现的候选: ${list.length} 个\n`);
    for (const [i, c] of list.entries()) {
      console.log(`  ${i + 1}. [${c.source}] ${c.name || c.feature} (composite: ${c.composite_score || c.score}, effort: ${c.estimated_effort || c.effort})`);
      console.log(`     reason: ${c._safety}`);
    }
    if (list.length === 0) {
      console.log('  (无。需要先跑 feature-analyzer.js 生成 candidates.json，或建 auto-tasks.json)');
    }
    return;
  }

  if (cmd === 'status') {
    const s = loadState();
    console.log('\n🤖 auto-implement 状态');
    console.log('─'.repeat(40));
    console.log(`  累计运行: ${s.total_runs || 0}`);
    console.log(`  连续失败: ${s.consecutive_fails || 0}`);
    console.log(`  上次运行: ${s.last_run || 'never'}`);
    console.log(`  已自动完成: ${(s.auto_done || []).length}`);
    if ((s.auto_done || []).length > 0) {
      console.log('  最近 5 条:');
      for (const d of s.auto_done.slice(-5).reverse()) {
        console.log(`    - ${d.feature} (${d.at})`);
      }
    }
    return;
  }

  if (cmd === 'run') {
    const auto = args.includes('--auto');
    const dryRun = args.includes('--dry-run');
    const max = parseInt((args.find(a => a.startsWith('--max=')) || '--max=' + SAFETY.MAX_AUTO_PER_RUN).split('=')[1], 10);

    const state = loadState();
    if (state.consecutive_fails >= SAFETY.MAX_CONSECUTIVE_FAILS) {
      console.error(`🛑 连续失败 ${state.consecutive_fails} 次，需手动重置:`);
      console.error(`   编辑 ${STATE_FILE} 把 consecutive_fails 改 0，或运行 auto-implement.js reset`);
      process.exit(1);
    }

    const list = await listExecutable();
    if (list.length === 0) {
      console.log('⚠ 没有可自动实现的候选');
      return;
    }

    const toRun = auto ? list.slice(0, max) : list.slice(0, 1);
    console.log(`🚀 计划运行 ${toRun.length} 个 (auto=${auto}, dryRun=${dryRun}, max=${max})`);

    let successCount = 0, failCount = 0;
    for (const candidate of toRun) {
      const r = await implementOne(candidate, { dryRun });
      if (r.success) successCount++; else failCount++;
    }

    console.log(`\n📊 结果: ${successCount} 成功 / ${failCount} 失败`);
    return;
  }

  if (cmd === 'reset') {
    const s = loadState();
    s.consecutive_fails = 0;
    saveState(s);
    console.log('✅ consecutive_fails 已重置为 0');
    return;
  }

  if (cmd === 'add-task') {
    const file = args[1];
    if (!file) {
      console.error('用法: node auto-implement.js add-task <json-file>');
      process.exit(1);
    }
    const task = readJSON(file);
    const tasks = readJSON(AUTO_TASKS_FILE, { tasks: [] });
    tasks.tasks = tasks.tasks || [];
    tasks.tasks.push({ ...task, added_at: now() });
    writeJSON(AUTO_TASKS_FILE, tasks);
    console.log(`✅ 已添加自建任务: ${task.feature || task.name}`);
    return;
  }

  console.log(`
auto-implement.js — 进化闭环引擎 (增量 F / M7)

用法:
  node auto-implement.js list               列出可自动实现的候选
  node auto-implement.js run --auto         自动模式（small effort 限定）
  node auto-implement.js run --auto --dry-run   干跑，只输出计划
  node auto-implement.js run --auto --max=5     一次最多跑 5 个
  node auto-implement.js status             查看状态
  node auto-implement.js reset              重置连续失败计数
  node auto-implement.js add-task <file>    添加自建任务（JSON）

安全边界:
  - composite_score >= ${SAFETY.MIN_COMPOSITE}
  - effort 必须在 [${SAFETY.ALLOWED_EFFORT.join(',')}]
  - suggestion 必须是 adopt/adapt
  - 不修改 .claude/、CLAUDE.md、04、CHANGELOG、package.json（test 脚本例外）、dispatcher.js、autonomous.js
  - 连续失败 ${SAFETY.MAX_CONSECUTIVE_FAILS} 次自动停
`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}

module.exports = {
  evaluateSafety,
  checkPathSafety,
  listExecutable,
  implementOne,
  SAFETY,
  loadCandidates,
};