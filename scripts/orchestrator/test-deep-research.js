#!/usr/bin/env node
/**
 * test-deep-research.js — deep-research 单元测试（M49）
 *
 * 覆盖：
 *   1. METHODOLOGY 配置完整
 *   2. loadObject 三级 fallback
 *   3. renderVertical 含 5 维度 + 字数参考
 *   4. renderHorizontal 含场景 A/B/C + 4 维度对比
 *   5. renderIntersection 含 3 个剧本（最可能/最危险/最乐观）
 *   6. generateReport 输出含 6 段
 *   7. analyzeCmd 输出框架含"研究对象名"
 *   8. CLI --json 输出合法 JSON
 *   9. templateCmd 输出模板含 [待填]
 *  10. from-data 文件不存在报错
 *
 * 用法：node test-deep-research.js
 *
 * @since v3.0.7 (2026-06-29)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const dr = require('./deep-research.js');

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log('  PASS ' + name);
    pass++;
  } catch (e) {
    console.log('  FAIL ' + name + ' -- ' + e.message);
    fail++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'assertEq') + ' -- want ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

console.log('\ntest-deep-research.js\n');

// 1. METHODOLOGY
test('METHODOLOGY 完整配置', () => {
  const m = dr.METHODOLOGY;
  assert(m.name.includes('横纵'), 'name 含横纵');
  assert(m.axes.vertical, 'vertical');
  assert(m.axes.horizontal, 'horizontal');
  assert(m.axes.intersection, 'intersection');
  assertEq(m.axes.vertical.key_questions.length, 5, '5 维度');
  assertEq(m.axes.horizontal.comparison_dimensions.length, 4, '4 维度对比');
  assertEq(m.axes.intersection.core_questions.length, 5, '5 核心问题');
  assert(m.adopted_changes.length >= 1, 'adopted_changes 有内容');
});

// 2. loadObject
test('loadObject 三级 fallback', () => {
  const o = dr.loadObject('X');
  assertEq(o.name, 'X', 'name');
  assert(o.type.includes('待确定'), 'type fallback');
  assert(o.timeline.length === 0, 'timeline 空');
});

test('loadObject 接受 data 参数', () => {
  const data = { type: '产品', timeline: [{ date: '2024', event: '发布' }] };
  const o = dr.loadObject('X', data);
  assertEq(o.type, '产品', 'type');
  assertEq(o.timeline.length, 1, 'timeline 1 条');
});

// 3. renderVertical
test('renderVertical 含 5 维度', () => {
  const o = dr.loadObject('Claude Code');
  const out = dr.renderVertical(o);
  assert(out.includes('## 二、纵向分析'), '标题');
  assert(out.includes('起源追溯'), '起源追溯');
  assert(out.includes('诞生节点'), '诞生节点');
  assert(out.includes('演进历程'), '演进历程');
  assert(out.includes('决策逻辑'), '决策逻辑');
  assert(out.includes('阶段划分'), '阶段划分');
  assert(out.includes('6000-15000'), '字数参考');
});

// 4. renderHorizontal
test('renderHorizontal 含场景 A/B/C + 4 维度', () => {
  const o = dr.loadObject('X');
  const out = dr.renderHorizontal(o);
  assert(out.includes('## 三、横向分析'), '标题');
  assert(out.includes('场景 A'), '场景 A');
  assert(out.includes('场景 B'), '场景 B');
  assert(out.includes('场景 C'), '场景 C');
  assert(out.includes('核心差异'), '核心差异');
  assert(out.includes('用户视角'), '用户视角');
  assert(out.includes('生态位'), '生态位');
  assert(out.includes('趋势判断'), '趋势判断');
  assert(out.includes('3000-10000'), '字数参考');
});

// 5. renderIntersection
test('renderIntersection 含 3 剧本', () => {
  const o = dr.loadObject('X');
  const out = dr.renderIntersection(o);
  assert(out.includes('## 四、横纵交汇'), '标题');
  assert(out.includes('最可能'), '最可能');
  assert(out.includes('最危险'), '最危险');
  assert(out.includes('最乐观'), '最乐观');
  assert(out.includes('1500-3000'), '字数参考');
});

// 6. generateReport
test('generateReport 含 6 段', () => {
  const o = dr.loadObject('Claude Code');
  const report = dr.generateReport(o);
  assert(report.includes('# Claude Code'), 'H1 含对象名');
  assert(report.includes('## 一、一句话定义'), '段 1');
  assert(report.includes('## 二、纵向分析'), '段 2');
  assert(report.includes('## 三、横向分析'), '段 3');
  assert(report.includes('## 四、横纵交汇'), '段 4');
  assert(report.includes('## 五、机遇 / 风险 / 痛点'), '段 5 (M49+3 新增)');
  assert(report.includes('## 六、落地行动建议'), '段 6 (M49+3 新增)');
  assert(report.includes('## 七、信息来源'), '段 7');
  assert(report.includes('## 八、方法论说明'), '段 8');
});

test('generateReport 中 [待填] 占位符', () => {
  const o = dr.loadObject('X');
  const report = dr.generateReport(o);
  assert(report.includes('[待填]'), '有 [待填] 占位');
});

// 7. CLI --help
test('CLI 无参数输出用法', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js')], { encoding: 'utf8' });
  assertEq(r.status, 0, 'exit=0');
  assert(r.stdout.includes('用法'), '含用法');
  assert(r.stdout.includes('analyze'), 'analyze');
  assert(r.stdout.includes('template'), 'template');
  assert(r.stdout.includes('from-data'), 'from-data');
});

// 8. CLI analyze
test('CLI analyze "Claude Code" 输出框架', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js'), 'analyze', 'Claude Code'], { encoding: 'utf8' });
  assertEq(r.status, 0, 'exit=0');
  assert(r.stdout.includes('Claude Code'), '含对象名');
  assert(r.stdout.includes('## 二、纵向分析'), '段 2');
  assert(r.stdout.includes('## 四、横纵交汇'), '段 4');
});

// 9. CLI --json
test('CLI analyze --json 输出合法 JSON', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js'), 'analyze', 'X', '--json'], { encoding: 'utf8' });
  assertEq(r.status, 0, 'exit=0');
  try {
    const j = JSON.parse(r.stdout);
    assert(j.methodology, 'methodology');
    assert(j.axes, 'axes');
    assert(j.object, 'object');
  } catch (e) {
    throw new Error('JSON parse fail: ' + e.message);
  }
});

// 10. CLI template
test('CLI template 输出模板', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js'), 'template', 'X'], { encoding: 'utf8' });
  assertEq(r.status, 0, 'exit=0');
  assert(r.stdout.includes('待填') || r.stdout.includes('[待填]') || r.stdout.includes('必填'), '含占位符');
  assert(r.stdout.includes('纵向'), '纵向');
  assert(r.stdout.includes('横向'), '横向');
});

// 11. CLI from-data
test('CLI from-data 文件不存在报错', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js'), 'from-data', '/nonexistent.json'], { encoding: 'utf8' });
  assert(r.status !== 0, 'exit != 0');
  assert(r.stderr.includes('不存在') || r.stdout.includes('不存在'), '含不存在');
});

test('CLI from-data 从真实 JSON 生成报告', () => {
  const tmp = path.join(os.tmpdir(), 'dr-' + Date.now() + '.json');
  const data = {
    name: 'TestObj',
    type: '产品',
    timeline: [{ date: '2024-01', event: '初始发布' }],
    competitors: [{ name: '竞品 A', description: 'A 的定位' }],
    advantage_roots: [{ advantage: '快', historical_event: '2023 Q3 重构' }],
    future_scenarios: [{ scenario: '继续增长' }],
  };
  fs.writeFileSync(tmp, JSON.stringify(data));
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', [path.join(__dirname, 'deep-research.js'), 'from-data', tmp], { encoding: 'utf8' });
  assertEq(r.status, 0, 'exit=0');
  assert(r.stdout.includes('TestObj'), '含对象名');
  assert(r.stdout.includes('2024-01'), '含时间线');
  assert(r.stdout.includes('竞品 A'), '含竞品');
  fs.unlinkSync(tmp);
});
// 12. M49+3 loadObject 4 字段默认值
test('M49+3 loadObject 默认 4 字段', () => {
  const o = dr.loadObject('X');
  assert(Array.isArray(o.pain_points), 'pain_points 是数组');
  assertEq(o.pain_points.length, 0, 'pain_points 空');
  assert(Array.isArray(o.opportunities), 'opportunities 是数组');
  assert(Array.isArray(o.risks), 'risks 是数组');
  assert(o.actions_by_persona, 'actions_by_persona 存在');
  assertEq(o.actions_by_persona.entrepreneur, '', 'entrepreneur 默认空');
  assertEq(o.actions_by_persona.practitioner, '', 'practitioner 默认空');
  assertEq(o.actions_by_persona.learner, '', 'learner 默认空');
  assertEq(o.actions_by_persona.investor, '', 'investor 默认空');
});

test('M49+3 loadObject 接受 4 字段', () => {
  const data = {
    pain_points: [{ title: '贵', detail: '价格高' }],
    opportunities: [{ title: 'AI 化', detail: 'AI 转型' }],
    risks: [{ title: '政策', detail: '监管收紧', probability: '中', impact: '高' }],
    actions_by_persona: { entrepreneur: '切入 X 场景' },
  };
  const o = dr.loadObject('X', data);
  assertEq(o.pain_points.length, 1, 'pain_points 1 条');
  assertEq(o.pain_points[0].title, '贵', 'pain_points[0].title');
  assertEq(o.opportunities[0].title, 'AI 化', 'opportunities[0].title');
  assertEq(o.risks[0].probability, '中', 'risks[0].probability');
  assertEq(o.actions_by_persona.entrepreneur, '切入 X 场景', 'entrepreneur 字段');
});

// 13. M49+3 renderOpportunitiesRisks 0 字段占位符
test('M49+3 renderOpportunitiesRisks 0 字段', () => {
  const o = dr.loadObject('X');
  const out = dr.renderOpportunitiesRisks(o);
  assert(out.includes('## 五、机遇 / 风险 / 痛点'), '标题');
  assert(out.includes('5.1'), '5.1 子段');
  assert(out.includes('5.2'), '5.2 子段');
  assert(out.includes('5.3'), '5.3 子段');
  assert(out.includes('[待填]'), '有占位符');
  assert(out.includes('行业现存痛点'), '痛点说明');
  assert(out.includes('未来增长机遇'), '机遇说明');
  assert(out.includes('潜在风险'), '风险说明');
  assert(out.includes('1000-3000'), '字数参考');
});

// 14. M49+3 renderOpportunitiesRisks 完整数据
test('M49+3 renderOpportunitiesRisks 完整数据', () => {
  const o = dr.loadObject('X', {
    pain_points: [{ title: '价格高', detail: '中等收入用户门槛' }],
    opportunities: [{ title: 'AI 集成', detail: 'AI 重塑行业' }],
    risks: [{ title: '政策', detail: '合规风险', probability: '中', impact: '高' }],
  });
  const out = dr.renderOpportunitiesRisks(o);
  assert(out.includes('价格高'), 'pain_point 标题');
  assert(out.includes('中等收入用户门槛'), 'pain_point 详情');
  assert(out.includes('AI 集成'), 'opportunity 标题');
  assert(out.includes('AI 重塑行业'), 'opportunity 详情');
  assert(out.includes('政策'), 'risk 标题');
  assert(out.includes('概率: 中'), 'risk probability');
  assert(out.includes('影响: 高'), 'risk impact');
});

// 15. M49+3 renderActions 0 字段 + 完整字段
test('M49+3 renderActions 0 字段占位符', () => {
  const o = dr.loadObject('X');
  const out = dr.renderActions(o);
  assert(out.includes('## 六、落地行动建议'), '标题');
  assert(out.includes('6.1 创业者'), '6.1 子段');
  assert(out.includes('6.2 从业者'), '6.2 子段');
  assert(out.includes('6.3 学习者'), '6.3 子段');
  assert(out.includes('6.4 投资人'), '6.4 子段');
  assert(out.includes('[待填]'), '有占位符');
  assert(out.includes('1000-2000'), '字数参考');
});

test('M49+3 renderActions 完整数据', () => {
  const o = dr.loadObject('X', {
    actions_by_persona: {
      entrepreneur: '切入 SaaS 化场景',
      practitioner: '学 AI 工具 + 转岗',
      learner: '读 3 本书 + 跟 1 个项目',
      investor: '关注 A 轮标的',
    },
  });
  const out = dr.renderActions(o);
  assert(out.includes('切入 SaaS 化场景'), 'entrepreneur 建议');
  assert(out.includes('学 AI 工具 + 转岗'), 'practitioner 建议');
  assert(out.includes('读 3 本书'), 'learner 建议');
  assert(out.includes('A 轮标的'), 'investor 建议');
});

// 16. M49+3 段位连贯性
test('M49+3 段位连贯性', () => {
  const o = dr.loadObject('Claude Code', {
    pain_points: [{ title: '贵', detail: 'x' }],
    opportunities: [{ title: 'AI', detail: 'y' }],
    risks: [{ title: '政策', detail: 'z', probability: '中', impact: '高' }],
    actions_by_persona: { entrepreneur: '做 X', practitioner: '做 Y', learner: '做 Z', investor: '做 W' },
  });
  const report = dr.generateReport(o);
  const idxIntersection = report.indexOf('## 四、横纵交汇');
  const idxOpportunity = report.indexOf('## 五、机遇 / 风险 / 痛点');
  const idxActions = report.indexOf('## 六、落地行动建议');
  const idxSource = report.indexOf('## 七、信息来源');
  assert(idxIntersection < idxOpportunity, '交汇在机遇风险前');
  assert(idxOpportunity < idxActions, '机遇风险在行动建议前');
  assert(idxActions < idxSource, '行动建议在信息来源前');
  assert(report.includes('切入 SaaS 化场景') || report.includes('做 X'), 'action 数据在报告里');
});



console.log('\n' + '='.repeat(50));
console.log('总计: ' + (pass + fail) + ' · 通过: ' + pass + ' · 失败: ' + fail);
if (fail > 0) {
  console.log('\n失败用例:');
  for (const f of failures) console.log('  - ' + f.name + ': ' + f.error);
  process.exit(1);
} else {
  console.log('全部通过\n');
  process.exit(0);
}
