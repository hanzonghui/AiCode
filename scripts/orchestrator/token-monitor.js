#!/usr/bin/env node
/**
 * Token 成本监控
 * 跑 N 次 dispatcher 后，统计决策分布 + 估算成本
 */

const fs = require('fs');
const path = require('path');
const { decide } = require('./dispatcher');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dispatch-decisions.log');

// 确保日志目录
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logDecision(prompt, decision) {
  const entry = {
    timestamp: new Date().toISOString(),
    prompt: prompt.substring(0, 100),  // 截断避免日志过大
    decision,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

function loadStats() {
  if (!fs.existsSync(LOG_FILE)) {
    return { total: 0, dispatched: 0, agentsTotal: 0 };
  }
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  let total = 0, dispatched = 0, agentsTotal = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      total++;
      if (entry.decision?.dispatch === true) {
        dispatched++;
        agentsTotal += entry.decision.agents || 0;
      }
    } catch {}
  }
  return { total, dispatched, agentsTotal };
}

function showStats() {
  const stats = loadStats();
  const dispatchRate = stats.total > 0 ? (stats.dispatched / stats.total * 100).toFixed(1) : 0;
  const avgAgents = stats.dispatched > 0 ? (stats.agentsTotal / stats.dispatched).toFixed(2) : 0;

  // 估算成本（每个 Agent 独立 context，约 5-10k Token）
  const estimatedCostPerAgent = 8000;
  const totalTokens = stats.agentsTotal * estimatedCostPerAgent;
  const totalCNY = (totalTokens / 1000 * 0.01).toFixed(2);  // 假设 ¥0.01/1k tokens

  console.log('\n========================================');
  console.log('📊 智能调度模块成本统计');
  console.log('========================================\n');
  console.log(`总决策次数:    ${stats.total}`);
  console.log(`派 Agent 次数:  ${stats.dispatched} (${dispatchRate}%)`);
  console.log(`不派次数:      ${stats.total - stats.dispatched}`);
  console.log(`平均 Agent 数: ${avgAgents}`);
  console.log(`\n成本估算:`);
  console.log(`  累计 Agent 调用: ${stats.agentsTotal}`);
  console.log(`  估算 Token:     ~${totalTokens.toLocaleString()}`);
  console.log(`  估算费用:       ~¥${totalCNY}`);
  console.log(`\n日志文件: ${LOG_FILE}`);
  console.log('========================================\n');
}

// CLI 入口
const cmd = process.argv[2];
if (cmd === 'stats') {
  showStats();
} else if (cmd === 'log') {
  const prompt = process.argv.slice(2).join(' ');
  const decision = decide(prompt);
  logDecision(prompt, decision);
  console.log(JSON.stringify(decision, null, 2));
} else if (cmd === 'reset') {
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
  console.log('✅ 日志已重置');
} else {
  console.log('用法:');
  console.log('  node token-monitor.js stats          # 看统计');
  console.log('  node token-monitor.js log "<任务>"   # 记录决策');
  console.log('  node token-monitor.js reset          # 清空日志');
}

module.exports = { logDecision, loadStats };