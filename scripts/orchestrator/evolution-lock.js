#!/usr/bin/env node
/**
 * evolution-lock.js — 演进计划锁（P0-0 元能力）
 *
 * 作用：
 *   - 防止多窗口/多会话同时改 04.md/CLAUDE.md/CHANGELOG 等纲领文档导致状态漂移
 *   - 提供「单一权威源」evolution-plan.json 记录"当前在做什么 / 下个候选 / 锁持有者"
 *   - L1 软锁：所有窗口启动时主动读 evolution-plan.json
 *   - L2 文件锁：acquire 写 owner + 锁时间戳；5 分钟超时自动释放
 *   - L3 hook 强制：PostToolUse 拦截 Edit/Write（未来由 P0-0 Step 0.3 接入）
 *
 * 设计原则：
 *   - 永不 throw（任何 I/O 异常 → 退化）
 *   - 状态文件 gitignore 排除（避免状态被 commit）
 *   - 单文件原子写入（先写 .tmp 再 rename）
 *   - JSON schema 简单可读（不引入 zod/ajv 依赖）
 *
 * 用法：
 *   node evolution-lock.js status                    # 查看当前状态
 *   node evolution-lock.js acquire <id> [owner]      # 申请锁
 *   node evolution-lock.js release [id]              # 释放锁
 *   node evolution-lock.js complete <id> [summary]   # 标记完成 + 自动 release
 *   node evolution-lock.js queue <id> [title]        # 追加候选到 next
 *   node evolution-lock.js peek [id]                 # 查看某阶段详情
 *
 * 状态文件：
 *   .claude/skills/left-brain/memory/evolution-plan.json
 *
 * @since v2.0.4 (2026-06-25) — P0-0 演进治理基础设施
 * @source .claude/rules/evolution-lock.md
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

// scripts/orchestrator/evolution-lock.js → 上三级到工程根
const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory');
const STATE_FILE = path.join(MEMORY_DIR, 'evolution-plan.json');

// 锁超时（毫秒）
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

// 状态默认值
const DEFAULT_STATE = {
  schema_version: 1,
  current: null, // { id, title, owner, locked_at, scope, allowed_docs }
  next: [],      // [{ id, title, queued_at, note }]
  history: [],   // [{ id, owner, started_at, completed_at, summary }]
  updated_at: null,
};

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE, history: [] };
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      ...DEFAULT_STATE,
      ...data,
      next: data.next || [],
      history: data.history || [],
    };
  } catch {
    return { ...DEFAULT_STATE, history: [] };
  }
}

function saveState(state) {
  ensureDir(MEMORY_DIR);
  state.updated_at = new Date().toISOString();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function isStale(current) {
  if (!current || !current.locked_at) return true;
  const lockedAt = new Date(current.locked_at).getTime();
  return Date.now() - lockedAt > LOCK_TIMEOUT_MS;
}

// ── 核心 API ────────────────────────────────────────

/**
 * 查看当前锁状态
 * @returns {{ locked: boolean, current: object|null, stale: boolean, holder_age_ms: number|null }}
 */
function status() {
  const s = loadState();
  if (!s.current) {
    return { locked: false, current: null, stale: false, holder_age_ms: null };
  }
  const stale = isStale(s.current);
  const age = Date.now() - new Date(s.current.locked_at).getTime();
  return { locked: true, current: s.current, stale, holder_age_ms: age };
}

/**
 * 申请锁
 * @param {string} id 阶段 ID（如 "M13-failure-distiller"）
 * @param {string} owner 持有者（窗口名 / 用户名 / 会话 ID）
 * @param {object} opts { title, scope, allowed_docs, reason }
 * @returns {{ acquired: boolean, state: object, reason: string }}
 */
function acquire(id, owner, opts = {}) {
  const s = loadState();
  if (s.current && !isStale(s.current) && s.current.id !== id) {
    return {
      acquired: false,
      state: s,
      reason: `锁被占用: ${s.current.id} (owner=${s.current.owner})`,
    };
  }
  // 同 id 重入 或 新申请 或 接管 stale 锁
  s.current = {
    id,
    title: opts.title || id,
    owner: owner || 'unknown',
    locked_at: new Date().toISOString(),
    scope: opts.scope || [],
    allowed_docs: opts.allowed_docs || [],
    reason: opts.reason || null,
  };
  saveState(s);
  return { acquired: true, state: s, reason: 'ok' };
}

/**
 * 释放锁
 * @param {string} [id] 指定释放哪个 id（省略则释放 current）
 * @returns {{ released: boolean, state: object, reason: string }}
 */
function release(id) {
  const s = loadState();
  if (!s.current) {
    return { released: false, state: s, reason: '当前无锁' };
  }
  if (id && s.current.id !== id) {
    return { released: false, state: s, reason: `id 不匹配: 期望 ${id}，当前 ${s.current.id}` };
  }
  s.current = null;
  saveState(s);
  return { released: true, state: s, reason: 'ok' };
}

/**
 * 标记完成：写入 history + release 锁
 * @param {string} id
 * @param {string} summary
 * @returns {{ completed: boolean, state: object, reason: string }}
 */
function complete(id, summary) {
  const s = loadState();
  if (!s.current || s.current.id !== id) {
    return { completed: false, state: s, reason: `current 不是 ${id}（无法 complete）` };
  }
  s.history.unshift({
    id,
    title: s.current.title,
    owner: s.current.owner,
    started_at: s.current.locked_at,
    completed_at: new Date().toISOString(),
    summary: summary || '(无摘要)',
  });
  // 历史保留最近 20 条
  s.history = s.history.slice(0, 20);
  s.current = null;
  saveState(s);
  return { completed: true, state: s, reason: 'ok' };
}

/**
 * 追加候选到 next 队列
 * @param {string} id
 * @param {string} title
 * @param {object} [opts] { note, priority }
 * @returns {{ queued: boolean, state: object, reason: string }}
 */
function queue(id, title, opts = {}) {
  const s = loadState();
  // 重复 id 跳过
  if (s.next.find(x => x.id === id) || (s.current && s.current.id === id)) {
    return { queued: false, state: s, reason: `id ${id} 已存在（current 或 next）` };
  }
  s.next.push({
    id,
    title,
    queued_at: new Date().toISOString(),
    note: opts.note || null,
    priority: opts.priority || 'P1',
  });
  saveState(s);

  // M24 子模块 D：入队后自动调 sync-roadmap.js 同步 04.md §十二 ⏳ 段
  // 用 spawn detached 避免阻塞主流程；sync-roadmap 内部不 throw
  try {
    const { spawn } = require('child_process');
    const syncScript = path.join(__dirname, 'sync-roadmap.js');
    spawn(process.execPath, [syncScript], {
      cwd: WORKSPACE_ROOT,
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch { /* sync-roadmap 失败不阻塞 queue 主流程 */ }

  return { queued: true, state: s, reason: 'ok' };
}

/**
 * 查看某阶段详情
 * @param {string} id
 * @returns {object|null}
 */
function peek(id) {
  const s = loadState();
  if (s.current && s.current.id === id) return { ...s.current, status: 'in_progress' };
  const inNext = s.next.find(x => x.id === id);
  if (inNext) return { ...inNext, status: 'queued' };
  const inHistory = s.history.find(x => x.id === id);
  if (inHistory) return { ...inHistory, status: 'completed' };
  return null;
}

// ── 格式化输出（人读） ─────────────────────────────

function formatStatus(s) {
  if (!s.locked) {
    return '🟢 锁空闲 — 可领取下一阶段';
  }
  const ageMin = Math.round(s.holder_age_ms / 60000);
  const stale = s.stale ? ' ⚠️ STALE' : '';
  return `🔒 锁被占用: ${s.current.id}\n   持有者: ${s.current.owner}\n   持续: ${ageMin} 分钟${stale}\n   标题: ${s.current.title}`;
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  const arg3 = process.argv[5];

  try {
    switch (cmd) {
      case 'status': {
        const s = status();
        console.log(formatStatus(s));
        if (s.locked && s.current.allowed_docs && s.current.allowed_docs.length) {
          console.log(`   允许文档: ${s.current.allowed_docs.join(', ')}`);
        }
        break;
      }
      case 'acquire': {
        if (!arg1) { console.log('❌ 用法: acquire <id> [owner] [title]'); break; }
        const r = acquire(arg1, arg2 || 'unknown', { title: arg3 || arg1 });
        if (r.acquired) {
          console.log(`✅ 锁已获取: ${arg1} (owner=${arg2 || 'unknown'})`);
        } else {
          console.log(`❌ ${r.reason}`);
        }
        break;
      }
      case 'release': {
        const r = release(arg1);
        if (r.released) console.log('✅ 锁已释放');
        else console.log(`❌ ${r.reason}`);
        break;
      }
      case 'complete': {
        if (!arg1) { console.log('❌ 用法: complete <id> [summary]'); break; }
        const r = complete(arg1, arg2 || '(无摘要)');
        if (r.completed) console.log(`✅ ${arg1} 已完成: ${arg2 || '(无摘要)'}`);
        else console.log(`❌ ${r.reason}`);
        break;
      }
      case 'queue': {
        if (!arg1) { console.log('❌ 用法: queue <id> <title>'); break; }
        const r = queue(arg1, arg2 || arg1, { note: arg3 });
        if (r.queued) console.log(`✅ ${arg1} 已加入 next 队列`);
        else console.log(`❌ ${r.reason}`);
        break;
      }
      case 'peek': {
        if (!arg1) { console.log('❌ 用法: peek <id>'); break; }
        const detail = peek(arg1);
        if (detail) console.log(JSON.stringify(detail, null, 2));
        else console.log(`❌ ${arg1} 不存在（current/next/history 都没有）`);
        break;
      }
      case 'init': {
        // 强制初始化空状态文件（仅用于首次创建）
        if (fs.existsSync(STATE_FILE)) {
          console.log('⚠️ 状态文件已存在，未覆盖');
        } else {
          saveState({ ...DEFAULT_STATE, history: [] });
          console.log('✅ 状态文件已创建:', STATE_FILE);
        }
        break;
      }
      default: {
        console.log(`
evolution-lock.js v1.0.0 — 演进计划锁（P0-0 元能力）

用法:
  status                       查看当前锁状态
  acquire <id> [owner] [title] 申请锁（如被占用会失败）
  release [id]                 释放锁（id 省略则释放 current）
  complete <id> [summary]      标记完成（自动 release + 写 history）
  queue <id> [title] [note]    追加候选到 next
  peek <id>                    查看某阶段详情
  init                         强制初始化空状态文件

状态文件: ${STATE_FILE}
锁超时: ${LOCK_TIMEOUT_MS / 60000} 分钟（超时不显式 release 仍可被接管）
`);
      }
    }
  } catch (e) {
    // 永不 throw
    console.error('❌ 异常:', e.message);
  }
  process.exit(0);
}

module.exports = {
  status,
  acquire,
  release,
  complete,
  queue,
  peek,
  loadState,
  saveState,
  STATE_FILE,
  LOCK_TIMEOUT_MS,
};
