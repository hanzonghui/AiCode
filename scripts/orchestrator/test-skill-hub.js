#!/usr/bin/env node
/**
 * test-skill-hub.js — skill-hub 测试（M40 · v3.0.5）
 *
 * 覆盖：
 *   - tokenize
 *   - loadLocalSkills（解析 SKILL_INDEX.md）
 *   - loadInstalledSkills（扫描 .claude/skills/）
 *   - loadRemoteSkills（读 skill-cache.json）
 *   - scoreSkill
 *   - searchSkills / listSkills
 *
 * @since v3.0.5 M40 (2026-06-28)
 */

'use strict';

const {
  tokenize,
  loadLocalSkills,
  loadInstalledSkills,
  loadRemoteSkills,
  scoreSkill,
  searchSkills,
  listSkills,
} = require('./skill-hub');

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

console.log('━'.repeat(60));
console.log('🧪 skill-hub 测试（M40 · v3.0.5 · 借鉴 davepoon/buildwithclaude）');
console.log('━'.repeat(60));

// ── 1. tokenize ──
console.log('\n── 1. tokenize 分词 ──');
const tokens = tokenize('Claude Code skill hub 中文搜索');
check('包含 Claude', tokens.has('claude'));
check('包含 Code', tokens.has('code'));
check('包含 skill', tokens.has('skill'));
check('包含 中文搜索', tokens.has('中文搜索'));
check('空字符串 → 空 set', tokenize('').size === 0);
check('null → 空 set', tokenize(null).size === 0);

// ── 2. loadLocalSkills ──
console.log('\n── 2. loadLocalSkills 本地 skill 索引 ──');
const local = loadLocalSkills();
check('加载数量 > 0', local.length > 0, 'actual: ' + local.length);
check('包含 left-brain', local.some(s => s.name.toLowerCase().includes('left-brain')));
check('包含 audit', local.some(s => s.name.toLowerCase().includes('audit')));
check('包含 autonomous', local.some(s => s.name.toLowerCase().includes('autonomous')));
check('包含 evolve', local.some(s => s.name.toLowerCase().includes('evolve')));
check('每条有 description', local.every(s => !!s.description));
check('每条有 command', local.every(s => !!s.command));
check('来源都是 local', local.every(s => s.source === 'local'));

// ── 3. loadInstalledSkills ──
console.log('\n── 3. loadInstalledSkills 已装 skill ──');
const installed = loadInstalledSkills();
check('加载数量 >= 0', installed.length >= 0, 'actual: ' + installed.length);
check('如果存在，来源都是 installed', installed.every(s => s.source === 'installed'));
check('如果存在，都有 name', installed.every(s => !!s.name));

// ── 4. loadRemoteSkills ──
console.log('\n── 4. loadRemoteSkills 远程缓存 ──');
const remote = loadRemoteSkills();
check('远程加载不报错', Array.isArray(remote));
check('如果有缓存，来源都是 remote', remote.length === 0 || remote.every(s => s.source === 'remote'));

// ── 5. scoreSkill ──
console.log('\n── 5. scoreSkill 相关分 ──');
const skillA = { name: 'left-brain', description: '跨会话记忆', command: 'left-brain.sh', files: '.claude/skills/left-brain/' };
const skillB = { name: 'chart-skill', description: 'chart visualization', command: '', files: '' };
check('记忆 与 left-brain 相关 > 0', scoreSkill('记忆', skillA) > 0);
check('chart 与 chart-skill 相关 > 0', scoreSkill('chart', skillB) > 0);
check('记忆 与 chart-skill 不相关', scoreSkill('记忆', skillB) === 0);
check('空 query 得 0', scoreSkill('', skillA) === 0);

// ── 6. searchSkills ──
console.log('\n── 6. searchSkills 搜索 ──');
const r1 = searchSkills('记忆');
check('返回 hits 数组', Array.isArray(r1.hits));
check('返回 markdown', typeof r1.markdown === 'string' && r1.markdown.length > 0);
check('返回 total', typeof r1.total === 'number' && r1.total >= 0);
check('返回 bySource', typeof r1.bySource === 'object');
check('搜索结果包含 left-brain', r1.hits.some(h => h.name.toLowerCase().includes('left-brain')));
check('topK 限制有效', searchSkills('skill', { topK: 3 }).hits.length <= 3);
check('无 query 时 listSkills 不空', listSkills().hits.length >= local.length);

// ── 7. 排序合理性 ──
console.log('\n── 7. 排序合理性 ──');
const r2 = searchSkills('audit');
if (r2.hits.length >= 2) {
  check('installed/local 在 remote 前', r2.hits[0].source !== 'remote' || r2.hits.every(h => h.source === 'remote'));
}

// ── 8. 边界 ──
console.log('\n── 8. 边界 ──');
check('无意义 query 可能返回空或低分', searchSkills('xyzabc123notexist', { minScore: 0.5 }).hits.length === 0);
check('listSkills 返回总数', listSkills().total >= local.length);

// 总结
console.log('\n' + '━'.repeat(60));
console.log(`📊 总计: ${pass} ✅ / ${fail} ❌`);
console.log('━'.repeat(60));
if (fail > 0) {
  console.log('\n失败清单:');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('\n🎉 全部通过');
  process.exit(0);
}
