#!/usr/bin/env node
/**
 * idea-discovery.js — 候选想法评分 + 排序 + Top-K（M38 · 借鉴 wanshuiyin/Auto-claude-code-research-in-sleep）
 *
 * 痛点：AI / 用户生成一堆 idea / 候选 / 方案后，谁排前面？人工排序主观且慢。
 *
 * 借鉴思路（ARIS `idea-discovery` SKILL.md Phase 2 核心）：
 *   - 多维评分：novelty / feasibility / impact / clarity / cost
 *   - 加权汇总 → 0-10 分
 *   - 阈值过滤（POSITIVE_THRESHOLD = 6）
 *   - Top-K 排序
 *   - 输出 Markdown 表（用户一眼可读）
 *
 * 本实现（M38 POC）：
 *   - 纯函数 + 离线模式（启发式 preset scoring，不调真 LLM）
 *   - 提供 scoreIdea(idea, weights) 单个评分
 *   - 提供 discoverIdeas(candidates, opts) 批量筛选 + 排序
 *   - 提供 formatReport(result) Markdown 输出
 *
 * @since v3.0.5 M38 (2026-06-28)
 * @source https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep · 借鉴评估 7.4/10
 * @reference skills/idea-discovery/SKILL.md
 */

'use strict';

const { makeVerdict } = require('./verdict');

const DEFAULTS = {
  // 5 维评分（借鉴 ARIS idea-discovery 多 phase 输出）
  dimensions: ['novelty', 'feasibility', 'impact', 'clarity', 'cost'],
  weights: {
    novelty: 1.2,       // 新颖度
    feasibility: 1.5,   // 可行性（人/时间/依赖）
    impact: 1.3,        // 影响面（用户/价值）
    clarity: 0.8,       // 描述清晰度
    cost: 1.0,          // 实施成本（越高分 = 越低，反向）
  },
  positiveThreshold: 6,    // ARIS POSITIVE_THRESHOLD
  topK: 5,                // 默认返回前 K
  rankLabels: {
    STRONG: 'STRONG',           // >= 8
    RECOMMENDED: 'RECOMMENDED', // >= 6
    BACKUP: 'BACKUP',           // >= 4
    ELIMINATED: 'ELIMINATED',   // < 4
  },
};

/**
 * 给单个 idea 评分（5 维启发式）
 *
 * 输入 idea 格式：
 *   {
 *     id, title, description,           // 必填
 *     keywords: [...],                  // 可选，影响 novelty/clarity
 *     estimatedHours: 2,                // 可选，影响 feasibility/cost
 *     dependencies: ['node >= 16'],     // 可选，影响 feasibility
 *     duplicateOf: 'M12',               // 可选，已存在则直接 ELIMINATED
 *     priority: 'P1',                   // 可选，影响 impact
 *     evidence: '已有 5 个 KB 引用',     // 可选，影响 impact
 *   }
 *
 * @param {object} idea
 * @param {object} [customWeights]
 * @returns {object}  { scores: {...}, weighted: number, verdict, rank, label }
 */
function scoreIdea(idea, customWeights = {}) {
  if (!idea || typeof idea !== 'object') {
    return {
      scores: {},
      weighted: 0,
      verdict: 'NOT_APPLICABLE',
      rank: -1,
      label: 'ELIMINATED',
      reason: 'invalid idea',
    };
  }
  const weights = { ...DEFAULTS.weights, ...customWeights };

  // 重复检查 → 直接 ELIMINATED
  if (idea.duplicateOf) {
    return {
      scores: { novelty: 0, feasibility: 0, impact: 0, clarity: 0, cost: 0 },
      weighted: 0,
      verdict: 'FAIL',
      rank: -1,
      label: 'ELIMINATED',
      reason: `duplicate of ${idea.duplicateOf}`,
    };
  }

  // 各维度启发式评分（0-10）
  const scores = {
    novelty: scoreNovelty(idea),
    feasibility: scoreFeasibility(idea),
    impact: scoreImpact(idea),
    clarity: scoreClarity(idea),
    cost: scoreCost(idea),
  };

  // 加权平均
  let total = 0, weightSum = 0;
  for (const dim of DEFAULTS.dimensions) {
    const w = weights[dim] || 1;
    total += scores[dim] * w;
    weightSum += w;
  }
  const weighted = weightSum > 0 ? total / weightSum : 0;

  // 分级标签
  let label, verdict;
  if (weighted >= 8) {
    label = DEFAULTS.rankLabels.STRONG;
    verdict = 'PASS';
  } else if (weighted >= DEFAULTS.positiveThreshold) {
    label = DEFAULTS.rankLabels.RECOMMENDED;
    verdict = 'PASS';
  } else if (weighted >= 4) {
    label = DEFAULTS.rankLabels.BACKUP;
    verdict = 'WARN';
  } else {
    label = DEFAULTS.rankLabels.ELIMINATED;
    verdict = 'FAIL';
  }

  return {
    scores,
    weighted: round2(weighted),
    verdict,
    rank: 0, // 排序后填
    label,
  };
}

// ---- 各维度启发式 ----

function scoreNovelty(idea) {
  // 描述越长 + 关键词越具体 → novelty 越高
  const desc = idea.description || '';
  const kws = idea.keywords || [];
  let s = 5;
  if (desc.length > 100) s += 1;
  if (desc.length > 300) s += 1;
  if (kws.length >= 3) s += 1;
  if (kws.length >= 5) s += 1;
  // 引用相关工作 → 加分
  if (idea.references || idea.cites) s += 0.5;
  // 有 prior work → 扣分（说明重复）
  if (idea.similarTo) s -= 2;
  return clamp(s, 0, 10);
}

function scoreFeasibility(idea) {
  let s = 7;
  const hours = idea.estimatedHours;
  if (typeof hours === 'number') {
    if (hours <= 1) s += 2;
    else if (hours <= 4) s += 1;
    else if (hours <= 8) s += 0;
    else if (hours <= 24) s -= 1;
    else s -= 3; // 大于 1 天
  }
  const deps = idea.dependencies || [];
  if (deps.length === 0) s += 1;
  else if (deps.length <= 2) s += 0;
  else s -= 1;
  // POC/原型 → 加分
  if (idea.pocOnly) s += 1;
  // 已有 demo 链接 → 加分
  if (idea.demoUrl) s += 1;
  return clamp(s, 0, 10);
}

function scoreImpact(idea) {
  let s = 5;
  // 优先级 P0/P1/P2
  if (idea.priority === 'P0') s += 3;
  else if (idea.priority === 'P1') s += 2;
  else if (idea.priority === 'P2') s += 1;
  // 用户数 / 触及面
  if (idea.affects === 'all') s += 2;
  else if (idea.affects === 'power-users') s += 1;
  // 已有 evidence / KB 引用
  if (idea.evidence) s += 1;
  // 解决核心痛点
  if (idea.solvesCorePain) s += 2;
  return clamp(s, 0, 10);
}

function scoreClarity(idea) {
  const desc = idea.description || '';
  const title = idea.title || '';
  let s = 5;
  // 标题长度
  if (title.length >= 10 && title.length <= 80) s += 2;
  // 描述长度
  if (desc.length >= 50) s += 1;
  if (desc.length >= 200) s += 1;
  // 有 acceptance criteria
  if (idea.acceptance) s += 1;
  // 有 ROI
  if (idea.roi) s += 0.5;
  return clamp(s, 0, 10);
}

function scoreCost(idea) {
  // 越低成本 → 越高分（反向）
  let s = 7;
  const hours = idea.estimatedHours;
  if (typeof hours === 'number') {
    if (hours <= 1) s += 3;
    else if (hours <= 4) s += 1;
    else if (hours <= 16) s -= 1;
    else s -= 3;
  }
  // 引入新依赖 → 扣分
  const deps = idea.dependencies || [];
  if (deps.length > 2) s -= 1;
  // 改核心文件 → 扣分
  if (idea.touchesCore) s -= 2;
  return clamp(s, 0, 10);
}

// ---- 主入口 ----

/**
 * 批量发现：评分 + 排序 + Top-K + 过滤
 *
 * @param {object[]} candidates  idea 数组
 * @param {object}   [opts]
 * @param {number}   [opts.topK]
 * @param {number}   [opts.positiveThreshold]
 * @param {object}   [opts.weights]
 * @param {string[]} [opts.includeLabels]   只保留哪些 label（默认全部）
 * @returns {object}  { ranked: [...], eliminated: [...], stats: {...} }
 */
function discoverIdeas(candidates, opts = {}) {
  if (!Array.isArray(candidates)) candidates = [];
  const topK = opts.topK || DEFAULTS.topK;
  const threshold = opts.positiveThreshold || DEFAULTS.positiveThreshold;
  const weights = opts.weights || DEFAULTS.weights;
  const includeLabels = opts.includeLabels || Object.values(DEFAULTS.rankLabels);

  // 1) 评分
  const scored = candidates.map(idea => {
    const sc = scoreIdea(idea, weights);
    return {
      idea,
      ...sc,
    };
  });

  // 2) 排序（weighted 降序）
  scored.sort((a, b) => b.weighted - a.weighted);

  // 3) 填 rank
  scored.forEach((s, i) => { s.rank = i + 1; });

  // 4) 分类
  const ranked = [];
  const eliminated = [];
  for (const s of scored) {
    if (s.label === DEFAULTS.rankLabels.ELIMINATED) {
      eliminated.push(s);
    } else if (includeLabels.includes(s.label)) {
      ranked.push(s);
    } else {
      eliminated.push(s);
    }
  }

  // 5) Top-K
  const top = ranked.slice(0, topK);

  // 6) 统计
  const stats = {
    total: candidates.length,
    ranked: ranked.length,
    eliminated: eliminated.length,
    strong: ranked.filter(r => r.label === DEFAULTS.rankLabels.STRONG).length,
    recommended: ranked.filter(r => r.label === DEFAULTS.rankLabels.RECOMMENDED).length,
    backup: ranked.filter(r => r.label === DEFAULTS.rankLabels.BACKUP).length,
    avgScore: candidates.length > 0
      ? round2(scored.reduce((s, x) => s + x.weighted, 0) / scored.length)
      : 0,
  };

  return {
    ranked: top,
    allRanked: ranked,
    eliminated,
    stats,
    config: { topK, threshold, weights, includeLabels },
  };
}

/**
 * 格式化为 Markdown 报告（借鉴 ARIS `idea-stage/IDEA_REPORT.md` 风格）
 *
 * @param {object} result  discoverIdeas 返回
 * @param {string} [direction]  研究方向（如 "扩展 skill 生态"）
 * @returns {string}
 */
function formatReport(result, direction = '') {
  const lines = [];
  lines.push('# Idea Discovery Report');
  if (direction) lines.push(`**Direction**: ${direction}`);
  lines.push(`**Date**: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Statistics');
  lines.push(`- Total candidates: ${result.stats.total}`);
  lines.push(`- Ranked: ${result.stats.ranked} (Strong=${result.stats.strong}, Recommended=${result.stats.recommended}, Backup=${result.stats.backup})`);
  lines.push(`- Eliminated: ${result.stats.eliminated}`);
  lines.push(`- Average score: ${result.stats.avgScore}`);
  lines.push('');
  lines.push('## Top Ideas');
  lines.push('');
  lines.push('| # | Label | Title | Score | Verdict | N | F | I | C | $ |');
  lines.push('|---|-------|-------|------:|---------|---|---|---|---|---|');
  for (const r of result.ranked) {
    const sc = r.scores;
    lines.push(
      `| ${r.rank} | ${r.label} | ${r.idea.title || r.idea.id} | ${r.weighted} | ${r.verdict} | ${sc.novelty} | ${sc.feasibility} | ${sc.impact} | ${sc.clarity} | ${sc.cost} |`
    );
  }
  if (result.eliminated.length > 0) {
    lines.push('');
    lines.push('## Eliminated');
    for (const e of result.eliminated) {
      lines.push(`- **${e.idea.title || e.idea.id}** (score=${e.weighted}) — ${e.reason || 'low score'}`);
    }
  }
  return lines.join('\n');
}

// ---- helpers ----

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  DEFAULTS,
  scoreIdea,
  discoverIdeas,
  formatReport,
};