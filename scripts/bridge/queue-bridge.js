#!/usr/bin/env node
/**
 * queue-bridge.js — 候选汇聚桥梁（v3.0.1 M16 → v3.0.3 M19-2）
 *
 * 作用：
 *   - 把 4 个分散的候选来源汇聚到 evolution-plan.json（next 队列）
 *     1. data/github/candidates.json  — /evolve GitHub 扫描结果（suggestion='adopt'）
 *     2. 04_自我演进路线.md 末尾 backlog 段 — /audit 自审整合建议
 *     3. .claude/audits/audit-*.md    — /audit 浅层报告第 6 段（P0/P1/P2）
 *     4. .claude/audits/research-*.md — Deep-research 调研报告
 *
 * 设计原则：
 *   - **半自动**：人工决定何时跑（不绑 cron），跑后输出去重报告让人工 review
 *   - **单一权威源**：只写 evolution-plan.json，其他源文件只读
 *   - **永不破坏**：dedupe 严格按 id 匹配；冲突时跳过并报告，不覆盖
 *   - **可观测**：每次跑都写 data/bridge/queue-sync-YYYYMMDD-HHMM.md 日志
 *   - **零依赖**：复用 evolution-lock.queue() + 解析 markdown
 *
 * 用法：
 *   node queue-bridge.js                  # 全量汇聚（4 个源）
 *   node queue-bridge.js --source evolve # 只看 evolve 候选
 *   node queue-bridge.js --source audit  # 只看 audit 候选
 *   node queue-bridge.js --dry-run       # 只打印不入队
 *
 * @since v3.0.1 (2026-06-25) M16
 * @updated v3.0.3 (2026-06-26) M19-2（+ audit 第 6 段 + research 报告）
 * @source 04_自我演进路线.md §0.4 M16 + M19
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const BRIDGE_DIR = path.join(DATA_DIR, 'bridge');

// 复用 evolution-lock 的 queue()（确保状态写一致）
const { queue: evoQueue } = require(path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'evolution-lock.js'));

// 复用 metrics Evolution 命名空间（接 M15 评价闭环）
let Metrics = null;
try { Metrics = require(path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'metrics.js')); } catch { /* 独立跑时无 metrics */ }
const { Evolution: Evo } = Metrics || { Evolution: null };

// ── 路径 ─────────────────────────────────────────────
const CANDIDATES_FILE = path.join(DATA_DIR, 'github', 'candidates.json');
const ROADMAP_FILE = path.join(WORKSPACE_ROOT, '04_自我演进路线.md');
const AUDIT_DIR = path.join(WORKSPACE_ROOT, '.claude', 'audits');

// ── ID 生成规则 ───────────────────────────────────────

/**
 * 候选 ID 命名规范（避免与手动 ID 冲突）：
 *   - evolve 来源：EVOLVE-<slug>（slug = repo name 转 kebab-case）
 *   - audit 来源：AUDIT-<timestamp>-<n>（时间戳 + 序号）
 *
 * 人工手动 ID 命名规范（M1~M15 / P0-0 / STAGE-N）：
 *   - 全大写 / 含连字符
 *   - 不以 EVOLVE- / AUDIT- 开头（保留命名空间）
 */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * 候选 ID 生成（带 namespace）
 */
function makeId(source, key) {
  if (source === 'evolve') return `EVOLVE-${slugify(key)}`;
  if (source === 'audit') return `AUDIT-${key}`; // key 形如 '20260625-1'
  if (source === 'research') return `RESEARCH-${slugify(key)}`; // v3.0.3 M19-2
  return slugify(key);
}

// ── 源 1：data/github/candidates.json ──────────────────

/**
 * 读 evolve 候选（adopt 建议）
 * @returns {Array<{id, title, source, score, summary, url}>}
 */
function readEvolveCandidates() {
  if (!fs.existsSync(CANDIDATES_FILE)) return [];
  let data;
  try { data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8')); }
  catch { return []; }

  const candidates = data.candidates || [];
  return candidates
    .filter(c => c.suggestion === 'adopt') // 只采纳"建议采纳"的
    .map(c => ({
      id: makeId('evolve', c.name || c.id || c.url),
      title: c.name || c.url || 'unknown',
      source: 'evolve',
      score: c.composite_score,
      summary: c.summary,
      url: c.url,
      effort: c.estimated_effort,
    }));
}

// ── 源 2：04.md backlog 段 ────────────────────────────

/**
 * 解析 04.md 末尾 backlog 段
 *
 * backlog 段格式（/audit 整合时写入）：
 *   ## 十三、backlog（待整合候选）
 *   ...
 *   ### 🔴 P0
 *   1. **[type]** title（effort）
 *      - detail
 *
 * @param {string} [filePath]  可选：自定义路径（测试用），默认用真 ROADMAP_FILE
 * @returns {Array<{id, title, source, priority, detail}>}
 */
function readRoadmapBacklog(filePath) {
  const fp = filePath || ROADMAP_FILE;
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf8');

  // 抓取最后一个 "## 十三" 或 "## Backlog" 段
  const backlogMatch = text.match(/## (?:十三|Backlog|backlog)[\s\S]*?(?=\n## |\s*$)/);
  if (!backlogMatch) return [];

  const backlog = backlogMatch[0];
  const results = [];

  // 按段解析：先分 P0/P1/P2 三段
  // 注意：🔴🟡🟢 是 surrogate pair，字符类 [🔴🟡🟢] 在 JS regex 中不可靠，改用 unicode 转义
  const sections = backlog.split(/(?=### \u{1F534}\u{FE0F}? P\d|### \u{1F7E1}\u{FE0F}? P\d|### \u{1F7E2}\u{FE0F}? P\d)/u);

  for (const sec of sections) {
    const pMatch = sec.match(/### (\u{1F534}|\u{1F7E1}|\u{1F7E2}) P(\d)/u);
    if (!pMatch) continue;
    const priority = `P${pMatch[2]}`;
    const num = priority === 'P0' ? 0 : priority === 'P1' ? 1 : 2;

    // 每条候选：`**[type]** title（effort）` + `   - detail`
    const itemRe = /\d+\.\s+\*\*\[([^\]]+)\]\*\*\s+([^\n（]+)（([^）]+)）\s*\n\s*-\s+([^\n]+)/g;
    let m;
    while ((m = itemRe.exec(sec)) !== null) {
      const [, type, title, effort, detail] = m;
      const id = makeId('audit', `${type}-${slugify(title)}`);
      results.push({
        id,
        title: title.trim(),
        source: 'audit',
        priority: `P${num + 1}`, // backlog P0 → 演进 P1（避免与最高优先混淆）
        detail: detail.trim(),
        effort: effort.trim(),
        type: type.trim(),
      });
    }
  }

  return results;
}

// ── 源 3a：.claude/audits/audit-*.md 第 6 段（v3.0.3 M19-2）────

/**
 * 读 audit 浅层报告第 6 段（P0/P1/P2 建议）
 *
 * 报告格式（quick-audit.js 输出）：
 *   ## 6. 💡 优化建议（按 ROI 排序）
 *   ### 🔴 P0
 *   1. **[type]** title（effort）
 *      - detail
 *   ### 🟡 P1
 *   ...
 *   ### 🟢 P2
 *   ...
 *
 * 取最新一份 audit 报告（避免重复入队旧建议）
 *
 * @returns {Array<{id, title, source, priority, detail}>}
 */
function readAuditBacklog() {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  const files = fs.readdirSync(AUDIT_DIR)
    .filter(f => /^audit-\d{8}-\d{4}\.md$/.test(f))
    .sort();
  if (files.length === 0) return [];
  // 取最新一份（避免重复入队已处理项）
  const latest = files[files.length - 1];
  return _parseAuditReport(path.join(AUDIT_DIR, latest));
}

/**
 * 解析单份 audit 报告（提取第 6 段 P0/P1/P2）
 */
function _parseAuditReport(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); }
  catch { return []; }

  // 抓取"## 6."段（最后一段 ## 6.💡 优化建议）
  const sectionMatch = text.match(/## 6\.[\s\S]*?(?=\n## |\n--- |\s*$)/);
  if (!sectionMatch) return [];
  const section = sectionMatch[0];

  const results = [];
  // 按 emoji 切分 P0/P1/P2 段
  const pSections = section.split(/(?=### 🔴 P0|### 🟡 P1|### 🟢 P2)/);

  for (const ps of pSections) {
    const pMatch = ps.match(/### (🔴|🟡|🟢) P(\d)/);
    if (!pMatch) continue;
    const priority = `P${pMatch[2]}`;

    // 每条: `1. **[type]** title（effort）` + `   - detail`
    const itemRe = /\d+\.\s+\*\*\[([^\]]+)\]\*\*\s+([^\n（]+)（([^）]+)）\s*\n\s*-\s+([^\n]+)/g;
    let m;
    while ((m = itemRe.exec(ps)) !== null) {
      const [, type, title, effort, detail] = m;
      const id = makeId('audit', `${type}-${slugify(title)}`);
      results.push({
        id,
        title: title.trim(),
        source: 'audit',
        priority: priority === 'P0' ? 'P1' : priority === 'P1' ? 'P2' : 'P3', // audit P0 → evolution P1
        detail: detail.trim(),
        effort: effort.trim(),
        type: type.trim(),
      });
    }
  }
  return results;
}

// ── 源 3b：.claude/audits/research-*.md（v3.0.3 M19-2）────

/**
 * 读 research 报告（Deep-research 产物）
 * 取头部 30 行（标题 + 调研范围 + 推荐路径摘要）
 *
 * @returns {Array<{id, title, source, priority, detail}>}
 */
function readResearchDigest() {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  const files = fs.readdirSync(AUDIT_DIR)
    .filter(f => /^research-.+\.md$/.test(f))
    .sort();
  if (files.length === 0) return [];

  const results = [];
  for (const f of files) {
    const fp = path.join(AUDIT_DIR, f);
    let text;
    try { text = fs.readFileSync(fp, 'utf8'); }
    catch { continue; }

    // 抓标题（第一个 # 开头）
    const titleMatch = text.match(/^# (.+)$/m);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    // 抓调研日期
    const dateMatch = text.match(/调研日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : f.match(/(\d{4}\d{2}\d{2})/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || 'unknown';

    // 抓推荐路径（看有没有 "推荐" 或 "路径" 关键词）
    const recommendMatch = text.match(/(推荐[路径\d]*)[\s\S]{0,200}/);
    const detail = recommendMatch
      ? recommendMatch[0].split('\n').slice(0, 3).join(' ').trim()
      : '调研报告（无推荐路径）';

    // ID = RESEARCH-{filename-slug}
    const id = makeId('research', f.replace(/\.md$/, ''));

    results.push({
      id,
      title,
      source: 'research',
      priority: 'P2', // research 报告默认 P2（远期调研参考，不直接行动）
      detail: `${date} | ${detail}`,
      effort: '调研参考',
      type: 'research',
    });
  }
  return results;
}

/**
 * 读最新一份 audit 报告
 */
function readLatestAuditReport() {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  const files = fs.readdirSync(AUDIT_DIR)
    .filter(f => /^audit-\d{8}-\d{4}\.md$/.test(f))
    .sort();
  if (files.length === 0) return [];
  const latest = files[files.length - 1];

  // 注意：直接读 report 会跟 04.md backlog 段重复
  // bridge 策略：04.md backlog 已读就不读 report（避免双倍）
  // 但 report 单独存在时仍可读
  return {
    file: latest,
    path: path.join(AUDIT_DIR, latest),
  };
}

// ── 汇聚 + dedupe ─────────────────────────────────────

/**
 * 多源合并 + dedupe
 * @param {Array<string>} sources  来源列表
 * @param {object} [opts] { roadmapPath }  可选自定义路径（测试用）
 */
function aggregate(sources, opts = {}) {
  const all = [
    ...(sources.includes('evolve') ? readEvolveCandidates() : []),
    ...(sources.includes('audit') ? readRoadmapBacklog(opts.roadmapPath) : []),
    ...(sources.includes('audit') ? readAuditBacklog() : []),
    ...(sources.includes('audit') ? readResearchDigest() : []),
  ];

  // dedupe by id
  const seen = new Set();
  const unique = [];
  const dups = [];
  for (const c of all) {
    if (seen.has(c.id)) {
      dups.push(c);
    } else {
      seen.add(c.id);
      unique.push(c);
    }
  }

  return { unique, dups, total_raw: all.length };
}

// ── 入队 ─────────────────────────────────────────────

/**
 * 把汇聚结果入队到 evolution-plan.json
 * @returns {{ added: [], skipped: [], errors: [] }}
 */
function enqueueAll(candidates, { dryRun = false } = {}) {
  const added = [];
  const skipped = [];
  const errors = [];

  for (const c of candidates) {
    if (dryRun) {
      added.push({ ...c, dryRun: true });
      continue;
    }
    try {
      const r = evoQueue(c.id, c.title, {
        note: c.summary || c.detail || null,
        priority: c.priority || 'P1',
      });
      if (r.queued) {
        added.push(c);
      } else {
        skipped.push({ ...c, reason: r.reason });
      }
    } catch (e) {
      errors.push({ ...c, error: e.message });
    }
  }

  return { added, skipped, errors };
}

// ── 日志写入 ─────────────────────────────────────────

/**
 * 写人类可读的同步日志
 */
function writeSyncLog(result, sources) {
  if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13); // YYYYMMDDHHMM
  const outPath = path.join(BRIDGE_DIR, `queue-sync-${ts}.md`);

  const lines = [];
  lines.push(`# 🔗 Queue Bridge Sync — ${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`);
  lines.push('');
  lines.push(`> **来源**：${sources.join(', ')}`);
  lines.push(`> **新增**：${result.added.length} 条`);
  lines.push(`> **跳过**：${result.skipped.length} 条（已存在）`);
  lines.push(`> **重复**：${result.dups.length} 条（源内 dedupe）`);
  lines.push(`> **错误**：${result.errors.length} 条`);
  lines.push('');

  if (result.added.length > 0) {
    lines.push('## ✅ 新增到 evolution-plan.json');
    lines.push('');
    for (const c of result.added) {
      const tag = c.dryRun ? '（dry-run）' : '';
      lines.push(`- **${c.id}** ${tag}（${c.source} · ${c.priority || 'P1'}）`);
      lines.push(`  - ${c.title}`);
      if (c.summary) lines.push(`  - ${c.summary.split('\n')[0]}`);
      if (c.detail) lines.push(`  - ${c.detail}`);
    }
    lines.push('');
  }

  if (result.skipped.length > 0) {
    lines.push('## ⏭️ 跳过（已存在）');
    lines.push('');
    for (const s of result.skipped) {
      lines.push(`- **${s.id}** — ${s.reason}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('## ❌ 错误');
    lines.push('');
    for (const e of result.errors) {
      lines.push(`- **${e.id}** — ${e.error}`);
    }
    lines.push('');
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

// ── 评价事件 ─────────────────────────────────────────

function recordMetric(syncResult) {
  if (!Evo) return;
  try {
    Evo.taskCompletionTime('queue-bridge.sync', syncResult.added.length, { added: syncResult.added.length, source: syncResult.sources });
  } catch { /* 不阻塞 */ }
}

// ── CLI ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sourceArg = args.indexOf('--source');
  let sources = ['evolve', 'audit', 'research'];
  if (sourceArg !== -1 && args[sourceArg + 1]) {
    sources = [args[sourceArg + 1]];
  }

  console.log('🔗 Queue Bridge — 候选汇聚');
  console.log('━'.repeat(50));
  console.log(`  来源: ${sources.join(', ')}`);
  console.log(`  模式: ${dryRun ? 'dry-run（不入队）' : '实际入队'}`);
  console.log('');

  const { unique, dups, total_raw } = aggregate(sources, { roadmapPath: process.env.M16_ROADMAP_PATH });
  console.log(`  原始候选: ${total_raw}`);
  console.log(`  dedupe 后: ${unique.length}`);
  console.log(`  源内重复: ${dups.length}`);
  console.log('');

  const enqResult = enqueueAll(unique, { dryRun });
  const result = { ...enqResult, dups, sources };

  console.log(`  ✅ 新增: ${result.added.length}`);
  console.log(`  ⏭️  跳过: ${result.skipped.length}`);
  console.log(`  ❌ 错误: ${result.errors.length}`);
  console.log('');

  if (result.added.length > 0 && !dryRun) {
    for (const c of result.added) {
      console.log(`    + [${c.source}] ${c.id} — ${c.title}`);
    }
  }

  // 写日志
  const logPath = writeSyncLog(result, sources);
  console.log('');
  console.log(`📝 同步日志: ${logPath}`);

  // 评价事件
  recordMetric(result);

  // exit code
  if (result.errors.length > 0) process.exit(1);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}

module.exports = {
  readEvolveCandidates,
  readRoadmapBacklog,
  readAuditBacklog,    // v3.0.3 M19-2
  readResearchDigest,  // v3.0.3 M19-2
  _parseAuditReport,   // v3.0.3 M19-2 (内部但导出供测试)
  aggregate,
  enqueueAll,
  writeSyncLog,
  makeId,
  slugify,
};
