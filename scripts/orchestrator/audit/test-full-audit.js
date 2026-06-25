#!/usr/bin/env node
/**
 * test-full-audit.js — full-audit 引擎基础测试
 *
 * 测试目标：
 *   1. runDeepAudit 不 throw
 *   2. 生成任务清单结构正确
 *   3. 任务覆盖所有关键子系统
 *   4. 浅层摘要嵌入正确
 *   5. formatReport 输出含任务清单 + 浅层摘要
 *   6. aggregateResults 处理空数组不 throw
 *   7. CLI 不 throw
 *
 * @since v2.0.2
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const fullAudit = require('./full-audit');
const { runDeepAudit, generateTasks, aggregateResults, formatReport, SUBSYSTEMS } = fullAudit;

// ── 工具 ─────────────────────────────────────────────

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

test('runDeepAudit 不 throw', () => {
  const result = runDeepAudit();
  assert(result, '应返回 result');
  assert(result.tasks, '应包含 tasks');
  assert(result.quickResult, '应包含 quickResult');
  assert(result.generatedAt, '应包含时间戳');
});

test('generateTasks 返回非空数组', () => {
  const tasks = generateTasks();
  assert(Array.isArray(tasks), 'tasks 必为数组');
  assert(tasks.length >= 5, '应至少 5 个子系统');
});

test('每个任务含必要字段', () => {
  const tasks = generateTasks();
  for (const t of tasks) {
    assert(t.id, 'task.id 必填');
    assert(t.name, 'task.name 必填');
    assert(t.paths && t.paths.length > 0, 'task.paths 必含至少 1 个路径');
    assert(t.focus && t.focus.length > 0, 'task.focus 必含至少 1 个关注点');
    assert(t.promptTemplate, 'task.promptTemplate 必填');
    // 验证路径真实存在
    const exists = t.paths.some(p => {
      if (p.includes('*')) {
        // glob 形式,跳过精确检查
        const dir = p.split('*')[0];
        return fs.existsSync(dir);
      }
      return fs.existsSync(p);
    });
    assert(exists, `${t.id} 的路径至少有一个存在`);
  }
});

test('覆盖关键子系统', () => {
  const tasks = generateTasks();
  const ids = tasks.map(t => t.id);
  const required = ['dispatcher', 'reflection', 'proactive', 'evolution', 'autonomous'];
  for (const r of required) {
    assert(ids.includes(r), `应包含子系统: ${r}`);
  }
});

test('浅层摘要嵌入正确', () => {
  const result = runDeepAudit();
  assert(result.quickResult.profile, '应嵌入 quick-audit profile');
  assert(result.quickResult.gaps, '应嵌入 quick-audit gaps');
});

test('aggregateResults 处理空数组不 throw', () => {
  const agg = aggregateResults([]);
  assert(agg.totalSubsystems === 0, '空数组应返回 0');
  assert(Array.isArray(agg.suggestions), 'suggestions 必为数组');
});

test('aggregateResults 汇总 P0 优先', () => {
  const agg = aggregateResults([
    { subsystem: 'a', suggestions: [{ type: 'P2', title: 's2' }], risks: [], strengths: [] },
    { subsystem: 'b', suggestions: [{ type: 'P0', title: 's0' }], risks: [], strengths: [] },
    null, // 模拟失败
    { subsystem: 'c', suggestions: [{ type: 'P1', title: 's1' }], risks: [], strengths: [] },
  ]);
  assert(agg.totalSubsystems === 3, 'null 应被跳过');
  assert(agg.suggestions[0].type === 'P0', 'P0 应排第一');
  assert(agg.suggestions[1].type === 'P1', 'P1 排第二');
  assert(agg.suggestions[2].type === 'P2', 'P2 排第三');
});

test('formatReport 输出含任务清单 + 浅层摘要', () => {
  const result = runDeepAudit();
  const content = formatReport(result.tasks, result.quickResult, null);
  assert(content.includes('深度调研任务清单'), '应含任务清单标题');
  assert(content.includes('浅层摘要'), '应含浅层摘要');
  assert(content.includes('深度模式说明'), '应含说明');
});

test('SUBSYSTEMS 数量合理', () => {
  assert(SUBSYSTEMS.length >= 5 && SUBSYSTEMS.length <= 20, '子系统数量应在 5~20 之间');
});

// ── 总结 ─────────────────────────────────────────────

console.log('');
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);