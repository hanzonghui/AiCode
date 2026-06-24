#!/usr/bin/env node
/**
 * state-snapshot.js 单元测试
 * 验证：数据收集 / save / load / renderMarkdown / CLI
 *
 * @since v2.3.0 — 增量 G / M8
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SS = require('./state-snapshot');
const {
  save,
  load,
  status,
  renderMarkdown,
  collectPlanStatus,
  collectRecentFiles,
  collectRecentKB,
  collectPendingTodos,
  collectAutonomous,
  collectAnomalies,
  STATE_FILE,
  SUMMARY_FILE,
  VERSION,
} = SS;

// 路径常量
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const TMP_STATE = STATE_FILE + '.bak';
const TMP_SUMMARY = SUMMARY_FILE + '.bak';

let pass = 0, fail = 0;
const fails = [];
function assert(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push({ name, detail }); console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

function backup() {
  if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, TMP_STATE);
  if (fs.existsSync(SUMMARY_FILE)) fs.copyFileSync(SUMMARY_FILE, TMP_SUMMARY);
}
function restore() {
  if (fs.existsSync(TMP_STATE)) { fs.copyFileSync(TMP_STATE, STATE_FILE); fs.unlinkSync(TMP_STATE); }
  else if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  if (fs.existsSync(TMP_SUMMARY)) { fs.copyFileSync(TMP_SUMMARY, SUMMARY_FILE); fs.unlinkSync(TMP_SUMMARY); }
  else if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
}

// ==================== 1. 数据收集函数 ====================
section('1. 数据收集函数');

{
  const plan = collectPlanStatus();
  assert(typeof plan.plan_status === 'string', 'plan_status 是字符串');

  const files = collectRecentFiles();
  assert(Array.isArray(files), 'recent_files 是数组');
  assert(files.length > 0, `recent_files 非空（${files.length} 个）`);

  const kb = collectRecentKB();
  assert(Array.isArray(kb) && kb.length > 0, `kb_recent 非空（${kb.length} 条）`);

  const todos = collectPendingTodos();
  assert(Array.isArray(todos), 'pending_todos 是数组');

  const a = collectAutonomous();
  assert(typeof a === 'object', 'autonomous_state 是对象');

  const an = collectAnomalies();
  assert(Array.isArray(an), 'anomalies 是数组');
}

// ==================== 2. save / load 一致性 ====================
section('2. save + load 一致性');

{
  backup();
  try {
    const saved = save('test summary content', { nextAction: 'test next' });
    assert(saved.version === VERSION, 'version 正确');
    assert(saved.summary === 'test summary content', 'summary 保存');
    assert(saved.next_action === 'test next', 'next_action 保存');
    assert(fs.existsSync(STATE_FILE), 'state JSON 落盘');
    assert(fs.existsSync(SUMMARY_FILE), 'summary MD 落盘');

    // 重新读取
    const reloaded = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    assert(reloaded.summary === 'test summary content', 'JSON 持久化正确');
    assert(reloaded.next_action === 'test next', 'next_action 持久化正确');
  } finally { restore(); }
}

// ==================== 3. renderMarkdown 格式 ====================
section('3. renderMarkdown');

{
  const s = {
    version: VERSION,
    saved_at: '2026-06-24T15:00:00.000Z',
    session_id: '20260624-150000',
    summary: 'test',
    plan_status: 'done',
    current_plan: { name: 'p1', completed_steps: 3, total_steps: 5, status: 'done' },
    recent_files_modified: ['a.js', 'b.md'],
    pending_todos: ['M8', 'M9'],
    kb_recent: [{ id: 'KB-1', category: '技术', content: 'test' }],
    autonomous_state: { enabled: true },
    proactive_anomalies: [{ type: 'test', detail: 'det' }],
    recent_reflections: [],
    next_action: 'go',
  };
  const md = renderMarkdown(s);
  assert(md.includes('# 会话状态快照'), '含 H1 标题');
  assert(md.includes('v' + VERSION), '含版本号');
  assert(md.includes('## 对话摘要'), '含摘要段');
  assert(md.includes('## 待办事项'), '含待办段');
  assert(md.includes('## 最近改动文件'), '含文件段');
  assert(md.includes('## 最近知识（KB）'), '含 KB 段');
  assert(md.includes('M8') && md.includes('M9'), '待办被渲染');
  assert(md.includes('## 最近异常'), '异常段存在');
  assert(md.includes('go'), 'next_action 被渲染');
}

// ==================== 4. summary 截断 ====================
section('4. summary 截断（500 字符上限）');

{
  backup();
  try {
    const long = 'A'.repeat(1000);
    const saved = save(long);
    assert(saved.summary.length === 500, `summary 截断到 500（实际 ${saved.summary.length}）`);
  } finally { restore(); }
}

// ==================== 5. load 无文件不抛错 ====================
section('5. load 无文件 fallback');

{
  backup();
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    const result = load();
    assert(result === null, '无文件返回 null');
  } finally { restore(); }
}

// ==================== 6. status 不抛错 ====================
section('6. status 无文件 fallback');

{
  backup();
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    const result = status();
    assert(result === null, '无文件 status 返回 null');
  } finally { restore(); }
}

// ==================== 7. CLI ====================
section('7. CLI');

{
  backup();
  try {
    // save
    const out1 = execFileSync('node', [path.join(__dirname, 'state-snapshot.js'), 'save', 'cli test', '-m', 'cli next'], { encoding: 'utf8' });
    assert(out1.includes('状态快照已保存'), 'CLI save 输出确认');

    // status
    const out2 = execFileSync('node', [path.join(__dirname, 'state-snapshot.js'), 'status'], { encoding: 'utf8' });
    assert(out2.includes('状态快照'), 'CLI status 输出');

    // load
    const out3 = execFileSync('node', [path.join(__dirname, 'state-snapshot.js'), 'load'], { encoding: 'utf8' });
    assert(out3.includes('🧠 状态快照') && out3.includes('下次'), 'CLI load 完整输出');

    // print (JSON)
    const out4 = execFileSync('node', [path.join(__dirname, 'state-snapshot.js'), 'print'], { encoding: 'utf8' });
    const j = JSON.parse(out4);
    assert(j.version === VERSION, 'CLI print 输出可解析 JSON');
  } finally { restore(); }
}

// ==================== 8. 字段兼容性 ====================
section('8. 字段完整性');

{
  backup();
  try {
    const saved = save('field test');
    const required = [
      'version', 'saved_at', 'session_id', 'summary',
      'plan_status', 'current_plan',
      'recent_files_modified', 'pending_todos', 'kb_recent',
      'autonomous_state', 'proactive_anomalies', 'next_action',
    ];
    for (const k of required) {
      assert(k in saved, `字段 ${k} 存在`);
    }
  } finally { restore(); }
}

// ==================== 汇总 ====================
console.log(`\n${'━'.repeat(40)}`);
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败详情:');
  fails.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail || ''}`));
  process.exit(1);
}
console.log('✅ 全部通过');