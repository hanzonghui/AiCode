#!/usr/bin/env node
/**
 * 智能调度 v1.2 统一入口
 * 串联 4 个工具：dispatcher → token-monitor 日志 → learn-rules 反馈队列
 *
 * 用法：
 *   const { dispatch } = require('./index');
 *   const result = dispatch('全面排查 BUG');
 *
 *   # CLI
 *   node index.js "全面排查点餐系统 BUG"
 *
 * @since v1.2.0 (2026-06-22) 批次 2:
 *   - 4 工具统一入口
 *   - 自动写入决策日志
 *   - 灰区任务自动入反馈队列
 */

const path = require('path');
const fs = require('fs');
const { decide } = require('./dispatcher');

// 日志路径：复用 token-monitor 同一文件
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dispatch-decisions.log');
const FEEDBACK_FILE = path.join(LOG_DIR, 'feedback.jsonl');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * 写决策日志（追加，JSONL 格式）
 */
function logDecision(prompt, decision) {
  const entry = {
    timestamp: new Date().toISOString(),
    prompt: (prompt || '').substring(0, 100),
    decision,
    source: 'index.js',
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write(`[index] 日志写入失败: ${e.message}\n`);
  }
}

/**
 * 灰区任务自动入反馈队列（让用户标记对错）
 */
function enqueueGrayZone(prompt, decision) {
  if (decision.dispatch !== null) return;  // 非灰区不入队
  const entry = {
    timestamp: new Date().toISOString(),
    prompt: (prompt || '').substring(0, 200),
    decision,
    status: 'pending',  // 用户标记后改 good/bad
  };
  try {
    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write(`[index] 反馈入队失败: ${e.message}\n`);
  }
}

/**
 * 统一调度入口
 * @param {string} prompt 用户任务文本
 * @returns {object} decision（dispatch/agents/reason/confidence 等）
 */
function dispatch(prompt) {
  if (!prompt || prompt.trim().length === 0) {
    return { dispatch: null, reason: '空 prompt', layer: 0 };
  }

  const decision = decide(prompt);

  // 1. 写决策日志
  logDecision(prompt, decision);

  // 2. 灰区自动入反馈队列
  enqueueGrayZone(prompt, decision);

  return decision;
}

// ==================== CLI 入口 ====================

if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ');
  if (!prompt) {
    console.error('用法: node index.js "你的任务描述"');
    process.exit(1);
  }

  const result = dispatch(prompt);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { dispatch, logDecision, enqueueGrayZone };
