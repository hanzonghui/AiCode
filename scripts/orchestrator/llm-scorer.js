#!/usr/bin/env node
/**
 * Layer 2 LLM 评分（灰区任务用）
 * 输入：用户任务文本 + Layer 1 灰区数据
 * 输出：{ dispatch, agents, scores, reason }
 *
 * 当前实现：基于关键词 + 启发式的"伪 LLM 评分"
 * 真实 LLM 评分可通过 OpenAI API / 本地 Ollama 接入（预留接口）
 */

function llmScore(taskText, grayData) {
  const scores = {
    decomposability: 0,  // 可拆性 0-10
    workload: 0,         // 工作量 0-10
    risk: 0,             // 风险度 0-10
  };
  const reasons = [];

  // === 维度 1: 可拆性 ===
  // 文本里有多个并列对象 → 可拆性高
  const andPatterns = /(和|与|以及|同时|还有|另外)/g;
  const andMatches = (taskText.match(andPatterns) || []).length;
  scores.decomposability = Math.min(10, andMatches * 3 + 2);

  // === 维度 2: 工作量 ===
  // 涉及文件/模块越多，工作量越大
  scores.workload = Math.min(10, grayData.fileCount * 1.5 + grayData.moduleCount * 2);

  // === 维度 3: 风险度 ===
  // 涉及数据库/迁移/生产环境 → 风险高
  if (/数据库|migration|迁移|生产|删除|drop/i.test(taskText)) {
    scores.risk = 8;
    reasons.push('涉及数据库/迁移/生产环境');
  } else if (/重构|优化|整理/i.test(taskText)) {
    scores.risk = 5;
    reasons.push('涉及重构/优化');
  } else {
    scores.risk = 3;
    reasons.push('普通任务');
  }

  // === 综合分（加权平均） ===
  const composite = (
    scores.decomposability * 0.4 +
    scores.workload * 0.4 +
    scores.risk * 0.2
  );

  return {
    scores,
    composite: Math.round(composite * 10) / 10,
    reasons,
  };
}

/**
 * 决策函数：基于 LLM 评分决定是否派 Agent
 */
function decideFromScore(scoreResult, threshold = 6) {
  if (scoreResult.composite >= threshold + 2) {
    return { dispatch: true, agents: 3, reason: `LLM 评分高（${scoreResult.composite}），派 3 个` };
  }
  if (scoreResult.composite >= threshold) {
    return { dispatch: true, agents: 2, reason: `LLM 评分中（${scoreResult.composite}），派 2 个` };
  }
  return { dispatch: false, agents: 0, reason: `LLM 评分低（${scoreResult.composite} < ${threshold}），不派` };
}

// CLI 入口
if (require.main === module) {
  const taskText = process.argv.slice(2).join(' ');
  if (!taskText) {
    console.error('用法: node llm-scorer.js "<任务>"');
    process.exit(1);
  }

  const grayData = { fileCount: 1, moduleCount: 1, taskType: 'unknown' };
  const score = llmScore(taskText, grayData);
  const decision = decideFromScore(score);

  console.log(JSON.stringify({
    ...score,
    decision,
    note: '当前是伪 LLM 评分（启发式），真实 LLM 接入预留',
  }, null, 2));
}

module.exports = { llmScore, decideFromScore };