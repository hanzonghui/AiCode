#!/usr/bin/env node
/**
 * sandbox-tool-output.js — 大输出摘要压缩（M26 · 借鉴 mksglu/context-mode）
 *
 * 痛点：Claude Code 工具输出（Read 大文件 / Bash 长命令 / Grep 大量匹配）
 *       经常塞满上下文窗口，导致 token 超限、费用高、注意力分散。
 *
 * 借鉴思路（context-mode 核心能力之一）：
 *   - sandbox 工具输出（98% reduction）
 *   - 大输出 → 摘要压缩（保留首尾 + 关键行）
 *   - 保留元数据（总行数 / 总字符数 / 省略区间）
 *
 * 本实现（M26 POC）：
 *   - 不接 hook（避免误伤）
 *   - 提供 shouldSandbox(size) + sandboxOutput(text, opts) 两个纯函数
 *   - 算法：headLines + tailLines + 中间省略 + 元信息尾部
 *   - 默认阈值：> 5000 字符触发；保留首 30 + 末 30 行
 *
 * @since v3.0.5 M26 (2026-06-27)
 * @source https://github.com/mksglu/context-mode
 * @see .claude/skills/evolve/SKILL.md §借鉴评估
 */

'use strict';

const DEFAULTS = {
  threshold: 5000,         // 超过这个字符数触发 sandbox
  headLines: 30,           // 保留头部行数
  tailLines: 30,           // 保留尾部行数
  marker: '\n... [sandbox] ...\n', // 中间省略标记
  metaSuffix: true,        // 是否在末尾追加元信息
};

/**
 * 判断是否需要 sandbox
 * @param {string} text
 * @param {number} [threshold]
 * @returns {boolean}
 */
function shouldSandbox(text, threshold = DEFAULTS.threshold) {
  if (typeof text !== 'string') return false;
  return text.length > threshold;
}

/**
 * sandbox 大输出：保留首 N 行 + 末 N 行 + 中间省略标记 + 元信息
 * @param {string} text
 * @param {object} [opts] { threshold, headLines, tailLines, marker, metaSuffix }
 * @returns {string}
 */
function sandboxOutput(text, opts = {}) {
  if (typeof text !== 'string') return '';

  const o = { ...DEFAULTS, ...opts };

  // 小输出直通
  if (!shouldSandbox(text, o.threshold)) return text;

  const lines = text.split('\n');
  const totalLines = lines.length;
  const totalChars = text.length;

  // 行数太少：保留全部
  if (totalLines <= o.headLines + o.tailLines) {
    if (o.metaSuffix) {
      return text + formatMeta(totalLines, totalLines, 0, totalChars);
    }
    return text;
  }

  const head = lines.slice(0, o.headLines);
  const tail = lines.slice(-o.tailLines);
  const omittedLines = totalLines - o.headLines - o.tailLines;

  const parts = [];
  parts.push(head.join('\n'));
  parts.push(o.marker.trim());
  parts.push(tail.join('\n'));

  if (o.metaSuffix) {
    parts.push(formatMeta(o.headLines, o.tailLines, totalLines, omittedLines, totalChars));
  }

  return parts.join('\n');
}

/**
 * 格式化元信息（附在 sandbox 输出末尾）
 */
function formatMeta(keptHead, keptTail, totalLines, omittedLines, totalChars) {
  const savedChars = Math.max(0, totalChars - estimateSandboxedSize(totalLines, totalChars));
  return [
    '',
    '── sandbox 元信息 ──',
    `保留: ${keptHead} 头 + ${keptTail} 尾 = ${keptHead + keptTail} 行`,
    `省略: ${omittedLines} 行`,
    `原始: ${totalLines} 行 / ${totalChars.toLocaleString()} 字符`,
    `节省: ~${savedChars.toLocaleString()} 字符（${Math.min(99, Math.round(savedChars / totalChars * 100))}%）`,
  ].join('\n');
}

/**
 * 估算 sandbox 后大小（head + tail + 元信息）
 */
function estimateSandboxedSize(totalLines, totalChars) {
  // 实际平均行字符数
  const avgLineChars = totalChars / totalLines;
  // 保留 60 行 + 元信息 ~300 字符
  return Math.round(avgLineChars * 60 + 300);
}

/**
 * 批量处理：分析 sandbox 效果（不修改，只统计）
 */
function analyzeReduction(originalText, opts = {}) {
  if (!shouldSandbox(originalText, opts.threshold || DEFAULTS.threshold)) {
    return {
      triggered: false,
      originalChars: originalText.length,
      sandboxedChars: originalText.length,
      reductionPct: 0,
    };
  }

  const sandboxed = sandboxOutput(originalText, opts);
  const origChars = originalText.length;
  const newChars = sandboxed.length;
  return {
    triggered: true,
    originalChars: origChars,
    sandboxedChars: newChars,
    reductionPct: Math.round((1 - newChars / origChars) * 100),
  };
}

module.exports = {
  DEFAULTS,
  shouldSandbox,
  sandboxOutput,
  analyzeReduction,
  formatMeta,
};

// ── CLI 演示 ─────────────────────────────────────────

if (require.main === module) {
  const fs = require('fs');
  const arg = process.argv[2];
  if (!arg) {
    console.log('用法:');
    console.log('  node sandbox-tool-output.js <file>     # sandbox 一个文件');
    console.log('  node sandbox-tool-output.js --analyze <file>  # 只分析不 sandbox');
    process.exit(0);
  }

  if (arg === '--analyze') {
    const file = process.argv[3];
    if (!file || !fs.existsSync(file)) {
      console.error(`❌ 文件不存在: ${file}`);
      process.exit(1);
    }
    const content = fs.readFileSync(file, 'utf8');
    const result = analyzeReduction(content);
    console.log('📊 Sandbox 分析:');
    console.log(`   触发: ${result.triggered ? '✅ 是' : '❌ 否'}`);
    console.log(`   原始: ${result.originalChars.toLocaleString()} 字符`);
    console.log(`   Sandbox 后: ${result.sandboxedChars.toLocaleString()} 字符`);
    console.log(`   减少: ${result.reductionPct}%`);
    process.exit(0);
  }

  const content = fs.readFileSync(arg, 'utf8');
  console.log(sandboxOutput(content));
}