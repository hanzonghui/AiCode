#!/usr/bin/env node
/**
 * autonomous.js — 自主演进模式开关（v2.0 P0-1）
 *
 * 触发位置：
 *   - /autonomous 打开开关
 *   - /autonomous-stop 关闭开关
 *
 * 作用：会话级持久开关，ON 时 Claude 自主决策不逐步确认
 *
 * 行为对比：
 *   OFF（默认）：完成功能 → 询问 → 用户决策
 *   ON（自主）：  完成功能 → 自主选下一个 → 写入快照 → 自动 commit（安全时）
 *
 * 状态文件：.claude/skills/left-brain/memory/autonomous-state.json
 * 顶部展示：session-init.sh Step 7 显式显示当前状态
 *
 * 设计原则：
 *   - 开关 OFF 是默认值（安全）
 *   - 状态持久化（跨 SessionStart）
 *   - 提供 toggle / status / on / off 四个子命令
 *   - ON 时带启用时间戳（便于追溯何时进入）
 *   - 永不 throw
 *
 * @since v2.2.0 (2026-06-25) — 增加 single / always 两种模式
 * @source 03_版本迭代计划.md §五 v2.0 P0-1
 * @source .claude/memory/autonomous-mode.md
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── 配置 ─────────────────────────────────────────────

// scripts/orchestrator/autonomous.js → 上两级到工程根 H:\AI-han\AiCode
const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const STATE_FILE = path.join(MEMORY_DIR, 'autonomous-state.json');

// 默认值
const DEFAULT_STATE = {
  enabled: false,
  enabled_at: null,
  enabled_by: 'user',
  reason: null,
  mode: 'always', // 'single' = 完成一个阶段后停止；'always' = 循环执行阶段
};

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...DEFAULT_STATE, ...data };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  ensureDir(MEMORY_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── 核心 API ────────────────────────────────────────

/**
 * 打开自主模式
 * @param {object} opts { reason, by, mode }
 * @returns {object} 新状态
 */
function enable(opts = {}) {
  const current = loadState();
  // 显式传入 mode > 当前已启用时的 mode > 之前保留的 mode > 默认 always
  const mode = opts.mode || (current.enabled ? current.mode : (current.mode || 'always'));
  const state = {
    enabled: true,
    enabled_at: new Date().toISOString(),
    enabled_by: opts.by || 'user',
    reason: opts.reason || null,
    mode,
  };
  saveState(state);
  return state;
}

/**
 * 关闭自主模式
 * @returns {object} 新状态
 */
function disable() {
  const current = loadState();
  const state = {
    enabled: false,
    enabled_at: null,
    enabled_by: 'user',
    reason: null,
    mode: current.mode || 'always',
  };
  saveState(state);
  return state;
}

/**
 * 切换开关
 * @param {object} opts
 * @returns {{ state: object, changed: boolean }}
 */
function toggle(opts = {}) {
  const current = loadState();
  if (current.enabled) {
    const newState = disable();
    return { state: newState, changed: true, action: 'off' };
  } else {
    const newState = enable(opts);
    return { state: newState, changed: true, action: 'on' };
  }
}

/**
 * 检查是否开启
 * @returns {boolean}
 */
function isEnabled() {
  return loadState().enabled;
}

/**
 * 获取当前状态
 * @returns {object}
 */
function getState() {
  return loadState();
}

/**
 * 顶部展示用（一行）
 */
function formatStatusLine() {
  const s = loadState();
  if (s.enabled) {
    const when = s.enabled_at ? new Date(s.enabled_at).toLocaleString('zh-CN') : '未知';
    const modeText = s.mode === 'single' ? 'single（单阶段）' : 'always（循环）';
    return `🤖 自主模式: ON（${modeText}，开启于 ${when}）`;
  }
  return '🙋 正常模式: OFF（逐步确认）';
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'status';
  const reason = process.argv[3];  // 可选：原因

  try {
    switch (cmd) {
      case 'on': {
        const state = enable({ reason });
        console.log('🤖 自主模式已开启');
        if (state.reason) console.log(`   原因: ${state.reason}`);
        console.log(`   开启时间: ${state.enabled_at}`);
        break;
      }
      case 'off': {
        disable();
        console.log('🙋 已切回正常模式（逐步确认）');
        break;
      }
      case 'single': {
        const state = enable({ reason, mode: 'single' });
        console.log('🤖 自主模式已开启（single：完成一个阶段后自动停止）');
        if (state.reason) console.log(`   原因: ${state.reason}`);
        console.log(`   开启时间: ${state.enabled_at}`);
        console.log('   提示: 执行 "node autonomous.js runner" 启动 runner');
        break;
      }
      case 'always': {
        const state = enable({ reason, mode: 'always' });
        console.log('🤖 自主模式已开启（always：循环执行阶段）');
        if (state.reason) console.log(`   原因: ${state.reason}`);
        console.log(`   开启时间: ${state.enabled_at}`);
        console.log('   提示: 执行 "node autonomous.js runner" 启动 runner');
        break;
      }
      case 'start': {
        const state = enable({ reason, mode: 'always' });
        console.log('🤖 自主模式已开启（always：循环执行阶段）');
        if (state.reason) console.log(`   原因: ${state.reason}`);
        console.log(`   开启时间: ${state.enabled_at}`);
        // 启动 runner 循环（阻塞直到 runner 结束）
        const runnerPath = path.join(__dirname, 'autonomous-runner.js');
        const child = spawn('node', [runnerPath, 'run'], {
          cwd: WORKSPACE_ROOT,
          stdio: 'inherit',
        });
        child.on('exit', (code) => {
          process.exit(code);
        });
        return;
      }
      case 'runner': {
        if (!isEnabled()) {
          console.log('🙋 自主模式当前为 OFF，无法启动 runner。请先执行 start 或 on');
          process.exit(1);
        }
        const runnerPath = path.join(__dirname, 'autonomous-runner.js');
        const child = spawn('node', [runnerPath, 'run'], {
          cwd: WORKSPACE_ROOT,
          stdio: 'inherit',
        });
        child.on('exit', (code) => {
          process.exit(code);
        });
        return;
      }
      case 'toggle': {
        const r = toggle({ reason });
        if (r.action === 'on') {
          console.log('🤖 自主模式已开启');
        } else {
          console.log('🙋 已切回正常模式（逐步确认）');
        }
        break;
      }
      case 'status': {
        const s = loadState();
        console.log(formatStatusLine());
        if (s.enabled) {
          console.log(`   开启人: ${s.enabled_by}`);
          if (s.reason) console.log(`   原因: ${s.reason}`);
        }
        break;
      }
      case 'is-enabled': {
        // 机器读用，exit code 表示
        console.log(isEnabled() ? '1' : '0');
        process.exit(isEnabled() ? 0 : 1);
      }
      default: {
        console.log(`
autonomous.js v2.2.0 — 自主演进模式开关 + runner 入口

用法:
  node autonomous.js on [reason]             # 开启自主模式（不启动 runner，默认 always）
  node autonomous.js off                     # 关闭
  node autonomous.js single [reason]         # 开启 single 模式（完成一个阶段后自动停止）
  node autonomous.js always [reason]         # 开启 always 模式（循环执行阶段）
  node autonomous.js start [reason]          # 同 always + 立即启动 runner（向后兼容）
  node autonomous.js runner                  # 直接启动 runner（按当前 mode 执行）
  node autonomous.js toggle [reason]         # 切换
  node autonomous.js status                  # 查看状态
  node autonomous.js is-enabled              # 机器读（exit 0=ON, 1=OFF）

启动命令（组合用法）:
  node autonomous.js single [reason] && node autonomous.js runner
  node autonomous.js always [reason] && node autonomous.js runner

状态文件: .claude/skills/left-brain/memory/autonomous-state.json

single 模式:
  ✅ 自动选下一个增量开发
  ✅ 完成一个阶段后自动停止并关闭开关

always 模式:
  ✅ 自动选下一个增量开发
  ✅ 完成后自动开启新阶段循环执行

公共行为:
  ✅ 关键决策写入快照不询问
  ✅ 完成后自动 commit（安全时）
  ✅ session-init 顶部显示 🤖

OFF 时行为（默认）:
  🙋 每完成一个功能 → 询问
  🙋 关键决策 → 询问
  🙋 commit → 询问
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
  enable,
  disable,
  toggle,
  isEnabled,
  getState,
  loadState,
  saveState,
  formatStatusLine,
  STATE_FILE,
};