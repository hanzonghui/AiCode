#!/usr/bin/env node
/**
 * promote-kb.js — KB 毕业（promote）机制（M48-A · neat-freak 借鉴）
 *
 * 作用：
 *   - 把"稳定下来"的 KB 从 memory 升入 docs（CLAUDE.md / 02.md / 04.md 体系），
 *     源文件缩成 1 行 pointer（或删除）
 *   - 这是治理 memory 膨胀的唯一治本手段
 *
 * 毕业三触发（任一即触发）：
 *   1. **同一主题的教训反复出现到第 3 次**（count >= 3）→ 它已是稳定知识
 *   2. **它讲的是"系统怎么工作"而非"我们踩过什么坑"**（category: 技术/概念澄清）→ 本就是 docs 的职责
 *   3. **它是"X 上线 / 落地 / 就位"的事件记录**（category: 事件 且 created > 14 天）→ 过程进 git log，memory 不留常驻
 *
 * 判据一句话：「下一个接手的人（不只是我自己）需要知道这件事吗？」需要 → 升 docs；不需要 → 缩 pointer。
 *
 * 用法：
 *   node promote-kb.js --report              # 看哪些 KB 达到毕业条件
 *   node promote-kb.js --dry-run             # 输出将做的动作，不写文件
 *   node promote-kb.js --apply               # 实际执行（需 --yes 确认，否则交互式 yes）
 *   node promote-kb.js --apply --yes         # 直接执行（CI / 自主模式用，无交互）
 *   node promote-kb.js --apply --delete      # 升 docs 后删源（不留 pointer）
 *   node promote-kb.js --apply --target docs # 升 docs/02.md（默认升 CLAUDE.md）
 *   node promote-kb.js --promote-to-asset     # 毕业到 .claude/prompt-assets/（M54 Phase 3）
 *   node promote-kb.js --kb KB-20260629-001  # 只对单条操作
 *
 * 纯函数离线，不接 hook。
 *
 * @since v3.0.6 (2026-06-29) — M48-A neat-freak 完整借鉴
 * @source 04_自我演进路线.md §0.4 增量 M48-A
 * @origin github.com/KKKKhazix/khazix-skills/neat-freak
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const KB_DIR = path.join(
  WORKSPACE_ROOT,
  '.claude',
  'skills',
  'left-brain',
  'memory',
  'knowledge'
);
const MEMORY_INDEX = path.join(
  WORKSPACE_ROOT,
  '.claude',
  'skills',
  'left-brain',
  'memory',
  'MEMORY.md'
);

// 毕业条件阈值
const PROMOTE_CONFIG = {
  // 触发 1：同一主题出现次数
  repeatCountThreshold: 3,
  // 触发 3：事件类 KB 毕业天数
  eventAgeDays: 14,
  // 不需毕业的常驻类型
  evergreenCategories: ['reference', 'preference', '偏好'],
  // 自动升 docs 目标（默认升 CLAUDE.md 顶部"参考指针"段）
  defaultTarget: 'CLAUDE.md',
  // prompt-asset 目录（M54 Phase 3）
  assetDir: path.join(WORKSPACE_ROOT, '.claude', 'prompt-assets'),
  // 升 docs 时写什么
  pointerTemplate: (kb) => `- [${kb.title}](${path.basename(kb.filePath)}) — ${kb.oneLineSummary}`,
  // 缩为 pointer 时的源文件模板
  sourcePointerTemplate: (kb) => `# ${kb.title}\n\n> **已毕业到 ${kb.promoteTarget}**（${new Date().toISOString().slice(0, 10)} · M48-A）\n> 原始内容见 docs/${path.basename(kb.filePath)}。\n`,
  // 缩为 pointer 到 prompt-asset 时的源文件模板
  assetPointerTemplate: (kb, assetPath) => `# ${kb.title}\n\n> **已毕业到 ${assetPath}**（${new Date().toISOString().slice(0, 10)} · M48-A + M54 Phase 3）\n> 原始内容见 ${assetPath}。\n`,
};

// ── 工具函数 ─────────────────────────────────────────

/**
 * 解析单个 KB 文件的 frontmatter
 * @param {string} filePath
 * @returns {{ title: string, category: string, created: string, tags: string[], filePath: string, content: string, oneLineSummary: string }}
 */
function parseKB(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { filePath, title: path.basename(filePath, '.md'), category: 'unknown', created: '', tags: [], content: raw, oneLineSummary: '' };
  }
  const frontmatter = fmMatch[1];
  const content = fmMatch[2];
  // 简单解析（key: value）
  const get = (key) => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const tagsRaw = get('tags') || '';
  const tags = tagsRaw ? tagsRaw.replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean) : [];
  // 提取一句话摘要：取第一段非空非标题内容
  const firstPara = content.split('\n\n').find(p => p.trim() && !p.trim().startsWith('#') && !p.trim().startsWith('>'));
  const oneLineSummary = firstPara ? firstPara.replace(/[#*`>]/g, '').trim().slice(0, 100) : '';
  // title 三级 fallback：frontmatter.title → content 首行 # 标题 → 文件名
  const titleFromFm = get('title');
  const titleFromHeader = (() => {
    const m = content.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : '';
  })();
  return {
    filePath,
    title: titleFromFm || titleFromHeader || path.basename(filePath, '.md'),
    category: get('category') || 'unknown',
    created: get('created') || get('date') || '',
    tags,
    content,
    oneLineSummary,
  };
}

/**
 * 计算 KB 创建距今天数
 */
function ageInDays(created) {
  if (!created) return 0;
  const d = new Date(created);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 毕业判定
 * @param {object} kb
 * @param {Map<string, number>} repeatMap  key=title 前缀词, val=出现次数
 * @returns {{ shouldPromote: boolean, reason: string }}
 */
function judgePromote(kb, repeatMap) {
  // 1. 常驻类直接跳过
  if (PROMOTE_CONFIG.evergreenCategories.includes(kb.category)) {
    return { shouldPromote: false, reason: `常驻类 (${kb.category})` };
  }
  // 2. 触发 1：同一主题出现 N 次
  const key = topicKey(kb.title);
  const count = key ? (repeatMap.get(key) || 0) : 0;
  if (count >= PROMOTE_CONFIG.repeatCountThreshold) {
    return { shouldPromote: true, reason: `触发 1: 主题 "${key}" 反复出现 ${count} 次` };
  }
  // 3. 触发 2：技术/概念类（"系统怎么工作"）
  if (['技术', '概念澄清'].includes(kb.category)) {
    return { shouldPromote: true, reason: `触发 2: ${kb.category} 类 = 系统机制描述，docs 职责` };
  }
  // 4. 触发 3：事件类超过 14 天
  if (kb.category === '事件') {
    const days = ageInDays(kb.created);
    if (days >= PROMOTE_CONFIG.eventAgeDays) {
      return { shouldPromote: true, reason: `触发 3: 事件类 ${days} 天前，过程归 git log` };
    }
  }
  return { shouldPromote: false, reason: '未触发任何毕业条件' };
}

/**
 * 构建 repeatMap（扫所有 KB）
 */
function topicKey(title) {
  // KB-YYYYMMDD-NNN 风格的文件名不算主题
  const cleaned = title.replace(/^KB-\d{8}-\d+\s*/, '').trim();
  // 取连续英文 token 的前 4 字符（避免 KB-YYYYMMDD 把全文件聚合）
  const m = cleaned.match(/[a-zA-Z]{4,}/);
  return m ? m[0].slice(0, 4).toLowerCase() : '';
}

function buildRepeatMap(allKBs) {
  const map = new Map();
  for (const kb of allKBs) {
    const key = topicKey(kb.title);
    if (key) map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/**
 * 生成 topic key（暴露给测试用）
 */
function _topicKeyForTest(title) { return topicKey(title); }

/**
 * 列出所有 KB
 */
function listAllKBs() {
  if (!fs.existsSync(KB_DIR)) return [];
  return fs.readdirSync(KB_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => parseKB(path.join(KB_DIR, f)));
}

// ── 主流程 ───────────────────────────────────────────

function cmdReport() {
  const all = listAllKBs();
  const repeat = buildRepeatMap(all);
  const judged = all.map(kb => {
    const r = judgePromote(kb, repeat);
    return { ...kb, ...r };
  });
  const toPromote = judged.filter(k => k.shouldPromote);
  const keep = judged.filter(k => !k.shouldPromote);

  console.log(`\n📊 KB 毕业体检报告 (${new Date().toISOString().slice(0, 10)})\n`);
  console.log(`总计: ${all.length} 条 KB`);
  console.log(`  - 建议毕业: ${toPromote.length} 条`);
  console.log(`  - 保持常驻: ${keep.length} 条\n`);

  if (toPromote.length) {
    console.log('🎓 建议毕业 (升 docs + 缩源为 pointer):\n');
    for (const k of toPromote) {
      console.log(`  - [${k.category}] ${k.title}`);
      console.log(`    原因: ${k.reason}`);
      console.log(`    目标: ${PROMOTE_CONFIG.defaultTarget}`);
      console.log(`    摘要: ${k.oneLineSummary}\n`);
    }
  }
  if (keep.length) {
    console.log(`\n📌 保持常驻 (${keep.length} 条):\n`);
    for (const k of keep.slice(0, 5)) {
      console.log(`  - [${k.category}] ${k.title} — ${k.reason}`);
    }
    if (keep.length > 5) console.log(`  ... 还有 ${keep.length - 5} 条`);
  }
  return { toPromote, keep };
}

function cmdApply({ deleteSource = false, target = null, kbFilter = null, confirmed = false, promoteToAsset = false }) {
  const all = listAllKBs();
  const repeat = buildRepeatMap(all);
  const filtered = kbFilter ? all.filter(k => k.filePath.includes(kbFilter)) : all;
  const judged = filtered.map(kb => {
    const r = judgePromote(kb, repeat);
    return { ...kb, ...r, promoteTarget: target || PROMOTE_CONFIG.defaultTarget };
  });
  const toPromote = judged.filter(k => k.shouldPromote);

  if (toPromote.length === 0) {
    console.log('\n✅ 没有 KB 达到毕业条件。\n');
    return { toPromote, actionPlan: [] };
  }

  // 闸门：未确认时打印计划并要求 yes
  if (!confirmed) {
    const actionLabel = promoteToAsset ? '写入 .claude/prompt-assets/' : `升 ${target || PROMOTE_CONFIG.defaultTarget}`;
    console.log(`\n⚠️  将对 ${toPromote.length} 条 KB 执行毕业（${actionLabel}，${deleteSource ? '删除源' : '保留源'}）:\n`);
    for (const k of toPromote) {
      console.log(`  → ${k.title}`);
      console.log(`    目标: ${promoteToAsset ? '.claude/prompt-assets/' : k.promoteTarget}`);
      console.log(`    源: ${deleteSource ? '删除' : '缩为 1 行 pointer'}`);
      console.log(`    原因: ${k.reason}\n`);
    }
    console.log(`提示: 这是破坏性操作，请用 --yes 确认执行。\n`);
    console.log(`      例: node promote-kb.js --apply --yes --target 02.md\n`);
    return { toPromote, actionPlan: [], aborted: 'awaiting-confirm' };
  }

  // 实际执行：缩源为 pointer + 追加到 docs/目标文件 或 写入 prompt-asset
  console.log(`\n🔧 实际执行毕业（${toPromote.length} 条）:\n`);
  const actionPlan = [];
  for (const k of toPromote) {
    try {
      let assetPath = null;
      if (promoteToAsset) {
        assetPath = writeAsset(k);
      }
      shrinkKB(k, deleteSource, assetPath);
      actionPlan.push({ ...k, action: deleteSource ? 'delete' : 'shrink', assetPath });
      console.log(`  ✅ ${k.title} → ${assetPath || k.promoteTarget} (${deleteSource ? '删除源' : '缩 pointer'})`);
    } catch (err) {
      console.error(`  ❌ ${k.title}: ${err.message}`);
    }
  }
  console.log(`\n📊 完成: ${actionPlan.length}/${toPromote.length} 成功\n`);

  return { toPromote, actionPlan };
}

/**
 * 把 KB 内容写入 .claude/prompt-assets/ 作为可复用 asset
 * @param {object} kb
 * @returns {string} 相对工作空间根的 asset 路径
 */
function writeAsset(kb) {
  const slug = path.basename(kb.filePath, '.md').toLowerCase().replace(/^kb-\d{8}-\d+_?/, '');
  const categoryDir = kb.category === '技术' ? 'system-prompts' :
                      kb.category === '概念澄清' ? 'phase-prompts' : 'general';
  const dir = path.join(PROMOTE_CONFIG.assetDir, categoryDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const assetFileName = `${slug}.v1.md`;
  const assetPath = path.join(dir, assetFileName);
  const relPath = path.relative(WORKSPACE_ROOT, assetPath).replace(/\\/g, '/');

  const fmLines = [
    '---',
    `asset-type: ${categoryDir === 'system-prompts' ? 'system-prompt' : 'phase-prompt'}`,
    'asset-version: 1.0.0',
    `source: ${path.relative(WORKSPACE_ROOT, kb.filePath).replace(/\\/g, '/')}`,
    `promoted-from: ${path.basename(kb.filePath, '.md')}`,
    `promoted-at: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
  ];

  fs.writeFileSync(assetPath, fmLines.join('\n') + kb.content, 'utf8');
  return relPath;
}

/**
 * 把 KB 缩为 1 行 pointer（不动 docs 目标文件 — docs 由 doc-sync 规则统一同步）
 *
 * pointer 格式：
 *   <!-- KB-YYYYMMDD-NNN 已毕业 @ YYYY-MM-DD → docs/02.md -->
 */
function shrinkKB(kb, deleteSource, assetPath = null) {
  const target = assetPath || kb.promoteTarget;
  const pointerLine = assetPath
    ? PROMOTE_CONFIG.assetPointerTemplate(kb, assetPath)
    : `<!-- ${path.basename(kb.filePath, '.md')} 已毕业 @ ${new Date().toISOString().slice(0, 10)} → ${target} -->\n`;

  if (deleteSource) {
    fs.unlinkSync(kb.filePath);
  } else {
    fs.writeFileSync(kb.filePath, pointerLine);
  }
}

/**
 * dry-run：显示计划，不写任何文件
 */
function cmdDryRun({ deleteSource = false, target = null, kbFilter = null, promoteToAsset = false }) {
  const all = listAllKBs();
  const repeat = buildRepeatMap(all);
  const filtered = kbFilter ? all.filter(k => k.filePath.includes(kbFilter)) : all;
  const judged = filtered.map(kb => {
    const r = judgePromote(kb, repeat);
    return { ...kb, ...r, promoteTarget: target || PROMOTE_CONFIG.defaultTarget };
  });
  const toPromote = judged.filter(k => k.shouldPromote);

  const actionLabel = promoteToAsset ? '写入 .claude/prompt-assets/' : `升 ${target || PROMOTE_CONFIG.defaultTarget}`;
  console.log(`\n🔍 [DRY-RUN] 将对 ${toPromote.length} 条 KB 执行毕业（${actionLabel}，不写文件）:\n`);
  for (const k of toPromote) {
    console.log(`  → ${k.title}`);
    console.log(`    目标: ${promoteToAsset ? '.claude/prompt-assets/' : k.promoteTarget}`);
    console.log(`    源: ${deleteSource ? '删除' : '缩为 1 行 pointer'}`);
    console.log(`    原因: ${k.reason}\n`);
  }
  if (toPromote.length === 0) {
    console.log('  （无）');
  }
  console.log(`\n提示: dry-run 不写文件。如确认执行: node promote-kb.js --apply --yes\n`);

  return { toPromote, dryRun: true };
}

// ── CLI ──────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: null, deleteSource: false, target: null, kbFilter: null, confirmed: false, promoteToAsset: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report') opts.mode = 'report';
    else if (args[i] === '--dry-run') opts.mode = 'dry-run';
    else if (args[i] === '--apply') opts.mode = 'apply';
    else if (args[i] === '--yes') opts.confirmed = true;
    else if (args[i] === '--delete') opts.deleteSource = true;
    else if (args[i] === '--promote-to-asset') opts.promoteToAsset = true;
    else if (args[i] === '--target' && args[i + 1]) { opts.target = args[++i]; }
    else if (args[i] === '--kb' && args[i + 1]) { opts.kbFilter = args[++i]; }
  }
  if (!opts.mode) opts.mode = 'report'; // 默认 report
  return opts;
}

function main() {
  const opts = parseArgs();
  if (opts.mode === 'report') {
    cmdReport();
  } else if (opts.mode === 'dry-run') {
    cmdDryRun(opts);
  } else if (opts.mode === 'apply') {
    cmdApply(opts);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseKB, judgePromote, buildRepeatMap, listAllKBs, ageInDays, topicKey, PROMOTE_CONFIG, parseArgs };
