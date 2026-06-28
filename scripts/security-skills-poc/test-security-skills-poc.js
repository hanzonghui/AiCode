#!/usr/bin/env node
/**
 * test-security-skills-poc.js — M41 security-skills POC 测试
 *
 * 覆盖：
 *   - 安全过滤（白名单/黑名单/默认拒绝）
 *   - frontmatter 解析
 *   - skill 适配 + prompt 块生成
 *   - 工具函数
 */

'use strict';

const fs = require('fs');
const path = require('path');

const adapter = require('./security-skills-adapter');

// ── 简易测试框架 ──────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) {
    throw new Error(`${msg || 'assertTrue'}: expected true, got ${JSON.stringify(value)}`);
  }
}

function assertArrayContains(arr, item, msg) {
  if (!arr.includes(item)) {
    throw new Error(`${msg || 'assertArrayContains'}: expected array to contain ${JSON.stringify(item)}`);
  }
}

// ── 测试用例 ──────────────────────────────────────────

console.log('\n🧪 Security Skills POC Tests\n');

test('filterSkill 允许防御性 skill', () => {
  const result = adapter.filterSkill({
    name: 'acquiring-disk-image-with-dd-and-dcfldd',
    description: 'Create forensically sound bit-for-bit disk images',
    tags: ['forensics', 'disk-imaging'],
  });
  assertTrue(result.allowed, 'should allow defensive skill');
  assertEqual(result.reason, 'defensive content allowed');
});

test('filterSkill 拒绝主动攻击 skill', () => {
  const result = adapter.filterSkill({
    name: 'abusing-dpapi-for-credential-access',
    description: 'Extract DPAPI-protected secrets such as credentials',
    tags: ['credential-access'],
  });
  assertTrue(!result.allowed, 'should reject offensive skill');
  assertEqual(result.reason, 'offensive content filtered');
});

test('filterSkill 默认拒绝未知 skill', () => {
  const result = adapter.filterSkill({
    name: 'some-random-skill',
    description: 'does something unspecified',
    tags: [],
  });
  assertTrue(!result.allowed, 'should deny unknown skill');
});

test('parseSkillMarkdown 解析 frontmatter', () => {
  const raw = `---
name: test-skill
description: A test skill
nist_csf:
- RS.AN-01
- RS.MA-01
mitre_attack:
- T1006
---

# Body
Some content.
`;
  const { meta, body } = adapter.parseSkillMarkdown(raw);
  assertEqual(meta.name, 'test-skill');
  assertEqual(meta.description, 'A test skill');
  assertArrayContains(meta.nist_csf, 'RS.AN-01');
  assertArrayContains(meta.mitre_attack, 'T1006');
  assertTrue(body.includes('Some content.'));
});

test('parseSkillMarkdown 容错无 frontmatter', () => {
  const raw = '# Just body';
  const { meta, body } = adapter.parseSkillMarkdown(raw);
  assertEqual(Object.keys(meta).length, 0);
  assertTrue(body.includes('Just body'));
});

test('adaptSkill 生成 AiCode 格式', () => {
  const raw = `---
name: acquiring-disk-image-with-dd-and-dcfldd
description: Create forensically sound bit-for-bit disk images
nist_csf:
- RS.AN-01
mitre_attack:
- T1006
---

# Disk Image Acquisition
Use dd/dcfldd.
`;
  const skill = {
    name: 'acquiring-disk-image-with-dd-and-dcfldd',
    description: 'Create forensically sound bit-for-bit disk images',
    path: 'skills/acquiring-disk-image-with-dd-and-dcfldd',
  };
  const adapted = adapter.adaptSkill(skill, raw);
  assertEqual(adapted.id, 'security-acquiring-disk-image-with-dd-and-dcfldd');
  assertTrue(adapted.frameworks.length === 2, 'should have 2 frameworks');
  assertTrue(adapted.body.includes('Use dd/dcfldd'));
});

test('formatPromptBlock 包含框架映射', () => {
  const raw = `---
name: test-skill
description: Test
nist_csf:
- RS.AN-01
---

Body.
`;
  const skill = { name: 'test-skill', description: 'Test', path: 'skills/test-skill' };
  const adapted = adapter.adaptSkill(skill, raw);
  const block = adapter.formatPromptBlock(adapted);
  assertTrue(block.includes('NIST CSF'));
  assertTrue(block.includes('RS.AN-01'));
  assertTrue(block.includes('Body.'));
});

test('matchesAny 子串匹配', () => {
  assertTrue(adapter.matchesAny('Disk forensic imaging', ['forensic']));
  assertTrue(!adapter.matchesAny('Disk imaging', ['forensic']));
});

// ── 汇总 ──────────────────────────────────────────────

console.log('\n' + '─'.repeat(40));
console.log(`结果: ${passed} 通过 / ${failed} 失败`);
console.log('─'.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
