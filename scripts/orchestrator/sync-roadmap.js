#!/usr/bin/env node
/**
 * sync-roadmap.js — 04.md §十二 ⏳ 段自动同步脚本（M24 子模块 D）+ 版本号 metadata 同步
 *
 * 作用：
 *   - 读 evolution-plan.json 的 next 队列
 *   - 解析 04_自我演进路线.md §十二 ⏳ 段 table
 *   - diff 后缺则 append / 已 complete 则从 table 删除
 *   - 同步"状态统计" + 顶部"最近一次同步" + "next 队列状态"
 *   - 同步 package.json version 到 01.md / 04.md / PROJECT-CONTEXT.md 的 metadata
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
 *   node sync-roadmap.js --no-version # 跳过版本号 metadata 同步
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
const PACKAGE_JSON = path.join(WORKSPACE_ROOT, 'package.json');
const LOG_DIR = path.join(WORKSPACE_ROOT, 'data', 'roadmap-sync');

// ── 工具函数 ─────────────────────────────────────────

function readJSON(file, def = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function loadPackageVersion() {
  const pkg = readJSON(PACKAGE_JSON, null);
  return pkg?.version || null;
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
      tableStart = i + 2; // 跳过表头 + 分隔行
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

/**
 * 找 §十二 ✅ 已完成段 + 数实际行数
 * @returns {{startIdx: number, endIdx: number, lineCount: number} | null}
 */
function findCompletedSection(md) {
  const startIdx = md.indexOf('### ✅ 已完成');
  if (startIdx === -1) return null;
  const endIdx = md.indexOf('### ⏳ 计划中', startIdx);
  if (endIdx === -1) return null;
  const section = md.slice(startIdx, endIdx);
  // 匹配 | M_N | 或 | **M_N** | 行
  const lineCount = (section.match(/^\| (\*\*)?M\d+(\*\*)? \|/gm) || []).length;
  return { startIdx, endIdx, lineCount };
}

// ── 版本号 metadata 同步 ──────────────────────────────

/**
 * 同步各文档中的"项目当前版本"metadata，保持与 package.json 一致
 * 只改明确标记为 metadata 的位置，不改功能首次上线版本号
 */
function syncVersionMetadata(result) {
  const version = loadPackageVersion();
  if (!version) {
    result.warnings.push('无法读取 package.json version，跳过版本号同步');
    return;
  }

  const today = now().slice(0, 10);
  const files = [
    {
      path: ROADMAP_MD,
      name: '04.md',
      replacements: [
        {
          // 顶部 "最近一次同步"
          pattern: /(\*\*最近一次同步\*\*：)[\d-]+(\s*\(v)\d+\.\d+\.\d+/m,
          replacement: `$1${today}$2${version}`
        },
        {
          // §0.7 "当前版本" 段
          pattern: /(\*\*当前（)[\d-]+(）\*\*：)v\d+\.\d+\.\d+/m,
          replacement: `$1${today}$2v${version}`
        }
      ]
    },
    {
      path: path.join(WORKSPACE_ROOT, '01_AI-ClaudeCode-最佳实践精简.md'),
      name: '01.md',
      replacements: [
        {
          // 顶部 blockquote "最后更新"
          pattern: /(最后更新：)[\d-]+（v\d+\.\d+\.\d+/m,
          replacement: `$1${today}（v${version}`
        },
        {
          // "## 十二、版本状态（vX.Y.Z）"
          pattern: /(## 十二、版本状态（v)\d+\.\d+\.\d+(）)/m,
          replacement: `$1${version}$2`
        },
        {
          // 底部 "_最后更新：YYYY-MM-DD · vX.Y.Z..._"
          pattern: /(_最后更新：)[\d-]+( · v)\d+\.\d+\.\d+/m,
          replacement: `$1${today}$2${version}`
        }
      ]
    },
    {
      path: path.join(WORKSPACE_ROOT, 'PROJECT-CONTEXT.md'),
      name: 'PROJECT-CONTEXT.md',
      replacements: [
        {
          // 顶部版本
          pattern: /(> \*\*版本\*\*：)v\d+\.\d+\.\d+/m,
          replacement: `$1v${version}`
        }
      ]
    },
    {
      path: path.join(WORKSPACE_ROOT, '02_工作空间功能介绍.md'),
      name: '02.md',
      replacements: [
        {
          // 顶部版本
          pattern: /(> \*\*版本\*\*：)v\d+\.\d+\.\d+/m,
          replacement: `$1v${version}`
        },
        {
          // 顶部最后更新日期
          pattern: /(> \*\*最后更新\*\*：)\d{4}-\d{2}-\d{2}/m,
          replacement: `$1${today}`
        }
      ]
    },
    {
      path: path.join(WORKSPACE_ROOT, 'README.md'),
      name: 'README.md',
      replacements: [
        {
          // 测试基线版本
          pattern: /(## 🧪 测试基线（v)\d+\.\d+\.\d+）/m,
          replacement: `$1${version}）`
        }
      ]
    },
  ];

  for (const file of files) {
    if (!fs.existsSync(file.path)) continue;
    let md = fs.readFileSync(file.path, 'utf8');
    const original = md;
    let applied = 0;
    for (const { pattern, replacement } of file.replacements) {
      const newMd = md.replace(pattern, replacement);
      if (newMd !== md) {
        applied++;
        md = newMd;
      }
    }
    if (md !== original) {
      result.versionSync = result.versionSync || {};
      result.versionSync[file.name] = { applied };
      result.filesToWrite = result.filesToWrite || {};
      result.filesToWrite[file.path] = md;
    }
  }
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

function sync(options = {}) {
  const result = { added: [], removed: [], updated: false, dryRun: false, warnings: [] };

  if (!fs.existsSync(ROADMAP_MD)) {
    return { ...result, error: `04.md 不存在: ${ROADMAP_MD}` };
  }

  const md = fs.readFileSync(ROADMAP_MD, 'utf8');
  const next = loadNext();
  const historyIds = new Set(loadHistory().map(e => e.id));

  // 2026-06-30: §十二 ⏳ 段已改为 P0/P3 分组表，不再自动追加/删除 table 行
  // 只同步顶部元数据 + 当前队列状态文字，⏳ 段 table 由人工维护

  const newCount = next.length;
  const completedSection = findCompletedSection(md);
  const completedCount = completedSection?.lineCount || historyIds.size;
  const evoCount = next.filter(e => e.id.startsWith('EVOLVE-')).length;
  const auditCount = next.filter(e => e.id.startsWith('AUDIT-')).length;
  const researchCount = next.filter(e => e.id.startsWith('RESEARCH-')).length;
  const manualCount = next.length - evoCount - auditCount - researchCount;
  const p0Count = next.filter(e => e.priority === 'P0').length;
  const p1Count = next.filter(e => e.priority === 'P1').length;
  const p2Count = next.filter(e => e.priority === 'P2').length;
  const p3Count = next.filter(e => e.priority === 'P3').length;

  let updatedMd = findAndReplaceTopMeta(md, [
    {
      pattern: /(\*\*最近一次同步\*\*：)[\d-]+(\s*\(v)\d+\.\d+\.\d+(.*?)$/m,
      replacement: `$1${now().slice(0, 10)}$2${loadPackageVersion() || '3.0.5'}$3`,
    },
    {
      pattern: /(\*\*当前 `next` 队列状态\*\*：|\*\*next 队列：)[^\n]+$/m,
      replacement: `$1🟡 **${newCount} 条候选**（${evoCount} EVOLVE + ${auditCount} AUDIT + ${researchCount} RESEARCH${manualCount > 0 ? ` + ${manualCount} 手动` : ''} · sync-roadmap 自动同步于 ${now().slice(0, 10)}）`,
    },
  ]);

  // 同步 §十二 末尾"当前队列状态"段（如果存在）
  updatedMd = updatedMd.replace(
    /(- \*\*next 队列：)\d+ 条（\d+ P0 \+ \d+ P1 \+ \d+ P3）\*\*/m,
    `$1${newCount} 条（${p0Count} P0 + ${p1Count} P1 + ${p3Count} P3）**`
  );

  // 同步版本号 metadata（默认开启，--no-version 跳过）
  if (!options.noVersion) {
    syncVersionMetadata(result);
    if (result.filesToWrite?.[ROADMAP_MD]) {
      updatedMd = result.filesToWrite[ROADMAP_MD];
    }
  }

  result.updated = updatedMd !== md || Object.keys(result.filesToWrite || {}).some(p => p !== ROADMAP_MD);
  result.newMd = updatedMd;
  result.message = result.updated ? '已同步顶部元数据 + 版本号' : '无需变更';
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
  const noVersion = args.includes('--no-version');

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

  const result = sync({ noVersion });
  if (result.error) {
    log(`❌ 错误: ${result.error}`);
    process.exit(1);
  }

  if (result.added.length > 0) log(`  ➕ 新增: ${result.added.join(', ')}`);
  if (result.removed.length > 0) log(`  ➖ 删除: ${result.removed.join(', ')}`);
  if (result.versionSync) {
    for (const [name, { applied }] of Object.entries(result.versionSync)) {
      log(`  🔢 版本号同步 (${name}): ${applied} 处`);
    }
  }
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => log(`  ⚠️  ${w}`));
  }
  log(result.message || (result.updated ? '✅ 已同步' : '⏭️ 无需变更'));

  if (dryRun) {
    log('🔍 DRY-RUN: 未写盘');
    return;
  }

  if (result.updated) {
    // 04.md
    if (result.newMd) {
      fs.writeFileSync(ROADMAP_MD, result.newMd);
    }
    // 其它文档（01.md / PROJECT-CONTEXT.md）
    for (const [filePath, content] of Object.entries(result.filesToWrite || {})) {
      if (filePath !== ROADMAP_MD) {
        fs.writeFileSync(filePath, content);
      }
    }
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
  findCompletedSection,
  findStatusStats,
  buildPlannedRow,
  syncVersionMetadata,
  loadPackageVersion,
  ROADMAP_MD,
  EVOLUTION_PLAN,
};
