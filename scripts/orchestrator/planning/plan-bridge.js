#!/usr/bin/env node
/**
 * plan-bridge.js — Plan 桥接执行引擎（v1.9.3 增量 B 方案 A）
 *
 * 触发位置：
 *   - 用户 /plan-execute 或 npm run plan:execute
 *   - /ok 批准 plan 后手动执行
 *
 * 作用：approved plan → 按 plan.steps 逐个调 claude -p 子会话执行
 *
 * 核心流程：
 *   1. 读 pending-plans.json 找 status=approved 的 plan
 *   2. 标记 plan.status: approved → executing
 *   3. 遍历 plan.steps：
 *      - 为每个 step 构造 dispatch prompt（含 agent/task/files）
 *      - 调 `claude -p --model <model> "{prompt}"` 启子会话
 *      - 写 plan-execution-log.json（每步 status/output）
 *   4. 单 step 失败 → 记 error + 继续下个
 *   5. 全部完成 → plan.status: executing → done
 *
 * 设计原则：
 *   - 默认调 `claude -p`（脱离主会话，异步）
 *   - 单 step 失败不阻塞其他（不破坏整体计划）
 *   - 永不 throw（任何异常都 catch 并记录）
 *   - 日志落盘 plan-execution-log.json（gitignore）
 *   - 与 plan-detect 共享 PENDING_PLANS_FILE（同一数据源）
 *
 * @since v1.9.3 (2026-06-24)
 * @source 04_自我进化循环系统设计.md §0.4 增量 B 方案 A
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  PENDING_PLANS_FILE,
  applyFallback,
} = require('./plan-detect');

// 内部加载 pending plans（不依赖 plan-detect 导出）
function loadPlans() {
  if (!fs.existsSync(PENDING_PLANS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PENDING_PLANS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory');
const EXECUTION_LOG_FILE = path.join(MEMORY_DIR, 'plan-execution-log.json');

// 默认模型（与 Claude Code 一致）
const DEFAULT_MODEL = 'claude-opus-4-8';

// 默认超时（5 分钟）
const STEP_TIMEOUT = 5 * 60 * 1000;

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadExecutionLog() {
  if (!fs.existsSync(EXECUTION_LOG_FILE)) return { executions: [] };
  try {
    return JSON.parse(fs.readFileSync(EXECUTION_LOG_FILE, 'utf8'));
  } catch {
    return { executions: [] };
  }
}

function saveExecutionLog(log) {
  ensureDir(MEMORY_DIR);
  fs.writeFileSync(EXECUTION_LOG_FILE, JSON.stringify(log, null, 2));
}

function appendExecution(entry) {
  const log = loadExecutionLog();
  log.executions.push(entry);
  saveExecutionLog(log);
}

// ── Stale Executing 自动恢复 (M54 batch 2 D) ─────────

// 默认 30 分钟（与 dispatcher stuck-detector 阈值对齐）
const DEFAULT_STALE_MS = 30 * 60 * 1000;
// OS-level lock 文件（防 executeLatest 并发跑覆盖 executing_at）
const LOCK_FILE = path.join(MEMORY_DIR, 'plan-bridge.lock');

/**
 * 扫 pending-plans.json 中 status=executing + 超 stalenessMs 阈值的卡死 plan
 * 自动回退: executing → approved + 记录 executing_warn 日志
 * @param {number} stalenessMs
 * @returns {{ rescued: string[], scanned: number }}
 */
function rescueStaleExecutings(stalenessMs = DEFAULT_STALE_MS) {
  let plans;
  try {
    plans = loadPlans();
  } catch (e) {
    return { rescued: [], scanned: 0 };
  }

  const now = Date.now();
  const rescued = [];
  let dirty = false;

  for (const p of plans) {
    if (p.status !== 'executing') continue;
    // 优先用 executing_at，没有就 fallback executing_lock_at，再没有就跳过（无法判断时间）
    const lockedAt = p.executing_at || p.executing_lock_at;
    if (!lockedAt) continue;
    const elapsed = now - new Date(lockedAt).getTime();
    if (elapsed > stalenessMs) {
      const planId = p.id;
      const elapsedMin = Math.round(elapsed / 60000);
      // 回退到 approved + 标记 stale 警告
      p.status = 'approved';
      p.stale_warning = `executing 持续 ${elapsedMin} 分钟（>${Math.round(stalenessMs / 60000)} 分钟阈值），自动回退 approved`;
      p.stale_recovered_at = new Date().toISOString();
      delete p.executing_at;
      delete p.executing_lock_at;
      rescued.push(planId);
      dirty = true;

      // 写 warn 到 execution log
      appendExecution({
        planId,
        stepIndex: -1,
        stepText: `[STALE-RESCUE] ${p.stale_warning}`,
        agent: 'system',
        files: [],
        status: 'stale_recovered',
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (dirty) savePlans(plans);
  return { rescued, scanned: plans.filter(p => p.status === 'executing').length + rescued.length };
}

/**
 * OS-level lock 文件（防 executeLatest 并发跑）
 * @returns {boolean} true = 锁成功；false = 已有别的进程在跑
 */
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const age = Date.now() - new Date(lockData.acquired_at).getTime();
      // 锁超过 35 分钟强制接管（比 stale 阈值长 5 分钟）
      if (age > 35 * 60 * 1000) {
        // 强制接管
      } else {
        return false; // 别人持有
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      acquired_at: new Date().toISOString(),
      pid: process.pid,
    }));
    return true;
  } catch (e) {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch { /* 释放失败不影响主流程 */ }
}

/**
 * 把正在 executing 的 plan 重新标 executing_at（更新心跳）
 */
function touchExecutingLock(planId) {
  try {
    const plans = loadPlans();
    const p = plans.find(x => x.id === planId);
    if (p && p.status === 'executing') {
      p.executing_at = new Date().toISOString();
      savePlans(plans);
    }
  } catch { /* 心跳失败不影响主流程 */ }
}

function savePlans(plans) {
  ensureDir(path.dirname(PENDING_PLANS_FILE));
  fs.writeFileSync(PENDING_PLANS_FILE, JSON.stringify(plans, null, 2));
}

/**
 * 构造 step 的 dispatch prompt
 */
function buildStepPrompt(plan, step, index, total) {
  const filled = applyFallback(step);
  const files = filled.files && filled.files.length > 0
    ? filled.files.join(', ')
    : '（无）';

  return `你是 ${filled.agent} agent。

【任务上下文】
计划: ${plan.task}
${plan.goal ? `目标: ${plan.goal}` : ''}
当前进度: 第 ${index + 1} / ${total} 步

【本步指令】
${filled.text}

【相关文件】
${files}

请专注于完成这一步。完成后用 1-3 行总结你做了什么。`;
}

/**
 * 调 claude -p 执行单个 step（同步版，简化逻辑）
 * @returns {{ ok: boolean, output: string, error?: string }}
 */
function executeStepSync(prompt, model) {
  try {
    const result = spawnSync(process.env.CLAUDE_BIN || 'claude', ['-p', '--model', model, prompt], {
      encoding: 'utf8',
      timeout: STEP_TIMEOUT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,  // Windows: 让 .cmd/.bat 走 cmd.exe 解析
    });

    if (result.error) {
      return { ok: false, output: '', error: result.error.message };
    }
    if (result.status !== 0) {
      return { ok: false, output: result.stdout || '', error: result.stderr || `exit ${result.status}` };
    }
    return { ok: true, output: result.stdout || '' };
  } catch (e) {
    return { ok: false, output: '', error: e.message };
  }
}

/**
 * 找到 latest approved plan
 */
function findLatestApproved() {
  const plans = loadPlans();
  const approved = plans.filter(p => p.status === 'approved');
  if (approved.length === 0) return null;
  return approved[approved.length - 1];
}

/**
 * 找最新 pending plan（避免 approved 与 executing 重复）
 */
function findLatestPending() {
  const plans = loadPlans();
  const pending = plans.filter(p => p.status === 'pending');
  if (pending.length === 0) return null;
  return pending[pending.length - 1];
}

/**
 * 更新 plan 状态
 */
function updatePlanStatus(planId, newStatus, extra = {}) {
  const plans = loadPlans();
  const target = plans.find(p => p.id === planId);
  if (!target) return null;
  target.status = newStatus;
  Object.assign(target, extra);
  target[`${newStatus}_at`] = new Date().toISOString();
  savePlans(plans);
  return target;
}

// ── 主入口 ─────────────────────────────────────────

/**
 * 执行指定 plan
 * @param {string} planId
 * @param {object} opts { dryRun, model }
 * @returns {{ ok: boolean, executed: number, failed: number, results: object[] }}
 */
function executePlan(planId, opts = {}) {
  const dryRun = opts.dryRun || false;
  const model = opts.model || DEFAULT_MODEL;

  // M54 batch 2 D: stale 自动恢复（执行前扫一次）
  try { rescueStaleExecutings(); } catch { /* 不阻塞主流程 */ }

  const plans = loadPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return { ok: false, error: 'plan not found', executed: 0, failed: 0, results: [] };

  if (plan.status !== 'approved') {
    return { ok: false, error: `plan status is ${plan.status}, expected approved`, executed: 0, failed: 0, results: [] };
  }

  // M54 batch 2 D: OS-level 锁（防并发跑覆盖 executing_at）
  if (!dryRun) {
    if (!acquireLock()) {
      return { ok: false, error: 'plan-bridge 锁被占用（另有进程在跑）', executed: 0, failed: 0, results: [] };
    }
  }

  const totalSteps = plan.plan.steps.length;

  try {
  // 标记 executing
  if (!dryRun) updatePlanStatus(planId, 'executing');

  const results = [];
  let executed = 0;
  let failed = 0;

  for (let i = 0; i < totalSteps; i++) {
    const step = plan.plan.steps[i];
    const filled = applyFallback(step);
    const prompt = buildStepPrompt(plan, filled, i, totalSteps);

    const stepEntry = {
      stepIndex: i,
      stepText: filled.text,
      agent: filled.agent,
      files: filled.files || [],
      timestamp: new Date().toISOString(),
    };

    if (dryRun) {
      stepEntry.dryRun = true;
      stepEntry.prompt = prompt;
      results.push(stepEntry);
      continue;
    }

    // 真执行
    const result = executeStepSync(prompt, model);
    stepEntry.output = result.output.slice(0, 2000);  // 截断避免日志爆炸
    stepEntry.status = result.ok ? 'done' : 'error';
    if (!result.ok) stepEntry.error = result.error;

    appendExecution({
      planId,
      ...stepEntry,
    });

    results.push(stepEntry);

    if (result.ok) {
      executed++;
    } else {
      failed++;
      // 单步失败不中断，继续下个 step
    }
  }

  // 标记 done
  if (!dryRun) updatePlanStatus(planId, failed > 0 ? 'partial' : 'done', {
    executed,
    failed,
    total: totalSteps,
  });

  return { ok: true, executed, failed, total: totalSteps, results };
  } finally {
    // M54 batch 2 D: try/finally 兜底释放锁（即使 plan 抛异常也不卡锁）
    if (!dryRun) releaseLock();
  }
}

/**
 * 执行最新 approved plan
 */
function executeLatest(opts = {}) {
  const plan = findLatestApproved();
  if (!plan) {
    return { ok: false, error: 'no approved plan found', executed: 0, failed: 0, results: [] };
  }
  return executePlan(plan.id, opts);
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'execute-latest';
  const dryRun = process.argv.includes('--dry-run');
  const planId = process.argv[3];

  try {
    switch (cmd) {
      case 'execute-latest': {
        const r = executeLatest({ dryRun });
        if (!r.ok) {
          console.log(`❌ ${r.error}`);
          console.log('提示: 用 plan-detect.js approve 批准一个 plan');
        } else {
          console.log(`🔧 Plan 执行: ${r.executed}/${r.total} 步完成${r.failed > 0 ? `, ${r.failed} 失败` : ''}`);
          for (const step of r.results) {
            const icon = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : step.dryRun ? '🔍' : '❓';
            console.log(`  ${icon} [${step.agent}] ${step.stepText.slice(0, 60)}`);
            if (step.error) console.log(`     错误: ${step.error.slice(0, 100)}`);
          }
          if (dryRun) console.log('\n💡 Dry-run 模式，未真执行');
        }
        break;
      }
      case 'execute': {
        if (!planId) {
          console.log('❌ 用法: plan-bridge.js execute <plan-id>');
          break;
        }
        const r = executePlan(planId, { dryRun });
        console.log(`🔧 Plan ${planId}: ${r.executed}/${r.total || 0} 步完成${r.failed > 0 ? `, ${r.failed} 失败` : ''}`);
        break;
      }
      case 'list-approved': {
        const plans = loadPlans().filter(p => p.status === 'approved');
        if (plans.length === 0) {
          console.log('📋 无 approved plan');
        } else {
          console.log(`📋 ${plans.length} 个 approved plan：`);
          for (const p of plans) {
            console.log(`  - [${p.id}] ${p.plan.task}（${p.plan.steps.length} 步骤，approved_at: ${p.approved_at}）`);
          }
        }
        break;
      }
      case 'log': {
        const log = loadExecutionLog();
        const recent = log.executions.slice(-10);
        if (recent.length === 0) {
          console.log('📋 无执行日志');
        } else {
          console.log(`📋 最近 ${recent.length} 条执行日志：`);
          for (const e of recent) {
            const icon = e.status === 'done' ? '✅' : e.status === 'error' ? '❌' : '❓';
            console.log(`  ${icon} [${e.planId.slice(-8)}] step ${e.stepIndex}: ${e.agent} - ${e.stepText.slice(0, 50)}`);
          }
        }
        break;
      }
      default:
        console.log(`
plan-bridge.js v1.9.3 — Plan 桥接执行引擎

用法:
  node plan-bridge.js execute-latest [--dry-run]    # 执行最新 approved plan
  node plan-bridge.js execute <plan-id> [--dry-run]  # 执行指定 plan
  node plan-bridge.js list-approved                  # 列出 approved plan
  node plan-bridge.js log                             # 看执行日志

前置:
  1. Claude 主会话输出 [plan] 块（自动被 plan-detect.js 捕获）
  2. 用户 /ok → plan 状态变 approved
  3. node plan-bridge.js execute-latest → 按 step 派 claude -p 执行
`);
    }
  } catch (e) {
    // 永不 throw
    console.error('❌ 异常:', e.message);
  }
  process.exit(0);
}

module.exports = {
  executePlan,
  executeLatest,
  buildStepPrompt,
  findLatestApproved,
  rescueStaleExecutings,
  acquireLock,
  releaseLock,
  DEFAULT_STALE_MS,
  LOCK_FILE,
  EXECUTION_LOG_FILE,
};