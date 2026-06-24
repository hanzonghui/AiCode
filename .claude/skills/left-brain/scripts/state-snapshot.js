#!/usr/bin/env node
/**
 * state-snapshot.js — 跨会话状态续接引擎（增量 G / M8）
 *
 * 核心目标：新会话首轮自动续接工作现场，不只是摘要文字。
 * 序列化对象：
 *   {
 *     version, saved_at, session_id,
 *     summary: string,                  // 人类可读摘要
 *     plan_status, current_plan,        // 来自 plan-bridge
 *     recent_files_modified,            // git diff --name-only 最近 N 次 commit
 *     pending_todos,                    // 从 CHANGELOG / KB 推断
 *     kb_recent,                        // 最近 N 条 KB
 *     autonomous_state,                 // 来自 autonomous.js
 *     proactive_anomalies,              // 来自 proactive-scan
 *     next_action                       // 建议下一步
 *   }
 *
 * 用法:
 *   node state-snapshot.js save "<summary>" [-m "<next_action>"]    保存
 *   node state-snapshot.js load                                    加载并输出
 *   node state-snapshot.js status                                  查看状态
 *   node state-snapshot.js print                                   只打印 JSON
 *
 * @since v2.3.0 (2026-06-24) — 增量 G / M8
 * @source 04_自我演进路线.md §0.4 增量 G
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── 路径 ──────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const SESSIONS_DIR = path.join(MEMORY_DIR, 'sessions');
const KNOWLEDGE_DIR = path.join(MEMORY_DIR, 'knowledge');
const LOGS_DIR = path.join(MEMORY_DIR, 'logs');

// 状态文件
const STATE_FILE = path.join(SESSIONS_DIR, 'latest_state.json');
const SUMMARY_FILE = path.join(SESSIONS_DIR, 'latest_summary.md');

// 联动数据源
const AUTONOMOUS_STATE = path.join(MEMORY_DIR, 'autonomous-state.json');
const ANOMALIES_FILE = path.join(MEMORY_DIR, 'anomalies.json');
const PENDING_PLANS = path.join(MEMORY_DIR, 'pending-plans.json');
const PLAN_LOG = path.join(MEMORY_DIR, 'plan-execution-log.json');
const REFLECTIONS = path.join(MEMORY_DIR, 'reflections.jsonl');

const VERSION = '2.3.0';

// ── 工具 ──────────────────────────────────────────────

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function readJSON(file, def = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function readFileOrNull(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function gitExec(cmd) {
  try {
    return execSync(cmd, { cwd: WORKSPACE_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString(); }

// ── 数据收集 ──────────────────────────────────────────

function collectPlanStatus() {
  const pending = readJSON(PENDING_PLANS, { plans: [] });
  const log = readJSON(PLAN_LOG, { executions: [] });
  const latestExec = (log.executions || []).slice(-1)[0] || null;

  let status = 'none';
  let currentPlan = null;

  if (latestExec) {
    if (latestExec.status === 'done') status = 'done';
    else if (latestExec.status === 'partial') status = 'partial';
    else if (latestExec.status === 'executing') status = 'executing';
    else if (latestExec.status === 'failed') status = 'failed';
    currentPlan = {
      name: latestExec.plan_name || 'unknown',
      status: latestExec.status,
      completed_steps: (latestExec.steps || []).filter(s => s.status === 'done').length,
      total_steps: (latestExec.steps || []).length,
      last_step: latestExec.steps ? latestExec.steps[latestExec.steps.length - 1] : null,
    };
  } else if ((pending.plans || []).length > 0) {
    status = 'pending';
    currentPlan = {
      name: pending.plans[pending.plans.length - 1].task || 'unknown',
      status: 'pending',
      created_at: pending.plans[pending.plans.length - 1].created_at,
    };
  }

  return { plan_status: status, current_plan: currentPlan };
}

function collectRecentFiles() {
  // 最近 5 次 commit 改动文件
  const out = gitExec('git log --name-only --pretty=format: -n 5');
  const files = new Set();
  for (const line of out.split('\n')) {
    const f = line.trim();
    if (f && !f.startsWith('"')) files.add(f);
  }
  return Array.from(files).slice(0, 30);
}

function collectRecentKB() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const m = readFileOrNull(path.join(KNOWLEDGE_DIR, f)) || '';
      const contentMatch = m.match(/^content:\s*(.*)$/m);
      const catMatch = m.match(/^category:\s*(.*)$/m);
      return {
        id: f.replace(/\.md$/, ''),
        category: catMatch ? catMatch[1].trim() : '其他',
        content: contentMatch ? contentMatch[1].trim().slice(0, 80) : '',
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id))  // id 含日期，越大越新
    .slice(0, 5);
}

function collectPendingTodos() {
  // 从 04 路线图"计划中"项推断
  const doc = readFileOrNull(path.join(WORKSPACE_ROOT, '04_自我演进路线.md')) || '';
  const todos = [];
  const lines = doc.split('\n');
  let inMileage = false;
  for (const line of lines) {
    if (/^## 十二、里程碑/.test(line)) inMileage = true;
    else if (inMileage && /^## /.test(line)) break;
    const m = line.match(/^\| M(\d+).*\| ⏳ 计划中 \|/);
    if (m) {
      const nameMatch = line.match(/^\| M\d+\s*\|\s*([^|]+?)\s*\|/);
      if (nameMatch) todos.push(`M${m[1]}: ${nameMatch[1].trim()}`);
    }
  }
  return todos;
}

function collectAutonomous() {
  return readJSON(AUTONOMOUS_STATE, { enabled: false });
}

function collectAnomalies() {
  const a = readJSON(ANOMALIES_FILE, { anomalies: [] });
  return (a.anomalies || []).slice(-3);
}

function collectReflections() {
  if (!fs.existsSync(REFLECTIONS)) return [];
  const lines = readFileOrNull(REFLECTIONS).split('\n').filter(Boolean);
  return lines.slice(-3).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ── 主流程：保存 ──────────────────────────────────────

function save(summary, opts = {}) {
  ensureDir(SESSIONS_DIR);
  const sessionId = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const state = {
    version: VERSION,
    saved_at: now(),
    session_id: sessionId,
    summary: (summary || '').slice(0, 500),
    ...collectPlanStatus(),
    recent_files_modified: collectRecentFiles(),
    pending_todos: collectPendingTodos(),
    kb_recent: collectRecentKB(),
    autonomous_state: collectAutonomous(),
    proactive_anomalies: collectAnomalies(),
    recent_reflections: collectReflections(),
    next_action: opts.nextAction || null,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // 同时写人类可读 markdown（向后兼容 session-summary.sh）
  const md = renderMarkdown(state);
  fs.writeFileSync(SUMMARY_FILE, md);

  console.log(`✅ 状态快照已保存: ${STATE_FILE}`);
  console.log(`   size: ${(JSON.stringify(state).length / 1024).toFixed(1)} KB`);
  console.log(`   plan_status: ${state.plan_status}`);
  console.log(`   pending_todos: ${state.pending_todos.length}`);
  console.log(`   recent_files: ${state.recent_files_modified.length}`);
  return state;
}

function renderMarkdown(s) {
  let md = `# 会话状态快照\n\n`;
  md += `- **版本**: v${s.version}\n`;
  md += `- **时间**: ${s.saved_at}\n`;
  md += `- **Session ID**: ${s.session_id}\n`;
  md += `- **自主模式**: ${s.autonomous_state.enabled ? '🤖 ON' : '🙋 OFF'}\n`;
  md += `- **Plan 状态**: ${s.plan_status}\n`;
  if (s.current_plan) {
    md += `  - ${s.current_plan.name || ''} (${s.current_plan.completed_steps || 0}/${s.current_plan.total_steps || '?'} steps)\n`;
  }
  md += `\n## 对话摘要\n${s.summary}\n\n`;

  md += `## 关键决策\n`;
  md += `<!-- 由 AI 在保存前填充 -->\n\n`;

  md += `## 待办事项\n`;
  if (s.pending_todos.length > 0) {
    for (const t of s.pending_todos) md += `- ${t}\n`;
  } else {
    md += `(无)\n`;
  }
  md += `\n`;

  md += `## 最近改动文件\n`;
  if (s.recent_files_modified.length > 0) {
    for (const f of s.recent_files_modified.slice(0, 10)) md += `- ${f}\n`;
  } else {
    md += `(无)\n`;
  }
  md += `\n`;

  md += `## 最近知识（KB）\n`;
  if (s.kb_recent.length > 0) {
    for (const k of s.kb_recent) md += `- [${k.id}] [${k.category}] ${k.content}\n`;
  } else {
    md += `(无)\n`;
  }
  md += `\n`;

  if (s.proactive_anomalies && s.proactive_anomalies.length > 0) {
    md += `## 最近异常\n`;
    for (const a of s.proactive_anomalies) md += `- ${a.type}: ${a.detail}\n`;
    md += `\n`;
  }

  if (s.recent_reflections && s.recent_reflections.length > 0) {
    md += `## 最近反思\n`;
    for (const r of s.recent_reflections) md += `- ${r.rule || r.type || ''}: ${r.detail || ''}\n`;
    md += `\n`;
  }

  md += `## 下次继续\n`;
  md += s.next_action ? `${s.next_action}\n` : `<!-- 由 AI 在保存前填充 -->\n`;
  return md;
}

// ── 主流程：加载 ──────────────────────────────────────

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('📝 暂无状态快照');
    return null;
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  print(state);
  return state;
}

function print(s) {
  console.log('━'.repeat(60));
  console.log(`🧠 状态快照 v${s.version} | ${s.saved_at}`);
  console.log('━'.repeat(60));
  console.log(`🤖 自主模式: ${s.autonomous_state.enabled ? 'ON' : 'OFF'}${s.autonomous_state.reason ? ' (' + s.autonomous_state.reason + ')' : ''}`);
  console.log(`📋 Plan: ${s.plan_status}${s.current_plan ? ' — ' + (s.current_plan.name || '') : ''}`);
  console.log(`📁 最近改动: ${s.recent_files_modified.length} 个`);
  if (s.recent_files_modified.length > 0) {
    for (const f of s.recent_files_modified.slice(0, 5)) console.log(`     - ${f}`);
  }
  console.log(`🧠 最近 KB: ${s.kb_recent.length} 条`);
  for (const k of s.kb_recent.slice(0, 3)) console.log(`     - [${k.id}] ${k.content}`);
  console.log(`📝 待办: ${s.pending_todos.length} 条`);
  for (const t of s.pending_todos) console.log(`     - ${t}`);
  if (s.proactive_anomalies && s.proactive_anomalies.length > 0) {
    console.log(`⚠️ 异常: ${s.proactive_anomalies.length} 条`);
    for (const a of s.proactive_anomalies) console.log(`     - ${a.type}: ${a.detail}`);
  }
  if (s.next_action) {
    console.log(`👉 下次: ${s.next_action}`);
  }
  console.log('━'.repeat(60));
  if (s.summary) {
    console.log(`\n📝 摘要: ${s.summary.slice(0, 200)}${s.summary.length > 200 ? '...' : ''}\n`);
  }
}

function status() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('📝 无状态快照');
    return null;
  }
  const stat = fs.statSync(STATE_FILE);
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  console.log(`状态快照:`);
  console.log(`  版本: v${state.version}`);
  console.log(`  保存时间: ${state.saved_at}`);
  console.log(`  文件大小: ${(stat.size / 1024).toFixed(1)} KB`);
  console.log(`  Plan: ${state.plan_status}`);
  console.log(`  待办: ${state.pending_todos.length}`);
  return state;
}

// ── CLI ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  if (cmd === 'save') {
    const summary = args[1] || '';
    let nextAction = null;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '-m' || args[i] === '--next') nextAction = args[++i];
    }
    save(summary, { nextAction });
  } else if (cmd === 'load') {
    load();
  } else if (cmd === 'status') {
    status();
  } else if (cmd === 'print') {
    if (fs.existsSync(STATE_FILE)) {
      console.log(fs.readFileSync(STATE_FILE, 'utf8'));
    } else {
      console.log('{}');
    }
  } else {
    console.log(`state-snapshot.js v${VERSION}`);
    console.log('用法:');
    console.log('  node state-snapshot.js save "<summary>" [-m "<next>"]   保存');
    console.log('  node state-snapshot.js load                            加载并打印');
    console.log('  node state-snapshot.js status                          查看状态');
    console.log('  node state-snapshot.js print                           输出 JSON');
  }
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('❌', e.message); process.exit(1); }
}

module.exports = {
  save,
  load,
  status,
  print,
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
};