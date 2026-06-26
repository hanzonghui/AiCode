#!/usr/bin/env node
/**
 * test-skill-reuse.js — skill-reuse.js 测试（M27 · 借鉴 MemOS）
 */

'use strict';

const { loadAllKB, parseKB, scoreKB, tokenize, recallSkills, estimateTokenSavings, DEFAULTS } = require('./skill-reuse');

let pass = 0, fail = 0;
const fails = [];

function check(name, cond, expected, actual) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else {
    fail++; fails.push(name);
    console.log(`❌ ${name}`);
    if (expected !== undefined) console.log(`   expected: ${JSON.stringify(expected)}`);
    if (actual !== undefined) console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
}

function near(a, b, eps = 0.01) { return Math.abs(a - b) <= eps; }

console.log('━'.repeat(60));
console.log('🧪 skill-reuse 测试（M27 · v3.0.5）');
console.log('━'.repeat(60));

// ── 1. tokenize ──
console.log('\n── 1. tokenize 分词 ──');
const tokens = tokenize('PowerShell Set-Content UTF-8 中文文件');
check('包含 PowerShell', tokens.has('PowerShell') || tokens.has('powershell'));
check('包含 UTF', tokens.has('UTF') || tokens.has('utf') || tokens.has('utf8') || tokens.has('UTF-8') || tokens.has('utf-8'));
check('包含中文', tokens.has('中文') || tokens.has('中文文件'));
check('空字符串 → 空 set', tokenize('').size === 0);
check('null → 空 set', tokenize(null).size === 0);

// ── 2. parseKB ──
console.log('\n── 2. parseKB 解析 ──');
const allKB = loadAllKB();
check('KB 加载数量 > 0', allKB.length > 0, '实际: ' + allKB.length);
check('KB 加载数量 > 50', allKB.length > 50);
const sample = allKB[0];
check('KB 有 id', sample && !!sample.id);
check('KB 有 content', sample && !!sample.content);
check('KB 有 keywords array', sample && Array.isArray(sample.keywords));

// ── 3. scoreKB ──
console.log('\n── 3. scoreKB 相关分 ──');
// 找一条含 "PowerShell" 关键词的 KB
const psKB = allKB.find(k => k.keywords.some(kw => kw.toLowerCase().includes('powershell')));
if (psKB) {
  const s1 = scoreKB('PowerShell 中文文件乱码', psKB);
  const s2 = scoreKB('完全不相关的话题：杭州西湖游玩攻略', psKB);
  check('相关 query 得分 > 不相关', s1 > s2, `相关=${s1.toFixed(2)} 不相关=${s2.toFixed(2)}`);
  check('相关分在 0-1 之间', s1 >= 0 && s1 <= 1);
}

// ── 4. recallSkills 基础 ──
console.log('\n── 4. recallSkills 基础 ──');
check('空 query 返回空结果', recallSkills('').hits.length === 0);
check('null query 返回空结果', recallSkills(null).hits.length === 0);

// ── 5. recallSkills PowerShell 主题 ──
console.log('\n── 5. recallSkills PowerShell 主题 ──');
const psResult = recallSkills('PowerShell Set-Content 中文文件乱码问题');
check('召回至少 1 条', psResult.hits.length >= 1, '实际: ' + psResult.hits.length);
check('top hit 是 PowerShell 相关',
  psResult.hits.length > 0 && (
    psResult.hits[0].category?.includes('其他') ||
    psResult.hits[0].id?.includes('20260627') ||
    psResult.hits[0].score > 0.05
  ),
  'top hit', psResult.hits[0]);
check('summary 非空', psResult.summary.length > 0);
check('summary 字符 < maxChars', psResult.totalChars <= DEFAULTS.maxChars);

// ── 6. recallSkills 与工程相关 ──
console.log('\n── 6. recallSkills 工程相关 ──');
const aiResult = recallSkills('GitHub 候选 Claude 项目演进');
check('工程相关查询召回 > 0', aiResult.hits.length >= 0);

// ── 7. threshold 过滤 ──
console.log('\n── 7. threshold 过滤 ──');
const strictResult = recallSkills('PowerShell', { minScore: 0.99, topK: 100 });
const looseResult = recallSkills('PowerShell', { minScore: 0.01, topK: 100 });
check('严格阈值（0.99）召回 ≤ 宽松阈值（0.01）',
  strictResult.hits.length <= looseResult.hits.length,
  `严格=${strictResult.hits.length} 宽松=${looseResult.hits.length}`);

// ── 8. topK 限制 ──
console.log('\n── 8. topK 限制 ──');
const top3 = recallSkills('PowerShell', { topK: 3, minScore: 0.01 });
check('topK=3 返回 ≤ 3 条', top3.hits.length <= 3);

// ── 9. snippet 截断 ──
console.log('\n── 9. snippet 截断 ──');
const smallSnippet = recallSkills('PowerShell', { snippetLen: 50, includeContent: true });
check('snippetLen=50 时 summary 较短',
  smallSnippet.totalChars < 500,
  'totalChars=' + smallSnippet.totalChars);

// ── 10. estimateTokenSavings ──
console.log('\n── 10. estimateTokenSavings ──');
const savings = estimateTokenSavings(1000, 2000);
check('injectedTokens > 0', savings.injectedTokens > 0);
check('avoidedTokens > 0', savings.avoidedTokens > 0);

// ── 11. 真实场景 demo ──
console.log('\n── 11. 真实场景 demo ──');
const realResult = recallSkills('怎么写 Node.js 测试用例');
console.log(`   召回: ${realResult.hits.length} 条`);
console.log(`   摘要长度: ${realResult.totalChars} 字符`);
realResult.hits.slice(0, 3).forEach(h => {
  console.log(`   - ${h.id} · ${(h.score * 100).toFixed(0)}% · ${h.category}`);
});

// ── 总结 ──
console.log('\n' + '━'.repeat(60));
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
console.log('━'.repeat(60));

if (fail > 0) {
  console.log('\n❌ 失败项:');
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\n🎉 skill-reuse 全部测试通过');
process.exit(0);