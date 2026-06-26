#!/usr/bin/env node
/**
 * skill-reuse.js — 任务前自动 recall 类似经验（M27 · 借鉴 MemTensor/MemOS）
 *
 * 痛点：用户给新任务时，Claude 经常"重新发现"之前已经踩过的坑 / 重新思考类似的方案，
 *       浪费 token + 重复劳动。MemOS 论文宣称"35.24% token savings"通过 cross-task skill reuse。
 *
 * 借鉴思路（MemOS 核心能力之一）：
 *   - 在任务开始前自动 recall KB 中"类似任务历史经验"
 *   - 按相关性剪裁（Top-K + 阈值）注入上下文
 *   - 节省 token：避免 Claude 重复解释背景知识
 *
 * 本实现（M27 POC）：
 *   - 纯函数 + 离线模式（不接 hook，避免误注入）
 *   - 复用现有 KB 结构（.claude/skills/left-brain/memory/knowledge/KB-*.md）
 *   - 简单 TF-IDF 评分（按关键词重叠数）
 *   - 输出 Markdown 片段（可直接粘到 prompt 或 commit msg）
 *
 * @since v3.0.5 M27 (2026-06-27)
 * @source https://github.com/MemTensor/MemOS · 借鉴评估 7.95/10
 */

'use strict';

const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'knowledge');

const DEFAULTS = {
  topK: 5,                  // 返回最相关 K 条
  minScore: 0.05,           // 最低相关分（0-1），Jaccard 在小 KB 上偏低
  maxChars: 3000,           // 输出总字符上限（防止注入过多）
  includeContent: true,     // 是否包含 KB content
  snippetLen: 200,          // 单条 KB 截断长度
};

/**
 * 加载所有 KB
 * @returns {Array<{id, content, keywords, category, score}>}
 */
function loadAllKB() {
  if (!fs.existsSync(KB_DIR)) return [];
  const files = fs.readdirSync(KB_DIR).filter(f => f.startsWith('KB-') && f.endsWith('.md'));
  return files.map(f => parseKB(path.join(KB_DIR, f))).filter(Boolean);
}

/**
 * 解析单个 KB 文件
 * @param {string} file
 * @returns {object|null}
 */
function parseKB(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    // 提取 frontmatter
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return null;
    const fm = match[1];

    const get = (key) => {
      const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };

    // 提取正文（frontmatter 后的第一段）
    const body = raw.split('---').slice(2).join('---').trim();

    return {
      id: get('id'),
      content: get('content') || body,
      category: get('category'),
      keywords: parseKeywords(get('keywords')),
      source: get('source'),
      confidence: parseFloat(get('confidence') || '0'),
      body: body.slice(0, 500),
      file,
    };
  } catch (e) {
    return null;
  }
}

/**
 * 解析 keywords 数组字符串：[a, b, c] → ['a', 'b', 'c']
 */
function parseKeywords(str) {
  if (!str) return [];
  const m = str.match(/\[(.*?)\]/);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 计算 query 与 KB 的相关分（0-1）
 * 算法：query 关键词 ∩ KB 关键词 / query 关键词 ∪ KB 关键词（Jaccard 简化）
 * @param {string} query 用户任务描述
 * @param {object} kb
 * @returns {number}
 */
function scoreKB(query, kb) {
  const qTokens = tokenize(query);
  const kTokens = new Set([...kb.keywords, ...tokenize(kb.content)]);

  if (qTokens.size === 0 || kTokens.size === 0) return 0;

  let intersection = 0;
  qTokens.forEach(t => { if (kTokens.has(t)) intersection++; });

  const union = qTokens.size + kTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 分词：中文（2+ 字）/ 英文（2+ 字母）/ 数字
 */
function tokenize(text) {
  if (!text) return new Set();
  const tokens = new Set();
  // 中文：2+ 字
  const cnMatches = text.match(/[一-龥]{2,}/g) || [];
  cnMatches.forEach(m => tokens.add(m));
  // 英文：2+ 字母
  const enMatches = text.match(/[a-zA-Z]{2,}/g) || [];
  enMatches.forEach(m => tokens.add(m.toLowerCase()));
  // 数字：2+ 位
  const numMatches = text.match(/\d{2,}/g) || [];
  numMatches.forEach(m => tokens.add(m));
  return tokens;
}

/**
 * 主函数：recall 类似任务经验
 * @param {string} query 用户任务描述
 * @param {object} [opts]
 * @returns {{hits: Array, totalChars: number, summary: string}}
 */
function recallSkills(query, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!query || typeof query !== 'string') return { hits: [], totalChars: 0, summary: '' };

  const allKB = loadAllKB();
  const scored = allKB
    .map(kb => ({ kb, score: scoreKB(query, kb) }))
    .filter(s => s.score >= o.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, o.topK);

  // 拼装 Markdown
  const parts = [];
  parts.push(`## 🧠 自动召回的经验（${scored.length} 条 · 相关度 ≥ ${o.minScore}）`);
  parts.push('');
  let totalChars = parts.join('\n').length;

  for (const { kb, score } of scored) {
    if (totalChars >= o.maxChars) break;

    const header = `### ${kb.id} · 相关度 ${(score * 100).toFixed(0)}% · ${kb.category || '其他'}`;
    const snippet = (o.includeContent ? kb.content : kb.body).slice(0, o.snippetLen);

    const block = `${header}\n${snippet}${snippet.length >= o.snippetLen ? '...' : ''}`;
    parts.push(block);
    parts.push('');
    totalChars = block.length;
  }

  const summary = parts.join('\n');

  return {
    hits: scored.map(s => ({ id: s.kb.id, score: s.score, category: s.kb.category })),
    totalChars: summary.length,
    summary,
  };
}

/**
 * 估算 token 节省量（粗算：1 token ≈ 4 字符）
 */
function estimateTokenSavings(summaryChars, originalQueryChars) {
  return {
    injectedChars: summaryChars,
    injectedTokens: Math.ceil(summaryChars / 4),
    // 假设回忆注入让 Claude 避免 35% 的"重新解释"（MemOS 论文值）
    avoidedTokens: Math.ceil(originalQueryChars / 4 * 0.35),
    savedTokens: Math.ceil(originalQueryChars / 4 * 0.35 - summaryChars / 4),
  };
}

module.exports = {
  DEFAULTS,
  loadAllKB,
  parseKB,
  scoreKB,
  tokenize,
  recallSkills,
  estimateTokenSavings,
};

// ── CLI 演示 ─────────────────────────────────────────

if (require.main === module) {
  const query = process.argv[2];
  if (!query) {
    console.log('用法:');
    console.log('  node skill-reuse.js "<任务描述>"     # recall 类似经验');
    console.log('  node skill-reuse.js --stats          # KB 统计');
    process.exit(0);
  }

  if (query === '--stats') {
    const all = loadAllKB();
    console.log(`📊 KB 统计:`);
    console.log(`   总数: ${all.length}`);
    const cats = {};
    all.forEach(k => { cats[k.category || '其他'] = (cats[k.category || '其他'] || 0) + 1; });
    console.log(`   按分类:`);
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`     - ${c}: ${n}`));
    process.exit(0);
  }

  const result = recallSkills(query);
  console.log(`\n${result.summary}`);
  console.log(`\n📊 召回: ${result.hits.length} 条 / 注入 ${result.totalChars} 字符`);
  const savings = estimateTokenSavings(result.totalChars, query.length);
  console.log(`   注入 token: ${savings.injectedTokens}`);
  console.log(`   节省估算: ${savings.avoidedTokens} - ${savings.injectedTokens} = ${Math.max(0, savings.savedTokens)} token（按 35% 节省率）`);
}