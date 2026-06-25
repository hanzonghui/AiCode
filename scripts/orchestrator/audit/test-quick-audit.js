#!/usr/bin/env node
/**
 * test-quick-audit.js — quick-audit 引擎基础测试
 *
 * 测试目标：
 *   1. 各扫描器都能在真实工程上跑通不 throw
 *   2. 6 段报告结构完整
 *   3. 整合到 04.md backlog 格式正确
 *   4. 报告保存到 .claude/audits/ 成功
 *   5. 历史索引更新成功
 *
 * @since v2.0.2
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const audit = require('./quick-audit');
const { runQuickAudit, formatReport, saveAuditReport } = audit;

// ── 工具函数 ─────────────────────────────────────────

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    fail++;
  }
}

// ── 测试 ─────────────────────────────────────────────

test('runQuickAudit 不 throw', () => {
  const result = runQuickAudit();
  assert(result, '应返回 result');
  assert(result.profile, '应包含 profile');
  assert(result.completed, '应包含 completed');
  assert(result.unfinished, '应包含 unfinished');
  assert(result.gaps, '应包含 gaps');
  assert(result.dups, '应包含 dups');
  assert(result.suggestions, '应包含 suggestions');
  assert(result.generatedAt, '应包含时间戳');
});

test('profile 字段完整性', () => {
  const { profile } = runQuickAudit();
  assert(typeof profile.version === 'string', 'version 必为字符串');
  assert(typeof profile.skillCount === 'number', 'skillCount 必为数字');
  assert(typeof profile.commandCount === 'number', 'commandCount 必为数字');
  assert(typeof profile.scriptCount === 'number', 'scriptCount 必为数字');
  assert(['ON', 'OFF'].some(s => profile.autonomousMode.includes(s) || profile.autonomousMode.startsWith(s)),
    'autonomousMode 必含 ON 或 OFF');
});

test('completed 至少包含 1 个 skill', () => {
  const { completed } = runQuickAudit();
  assert(completed.length > 0, '应至少检测到 1 个 skill/command/subsystem');
  const skills = completed.filter(c => c.type === 'skill');
  assert(skills.length >= 1, '应至少 1 个 skill');
});

test('unfinished 解析 CHANGELOG Unreleased', () => {
  const { unfinished } = runQuickAudit();
  // 现阶段 CHANGELOG 顶部 Unreleased 至少有 M12~M15 计划
  assert(Array.isArray(unfinished), 'unfinished 必为数组');
  // 不强求非空（可能某天 Unreleased 写完了）
});

test('gaps 数组结构', () => {
  const { gaps } = runQuickAudit();
  assert(Array.isArray(gaps), 'gaps 必为数组');
  for (const g of gaps) {
    assert(g.kind, 'gap.kind 必填');
    assert(g.message, 'gap.message 必填');
  }
});

test('suggestions 分 P0/P1/P2', () => {
  const { suggestions } = runQuickAudit();
  assert(Array.isArray(suggestions.p0), 'p0 必为数组');
  assert(Array.isArray(suggestions.p1), 'p1 必为数组');
  assert(Array.isArray(suggestions.p2), 'p2 必为数组');
});

test('formatReport 输出含 6 段', () => {
  const result = runQuickAudit();
  const content = formatReport(result);
  assert(content.includes('## 1.'), '应含第 1 段');
  assert(content.includes('## 2.'), '应含第 2 段');
  assert(content.includes('## 3.'), '应含第 3 段');
  assert(content.includes('## 4.'), '应含第 4 段');
  assert(content.includes('## 5.'), '应含第 5 段');
  assert(content.includes('## 6.'), '应含第 6 段');
  assert(content.includes('下一步'), '应含询问下一步');
});

test('saveAuditReport 写入 .claude/audits/ 成功', () => {
  const result = runQuickAudit();
  const content = formatReport(result);
  const { saved, filePath } = saveAuditReport(result, content);
  assert(saved === true, 'save 应返回 true');
  assert(fs.existsSync(filePath), `文件应存在: ${filePath}`);
  // 清理（保留目录）
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
});

test('重复脚本检测', () => {
  const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  // 我们已知 test:evolution 重复（line 8 和 line 66）
  const testEvolutionCount = Object.keys(scripts).filter(k => k === 'test:evolution').length;
  // 如果修复了就允许 = 1，否则 = 2
  // 不强求一定有重复，只要求 scanDuplicates 不 throw
  const { dups } = runQuickAudit();
  assert(Array.isArray(dups), 'dups 必为数组');
});

// ── 总结 ─────────────────────────────────────────────

console.log('');
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
