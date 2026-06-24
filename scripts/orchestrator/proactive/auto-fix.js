#!/usr/bin/env node
/**
 * auto-fix.js — 自动化修复引擎（v1.9.2 智能增量 D）
 *
 * 触发位置：
 *   - 保守模式：SessionStart hook（evolution-hook.sh 追加 --auto）
 *   - 完整模式：/autofix 命令（用户手动）
 *
 * 作用：让 Claude 不只发现问题（C 增量），还自动修可逆项 + 提议复杂项。
 *
 * 4 个可修维度：
 *   1. uncommitted         — 自动 git add + commit（可 revert）
 *   2. test-coverage       — 生成"待测文件清单"（不写测试）
 *   3. deps-outdated       — 输出 npm update 建议（不改 package.json）
 *   4. candidate-pending   — 调 implementer 链路生成 IMPLEMENT-PROMPT.md
 *
 * 不可修（只发现）：
 *   - ci-status（状态型）
 *   - todo-accumulate（范围模糊）
 *   - stale-files（需归档决策）
 *
 * 设计原则：
 *   - 保守模式只动 uncommitted，其他生成 proposal
 *   - 完整模式跑全部 4 项
 *   - 任意 fix 失败不阻塞其他
 *   - 永不 throw
 *   - 所有动作可 revert（commit / 不改 lockfile / 不动代码）
 *
 * @since v1.9.2 (2026-06-24)
 * @source 04_自我进化循环系统设计.md §0.4 增量 D
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { advise } = require('./llm-fix-advisor');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const ANOMALY_FILE = path.join(MEMORY_DIR, 'anomalies.json');
const PROPOSAL_FILE = path.join(MEMORY_DIR, 'fix-proposals.json');

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function execSafe(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function loadAnomalies() {
  if (!fs.existsSync(ANOMALY_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ANOMALY_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function loadProposals() {
  if (!fs.existsSync(PROPOSAL_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveProposals(proposals) {
  ensureDir(MEMORY_DIR);
  fs.writeFileSync(PROPOSAL_FILE, JSON.stringify(proposals, null, 2));
}

function addProposal(dimension, action, reason, dryRun) {
  if (dryRun) return;
  const proposals = loadProposals();
  proposals.push({
    id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    dimension,
    action,
    reason,
    status: 'pending',  // pending → approved | rejected
  });
  saveProposals(proposals);
}

// ── Fix 1: uncommitted → 自动 commit ────────────────

function fixUncommitted(dryRun = false) {
  const porcelain = execSafe('git status --porcelain');
  if (!porcelain) return { skipped: true, reason: 'no uncommitted changes' };

  const lines = porcelain.split('\n').filter(Boolean);
  if (lines.length === 0) return { skipped: true, reason: 'no uncommitted changes' };

  // 安全过滤 1：可疑文件（.env / key / node_modules）
  const suspicious = lines.filter(line => {
    const file = line.slice(3).trim();
    return /\.(env|key|pem|p12)$/i.test(file) ||
           /secrets?\//i.test(file) ||
           /^..\s+node_modules\//.test(line);
  });

  if (suspicious.length > 0) {
    return {
      skipped: true,
      reason: `检测到 ${suspicious.length} 个可疑文件（.env/key/pem/node_modules），跳过自动 commit`,
      suspicious,
    };
  }

  // 安全过滤 2：AI 工作目录（scripts/orchestrator/、.claude/、scripts/evolution/）
  // 这些通常是 AI 自己刚生成的代码，不该 auto-fix 偷偷 commit
  const aiWorkdirs = lines.filter(line => {
    const file = line.slice(3).trim();
    return /^scripts\/orchestrator\//.test(file) ||
           /^\.claude\//.test(file) ||
           /^scripts\/evolution\//.test(file) ||
           /^scripts\/mcp\//.test(file);
  });

  if (aiWorkdirs.length > 0) {
    return {
      skipped: true,
      reason: `检测到 ${aiWorkdirs.length} 个 AI 工作目录文件（scripts/orchestrator 等），跳过自动 commit（避免混进未经 review 的 AI 代码）`,
      aiWorkdirs: aiWorkdirs.slice(0, 5).map(l => l.slice(3).trim()),
    };
  }

  // 安全过滤 3：超过 50 个文件不自动 commit（防止大批量意外）
  if (lines.length > 50) {
    return {
      skipped: true,
      reason: `${lines.length} 个改动超过 50 阈值，跳过自动 commit（请手动 review）`,
    };
  }

  const fileCount = lines.length;

  if (dryRun) {
    return { dryRun: true, wouldCommit: fileCount };
  }

  // git add -A + commit
  try {
    execSafe('git add -A');
    const message = `auto-fix: ${fileCount} uncommitted files (v1.9.2 增量 D)`;
    execSafe(`git commit -m "${message}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { committed: fileCount, message };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Fix 2: test-coverage → 生成待测清单 + 可选 LLM 建议 ─

async function fixTestCoverage(dryRun = false, useLLM = false) {
  const anomalies = loadAnomalies();
  if (!anomalies) return { skipped: true, reason: 'no anomaly data' };

  const covFinding = (anomalies.findings || []).find(f => f.dimension === 'test-coverage');
  if (!covFinding) return { skipped: true, reason: 'no coverage issue' };

  // 扫哪些 .js 没有对应 test-*.js
  const allFiles = execSafe('git ls-files "*.js" 2>/dev/null');
  if (!allFiles) return { skipped: true, reason: 'no js files' };

  const jsFiles = allFiles.split('\n').filter(f =>
    f && !f.includes('node_modules') && !f.includes('archives/') && !f.includes('.skill/')
  );

  const missingTests = [];
  for (const f of jsFiles) {
    const basename = path.basename(f);
    if (basename.startsWith('test-') || basename.endsWith('.test.js')) continue;
    if (basename === 'index.js' || basename.includes('config')) continue;
    // 检查同目录有没有 test-<basename>.js
    const dir = path.dirname(f);
    const testName = `test-${basename}`;
    const testPath = path.join(dir, testName);
    const altPath = path.join(dir, '__tests__', basename);
    if (!fs.existsSync(path.join(WORKSPACE_ROOT, testPath)) &&
        !fs.existsSync(path.join(WORKSPACE_ROOT, altPath))) {
      missingTests.push(f);
    }
  }

  if (missingTests.length === 0) {
    return { skipped: true, reason: 'all files have tests' };
  }

  let llmAdvice = null;
  if (useLLM) {
    llmAdvice = await advise('test-coverage', { missingTests }, { maxTokens: 500 });
  }

  addProposal(
    'test-coverage',
    `为 ${missingTests.length} 个文件补测试`,
    `覆盖率低于 80%，缺测试文件: ${missingTests.slice(0, 5).join(', ')}${missingTests.length > 5 ? '...' : ''}`
      + (llmAdvice?.ok ? `\n\n💡 LLM 建议（${llmAdvice.backend}）：\n${llmAdvice.advice}` : ''),
    dryRun
  );

  return { proposed: missingTests.length, sample: missingTests.slice(0, 5), llmAdvice };
}

// ── Fix 3: deps-outdated → npm update 建议 + 可选 LLM 风险评估 ─

async function fixDepsOutdated(dryRun = false, useLLM = false) {
  const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) return { skipped: true, reason: 'no package.json' };

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const loosePinned = Object.entries(deps).filter(([, ver]) =>
    typeof ver === 'string' && /[\^~*>=]/.test(ver)
  );

  if (loosePinned.length === 0) return { skipped: true, reason: 'all deps pinned' };

  let llmAdvice = null;
  if (useLLM) {
    llmAdvice = await advise('deps-outdated', { loosePinned }, { maxTokens: 500 });
  }

  addProposal(
    'deps-outdated',
    `跑 npm outdated 检查实际过期情况`,
    `${loosePinned.length} 个浮动版本依赖，建议检查：\n  ${loosePinned.slice(0, 5).map(([n, v]) => `${n}@${v}`).join('\n  ')}${loosePinned.length > 5 ? '\n  ...' : ''}`
      + (llmAdvice?.ok ? `\n\n💡 LLM 建议（${llmAdvice.backend}）：\n${llmAdvice.advice}` : ''),
    dryRun
  );

  return { proposed: loosePinned.length, sample: loosePinned.slice(0, 5).map(([n]) => n), llmAdvice };
}

// ── Fix 4: candidate-pending → 调 implementer + 可选 LLM 实现计划 ─

async function fixCandidatePending(dryRun = false, useLLM = false) {
  const candPath = path.join(WORKSPACE_ROOT, 'data', 'github', 'candidates.json');
  if (!fs.existsSync(candPath)) return { skipped: true, reason: 'no candidates' };

  let candidates;
  try {
    const data = JSON.parse(fs.readFileSync(candPath, 'utf8'));
    candidates = (data.candidates || []).filter(c =>
      c.status === 'adopted' || c.status === 'approved'
    );
  } catch {
    return { skipped: true, reason: 'candidates parse error' };
  }

  if (candidates.length === 0) return { skipped: true, reason: 'no pending candidates' };

  if (dryRun) {
    return { dryRun: true, wouldImplement: candidates.length };
  }

  // 一次最多 implement 一个（避免阻塞）
  const target = candidates[0];

  let llmAdvice = null;
  if (useLLM) {
    llmAdvice = await advise('candidate-pending', { candidate: target }, { maxTokens: 500 });
  }

  // 调 implementer 链路
  let implementer;
  try {
    implementer = require('../evolution/implementer');
  } catch {
    addProposal(
      'candidate-pending',
      `手动跑 implementer 消化 ${candidates.length} 个候选`,
      `implementer.js 加载失败，需手动执行：node scripts/evolution/daily-evolution.js implement`
        + (llmAdvice?.ok ? `\n\n💡 LLM 建议（${llmAdvice.backend}）：\n${llmAdvice.advice}` : ''),
      dryRun
    );
    return { error: 'implementer not loadable', proposed: candidates.length, llmAdvice };
  }

  // 注：implementCandidate 是 async，可能需要交互
  // 这里只生成 proposal 让用户手动 /ok 后再调
  addProposal(
    'candidate-pending',
    `实现候选: ${target.name || target.id}`,
    `候选描述: ${target.description || target.summary || '（无描述）'}\n  仓库: ${target.repo || target.url || '未知'}\n  手动跑: node scripts/evolution/daily-evolution.js implement`
      + (llmAdvice?.ok ? `\n\n💡 LLM 建议（${llmAdvice.backend}）：\n${llmAdvice.advice}` : ''),
    dryRun
  );
  return { proposed: 1, target: target.name || target.id, llmAdvice };
}

// ── 主入口 ─────────────────────────────────────────

/**
 * 保守模式：只动 uncommitted
 */
function autoFixConservative(opts = {}) {
  const dryRun = opts.dryRun || false;
  const results = {};

  try {
    results.uncommitted = fixUncommitted(dryRun);
  } catch (e) {
    results.uncommitted = { error: e.message };
  }

  return {
    mode: 'conservative',
    dryRun,
    timestamp: new Date().toISOString(),
    results,
    proposalsAdded: loadProposals().length,
  };
}

/**
 * 完整模式：4 项全跑，可选 LLM 辅助建议
 */
async function autoFixFull(opts = {}) {
  const dryRun = opts.dryRun || false;
  const useLLM = opts.useLLM || false;
  const beforeCount = loadProposals().length;
  const results = {};

  try { results.uncommitted = fixUncommitted(dryRun); } catch (e) { results.uncommitted = { error: e.message }; }
  try { results['test-coverage'] = await fixTestCoverage(dryRun, useLLM); } catch (e) { results['test-coverage'] = { error: e.message }; }
  try { results['deps-outdated'] = await fixDepsOutdated(dryRun, useLLM); } catch (e) { results['deps-outdated'] = { error: e.message }; }
  try { results['candidate-pending'] = await fixCandidatePending(dryRun, useLLM); } catch (e) { results['candidate-pending'] = { error: e.message }; }

  const afterCount = loadProposals().length;

  return {
    mode: 'full',
    dryRun,
    useLLM,
    timestamp: new Date().toISOString(),
    results,
    proposalsAdded: afterCount - beforeCount,
  };
}

/**
 * 格式化报告（顶部展示用）
 */
function formatReport(report) {
  const lines = [];
  const { mode, dryRun, useLLM, results } = report;

  lines.push(`🔧 Auto-fix [${mode}${dryRun ? ' | dry-run' : ''}${useLLM ? ' | LLM' : ''}]:`);

  for (const [dim, r] of Object.entries(results)) {
    if (r.committed) {
      lines.push(`  ✅ [${dim}] committed ${r.committed} files: ${r.message || ''}`);
    } else if (r.proposed !== undefined) {
      const sample = r.sample ? ` (${r.sample.slice(0, 3).join(', ')})` : '';
      lines.push(`  📝 [${dim}] proposed: ${r.proposed} items${sample}`);
    } else if (r.dryRun) {
      lines.push(`  🔍 [${dim}] dry-run: ${JSON.stringify(r)}`);
    } else if (r.skipped) {
      lines.push(`  ⏭️  [${dim}] skipped: ${r.reason}`);
    } else if (r.error) {
      lines.push(`  ❌ [${dim}] error: ${r.error}`);
    } else {
      lines.push(`  ❓ [${dim}] ${JSON.stringify(r)}`);
    }

    if (r.llmAdvice?.ok) {
      const adviceLines = r.llmAdvice.advice.split('\n').slice(0, 4);
      for (const al of adviceLines) {
        lines.push(`      🤖 ${al}`);
      }
    }
  }

  if (report.proposalsAdded > 0) {
    lines.push(`  💡 ${report.proposalsAdded} proposals → fix-proposals.json（用户 /ok 后执行）`);
  }

  return lines.join('\n');
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  (async () => {
  const args = process.argv.slice(2);
  const auto = args.includes('--auto');
  const dryRun = args.includes('--dry-run');
  const useLLM = args.includes('--llm');
  const listProposals = args.includes('--list');

  try {
    if (listProposals) {
      const proposals = loadProposals();
      const pending = proposals.filter(p => p.status === 'pending');
      if (pending.length === 0) {
        console.log('📋 无 pending fix proposals');
      } else {
        console.log(`📋 ${pending.length} 个 pending fix proposals：`);
        for (const p of pending) {
          console.log(`  - [${p.dimension}] ${p.action}`);
          console.log(`    💡 ${p.reason.split('\n')[0]}`);
        }
      }
    } else {
      const report = auto
        ? autoFixConservative({ dryRun })
        : await autoFixFull({ dryRun, useLLM });
      console.log(formatReport(report));
    }
  } catch (e) {
    // 永不 throw
  }
  process.exit(0);
  })();
}

module.exports = {
  autoFixConservative,
  autoFixFull,
  formatReport,
  fixUncommitted,
  fixTestCoverage,
  fixDepsOutdated,
  fixCandidatePending,
  PROPOSAL_FILE,
};