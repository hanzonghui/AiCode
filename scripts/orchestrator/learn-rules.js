#!/usr/bin/env node
/**
 * 规则学习：从用户反馈中提取误判案例，更新规则
 *
 * 工作流：
 * 1. 用户标记"这个决策错了"（自动或手动）
 * 2. 记录：prompt + 错误决策 + 用户期望 + 修正规则
 * 3. 汇总到 feedback.jsonl
 * 4. 定期跑 learn-rules.js 分析规律 + 建议规则更新
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FEEDBACK_FILE = path.join(__dirname, '..', 'logs', 'feedback.jsonl');

// v1.2: prompt hash 去重（同一 prompt 不重复记录）
function promptHash(prompt) {
  return crypto.createHash('sha1').update((prompt || '').trim()).digest('hex').slice(0, 12);
}

function hasFeedback(prompt) {
  if (!fs.existsSync(FEEDBACK_FILE)) return false;
  const hash = promptHash(prompt);
  const lines = fs.readFileSync(FEEDBACK_FILE, 'utf8').split('\n');
  for (const line of lines) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.promptHash === hash) return true;
    } catch { /* skip malformed line */ }
  }
  return false;
}

function recordFeedback(entry) {
  const logDir = path.dirname(FEEDBACK_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  // v1.2: 去重检查
  const hash = promptHash(entry.prompt);
  if (hasFeedback(entry.prompt)) {
    console.log(`⏭️  重复反馈已跳过: ${entry.prompt?.substring(0, 50)} (hash=${hash})`);
    return false;
  }

  const full = {
    timestamp: new Date().toISOString(),
    promptHash: hash,
    ...entry,
  };
  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(full) + '\n');
  console.log('✅ 反馈已记录:', full.prompt?.substring(0, 50));
  return true;
}

function loadFeedback() {
  if (!fs.existsSync(FEEDBACK_FILE)) return [];
  const lines = fs.readFileSync(FEEDBACK_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function analyzePatterns() {
  const feedbacks = loadFeedback();
  if (feedbacks.length === 0) {
    console.log('暂无反馈数据');
    return;
  }

  console.log(`\n========================================`);
  console.log(`📊 反馈分析（共 ${feedbacks.length} 条）`);
  console.log(`========================================\n`);

  // 按决策类型分组
  const groups = {};
  for (const fb of feedbacks) {
    const key = `${fb.expected ? '应该派' : '不该派'}_实际${fb.actual ? '派' : '没派'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(fb);
  }

  for (const [key, items] of Object.entries(groups)) {
    console.log(`\n[${key}] (${items.length} 条)`);
    for (const item of items) {
      console.log(`  - ${item.prompt?.substring(0, 60)}`);
      console.log(`    建议: ${item.suggestedRule || '未提供'}`);
    }
  }

  // 提取高频关键词
  const keywordCounts = {};
  for (const fb of feedbacks) {
    if (!fb.suggestedKeyword) continue;
    keywordCounts[fb.suggestedKeyword] = (keywordCounts[fb.suggestedKeyword] || 0) + 1;
  }

  if (Object.keys(keywordCounts).length > 0) {
    console.log(`\n🔥 高频建议关键词:`);
    for (const [kw, count] of Object.entries(keywordCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  - "${kw}": ${count} 次`);
    }
  }
}

// CLI 入口
const cmd = process.argv[2];

if (cmd === 'record') {
  // 简化调用：node learn-rules.js record "<prompt>" <expected_dispatch>
  const prompt = process.argv[3];
  const expected = process.argv[4] === 'true';
  const suggested = process.argv[5];

  recordFeedback({
    prompt,
    actual: null,  // 实际决策由 dispatcher 给出（这里不查）
    expected,
    suggestedKeyword: suggested,
    note: 'manual feedback',
  });
} else if (cmd === 'analyze') {
  analyzePatterns();
} else if (cmd === 'reset') {
  if (fs.existsSync(FEEDBACK_FILE)) fs.unlinkSync(FEEDBACK_FILE);
  console.log('✅ 反馈数据已重置');
} else if (cmd === 'bad' || cmd === 'good') {
  // v1.2 简化命令：用户最常用的反馈入口
  // bad: 用户认为应该派但没派（或派少了）
  // good: 用户认为不应该派但派了（或派多了）
  const prompt = process.argv[3];
  const keyword = process.argv[4];
  if (!prompt) {
    console.error('用法: node learn-rules.js bad|good "<prompt>" "[关键词]"');
    process.exit(1);
  }
  recordFeedback({
    prompt,
    actual: null,
    expected: cmd === 'bad' ? true : false,  // bad=应该派, good=不应该派
    suggestedKeyword: keyword,
    note: `${cmd} feedback (v1.2 简化命令)`,
  });
} else {
  console.log('用法:');
  console.log('  node learn-rules.js record "<prompt>" <true|false> "[建议关键词]"');
  console.log('  node learn-rules.js bad "<prompt>" "[关键词]"   ← 应该派但没派');
  console.log('  node learn-rules.js good "<prompt>" "[关键词]" ← 不该派但派了');
  console.log('  node learn-rules.js analyze');
  console.log('  node learn-rules.js reset');
}

module.exports = { recordFeedback, analyzePatterns };