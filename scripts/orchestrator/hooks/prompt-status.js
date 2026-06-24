#!/usr/bin/env node
/**
 * prompt-status.js — UserPromptSubmit 轻量钩子
 *
 * 作用：每次用户输入时，快速 echo 当前自主模式状态 + 关键提示
 * 目的：让 v2.1.x 启动后用户能直接看到顶部状态（不依赖 SessionStart 输出）
 *
 * 设计原则：
 *   - 极快（< 100ms，不调重逻辑）
 *   - 永不 throw
 *   - stdout 输出会被 Claude Code 注入到 Claude 上下文（用户能间接看到）
 *
 * @since v2.0.0 (2026-06-24)
 */

const path = require('path');
const { formatStatusLine } = require('../autonomous');

try {
  // 当前自主模式状态
  const line = formatStatusLine();

  // 简化版（避免太长干扰上下文）
  const compact = line.includes('ON')
    ? '🤖 自主模式: ON（用户离开中，Claude 自主决策）'
    : '🙋 正常模式: OFF';

  // 关键提示
  const hint = line.includes('ON')
    ? '\n💡 自主模式已开：直接说方向，Claude 自己选下一个增量做'
    : '\n💡 切换自主模式：/autonomous "我离开1小时"';

  console.log(compact + hint);
} catch (e) {
  // 兜底
  console.log('⚠️ 状态钩子异常（已忽略）');
}

process.exit(0);