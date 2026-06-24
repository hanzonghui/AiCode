#!/usr/bin/env node
/**
 * secondary-review.js — 增量 A 方案 B：二次采样验证
 *
 * 触发位置：self-reflect.js 的 high-stakes-trigger 规则
 * 作用：对关键改动生成"二次采样"请求，排队等待另一个 Claude 实例复查
 *
 * 高风险判定（满足任一即触发）：
 *   1. 修改核心调度/反射/进化文件（dispatcher.js / self-reflect.js / proactive-scan.js 等）
 *   2. 修改根级配置/纲领文档（package.json / CLAUDE.md / 04.md / 03.md）
 *   3. 修改 .claude/rules/ 规则文件
 *   4. 单次改动涉及文件数 > 5
 *   5. 内容含安全敏感关键词（auth / token / secret / password / credential）
 *
 * 设计原则：
 *   - 只排队，不自动修改（真正的二次采样由另一个 Claude 实例或 LLM 完成）
 *   - 去重：同一文件同一原因最近 50 条内不重复
 *   - 永不 throw
 *   - 用户可用 /secondary-review 查看队列
 *
 * @since v2.0.1 (2026-06-25)
 * @source 04_自我演进路线.md §0.4 增量 A 方案 B
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const QUEUE_FILE = path.join(MEMORY_DIR, 'secondary-review-queue.json');
const MAX_QUEUE_SIZE = 50;

// 高风险文件模式
const HIGH_STAKES_PATTERNS = [
  // 核心调度与基础设施
  /scripts\/orchestrator\/dispatcher\.js$/,
  /scripts\/orchestrator\/with-retry\.js$/,
  /scripts\/orchestrator\/metrics\.js$/,
  /scripts\/orchestrator\/logger\.js$/,
  /scripts\/orchestrator\/permissions\.js$/,
  // 反射与规划
  /scripts\/orchestrator\/reflection\/self-reflect\.js$/,
  /scripts\/orchestrator\/reflection\/secondary-review\.js$/,
  /scripts\/orchestrator\/planning\/plan-detect\.js$/,
  /scripts\/orchestrator\/planning\/plan-bridge\.js$/,
  // 主动发现与修复
  /scripts\/orchestrator\/proactive\/proactive-scan\.js$/,
  /scripts\/orchestrator\/proactive\/auto-fix\.js$/,
  /scripts\/orchestrator\/proactive\/cron-report\.js$/,
  // 进化系统
  /scripts\/evolution\/implementer\.js$/,
  /scripts\/evolution\/auto-implement\.js$/,
  /scripts\/evolution\/daily-evolution\.js$/,
  // 记忆系统
  /\.claude\/skills\/left-brain\/scripts\/state-snapshot\.js$/,
  /\.claude\/skills\/left-brain\/scripts\/session-init\.sh$/,
  // 根级配置与纲领文档
  /package\.json$/,
  /CLAUDE\.md$/,
  /03_版本迭代计划\.md$/,
  /04_自我演进路线\.md$/,
  /CHANGELOG\.md$/,
  // 规则文件
  /\.claude\/rules\/.+\.md$/,
];

// 安全敏感关键词
const SECURITY_KEYWORDS = [
  'auth', 'token', 'secret', 'password', 'credential', 'apikey', 'api_key',
  'private.?key', 'access.?token', 'refresh.?token',
];

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    const data = JSON.parse(readFileSafe(QUEUE_FILE) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    ensureDir(MEMORY_DIR);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue.slice(0, MAX_QUEUE_SIZE), null, 2));
    return true;
  } catch {
    return false;
  }
}

function normalizePath(filePath) {
  if (!filePath) return '';
  // 转成相对路径（如果传入绝对路径）
  const abs = path.resolve(filePath);
  const root = path.resolve(WORKSPACE_ROOT);
  if (abs.startsWith(root)) {
    return path.relative(root, abs).replace(/\\/g, '/');
  }
  return filePath.replace(/\\/g, '/');
}

// ── 风险评估 ─────────────────────────────────────────

function isHighStakesFile(filePath) {
  const rel = normalizePath(filePath);
  return HIGH_STAKES_PATTERNS.some(p => p.test(rel));
}

function containsSecurityKeyword(content) {
  if (typeof content !== 'string') return false;
  const text = content.toLowerCase();
  return SECURITY_KEYWORDS.some(kw => {
    const re = new RegExp(kw.replace(/\?/g, '\\s?'), 'i');
    return re.test(text);
  });
}

/**
 * 评估一个改动是否需要二次采样
 * @param {Object} opts
 * @param {string} opts.file_path - 改动文件路径
 * @param {string} [opts.content] - 改动后内容
 * @param {string} [opts.tool_name] - Edit / Write
 * @param {number} [opts.batch_size] - 本次改动涉及文件数
 * @returns {{highStakes: boolean, reasons: string[]}}
 */
function assessRisk(opts = {}) {
  const reasons = [];
  const filePath = opts.file_path || '';
  const content = opts.content || '';
  const batchSize = opts.batch_size || 1;

  if (isHighStakesFile(filePath)) {
    reasons.push(`修改高风险文件: ${normalizePath(filePath)}`);
  }

  if (containsSecurityKeyword(content)) {
    reasons.push('内容含安全敏感关键词（auth/token/secret/password 等）');
  }

  if (batchSize > 5) {
    reasons.push(`单次改动涉及 ${batchSize} 个文件，超过阈值 5`);
  }

  return {
    highStakes: reasons.length > 0,
    reasons,
  };
}

// ── 队列操作 ─────────────────────────────────────────

function isDuplicate(queue, filePath, reasons) {
  const sig = `${normalizePath(filePath)}|${reasons.join(';')}`;
  return queue.some(item =>
    normalizePath(item.file_path) === normalizePath(filePath) &&
    item.reasons.join(';') === reasons.join(';')
  );
}

/**
 * 把二次采样请求加入队列
 * @returns {{added: boolean, item?: object}}
 */
function addToQueue(opts = {}) {
  const { file_path, content, tool_name, batch_size } = opts;
  const { highStakes, reasons } = assessRisk({ file_path, content, batch_size });

  if (!highStakes) return { added: false };

  const queue = loadQueue();
  if (isDuplicate(queue, file_path, reasons)) {
    return { added: false, reason: 'duplicate' };
  }

  const item = {
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    file_path: normalizePath(file_path),
    tool_name: tool_name || 'unknown',
    reasons,
    status: 'pending', // pending → reviewing → done | rejected
    sample_method: 'llm-secondary', // 未来可改 sub-agent / llm-judge
  };

  queue.unshift(item);
  const saved = saveQueue(queue);
  return { added: saved, item };
}

function markReviewed(id, result = {}) {
  const queue = loadQueue();
  const item = queue.find(i => i.id === id);
  if (!item) return { found: false };

  item.status = result.approved ? 'approved' : 'rejected';
  item.reviewedAt = new Date().toISOString();
  item.reviewNote = result.note || '';

  saveQueue(queue);
  return { found: true, item };
}

function clearQueue() {
  return saveQueue([]);
}

// ── 格式化 ───────────────────────────────────────────

function formatQueue(queue, compact = false) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return '✅ 二次采样队列为空（无高风险改动待复查）';
  }

  const pending = queue.filter(i => i.status === 'pending');
  const lines = [];
  lines.push(`🔍 二次采样队列: ${queue.length} 条（${pending.length} 条待复查）`);

  if (!compact) {
    for (const item of queue.slice(0, 10)) {
      const icon = item.status === 'pending' ? '⏳' : item.status === 'approved' ? '✅' : '❌';
      lines.push(`  ${icon} [${item.id}] ${item.file_path}`);
      for (const r of item.reasons) {
        lines.push(`     ⚠️ ${r}`);
      }
    }
    if (queue.length > 10) {
      lines.push(`  ... 还有 ${queue.length - 10} 条`);
    }
  }

  return lines.join('\n');
}

// ── CLI 入口 ─────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'status';

  try {
    if (cmd === 'status') {
      console.log(formatQueue(loadQueue()));
    } else if (cmd === 'clear') {
      const ok = clearQueue();
      console.log(ok ? '✅ 已清空二次采样队列' : '⚠️ 清空失败');
    } else if (cmd === 'add') {
      // 从 stdin 读 JSON
      const input = fs.readFileSync(0, 'utf8');
      const opts = JSON.parse(input || '{}');
      const result = addToQueue(opts);
      console.log(JSON.stringify(result));
    } else if (cmd === 'approve' || cmd === 'reject') {
      const id = process.argv[3];
      if (!id) {
        console.error('需要 id 参数');
        process.exit(1);
      }
      const result = markReviewed(id, { approved: cmd === 'approve' });
      console.log(result.found ? `✅ 已标记为 ${cmd}` : `⚠️ 找不到 ${id}`);
    } else {
      console.error(`未知命令: ${cmd}（支持: status / clear / approve <id> / reject <id>）`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ secondary-review 异常: ${e.message}`);
  }
  process.exit(0);
}

module.exports = {
  assessRisk,
  addToQueue,
  markReviewed,
  clearQueue,
  loadQueue,
  formatQueue,
  isHighStakesFile,
  containsSecurityKeyword,
  QUEUE_FILE,
  HIGH_STAKES_PATTERNS,
  SECURITY_KEYWORDS,
};
