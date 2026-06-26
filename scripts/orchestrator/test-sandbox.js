#!/usr/bin/env node
/**
 * test-sandbox.js — sandbox-tool-output.js 测试（M26 · 借鉴 mksglu/context-mode）
 *
 * 测试覆盖：
 *   - shouldSandbox 阈值判断
 *   - sandboxOutput 直通（小输出）
 *   - sandboxOutput 压缩（大输出保留首尾）
 *   - 元信息尾部格式
 *   - 边界：行数 < head+tail
 *   - 边界：非字符串输入
 *   - analyzeReduction 统计
 *   - 真实场景：模拟大 Read 输出
 */

'use strict';

const { shouldSandbox, sandboxOutput, analyzeReduction, DEFAULTS } = require('./sandbox-tool-output');

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

function near(a, b, eps = 1) { return Math.abs(a - b) <= eps; }

console.log('━'.repeat(60));
console.log('🧪 sandbox-tool-output 测试（M26 · v3.0.5）');
console.log('━'.repeat(60));

// ── 1. shouldSandbox 阈值 ──
console.log('\n── 1. shouldSandbox 阈值判断 ──');
check('空字符串不触发', shouldSandbox('') === false);
check('小输出不触发（< 5000）', shouldSandbox('a'.repeat(4999)) === false);
check('临界 5000 不触发', shouldSandbox('a'.repeat(5000)) === false);
check('5001 触发', shouldSandbox('a'.repeat(5001)) === true);
check('大输出（1MB）触发', shouldSandbox('a'.repeat(1024 * 1024)) === true);
check('自定义阈值：100 触发', shouldSandbox('a'.repeat(101), 100) === true);
check('自定义阈值：100 不触发', shouldSandbox('a'.repeat(99), 100) === false);
check('非字符串输入', shouldSandbox(null) === false);
check('非字符串输入（数字）', shouldSandbox(12345) === false);

// ── 2. sandboxOutput 直通 ──
console.log('\n── 2. sandboxOutput 直通（小输出）──');
const small = 'line1\nline2\nline3';
check('小输出直通', sandboxOutput(small) === small);
check('空字符串直通', sandboxOutput('') === '');

// ── 3. sandboxOutput 压缩 ──
console.log('\n── 3. sandboxOutput 压缩（大输出）──');
const bigLines = Array.from({ length: 500 }, (_, i) => `line ${i + 1} content here with some padding to push past threshold`);
const big = bigLines.join('\n');
const result = sandboxOutput(big);

// 大输出应保留 head + tail，省略中间
check('大输出包含 line 1', result.includes('line 1'));
check('大输出包含 line 30', result.includes('line 30 content'));
check('大输出包含 line 500', result.includes('line 500'));
check('大输出不包含 line 250', !result.includes('line 250 content'),
  '应被 sandbox 省略', result.includes('line 250') ? '包含 line 250' : '不包含');
check('大输出包含省略标记', result.includes('sandbox'));
check('大输出包含元信息（保留/省略/原始）',
  result.includes('保留') && result.includes('省略') && result.includes('原始'));

// ── 4. 边界：行数 < head+tail ──
console.log('\n── 4. 边界：行数 < head + tail ──');
const medium = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
const mediumResult = sandboxOutput(medium);
check('行数 50（head=30, tail=30 之和 60）：应保留全部',
  mediumResult.includes('line 0') && mediumResult.includes('line 49'));

// ── 5. 边界：非字符串输入 ──
console.log('\n── 5. 边界：非字符串输入 ──');
check('null 输入返回空字符串', sandboxOutput(null) === '');
check('undefined 输入返回空字符串', sandboxOutput(undefined) === '');
check('数字输入返回空字符串', sandboxOutput(123) === '');

// ── 6. 元信息格式 ──
console.log('\n── 6. 元信息格式 ──');
const metaResult = sandboxOutput(big);
check('元信息包含"保留"', metaResult.includes('保留:'));
check('元信息包含"省略"', metaResult.includes('省略:'));
check('元信息包含"原始"', metaResult.includes('原始:'));
check('元信息包含"节省"', metaResult.includes('节省:'));

// ── 7. analyzeReduction 统计 ──
console.log('\n── 7. analyzeReduction 统计 ──');
const noTrigger = analyzeReduction('small');
check('小输出：triggered=false', noTrigger.triggered === false);
check('小输出：reduction=0%', noTrigger.reductionPct === 0);

const triggered = analyzeReduction(big);
check('大输出：triggered=true', triggered.triggered === true);
check('大输出：reduction > 50%', triggered.reductionPct > 50,
  'reduction > 50%', triggered.reductionPct);
check('大输出：originalChars > 0', triggered.originalChars > 0);
check('大输出：sandboxedChars < originalChars',
  triggered.sandboxedChars < triggered.originalChars);

// ── 8. 真实场景：模拟 Read 大文件 ──
console.log('\n── 8. 真实场景 ──');
const realFileSim = Array.from({ length: 5000 }, (_, i) =>
  `${i.toString().padStart(4, '0')}: 这是第 ${i + 1} 行的内容，包含一些数据`).join('\n');
const realResult = sandboxOutput(realFileSim);
console.log(`   原始字符: ${realFileSim.length.toLocaleString()}`);
console.log(`   sandbox 后: ${realResult.length.toLocaleString()}`);
console.log(`   减少: ${Math.round((1 - realResult.length / realFileSim.length) * 100)}%`);
check('真实场景：输出包含开头', realResult.includes('0001:'));
check('真实场景：输出包含结尾', realResult.includes('4999:'));
check('真实场景：减少 > 70%', realResult.length < realFileSim.length * 0.3);

// ── 9. 默认值导出 ──
console.log('\n── 9. 默认值导出 ──');
check('DEFAULTS.threshold = 5000', DEFAULTS.threshold === 5000);
check('DEFAULTS.headLines = 30', DEFAULTS.headLines === 30);
check('DEFAULTS.tailLines = 30', DEFAULTS.tailLines === 30);

// ── 总结 ──
console.log('\n' + '━'.repeat(60));
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
console.log('━'.repeat(60));

if (fail > 0) {
  console.log('\n❌ 失败项:');
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\n🎉 sandbox-tool-output 全部测试通过');
process.exit(0);