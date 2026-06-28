#!/usr/bin/env node
/**
 * verdict.js — 6-state 评审合约（M38 · 借鉴 wanshuiyin/Auto-claude-code-research-in-sleep）
 *
 * 痛点：auto-implement / auto-review / M12 LLM-judge 等模块各自定义 verdict 字段（accept/reject、
 *       pass/fail、score 1-10），字段不一致导致调用方要写多份 if/else 适配。
 *
 * 借鉴思路（ARIS `shared-references/assurance-contract.md` 核心）：
 *   - 6 状态统一：`PASS | WARN | FAIL | BLOCKED | ERROR | NOT_APPLICABLE`
 *   - score 范围 0-10（与 ARIS NeurIPS-level reviewer 一致）
 *   - 每个状态有 next_action 建议（让上层决定是 continue / fix / abort）
 *
 * 本实现（M38 POC）：
 *   - 纯函数，无 IO，便于测试 + 复用
 *   - 提供 `makeVerdict({ score, rawVerdict, reason, ... })` 工厂函数（自动归一）
 *   - 提供 `aggregateVerdicts(verdicts, strategy)` 多视角汇总
 *   - 提供 `isStopping(verdict)` 终止判定
 *
 * @since v3.0.5 M38 (2026-06-28)
 * @source https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep · 借鉴评估 7.4/10
 * @reference skills/shared-references/assurance-contract.md (ARIS 官方合约)
 */

'use strict';

/**
 * 6-state verdict 状态枚举
 * 来源：ARIS `shared-references/assurance-contract.md`
 *
 * | 状态              | 含义                                | next_action 建议      |
 * |-------------------|-------------------------------------|----------------------|
 * | PASS              | 通过，无需修改                      | continue / accept    |
 * | WARN              | 通过但有小问题，可改进              | continue + log       |
 * | FAIL              | 不通过，需修复后重试                | fix + re-review      |
 * | BLOCKED           | 阻塞，无法继续（依赖/权限/环境）    | abort + escalate     |
 * | ERROR             | 评审本身出错（llm 失败等）          | retry / fallback     |
 * | NOT_APPLICABLE    | 不适用（场景不符/范围外）           | skip                 |
 */
const VERDICT_STATES = ['PASS', 'WARN', 'FAIL', 'BLOCKED', 'ERROR', 'NOT_APPLICABLE'];

/**
 * Score 阈值（借鉴 ARIS `auto-review-loop-llm` SKILL.md POSITIVE_THRESHOLD）
 * score >= 6 AND verdict ∈ {PASS, WARN} → positive
 */
const POSITIVE_SCORE_THRESHOLD = 6;

/**
 * 把任意 rawVerdict 归一到 6 状态之一（不区分大小写、容忍错别字）
 *
 * @param {string} raw  原始 verdict（如 'pass' / 'READY' / 'ok' / 'failed'）
 * @returns {string}   6 状态之一
 */
function normalizeVerdict(raw) {
  if (raw == null) return 'ERROR';
  const s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '_');
  // 直接命中
  if (VERDICT_STATES.includes(s)) return s;
  // 别名映射（ARIS 用 ready/almost/not ready，OpenAI 用 yes/no，业内常用 accept/reject）
  if (['READY', 'ACCEPT', 'YES', 'OK', 'APPROVED', 'PASSED', 'GOOD'].includes(s)) return 'PASS';
  if (['ALMOST', 'MOSTLY', 'PARTIAL', 'ACCEPTABLE'].includes(s)) return 'WARN';
  if (['NOT_READY', 'NOTREADY', 'NO', 'REJECT', 'REJECTED', 'FAILED', 'BAD', 'DENIED'].includes(s)) return 'FAIL';
  if (['BLOCK', 'BLOCKED', 'FROZEN', 'PAUSED'].includes(s)) return 'BLOCKED';
  if (['ERR', 'EXCEPTION', 'CRASH', 'TIMEOUT'].includes(s)) return 'ERROR';
  if (['NA', 'N/A', 'SKIP', 'IRRELEVANT', 'OUT_OF_SCOPE', 'NONE'].includes(s)) return 'NOT_APPLICABLE';
  return 'ERROR'; // 兜底
}

/**
 * 钳制 score 到 [0, 10]
 *
 * @param {number} n
 * @returns {number}
 */
function clampScore(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

/**
 * 工厂函数：构造一个 verdict 对象（带完整字段）
 *
 * @param {object} input
 * @param {number} input.score         0-10 数字
 * @param {string} input.verdict       6 状态之一（或别名自动归一）
 * @param {string} [input.reason]      评审理由（人/AI 都可读）
 * @param {string} [input.reviewer]    评审者标识（模型名 / 'gpt-4o' / 'claude-opus-4-8' 等）
 * @param {string[]} [input.weaknesses] 主要弱点列表
 * @param {string[]} [input.actions]   建议行动列表
 * @param {object} [input.meta]        额外元信息（时间/round/id 等）
 * @returns {object} verdict 对象
 */
function makeVerdict({ score, verdict, reason, reviewer, weaknesses, actions, meta } = {}) {
  const norm = normalizeVerdict(verdict);
  return {
    score: clampScore(score),
    verdict: norm,
    reason: reason || '',
    reviewer: reviewer || 'anonymous',
    weaknesses: Array.isArray(weaknesses) ? weaknesses.slice() : [],
    actions: Array.isArray(actions) ? actions.slice() : [],
    meta: meta && typeof meta === 'object' ? { ...meta } : {},
    timestamp: new Date().toISOString(),
    // 派生字段
    positive: isPositive({ score, verdict: norm }),
  };
}

/**
 * 是否算"positive"（借鉴 ARIS POSITIVE_THRESHOLD 双条件）
 * score >= 6 AND verdict ∈ {PASS, WARN}
 *
 * @param {object} v  verdict 或 { score, verdict }
 * @returns {boolean}
 */
function isPositive(v) {
  if (!v) return false;
  const score = clampScore(v.score);
  const verdict = normalizeVerdict(v.verdict);
  return score >= POSITIVE_SCORE_THRESHOLD && (verdict === 'PASS' || verdict === 'WARN');
}

/**
 * 是否应停止 review loop（PASS / BLOCKED / NOT_APPLICABLE 都算终结）
 *
 * @param {object} v
 * @returns {boolean}
 */
function isStopping(v) {
  if (!v) return false;
  const verdict = normalizeVerdict(v.verdict);
  return verdict === 'PASS' || verdict === 'BLOCKED' || verdict === 'NOT_APPLICABLE';
}

/**
 * 多视角 verdict 汇总（借鉴 ARIS cross-model audit chain + 增量 C proactive-scan 经验）
 *
 * 策略：
 *   - 'unanimous':   全部 positive 才算 positive（保守，类似 AND）
 *   - 'majority':    多数 positive 即 positive（默认，平衡）
 *   - 'any':         任意一个 positive 即 positive（乐观，类似 OR）
 *   - 'best_of':     取 score 最高的 verdict（采纳最强信号）
 *   - 'worst_of':    取 score 最低的（采纳最严信号）
 *
 * @param {object[]} verdicts  verdict 数组
 * @param {string}   [strategy] 汇总策略
 * @returns {object}           汇总 verdict
 */
function aggregateVerdicts(verdicts, strategy = 'majority') {
  if (!Array.isArray(verdicts) || verdicts.length === 0) {
    return makeVerdict({ score: 0, verdict: 'NOT_APPLICABLE', reason: 'empty input' });
  }

  // 归一所有 verdict
  const norm = verdicts.map(v => ({
    raw: v,
    score: clampScore(v.score),
    verdict: normalizeVerdict(v.verdict),
  }));

  // 统计
  const positiveCount = norm.filter(n => isPositive({ score: n.score, verdict: n.verdict })).length;
  const ratio = positiveCount / norm.length;
  const avgScore = norm.reduce((s, n) => s + n.score, 0) / norm.length;
  const maxScore = Math.max(...norm.map(n => n.score));
  const minScore = Math.min(...norm.map(n => n.score));

  let finalVerdict;
  let finalScore;
  let reason;

  switch (strategy) {
    case 'unanimous': {
      finalVerdict = ratio === 1 ? 'PASS' : 'FAIL';
      finalScore = minScore;
      reason = `unanimous ${positiveCount}/${norm.length} positive`;
      break;
    }
    case 'any': {
      finalVerdict = ratio > 0 ? 'PASS' : 'FAIL';
      finalScore = maxScore;
      reason = `any ${positiveCount}/${norm.length} positive`;
      break;
    }
    case 'best_of': {
      const best = norm.find(n => n.score === maxScore);
      finalVerdict = best.verdict;
      finalScore = best.score;
      reason = `best_of picked score=${maxScore}`;
      break;
    }
    case 'worst_of': {
      const worst = norm.find(n => n.score === minScore);
      finalVerdict = worst.verdict;
      finalScore = worst.score;
      reason = `worst_of picked score=${minScore}`;
      break;
    }
    case 'majority':
    default: {
      finalVerdict = ratio > 0.5 ? 'PASS' : 'FAIL';
      finalScore = avgScore;
      reason = `majority ${positiveCount}/${norm.length} positive`;
      break;
    }
  }

  // 收集所有 weaknesses / actions
  const allWeaknesses = verdicts.flatMap(v => Array.isArray(v.weaknesses) ? v.weaknesses : []);
  const allActions = verdicts.flatMap(v => Array.isArray(v.actions) ? v.actions : []);

  return makeVerdict({
    score: finalScore,
    verdict: finalVerdict,
    reason,
    reviewer: `aggregate:${strategy}`,
    weaknesses: dedupe(allWeaknesses),
    actions: dedupe(allActions),
    meta: {
      strategy,
      count: norm.length,
      positiveCount,
      avgScore: round2(avgScore),
      maxScore,
      minScore,
    },
  });
}

/**
 * 给 verdict 推荐下一步动作（借鉴 ARIS shared-references/acceptance-gate.md）
 *
 * @param {object} v
 * @returns {string} 'accept' | 'fix' | 'escalate' | 'retry' | 'skip' | 'continue'
 */
function nextAction(v) {
  if (!v) return 'retry';
  const verdict = normalizeVerdict(v.verdict);
  switch (verdict) {
    case 'PASS': return 'accept';
    case 'WARN': return 'continue';
    case 'FAIL': return 'fix';
    case 'BLOCKED': return 'escalate';
    case 'ERROR': return 'retry';
    case 'NOT_APPLICABLE': return 'skip';
    default: return 'retry';
  }
}

/**
 * 把 verdict 对象格式化为人类可读 1 行
 *
 * @param {object} v
 * @returns {string}
 */
function formatVerdict(v) {
  if (!v) return '[no verdict]';
  return `${v.verdict.padEnd(15)} score=${String(v.score).padStart(4)}  reviewer=${v.reviewer}  reason="${v.reason}"`;
}

// ---- helpers ----

function dedupe(arr) {
  return Array.from(new Set(arr));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  VERDICT_STATES,
  POSITIVE_SCORE_THRESHOLD,
  normalizeVerdict,
  clampScore,
  makeVerdict,
  isPositive,
  isStopping,
  aggregateVerdicts,
  nextAction,
  formatVerdict,
};