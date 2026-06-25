#!/usr/bin/env node
/**
 * autonomous-runner.js — 自主模式无人值守执行器（v2.2.0）
 *
 * 核心能力：
 *   - 阶段完成后自动保存快照
 *   - 退出当前 claude -p 子会话
 *   - 启动新的 claude -p 子会话加载快照并继续下一阶段
 *   - 完全无人值守循环执行
 *   - 支持 single 模式：完成一个阶段后自动停止
 *   - 支持 always 模式：循环执行阶段
 *
 * 触发位置：
 *   - /autonomous single 或 /autonomous always 调用
 *   - 手动：node scripts/orchestrator/autonomous-runner.js run
 *
 * 状态文件：
 *   - .claude/skills/left-brain/memory/autonomous-state.json
 *   - .claude/skills/left-brain/memory/sessions/latest_state.json
 *
 * 用法：
 *   node autonomous-runner.js run              # 启动 runner（按 state.mode 决定 single/always）
 *   node autonomous-runner.js stop             # 停止 runner（写 enabled=false）
 *   node autonomous-runner.js status           # 查看 runner 状态
 *   node autonomous-runner.js complete-stage   # 子进程调用：标记当前阶段完成
 *
 * @since v2.2.0 (2026-06-25) — 增加 single / always 模式支持
 * @source 03_版本迭代计划.md §五 v2.0 P0-1
 * @source .claude/memory/autonomous-mode.md
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const SESSIONS_DIR = path.join(MEMORY_DIR, 'sessions');

const AUTONOMOUS_STATE_FILE = path.join(MEMORY_DIR, 'autonomous-state.json');
const SNAPSHOT_FILE = path.join(SESSIONS_DIR, 'latest_state.json');

// 解析 claude 可执行文件路径（处理 Windows + 跨 shell 边界）
// - 优先用 CLAUDE_BIN 环境变量
// - Windows 上 Node spawn 不继承 PowerShell PATH，需显式加 %APPDATA%\npm（全局 npm 目录）
// - 找不到时返回 null，runClaudeStage 会给清晰提示
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform === 'win32') {
    // 1. 先看 %APPDATA%\npm\claude.cmd（npm i -g 的标准位置）
    const roaming = process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd');
    if (roaming && fs.existsSync(roaming)) return roaming;
    // 2. 退到 PATH 中的 claude
    return 'claude';
  }
  return 'claude';
}
const CLAUDE_BIN = resolveClaudeBin();
const MAX_FAILURES = parseInt(process.env.AUTONOMOUS_MAX_FAILURES, 10) || 5;
const STAGE_TIMEOUT_MS = parseInt(process.env.AUTONOMOUS_STAGE_TIMEOUT_MS, 10) || 30 * 60 * 1000; // 30 分钟

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON(file, def = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toISOString();
}

function log(level, message) {
  const ts = new Date().toLocaleString('zh-CN');
  console.log(`[${ts}] [${level}] ${message}`);
}

// ── 状态管理 ─────────────────────────────────────────

function loadAutonomousState() {
  return readJSON(AUTONOMOUS_STATE_FILE, { enabled: false });
}

function saveAutonomousState(state) {
  writeJSON(AUTONOMOUS_STATE_FILE, state);
}

function disableAutonomous(reason) {
  const state = loadAutonomousState();
  state.enabled = false;
  state.disabled_at = now();
  state.disabled_reason = reason || null;
  saveAutonomousState(state);
  log('WARN', `自主模式已停止: ${reason}`);
}

function loadSnapshot() {
  return readJSON(SNAPSHOT_FILE, null);
}

function saveSnapshot(state) {
  writeJSON(SNAPSHOT_FILE, state);
}

function ensureStage(snapshot) {
  if (!snapshot.stage) {
    snapshot.stage = {
      current: null,
      status: 'idle',
      completed: [],
      next: snapshot.next_action || null,
      failure_count: 0,
      started_at: null,
    };
  }
  return snapshot.stage;
}

function determineNextStage(snapshot) {
  const stage = ensureStage(snapshot);

  // 优先使用 runner 专用的 stage.next
  if (stage.next) return stage.next;

  // 兼容旧字段 next_action
  if (snapshot.next_action) return snapshot.next_action;

  // 从 pending_todos 推断
  if (snapshot.pending_todos && snapshot.pending_todos.length > 0) {
    return snapshot.pending_todos[0];
  }

  return null;
}

// ── 阶段生命周期 ─────────────────────────────────────

/**
 * runner 调用：阶段开始前，写入 in_progress 状态
 */
function markStageInProgress(snapshot, stageName) {
  const stage = ensureStage(snapshot);
  stage.current = stageName;
  stage.status = 'in_progress';
  stage.started_at = now();
  stage.failure_count = stage.failure_count || 0;
  saveSnapshot(snapshot);
}

/**
 * 子进程调用：阶段完成后，标记完成并设置下一步
 */
function markStageCompleted(nextStageName) {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    console.error('❌ 无法加载快照');
    process.exit(1);
  }

  const stage = ensureStage(snapshot);
  if (stage.current) {
    stage.completed.push(stage.current);
  }
  stage.current = null;
  stage.status = 'completed';
  stage.next = nextStageName || null;
  stage.failure_count = 0;
  stage.started_at = null;

  // 同步 next_action 字段（向后兼容）
  snapshot.next_action = nextStageName || null;

  saveSnapshot(snapshot);
  console.log(`✅ 阶段完成，下一步: ${nextStageName || '(无)'}`);
}

/**
 * runner 调用：阶段失败后，增加失败计数
 */
function markStageFailed(snapshot, reason) {
  const stage = ensureStage(snapshot);
  stage.status = 'failed';
  stage.failure_count = (stage.failure_count || 0) + 1;
  stage.last_error = reason || null;
  saveSnapshot(snapshot);
  return stage.failure_count;
}

// ── 子进程执行 ───────────────────────────────────────

function buildStagePrompt(snapshot) {
  const stage = snapshot.stage || {};
  const stageName = stage.current || snapshot.next_action || '未知阶段';

  // v2.2.2 BUG #2 fix: 子会话曾把 prompt 误读为"半句话用户消息"走 SessionStart 协议，
  // 没调 complete-stage。修复：开头加 ⚠️ 强制声明 + 任务清单提前 + 完成动作白纸黑字。
  return `
⚠️⚠️⚠️ 强制上下文（不可忽略） ⚠️⚠️⚠️

你正在以 \`claude -p\` 子进程身份运行，由 autonomous-runner.js 启动。
**这不是与用户的对话**——没有用户等你回复，也没有人会补充"半句话"。
你必须按下面的"任务清单"自主完成本阶段，**不能向任何方向发问**。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 任务清单（按顺序完成，全部必做）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【1/5】读上下文快照
   读取 .claude/skills/left-brain/memory/sessions/latest_state.json

【2/5】完成阶段开发工作
   读代码 → 改文件 → 跑测试 → commit
   本阶段名称: ${stageName}

【3/5】保存快照
   bash .claude/skills/left-brain/scripts/session-summary.sh save "[已完成] ${stageName}: 一句话摘要" -m "next: 下一阶段名称"

【4/5】⚠️ 关键：标记阶段完成（漏掉这一步 runner 会判失败！）
   node scripts/orchestrator/autonomous-runner.js complete-stage "下一阶段名称"
   或如果是最后一个阶段:
   node scripts/orchestrator/autonomous-runner.js complete-stage

【5/5】直接退出（print 退出信息后 exit，不要再读任何东西）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 重要约束
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ❌ 不要问"用户要我做什么"——没有用户，你看到的 prompt 就是全部
- ❌ 不要走 SessionStart 启动协议——你不是新会话
- ❌ 不要 git push
- ❌ 不要删分支/删文件
- ❌ 关键决策写入 KB 或快照
- ✅ 单步失败 → 保存失败快照 → 退出（让 runner 重试）
- ✅ 一次只完成一个阶段，不要贪多

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 上下文参考
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 会话摘要: ${snapshot.summary || '(无)'}
- 自主模式: ${snapshot.autonomous_state?.enabled ? 'ON' : 'OFF'}
- 已完成阶段: ${(stage.completed || []).join(', ') || '(无)'}
- 计划下一步: ${stage.next || snapshot.next_action || '(待推断)'}
`.trim();
}

function runClaudeStage(prompt) {
  return new Promise((resolve) => {
    log('INFO', `启动 claude -p 子会话执行阶段... (bin: ${CLAUDE_BIN})`);

    // shell: true 让 PowerShell/cmd 接管 PATH 解析，跨 Windows shell 边界也能找到全局 npm CLI
    const child = spawn(CLAUDE_BIN, ['-p', prompt], {
      cwd: WORKSPACE_ROOT,
      stdio: 'inherit',
      shell: true,
    });

    let timeoutId;
    if (STAGE_TIMEOUT_MS > 0) {
      timeoutId = setTimeout(() => {
        log('WARN', `阶段执行超过 ${STAGE_TIMEOUT_MS / 60000} 分钟，强制终止子进程`);
        child.kill('SIGTERM');
      }, STAGE_TIMEOUT_MS);
    }

    child.on('exit', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      log('INFO', `子会话结束: code=${code}, signal=${signal}`);
      resolve({ code, signal });
    });

    child.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      // ENOENT = spawn 时就找不到可执行文件。给清晰提示，避免静默失败
      if (err.code === 'ENOENT') {
        log('ERROR', `启动子会话失败: 找不到 '${CLAUDE_BIN}'`);
        log('ERROR', `  原因: ${err.message}`);
        log('ERROR', `  修复: 1) npm i -g @anthropic-ai/claude-code`);
        log('ERROR', `       2) 或设置 CLAUDE_BIN 环境变量指向绝对路径`);
        log('ERROR', `       3) 或把 claude 加入 PATH`);
      } else {
        log('ERROR', `启动子会话失败: ${err.message}`);
      }
      resolve({ code: -1, signal: null, error: err.message });
    });
  });
}

// ── 主循环 ───────────────────────────────────────────

async function runLoop() {
  log('INFO', '自主模式 runner 启动');

  while (true) {
    const autoState = loadAutonomousState();
    if (!autoState.enabled) {
      log('INFO', '自主模式已关闭，runner 退出');
      break;
    }

    const snapshot = loadSnapshot();
    if (!snapshot) {
      log('WARN', '无可用快照，runner 等待 10 秒后重试');
      await sleep(10000);
      continue;
    }

    const nextStage = determineNextStage(snapshot);
    if (!nextStage) {
      log('INFO', '无下一阶段任务，自主模式结束');
      disableAutonomous('所有阶段已完成，无下一步');
      break;
    }

    markStageInProgress(snapshot, nextStage);
    log('INFO', `开始阶段: ${nextStage}`);

    const prompt = buildStagePrompt(loadSnapshot());
    const result = await runClaudeStage(prompt);

    // 重新加载快照检查阶段结果
    const afterSnapshot = loadSnapshot();
    const stage = afterSnapshot?.stage;

    if (result.code === 0 && stage && stage.status === 'completed') {
      log('INFO', `阶段完成: ${nextStage}`);
      // failure_count 已在 complete-stage 中清零

      // single 模式：完成一个阶段后自动停止
      if (autoState.mode === 'single') {
        log('INFO', 'single 模式：完成一个阶段，自动停止自主模式');
        disableAutonomous('single 模式完成一个阶段后自动停止');
        break;
      }
    } else {
      const reason = stage?.last_error || `子进程退出 code=${result.code}`;
      const failures = markStageFailed(loadSnapshot(), reason);
      log('WARN', `阶段失败 (${failures}/${MAX_FAILURES}): ${reason}`);

      if (failures >= MAX_FAILURES) {
        disableAutonomous(`阶段 ${nextStage} 连续失败 ${MAX_FAILURES} 次`);
        break;
      }

      // 短暂后退，避免立刻重试同一阶段
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── CLI 入口 ─────────────────────────────────────────

function showHelp() {
  console.log(`
autonomous-runner.js — 自主模式无人值守执行器

用法:
  node autonomous-runner.js run                         # 启动 runner 主循环
  node autonomous-runner.js stop                        # 停止 runner
  node autonomous-runner.js status                      # 查看 runner 状态
  node autonomous-runner.js complete-stage [next]       # 标记当前阶段完成

环境变量:
  CLAUDE_BIN            claude 可执行文件路径（默认: Windows 上自动解析 %APPDATA%\npm\claude.cmd，其他平台回落 PATH）
  AUTONOMOUS_MAX_FAILURES   最大连续失败次数（默认: 5）
  AUTONOMOUS_STAGE_TIMEOUT_MS  单阶段超时（默认: 1800000ms = 30分钟）
`);
}

async function main() {
  const cmd = process.argv[2] || 'status';

  try {
    switch (cmd) {
      case 'run': {
        const state = loadAutonomousState();
        if (!state.enabled) {
          log('INFO', '自主模式当前为 OFF，请先执行 /autonomous 或 node autonomous.js on');
          process.exit(1);
        }
        const modeText = state.mode === 'single' ? 'single（完成一个阶段后停止）' : 'always（循环）';
        log('INFO', `runner 启动，模式: ${modeText}`);
        await runLoop();
        break;
      }
      case 'stop': {
        disableAutonomous('用户执行 stop 命令');
        console.log('🙋 已停止自主模式');
        break;
      }
      case 'complete-stage': {
        const nextStage = process.argv[3] || null;
        markStageCompleted(nextStage);
        break;
      }
      case 'status': {
        const autoState = loadAutonomousState();
        const snapshot = loadSnapshot();
        const stage = snapshot?.stage;
        console.log('━'.repeat(50));
        console.log(`🤖 自主模式: ${autoState.enabled ? 'ON' : 'OFF'}`);
        if (autoState.enabled) {
          const modeText = autoState.mode === 'single' ? 'single（单阶段）' : 'always（循环）';
          console.log(`   模式: ${modeText}`);
          if (autoState.reason) {
            console.log(`   原因: ${autoState.reason}`);
          }
        }
        if (stage) {
          console.log(`🎯 当前阶段: ${stage.current || '(无)'}`);
          console.log(`   状态: ${stage.status || 'idle'}`);
          console.log(`   已完: ${(stage.completed || []).length} 个`);
          console.log(`   下一步: ${stage.next || snapshot.next_action || '(无)'}`);
          console.log(`   失败计数: ${stage.failure_count || 0}`);
        }
        console.log('━'.repeat(50));
        break;
      }
      case 'help':
      case '-h':
      case '--help':
        showHelp();
        break;
      default:
        console.error(`未知命令: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (e) {
    log('ERROR', `runner 异常: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadAutonomousState,
  saveAutonomousState,
  disableAutonomous,
  loadSnapshot,
  saveSnapshot,
  ensureStage,
  determineNextStage,
  markStageInProgress,
  markStageCompleted,
  markStageFailed,
  buildStagePrompt,
  runClaudeStage,
  runLoop,
  resolveClaudeBin,
  AUTONOMOUS_STATE_FILE,
  SNAPSHOT_FILE,
};
