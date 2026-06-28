#!/usr/bin/env node
/**
 * review-loop.js — Cross-Model Review Loop（M38 · 借鉴 wanshuiyin/Auto-claude-code-research-in-sleep）
 *
 * 痛点：Claude 写完代码 / 文档 / plan 后，没人 review 容易出问题（小到 typo，大到安全漏洞）。
 *       用户每次让另一个 Claude 重新看一遍 = 多花 2-5 分钟。
 *
 * 借鉴思路（ARIS `auto-review-loop-llm` SKILL.md 核心）：
 *   - Cross-model review：让"不同视角"的评审者同时 review（不同 temperature / 不同 role / 不同 focus）
 *   - 循环：review → 修复 → 再 review，最多 MAX_ROUNDS
 *   - 终止条件：score >= 6 AND verdict ∈ {PASS, WARN}（POSITIVE_THRESHOLD）
 *   - 状态持久化：每次 round 写入 review-state.json（断点恢复）
 *
 * 本实现（M38 POC）：
 *   - 纯函数 + 离线模式（reviewers 是 preset 数组，不调真 LLM）
 *   - 提供 generateReviewers(focusAreas) 工厂：可生成 N 个不同视角的 preset reviewer
 *   - 提供 runReviewLoop(input, opts) 主循环：返回最终 verdict + 全部 rounds
 *   - 提供 formatReport(result) 人类可读输出
 *
 * @since v3.0.5 M38 (2026-06-28)
 * @source https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep · 借鉴评估 7.4/10
 * @reference skills/auto-review-loop-llm/SKILL.md
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { makeVerdict, aggregateVerdicts, isPositive, isStopping, normalizeVerdict } = require('./verdict');

const DEFAULTS = {
  maxRounds: 4,                              // ARIS POSITIVE_THRESHOLD 默认 4 轮
  positiveScore: 6,                          // score >= 6 算 positive
  aggregateStrategy: 'majority',             // 多视角汇总策略
  focusAreas: ['correctness', 'security', 'style', 'performance', 'maintainability'],
  // 每个 focus 的 reviewer "打分模型" —— 启发式 preset（不是真 LLM）
  // 给每个 focus 设权重（用于 weighted 聚合）
  weights: {
    correctness: 1.5,
    security: 1.5,
    style: 0.8,
    performance: 1.0,
    maintainability: 1.0,
  },
};

/**
 * 评审者 preset 模板
 *
 * 每个 reviewer 是 { name, focus, score(input) } 的纯函数。
 * 输入：{ subject, body, meta }
 * 输出：verdict 对象
 *
 * POC 模式：用启发式 keyword-based scoring（不调真 LLM）；
 *         真实模式（未来）：换成 LLM API 调用
 */
const REVIEWER_PRESETS = {
  correctness: {
    name: 'reviewer-correctness',
    focus: 'correctness',
    description: '关注逻辑错误 / 边界条件 / 空指针 / off-by-one',
    score(input) {
      const body = (input.body || '').toLowerCase();
      let s = 7; // baseline
      const issues = [];
      // 启发式信号
      if (/\bthrow new error\b/.test(body) && !input.meta?.hasErrorBoundary) {
        s -= 1; issues.push('throw 未被 try/catch 包裹');
      }
      if (/for\s*\(.*;\s*\w+\s*<\s*length\s*;/.test(body) && /i\+\+/.test(body)) {
        s -= 0.5; issues.push('C-style for 循环（考虑用 for-of）');
      }
      if (/\b(undefined|null)\b/.test(body) && !/typeof.*===|!==\s*(undefined|null)/.test(body)) {
        s -= 0.5;
      }
      if (input.meta?.testCount === 0) {
        s -= 2; issues.push('无测试覆盖');
      }
      // 长度负相关（越长越可能漏 bug）
      if (body.length > 5000) { s -= 0.5; }
      // 复杂语法风险
      if (/eval\s*\(/.test(body)) { s -= 3; issues.push('eval() 危险'); }
      return makeVerdict({
        score: Math.max(0, s),
        verdict: s >= 6 ? 'PASS' : (s >= 4 ? 'WARN' : 'FAIL'),
        reason: `correctness heuristics (body=${body.length}ch)`,
        reviewer: 'reviewer-correctness',
        weaknesses: issues,
      });
    },
  },
  security: {
    name: 'reviewer-security',
    focus: 'security',
    description: '关注注入 / 密钥泄露 / 路径穿越 / 权限提升',
    score(input) {
      const body = input.body || '';
      let s = 8;
      const issues = [];
      if (/(password|secret|api[_-]?key|token)\s*[:=]\s*['"]/.test(body)) {
        s -= 4; issues.push('疑似硬编码密钥');
      }
      if (/child_process|exec\s*\(/.test(body) && !/sanitize|escape/.test(body)) {
        s -= 2; issues.push('shell 执行无 sanitize');
      }
      if (/path\.(join|resolve)/.test(body) && /\.\.\//.test(body) && !/normalize|isAbsolute/.test(body)) {
        s -= 1; issues.push('路径拼接未防御 ../');
      }
      if (/eval|Function\s*\(/.test(body)) {
        s -= 3; issues.push('eval / 动态 Function');
      }
      if (/innerHTML\s*=/.test(body) || /dangerouslySetInnerHTML/.test(body)) {
        s -= 2; issues.push('innerHTML XSS 风险');
      }
      return makeVerdict({
        score: Math.max(0, s),
        verdict: s >= 6 ? 'PASS' : (s >= 4 ? 'WARN' : 'FAIL'),
        reason: `security heuristics`,
        reviewer: 'reviewer-security',
        weaknesses: issues,
      });
    },
  },
  style: {
    name: 'reviewer-style',
    focus: 'style',
    description: '关注命名 / 注释密度 / 一致性 / 可读性',
    score(input) {
      const body = input.body || '';
      let s = 7;
      const issues = [];
      const lines = body.split('\n');
      if (lines.length < 5) { s -= 0.5; }
      // 注释密度（每 N 行至少 1 行注释）
      const commentLines = lines.filter(l => /^\s*(\/\/|#|\*)/.test(l)).length;
      const commentRatio = commentLines / Math.max(lines.length, 1);
      if (commentRatio < 0.05 && lines.length > 30) {
        s -= 1; issues.push(`注释密度低 (${(commentRatio*100).toFixed(1)}%)`);
      }
      // 长行
      const longLines = lines.filter(l => l.length > 120).length;
      if (longLines > 3) {
        s -= 0.5; issues.push(`${longLines} 行超过 120 字符`);
      }
      // console.log 残留（不算错但生产代码不该有）
      const consoleCount = (body.match(/console\.log/g) || []).length;
      if (consoleCount > 0 && !input.meta?.allowConsole) {
        s -= 0.5; issues.push(`${consoleCount} 个 console.log 残留`);
      }
      // 命名一致性（驼峰 vs 下划线）
      const camelHits = (body.match(/\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length;
      const snakeHits = (body.match(/\b[a-z][a-z0-9]*_[a-z0-9_]*\b/g) || []).length;
      if (camelHits > 5 && snakeHits > 5) {
        s -= 0.5; issues.push('混合 camelCase 和 snake_case');
      }
      return makeVerdict({
        score: Math.max(0, s),
        verdict: s >= 6 ? 'PASS' : (s >= 4 ? 'WARN' : 'FAIL'),
        reason: `style heuristics (${lines.length} lines)`,
        reviewer: 'reviewer-style',
        weaknesses: issues,
      });
    },
  },
  performance: {
    name: 'reviewer-performance',
    focus: 'performance',
    description: '关注 N² 循环 / 同步 IO / 大列表 / 重复计算',
    score(input) {
      const body = input.body || '';
      let s = 7;
      const issues = [];
      // 嵌套 for
      const nestedFors = (body.match(/for\s*\([^)]*\)\s*{[^}]*for\s*\(/g) || []).length;
      if (nestedFors > 0) {
        s -= 1; issues.push(`${nestedFors} 处嵌套 for 循环`);
      }
      // 同步 IO
      if (/fs\.(readFileSync|writeFileSync)/.test(body)) {
        s -= 0.5; issues.push('同步文件 IO');
      }
      // JSON.parse 大字符串
      if (/JSON\.parse\(/.test(body) && !/try\s*{/.test(body)) {
        s -= 0.5;
      }
      // 重复正则编译
      const newRegexCount = (body.match(/new\s+RegExp\(/g) || []).length;
      if (newRegexCount > 3) {
        s -= 0.5; issues.push(`${newRegexCount} 处动态 RegExp（可缓存）`);
      }
      return makeVerdict({
        score: Math.max(0, s),
        verdict: s >= 6 ? 'PASS' : (s >= 4 ? 'WARN' : 'FAIL'),
        reason: `performance heuristics`,
        reviewer: 'reviewer-performance',
        weaknesses: issues,
      });
    },
  },
  maintainability: {
    name: 'reviewer-maintainability',
    focus: 'maintainability',
    description: '关注函数长度 / 嵌套深度 / 重复代码 / 模块化',
    score(input) {
      const body = input.body || '';
      let s = 7;
      const issues = [];
      // 长函数
      const funcMatches = body.match(/function\s+\w+[^}]*\}/g) || [];
      const longFuncs = funcMatches.filter(f => f.split('\n').length > 50).length;
      if (longFuncs > 0) {
        s -= 1; issues.push(`${longFuncs} 个长函数（>50 行）`);
      }
      // 嵌套深度（粗略）
      const maxIndent = Math.max(...body.split('\n').map(l => (l.match(/^\s*/)?.[0].length || 0)));
      if (maxIndent > 16) {
        s -= 1; issues.push(`嵌套深度 ${maxIndent / 2} 层`);
      }
      // TODO / FIXME
      const todoCount = (body.match(/\b(TODO|FIXME|XXX|HACK)\b/g) || []).length;
      if (todoCount > 0) {
        s -= 1; issues.push(`${todoCount} 个 TODO/FIXME 标记`);
      }
      return makeVerdict({
        score: Math.max(0, s),
        verdict: s >= 6 ? 'PASS' : (s >= 4 ? 'WARN' : 'FAIL'),
        reason: `maintainability heuristics`,
        reviewer: 'reviewer-maintainability',
        weaknesses: issues,
      });
    },
  },
};

/**
 * 根据 focus 列表生成 reviewers 数组
 *
 * @param {string[]} focusAreas  focus 名列表
 * @returns {object[]}           reviewer 列表（带 name/focus/description/score）
 */
function generateReviewers(focusAreas = DEFAULTS.focusAreas) {
  return focusAreas
    .filter(f => REVIEWER_PRESETS[f])
    .map(f => ({ ...REVIEWER_PRESETS[f] }));
}

/**
 * 主循环：runReviewLoop(input, opts)
 *
 * @param {object} input          待评审内容
 * @param {string} input.subject  主题（如 "M38 review-loop.js"）
 * @param {string} input.body     待评审的代码/文档/plan（字符串）
 * @param {object} [input.meta]   额外元信息（hasErrorBoundary / testCount / allowConsole）
 * @param {object} [opts]
 * @param {number} [opts.maxRounds]
 * @param {string[]} [opts.focusAreas]
 * @param {string} [opts.aggregateStrategy]  'majority' | 'unanimous' | 'any' | 'best_of' | 'worst_of'
 * @param {object} [opts.fixStrategy]        round N >= 2 时的"修复函数"（输入当前 verdict 数组，输出修复后的 body）
 * @returns {object}  { rounds, finalVerdict, status, totalRounds }
 */
function runReviewLoop(input, opts = {}) {
  const maxRounds = opts.maxRounds || DEFAULTS.maxRounds;
  const focusAreas = opts.focusAreas || DEFAULTS.focusAreas;
  const strategy = opts.aggregateStrategy || DEFAULTS.aggregateStrategy;
  const fixStrategy = opts.fixStrategy || defaultFixStrategy;

  const reviewers = generateReviewers(focusAreas);
  if (reviewers.length === 0) {
    return {
      rounds: [],
      finalVerdict: makeVerdict({ score: 0, verdict: 'NOT_APPLICABLE', reason: 'no reviewers' }),
      status: 'skipped',
      totalRounds: 0,
    };
  }

  const rounds = [];
  let currentInput = { ...input };
  let currentVerdict = null;

  for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
    // Phase A: Review（每个 reviewer 独立评分）
    const reviews = reviewers.map(r => r.score({
      subject: currentInput.subject,
      body: currentInput.body,
      meta: currentInput.meta || {},
    }));

    // Phase B: Aggregate
    const aggregated = aggregateVerdicts(reviews, strategy);

    // Phase C: 记录 round
    const roundRecord = {
      round: roundNum,
      reviews,
      aggregated,
      bodyLength: (currentInput.body || '').length,
      timestamp: new Date().toISOString(),
    };
    rounds.push(roundRecord);
    currentVerdict = aggregated;

    // Phase D: 检查终止
    if (isPositive(aggregated) || isStopping(aggregated)) {
      return {
        rounds,
        finalVerdict: aggregated,
        status: isPositive(aggregated) ? 'accepted' : 'stopped',
        totalRounds: roundNum,
      };
    }

    // Phase E: 修复（最后一轮不需要）
    if (roundNum >= maxRounds) {
      return {
        rounds,
        finalVerdict: aggregated,
        status: 'max_rounds_reached',
        totalRounds: roundNum,
      };
    }

    // 应用修复
    const fixedBody = fixStrategy(currentInput.body, reviews, aggregated);
    if (fixedBody === currentInput.body) {
      // 没有修复（fixStrategy 无作为），提前结束
      return {
        rounds,
        finalVerdict: aggregated,
        status: 'no_improvement',
        totalRounds: roundNum,
      };
    }
    currentInput = { ...currentInput, body: fixedBody };
  }

  // 理论上不会到这里（循环内部已 return）
  return {
    rounds,
    finalVerdict: currentVerdict,
    status: 'completed',
    totalRounds: rounds.length,
  };
}

/**
 * 默认修复策略：移除非关键弱点提及的 console.log（启发式，仅作 demo）
 *
 * 真实场景应换成 LLM API 调用（参考 ARIS auto-review-loop-llm Phase C）
 *
 * @param {string} body
 * @param {object[]} reviews
 * @param {object} aggregated
 * @returns {string}
 */
function defaultFixStrategy(body, reviews, aggregated) {
  let fixed = body;
  // 启发式 1：移除独立的 console.log
  fixed = fixed.replace(/^\s*console\.log\([^)]*\);\s*\n/gm, '');
  // 启发式 2：把 var 改成 const（简单替换，排除 = 形式的赋值）
  // 简化：只处理 `var x = ` 这种
  fixed = fixed.replace(/^(\s*)var\s+/gm, '$1const ');
  return fixed;
}

/**
 * 把 review loop 结果格式化为人类可读报告
 *
 * @param {object} result  runReviewLoop 返回
 * @returns {string}
 */
function formatReport(result) {
  if (!result || !result.rounds) return '[empty review result]';
  const lines = [];
  lines.push('# Cross-Model Review Loop Report');
  lines.push('');
  lines.push(`**Status**: ${result.status}`);
  lines.push(`**Total Rounds**: ${result.totalRounds}`);
  lines.push(`**Final Verdict**: ${result.finalVerdict.verdict} (score=${result.finalVerdict.score.toFixed(2)})`);
  lines.push(`**Reason**: ${result.finalVerdict.reason}`);
  lines.push('');
  lines.push('## Rounds');
  for (const round of result.rounds) {
    lines.push(`### Round ${round.round}`);
    lines.push(`- Aggregated: ${round.aggregated.verdict} (score=${round.aggregated.score.toFixed(2)})`);
    lines.push(`- Body length: ${round.bodyLength}`);
    for (const r of round.reviews) {
      lines.push(`  - ${r.reviewer}: ${r.verdict} (score=${r.score}) — ${r.reason}`);
      if (r.weaknesses.length > 0) {
        for (const w of r.weaknesses) {
          lines.push(`    ⚠️  ${w}`);
        }
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 持久化 state（借鉴 ARIS `REVIEW_STATE.json` 模式）
 *
 * @param {object} result
 * @param {string} outDir  目录路径
 * @returns {string}       写入的文件路径
 */
function saveState(result, outDir) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const statePath = path.join(outDir, 'review-state.json');
  const state = {
    savedAt: new Date().toISOString(),
    status: result.status,
    totalRounds: result.totalRounds,
    finalVerdict: result.finalVerdict,
    rounds: result.rounds.map(r => ({
      round: r.round,
      aggregated: r.aggregated,
      bodyLength: r.bodyLength,
      timestamp: r.timestamp,
    })),
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return statePath;
}

module.exports = {
  DEFAULTS,
  REVIEWER_PRESETS,
  generateReviewers,
  runReviewLoop,
  formatReport,
  saveState,
  defaultFixStrategy,
  // 重新导出 verdict 工具
  makeVerdict,
  aggregateVerdicts,
  isPositive,
  isStopping,
  normalizeVerdict,
};