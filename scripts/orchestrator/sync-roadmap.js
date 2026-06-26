#!/usr/bin/env node
/**
 * sync-roadmap.js — 04.md §十二 ⏳ 段自动同步脚本（M24 子模块 D）
 *
 * 作用：
 *   - 读 evolution-plan.json 的 next 队列
 *   - 解析 04_自我演进路线.md §十二 ⏳ 段 table
 *   - diff 后缺则 append / 已 complete 则从 table 删除
 *   - 同步"状态统计" + 顶部"最近一次同步" + "next 队列状态"
 *   - 写同步日志到 data/roadmap-sync-YYYYMMDD-HHMM.md
 *
 * 设计原则：
 *   - 永不 throw（任何 I/O 异常 → 写 log + return error）
 *   - 纯 Node.js，零依赖
 *   - 解析容错（找到 ⏳ 段标题就停，找不到就跳过）
 *   - 与 evolution-lock.js queue 钩子联动（自动调）
 *
 * 用法：
 *   node sync-roadmap.js           # 真同步
 *   node sync-roadmap.js --dry-run # 只打 diff
 *   node sync-roadmap.js --status  # 看当前同步状态
 *
 * @since v3.0.5 (2026-06-26) M24
 * @source 04_自我演进路线.md §0.7 演进计划的功能怎么来的
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory');
const EVOLUTION_PLAN = path.join(MEMORY_DIR, 'evolution-plan.json');
const ROADMAP_MD = path.join(WORKSPACE_ROOT, '04_自我演进路线.md');
const LOG_DIR = path.join(WORKSPACE_ROOT, 'data', 'roadmap-sync');

// ── 工具函数 ─────────────────────────────────────────

function readJSON(file, def = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function now() {
  return new Date().toISOString();
}

function nowShort() {
  return now().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg) {
  console.log(`[sync-roadmap] ${msg}`);
}

// ── 解析 evolution-plan.json ──────────────────────────

function loadNext() {
  const plan = readJSON(EVOLUTION_PLAN, null);
  if (!plan) return [];
  return plan.next || [];
}

function loadHistory() {
  const plan = readJSON(EVOLUTION_PLAN, null);
  if (!plan) return [];
  return plan.history || [];
}

// ── 解析 04.md §十二 ⏳ 段 ────────────────────────────

/**
 * 找到 §十二 ⏳ 段的 table 区域
 * @returns {{start: number, end: number, tableLines: string[]}} 行号区间
 */
function findPlannedTableRegion(md) {
  const lines = md.split('\n');
  let inPlanned = false;
  let tableStart = -1, tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 找到 ⏳ 计划中段标题
    if (/^###\s+⏳\s*计划中/.test(line)) {
      inPlanned = true;
      continue;
    }

    if (!inPlanned) continue;

    // table 头（| 阶段 | 内容 |...）
    if (/^\|\s*阶段\s*\|/.test(line)) {
      tableStart = i + 1; // 跳过分隔行
      continue;
    }

    if (tableStart !== -1 && /^\|---/.test(lines[i])) {
      // 分隔行后，table 内容开始
      continue;
    }

    if (tableStart !== -1 && !/^\|/.test(line)) {
      // table 结束
      tableEnd = i;
      break;
    }
  }

  return { start: tableStart, end: tableEnd };
}

/**
 * 提取 ⏳ 段 table 内的所有 id
 * @returns {string[]}
 */
function extractIdsFromPlanned(md) {
  const region = findPlannedTableRegion(md);
  if (region.start === -1) return [];
  const lines = md.split('\n');
  const ids = [];

  for (let i = region.start; i < (region.end === -1 ? lines.length : region.end); i++) {
    const line = lines[i];
    // 匹配 `**id**` 格式
    const m = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
    if (m) ids.push(m[1].trim());
  }
  return ids;
}

// ── 顶部"最近一次同步" + "next 队列状态" ──────────────

function findAndReplaceTopMeta(md, changes) {
  let updated = md;
  for (const { pattern, replacement } of changes) {
    updated = updated.replace(pattern, replacement);
  }
  return updated;
}

// ── 状态统计段 ────────────────────────────────────────

function findStatusStats(md) {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+📊\s*状态统计/.test(lines[i])) {
      // 找 4-5 行后的合计行
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/^\|\s*\*?\*?合计\*?\*?/.test(lines[j])) {
          return j;
        }
      }
    }
  }
  return -1;
}

// ── 主同步逻辑 ────────────────────────────────────────

function buildPlannedRow(entry) {
  const id = entry.id;
  const title = entry.title || '(无标题)';
  const queuedAt = (entry.queued_at || '').slice(0, 10); // YYYY-MM-DD
  const priority = entry.priority || 'P1';
  const noteShort = (entry.note || '').slice(0, 80) + ((entry.note || '').length > 80 ? '...' : '');
  return `| **${id}** | ${title} | ${queuedAt} | ${priority} | ${noteShort} |`;
}

function sync() {
  const result = { added: [], removed: [], updated: false, dryRun: false };

  if (!fs.existsSync(ROADMAP_MD)) {
    return { ...result, error: `04.md 不存在: ${ROADMAP_MD}` };
  }

  const md = fs.readFileSync(ROADMAP_MD, 'utf8');
  const next = loadNext();
  const nextIds = new Set(next.map(e => e.id));
  const historyIds = new Set(loadHistory().map(e => e.id));
  const tableIds = new Set(extractIdsFromPlanned(md));

  // 1. 计算 diff
  const toAdd = next.filter(e => !tableIds.has(e.id));
  const toRemove = [...tableIds].filter(id => !nextIds.has(id) && !historyIds.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    result.message = '已同步，无需变更';
    return result;
  }

  // 2. 应用 diff 到 md
  let updatedMd = md;

  // 2.1 移除（仅当 next 也没有、history 也没有 = 完全消失）
  if (toRemove.length > 0) {
    const lines = updatedMd.split('\n');
    const region = findPlannedTableRegion(updatedMd);
    if (region.end !== -1) {
      for (let i = region.end - 1; i >= region.start; i--) {
        const m = lines[i].match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
        if (m && toRemove.includes(m[1])) {
          lines.splice(i, 1);
          result.removed.push(m[1]);
        }
      }
      updatedMd = lines.join('\n');
    }
  }

  // 2.2 追加新条目
  if (toAdd.length > 0) {
    const newRows = toAdd.map(buildPlannedRow).join('\n');
    const region = findPlannedTableRegion(updatedMd);
    if (region.end !== -1) {
      const lines = updatedMd.split('\n');
      lines.splice(region.end, 0, newRows);
      updatedMd = lines.join('\n');
      result.added = toAdd.map(e => e.id);
    }
  }

  // 2.3 改顶部"最近一次同步" + "next 队列状态"
  const newCount = next.length;
  const completedCount = historyIds.size;
  const total = newCount + completedCount;
  const evoCount = next.filter(e => e.id.startsWith('EVOLVE-')).length;
  const auditCount = next.filter(e => e.id.startsWith('AUDIT-')).length;
  const researchCount = next.filter(e => e.id.startsWith('RESEARCH-')).length;
  const manualCount = next.length - evoCount - auditCount - researchCount;

  updatedMd = findAndReplaceTopMeta(updatedMd, [
    {
      pattern: /(\*\*最近一次同步\*\*：)[\d-]+(.*?)$/m,
      replacement: `$1${now().slice(0, 10)} (v3.0.5 M24 sync-roadmap 自动同步：${result.added.length} 新增 / ${result.removed.length} 删除；上一条：手动同步 M24 入队)`,
    },
    {
      pattern: /(\*\*当前 `next` 队列状态\*\*：)[^|]+$/m,
      replacement: `$1🟡 **${newCount} 条候选**（${evoCount} EVOLVE + ${auditCount} AUDIT + ${researchCount} RESEARCH${manualCount > 0 ? ` + ${manualCount} 手动` : ''} · sync-roadmap 自动同步于 ${now().slice(0, 10)}）`,
    },
  ]);

  // 2.4 改"状态统计"段
  const statsLine = findStatusStats(updatedMd);
  if (statsLine !== -1) {
    const lines = updatedMd.split('\n');
    lines[statsLine] = `| **合计** | **${total}** | — |`;
    // 上一行是 ⏳ 计划中
    if (statsLine > 0 && /^\|\s*⏳\s*计划中/.test(lines[statsLine - 1])) {
      lines[statsLine - 1] = `| ⏳ 计划中 | ${newCount} | ${((newCount / total) * 100).toFixed(1)}% |`;
    }
    // 上两行是 ✅ 已完成
    if (statsLine > 1 && /^\|\s*✅\s*已完成/.test(lines[statsLine - 2])) {
      lines[statsLine - 2] = `| ✅ 已完成 | ${completedCount} | ${((completedCount / total) * 100).toFixed(1)}% |`;
    }
    updatedMd = lines.join('\n');
  }

  result.updated = updatedMd !== md;
  result.newMd = updatedMd;
  return result;
}

function writeSyncLog(result) {
  ensureDir(LOG_DIR);
  const file = path.join(LOG_DIR, `roadmap-sync-${nowShort()}.md`);
  const content = [
    `# 路线图同步日志`,
    ``,
    `- 时间：${now()}`,
    `- 新增：${result.added.length} 条（${result.added.join(', ') || '(无)'}）`,
    `- 删除：${result.removed.length} 条（${result.removed.join(', ') || '(无)'}）`,
    `- 状态：${result.updated ? '✅ 已更新' : '⏭️ 无需变更'}`,
    result.error ? `- 错误：${result.error}` : '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(file, content);
  return file;
}

// ── CLI 入口 ─────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const isStatus = args.includes('--status');

  if (isStatus) {
    const next = loadNext();
    const md = fs.existsSync(ROADMAP_MD) ? fs.readFileSync(ROADMAP_MD, 'utf8') : '';
    const tableIds = extractIdsFromPlanned(md);
    log(`next 队列: ${next.length} 条`);
    log(`04.md §十二 ⏳ 段: ${tableIds.length} 条`);
    const inNextNotInTable = next.filter(e => !tableIds.includes(e.id));
    const inTableNotInNext = tableIds.filter(id => !next.find(e => e.id === id));
    if (inNextNotInTable.length > 0) {
      log(`  ⚠️  next 有但 04.md 没有: ${inNextNotInTable.map(e => e.id).join(', ')}`);
    }
    if (inTableNotInNext.length > 0) {
      log(`  ⚠️  04.md 有但 next 没有: ${inTableNotInNext.join(', ')}`);
    }
    if (inNextNotInTable.length === 0 && inTableNotInNext.length === 0) {
      log('  ✅ 同步状态正常');
    }
    return;
  }

  const result = sync();
  if (result.error) {
    log(`❌ 错误: ${result.error}`);
    process.exit(1);
  }

  if (result.added.length > 0) log(`  ➕ 新增: ${result.added.join(', ')}`);
  if (result.removed.length > 0) log(`  ➖ 删除: ${result.removed.join(', ')}`);
  log(result.message || (result.updated ? '✅ 已同步' : '⏭️ 无需变更'));

  if (dryRun) {
    log('🔍 DRY-RUN: 未写盘');
    return;
  }

  if (result.updated && result.newMd) {
    fs.writeFileSync(ROADMAP_MD, result.newMd);
    const logFile = writeSyncLog(result);
    log(`📝 日志: ${logFile}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  sync,
  loadNext,
  loadHistory,
  extractIdsFromPlanned,
  findPlannedTableRegion,
  buildPlannedRow,
  findStatusStats,
  ROADMAP_MD,
  EVOLUTION_PLAN,
};
