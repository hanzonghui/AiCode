#!/usr/bin/env node
/**
 * handoff.js — 会话切换助手（v3.0.4 M21 + M22）
 *
 * 作用：
 *   - 自动保存当前会话进度（强制写快照）
 *   - 生成"接续 prompt"（拼装 4 段：摘要 / 待办 / 下阶段 / 约束）
 *   - 写 autonomous-state.json.awaiting_handoff 标记待接续
 *   - --auto 模式：打开 VS Code 新窗口 + 把启动命令复制到剪贴板
 *   - 无参数模式：读 latest_state.json.next_action，自动继续下一步
 *
 * 设计原则：
 *   - **不破坏**已有 /autonomous / /snap-save 流程
 *   - **复用** session-summary.sh save + autonomous-state.json schema
 *   - **dry-run 默认** 让你先看接续 prompt 再决定
 *   - **零依赖** 纯 Node.js + 复用 session-summary.sh
 *
 * 用法：
 *   node handoff.js "M20: decision-assistant.js"   # 强制写快照 + 生成 prompt
 *   node handoff.js "M20" --dry-run                # 只打印 prompt 不写
 *   node handoff.js "M20" --auto                   # 开 VS Code 新窗口并复制命令
 *   node handoff.js                                # 无参数，继续摘要里的 next_action
 *
 * @since v3.0.4 (2026-06-26) M21
 * @updated v3.0.4 (2026-06-26) M22 — VS Code 新窗口 + 无参数
 * @source 04_自我演进路线.md §0.7 演进计划的功能怎么来的
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const AUTONOMOUS_STATE_FILE = path.join(MEMORY_DIR, 'autonomous-state.json');
const SNAPSHOT_FILE = path.join(MEMORY_DIR, 'sessions', 'latest_state.json');
const SESSION_SUMMARY_SCRIPT = path.join(SKILL_DIR, 'scripts', 'session-summary.sh');
const HANDOFF_DIR = path.join(WORKSPACE_ROOT, '.claude', 'handoff');
const CONTINUE_PROMPT_FILE = path.join(HANDOFF_DIR, 'continue.prompt.md');

// ── 工具函数 ─────────────────────────────────────────

function readJSON(file, def = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toISOString();
}

function loadAutonomousState() {
  return readJSON(AUTONOMOUS_STATE_FILE, { enabled: false });
}

function saveAutonomousState(state) {
  writeJSON(AUTONOMOUS_STATE_FILE, state);
}

function loadSnapshot() {
  return readJSON(SNAPSHOT_FILE, null);
}

/**
 * 无参数时，从 snapshot 解析下一步要做什么
 * 优先取 next_action，其次从 summary 里解析 "下一步:" / "next:" / "下一步"
 * @returns {{title: string, nextTitle: string} | null}
 */
function resolveNextFromSnapshot() {
  const snap = loadSnapshot();
  if (!snap) return null;

  // 1. 优先显式 next_action
  if (snap.next_action && typeof snap.next_action === 'string') {
    return { title: snap.next_action, nextTitle: snap.next_action };
  }

  // 2. 从 summary 解析
  if (snap.summary && typeof snap.summary === 'string') {
    const summary = snap.summary;
    const patterns = [
      /下一步[:：]\s*(.+?)(?:\n|$)/i,
      /next[:：]\s*(.+?)(?:\n|$)/i,
      /下一步\s+(.+?)(?:\n|$)/i,
    ];
    for (const re of patterns) {
      const m = summary.match(re);
      if (m && m[1].trim()) {
        const t = m[1].trim();
        return { title: t, nextTitle: t };
      }
    }
  }

  return null;
}

function ensureHandoffDir() {
  if (!fs.existsSync(HANDOFF_DIR)) {
    fs.mkdirSync(HANDOFF_DIR, { recursive: true });
  }
}

/**
 * 把 prompt 写入文件，供 --append-system-prompt-file 使用
 */
function writeContinuePromptFile(prompt, nextTitle) {
  ensureHandoffDir();
  const header = `<!-- handoff continue prompt | ${nextTitle} | ${new Date().toISOString()} -->\n\n`;
  fs.writeFileSync(CONTINUE_PROMPT_FILE, header + prompt);
  return CONTINUE_PROMPT_FILE;
}

/**
 * 把文本复制到系统剪贴板
 */
function copyToClipboard(text) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const proc = spawn('cmd', ['/c', 'clip'], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    }
    if (platform === 'darwin') {
      const proc = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    }
    // Linux: 优先 xclip，其次 xsel
    for (const bin of ['xclip', 'xsel']) {
      try {
        const proc = spawn(bin, bin === 'xclip' ? ['-selection', 'clipboard', '-in'] : ['--clipboard', '--input'], { stdio: ['pipe', 'ignore', 'ignore'] });
        proc.stdin.write(text);
        proc.stdin.end();
        return true;
      } catch { /* try next */ }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 打开 VS Code 新窗口
 */
function openVsCodeNewWindow() {
  return new Promise((resolve) => {
    const child = spawn('code', ['--new-window', WORKSPACE_ROOT], {
      cwd: WORKSPACE_ROOT,
      stdio: 'ignore',
      detached: true,
    });
    child.on('error', (err) => resolve({ opened: false, error: err.message }));
    child.on('exit', (code) => resolve({ opened: code === 0, code }));
    // 不给太长超时，start 后尽快返回
    setTimeout(() => resolve({ opened: true, code: null }), 1500);
  });
}

/**
 * 自动存快照（强制，绕过模式）
 * 复用 session-summary.sh save + 写 next_action 到 latest_state.json
 */
function saveSnapshot(title, nextTitle, tags = ['handoff']) {
  const tagStr = tags.join(' ');
  const note = `[已 handoff] ${title}\n\nnext: ${nextTitle}`;

  try {
    const out = execFileSync('bash', [SESSION_SUMMARY_SCRIPT, 'save', note, tagStr, '--force'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: WORKSPACE_ROOT,
    });

    // 同步写 next_action 到 latest_state.json（session-summary.sh 不支持 -m 参数）
    if (fs.existsSync(SNAPSHOT_FILE)) {
      try {
        const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
        snap.next_action = nextTitle;
        snap.handoff_at = now();
        snap.handoff_title = title;
        writeJSON(SNAPSHOT_FILE, snap);
      } catch { /* 容错 */ }
    }

    return { saved: true, output: out };
  } catch (e) {
    return { saved: false, error: e.message };
  }
}

/**
 * 生成"接续 prompt"（拼装 4 段）
 *
 * 4 段：
 *   1. 会话摘要（来自 latest_summary.md）
 *   2. 当前待办 / 决策快照（来自 latest_state.json）
 *   3. 下一阶段（用户传入的 title）
 *   4. 约束 / 注意事项（自主模式状态、next 队列、关键文件）
 */
function buildHandoffPrompt(title, nextTitle, snapshot, autonomousState) {
  const lines = [];
  const divider = '━'.repeat(60);

  lines.push(divider);
  lines.push('🚀 会话交接 — 继续工作模式');
  lines.push(divider);
  lines.push('');
  lines.push(`你正在接续上一会话的工作（${title}）。`);
  lines.push('');
  lines.push('## 📋 上一会话快照');
  lines.push('');

  // 1. 会话摘要
  if (snapshot?.summary) {
    lines.push('### 会话摘要');
    lines.push('```');
    lines.push(snapshot.summary.slice(0, 500) + (snapshot.summary.length > 500 ? '...' : ''));
    lines.push('```');
    lines.push('');
  }

  // 2. 待办 / 决策
  if (snapshot?.pending_todos?.length > 0) {
    lines.push('### 待办列表');
    for (const todo of snapshot.pending_todos.slice(0, 5)) {
      lines.push(`- ${todo}`);
    }
    lines.push('');
  }

  // 3. 下一阶段
  lines.push('## 🎯 下一阶段目标');
  lines.push('');
  lines.push(`**${nextTitle}**`);
  lines.push('');
  lines.push('> 执行步骤：');
  lines.push('> 1. 读取 `.claude/skills/left-brain/memory/sessions/latest_state.json` 完整快照');
  lines.push('> 2. 读取 `04_自我演进路线.md` §0.4 找到对应增量段定义');
  lines.push('> 3. 按增量段验收标准实施');
  lines.push('> 4. 写测试 + 跑全量回归');
  lines.push('> 5. 同步 4 文档 + commit + 释放锁 + 写快照');
  lines.push('');

  // 4. 约束 / 当前状态
  lines.push('## ⚠️ 当前状态与约束');
  lines.push('');
  lines.push(`- **自主模式**：${autonomousState.enabled ? `ON（${autonomousState.mode || 'always'}）` : 'OFF'}`);
  lines.push(`- **演进锁**：${snapshot?.stage?.current ? `占用（${snapshot.stage.current}）` : '🟢 空闲'}`);
  lines.push(`- **当前快照时间**：${snapshot?.snapshot_at || snapshot?.updated_at || '(无)'}`);
  lines.push('');
  lines.push('**关键约束**：');
  lines.push('- 不修改根目录外文件');
  lines.push('- 不 push / 不删分支');
  lines.push('- 不偷改 evolution-plan.json（用 evolution-lock.js queue）');
  lines.push('- 完成后调 autonomous-runner.js complete-stage 或 evolution-lock.js complete');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**你的第一句话应该说什么？**');
  lines.push('');
  lines.push(`> "继续 ${nextTitle}，先读 latest_state.json 和 04.md §0.4。"`);

  return lines.join('\n');
}

/**
 * 更新 autonomous-state.json 标 awaiting_handoff
 */
function markAwaitingHandoff(nextTitle, reason) {
  const state = loadAutonomousState();
  state.awaiting_handoff = true;
  state.handoff_at = now();
  state.handoff_next = nextTitle;
  state.handoff_reason = reason || null;
  state.next_action = nextTitle;
  saveAutonomousState(state);
  return state;
}

/**
 * 清除 awaiting_handoff 标记（下次会话开窗时）
 */
function clearAwaitingHandoff() {
  const state = loadAutonomousState();
  delete state.awaiting_handoff;
  delete state.handoff_at;
  delete state.handoff_next;
  delete state.handoff_reason;
  saveAutonomousState(state);
  return state;
}

/**
 * 把 nextTitle 实际入队到 evolution-plan.json
 * @param {string} id
 * @param {string} title
 * @param {string} note
 * @returns {boolean} 是否真入队
 */
function enqueueNext(id, title, note) {
  try {
    const planPath = AUTONOMOUS_STATE_FILE.replace('autonomous-state.json', 'evolution-plan.json');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    // 已存在不重复入队
    if (plan.next.find(x => x.id === id) || (plan.current && plan.current.id === id)) {
      return false;
    }
    const result = execFileSync('node', [
      path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'evolution-lock.js'),
      'queue', id, title, note || `handoff: ${title}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: WORKSPACE_ROOT });
    return result.includes('已加入 next 队列') || !result.includes('已存在');
  } catch (e) {
    return false;
  }
}

/**
 * VS Code 方案：打开新窗口 + 写入 prompt 文件 + 复制启动命令到剪贴板
 * 由于 VS Code CLI 没有"在新终端自动执行命令"的能力，采用"窗口+剪贴板"半自动方案
 */
function spawnClaudeContinuation(prompt, nextTitle) {
  return new Promise(async (resolve) => {
    log('INFO', `准备 VS Code 新窗口接续: ${nextTitle}`);

    // 1. 写入 prompt 文件
    const promptFile = writeContinuePromptFile(prompt, nextTitle);
    log('INFO', `  prompt 文件: ${promptFile}`);

    // 2. 构造启动命令（用户在新窗口终端粘贴执行）
    const claudeBin = process.env.CLAUDE_BIN || 'claude';
    const command = `${claudeBin} --append-system-prompt-file "${promptFile}" "继续执行: ${nextTitle}"`;

    // 3. 复制命令到剪贴板
    const copied = copyToClipboard(command);
    if (copied) {
      log('INFO', '  启动命令已复制到剪贴板');
    } else {
      log('WARN', '  剪贴板复制失败，请手动复制下方命令');
    }

    // 4. 打开 VS Code 新窗口
    log('INFO', '  正在打开 VS Code 新窗口...');
    const vs = await openVsCodeNewWindow();

    resolve({
      opened: vs.opened,
      copied,
      command,
      promptFile,
      error: vs.error || null,
    });
  });
}

function log(level, message) {
  const ts = new Date().toLocaleString('zh-CN');
  console.log(`[${ts}] [${level}] ${message}`);
}

/**
 * 主入口
 */
function handoff(title, opts = {}) {
  let { nextTitle, dryRun = false, auto = false, tags = ['handoff'] } = opts;

  // M22: 无参数时从 snapshot 解析下一步
  if (!title) {
    const resolved = resolveNextFromSnapshot();
    if (!resolved) {
      throw new Error('无参数时需要 latest_state.json 存在且包含 next_action 或 summary 中的"下一步"。也可显式提供 title（例：node handoff.js "M20: decision-assistant.js"）');
    }
    title = resolved.title;
    nextTitle = nextTitle || resolved.nextTitle;
  }

  const resolvedTitle = title;
  const resolvedNext = nextTitle || title;

  const snapshot = loadSnapshot();
  const autonomousState = loadAutonomousState();

  // 1. 生成接续 prompt
  const prompt = buildHandoffPrompt(resolvedTitle, resolvedNext, snapshot, autonomousState);

  // 2. dry-run 模式只打印
  if (dryRun) {
    return { dryRun: true, prompt, title: resolvedTitle, nextTitle: resolvedNext };
  }

  // 3. 写快照
  const saveResult = saveSnapshot(resolvedTitle, resolvedNext, tags);
  if (!saveResult.saved) {
    throw new Error(`快照保存失败: ${saveResult.error}`);
  }

  // 4. 更新 autonomous-state.json
  markAwaitingHandoff(resolvedNext, resolvedTitle);

  // 5. v3.0.4 M22: --auto 模式 — 实际入队 next + spawn 新子进程
  const enqueued = enqueueNext(
    resolvedNext,
    resolvedNext,
    `handoff from "${resolvedTitle}"`
  );

  const result = {
    saved: true,
    snapshotPath: SNAPSHOT_FILE,
    autonomousStatePath: AUTONOMOUS_STATE_FILE,
    prompt,
    enqueued,
    auto,
    title: resolvedTitle,
    nextTitle: resolvedNext,
  };

  if (auto && !dryRun) {
    result.spawnedClaude = true; // 同步标记
  }

  return result;
}

// ── CLI ───────────────────────────────────────────────

function showHelp() {
  console.log(`
handoff.js — 会话切换助手（v3.0.4 M21 + M22）

用法:
  node handoff.js                                   # 无参数：继续摘要里的下一步
  node handoff.js "标题" [next-title]               # 强制存快照 + 生成 prompt
  node handoff.js "标题" --dry-run                  # 只打印 prompt 不写
  node handoff.js "标题" [next-title] --auto        # VS Code 新窗口 + 剪贴板命令

参数:
  第一个 (可选)   当前会话标题（不写则读 snapshot.next_action）
  第二个 (可选)   下一阶段标题（默认 = 第一个）
  --auto / -a     VS Code 新窗口模式（打开新窗口 + 复制 claude 启动命令到剪贴板）
  --dry-run       只打印接续 prompt，不写快照
  --tags "tag1 tag2"  自定义快照标签

输出:
  1. 自动存快照到 .claude/skills/left-brain/memory/sessions/latest_state.json
  2. 标记 autonomous-state.json.awaiting_handoff = true
  3. 实际入队 evolution-plan.json next（如果 ID 不存在）
  4. 输出"接续 prompt"
  5. --auto 时打开 VS Code 新窗口，并把启动命令复制到剪贴板
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const auto = args.includes('--auto') || args.includes('-a');
  const tagsIdx = args.indexOf('--tags');
  const tags = tagsIdx !== -1 ? args[tagsIdx + 1].split(/\s+/) : ['handoff'];

  // 解析位置参数
  const positional = args.filter(a => !a.startsWith('--') && !a.startsWith('-') && !tags.includes(a));
  const title = positional[0];
  const nextTitle = positional[1] || title;

  try {
    const result = handoff(title, { nextTitle, dryRun, auto, tags });

    if (dryRun) {
      console.log('━'.repeat(60));
      console.log('🔍 DRY-RUN: 接续 prompt 预览');
      console.log('━'.repeat(60));
      console.log(result.prompt);
      console.log('━'.repeat(60));
      console.log('(未写入快照；删除 --dry-run 实际执行)');
      return;
    }

    console.log('✅ 会话交接完成');
    console.log(`   标题：${result.title}`);
    console.log(`   下一阶段：${result.nextTitle}`);
    console.log(`   快照：${result.snapshotPath}`);
    console.log(`   状态：${result.autonomousStatePath}`);
    console.log(`   next 入队：${result.enqueued ? '✅' : '⏭️ 已存在'}`);
    console.log('');

    if (auto) {
      console.log('🚀 --auto 模式：打开 VS Code 新窗口 + 复制启动命令到剪贴板...');
      spawnClaudeContinuation(result.prompt, result.nextTitle).then((r) => {
        if (r.error) {
          console.error(`❌ VS Code 新窗口打开失败: ${r.error}`);
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📋 请手动打开 VS Code 新窗口，并在终端执行：');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(r.command);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          process.exit(1);
        }
        console.log('');
        console.log('✅ VS Code 新窗口已打开');
        console.log(`   prompt 文件：${r.promptFile}`);
        console.log(`   命令已复制到剪贴板：${r.copied ? '是' : '否'}`);
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 在新窗口终端粘贴执行（已复制到剪贴板）：');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(r.command);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      });
    } else {
      console.log('━'.repeat(60));
      console.log('📋 接续 prompt（新子会话第一句）');
      console.log('━'.repeat(60));
      console.log(result.prompt);
      console.log('━'.repeat(60));
      console.log('');
      console.log('💡 建议操作：');
      console.log('   1. 加 --auto 打开 VS Code 新窗口并复制命令（推荐）');
      console.log('   2. 手动：在 Claude Code UI 点击 "New Chat"');
      console.log('   3. 手动：输入 /clear 后粘上面 prompt');
    }
  } catch (e) {
    console.error(`❌ handoff 失败: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  handoff,
  buildHandoffPrompt,
  saveSnapshot,
  markAwaitingHandoff,
  clearAwaitingHandoff,
  loadAutonomousState,
  loadSnapshot,
  resolveNextFromSnapshot,
  writeContinuePromptFile,
  copyToClipboard,
  openVsCodeNewWindow,
  spawnClaudeContinuation,
  CONTINUE_PROMPT_FILE,
  HANDOFF_DIR,
};
