#!/usr/bin/env node
/**
 * doc-sync.js — 6 文档一致性检测（M24.6 + 2026-06-26 doc-sync v2）
 *
 * 作用：
 *   - 验证 6 个核心文档（CLAUDE/01/02/04/CHANGELOG/package.json）日期一致性
 *   - 验证 01.md §三 速查表 / 02.md §2.X 是否提及最近完成 M_N
 *   - 验证 04.md 顶部"最近一次同步"日期 >= CHANGELOG 最近日期
 *   - 验证 §十二 状态统计数字 = ✅ + ⏳ 实际行数
 *
 * 触发：
 *   - `node test-doc-sync.js`（手动）
 *   - `npm run doc:check`（npm script）
 *   - SessionStart hook（proactive-scan 7 维度之一 `doc-drift`）
 *
 * @since v3.0.5 (2026-06-26) M24.6
 * @source .claude/rules/doc-sync.md v2
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const CLAUDE_MD = path.join(WORKSPACE_ROOT, 'CLAUDE.md');
const M01 = path.join(WORKSPACE_ROOT, '01_AI-ClaudeCode-最佳实践精简.md');
const M02 = path.join(WORKSPACE_ROOT, '02_工作空间功能介绍.md');
const M04 = path.join(WORKSPACE_ROOT, '04_自我演进路线.md');
const M03 = path.join(WORKSPACE_ROOT, '03_版本迭代计划.md');
const CHANGELOG = path.join(WORKSPACE_ROOT, 'CHANGELOG.md');
const PACKAGE = path.join(WORKSPACE_ROOT, 'package.json');

// ── 工具函数 ─────────────────────────────────────────

function readMd(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

/**
 * 从 md 文本中提取最新 M_N（highest number）
 * 匹配 "M_N" "M_N+M" "M1" "M22" "M24" 等
 */
function extractLatestMilestone(md) {
  if (!md) return null;
  const matches = md.match(/\bM(\d+)\b/g) || [];
  if (matches.length === 0) return null;
  // 排除 "M0" "M1" "M2"（增量名常用）——只看 >= 3 位数
  const nums = matches
    .map(m => parseInt(m.slice(1), 10))
    .filter(n => n >= 3);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/**
 * 提取日期（YYYY-MM-DD 格式）
 */
function extractDates(md) {
  if (!md) return [];
  const re = /\b(\d{4}-\d{2}-\d{2})\b/g;
  const dates = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    dates.push(m[1]);
  }
  return dates;
}

/**
 * 检测 md 是否含某关键词
 */
function hasKeyword(md, keyword) {
  if (!md) return false;
  return md.includes(keyword);
}

// ── 主检查 ───────────────────────────────────────────

let pass = 0, fail = 0;
const fails = [];
const warnings = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

function warn(name, msg) {
  warnings.push(`${name}: ${msg}`);
  console.log(`⚠️  ${name}: ${msg}`);
}

console.log('━'.repeat(60));
console.log('📚 doc-sync 6 文档一致性检查（v3.0.5 M24.6）');
console.log('━'.repeat(60));
console.log('');

// ==================== 1. 文件存在 ====================
console.log('── 1. 文件存在 ──');

check('CLAUDE.md 存在', fs.existsSync(CLAUDE_MD));
check('01_AI-ClaudeCode-最佳实践精简.md 存在', fs.existsSync(M01));
check('02_工作空间功能介绍.md 存在', fs.existsSync(M02));
check('04_自我演进路线.md 存在', fs.existsSync(M04));
check('03_版本迭代计划.md 存在', fs.existsSync(M03));
check('CHANGELOG.md 存在', fs.existsSync(CHANGELOG));
check('package.json 存在', fs.existsSync(PACKAGE));

// ==================== 2. 关键日期提取 ====================
console.log('\n── 2. 关键日期提取 ──');

const claudeMd = readMd(CLAUDE_MD);
const m01 = readMd(M01);
const m02 = readMd(M02);
const m04 = readMd(M04);
const m03 = readMd(M03);
const changelog = readMd(CHANGELOG);
const pkg = readJson(PACKAGE);

const m04SyncDates = extractDates(m04).filter(d => {
  // 找 "最近一次同步" 后面那个日期
  const syncIdx = m04.indexOf('最近一次同步');
  if (syncIdx === -1) return false;
  return m04.indexOf(d) > syncIdx;
});
const m04Latest = m04SyncDates[0] || null;
const changelogDates = extractDates(changelog);
const changelogLatest = changelogDates[0] || null;

check('04.md 含"最近一次同步"', m04 && m04.includes('最近一次同步'));
check('04.md 提取到同步日期', !!m04Latest, `got: ${m04Latest}`);
check('CHANGELOG 提取到最近日期', !!changelogLatest, `got: ${changelogLatest}`);

// ==================== 3. 日期一致性 ====================
console.log('\n── 3. 日期一致性 ──');

if (m04Latest && changelogLatest) {
  check('04.md 同步日期 >= CHANGELOG 最近日期',
    m04Latest >= changelogLatest,
    `04=${m04Latest} vs changelog=${changelogLatest}`);
}

// ==================== 4. 最新 M_N 一致性 ====================
console.log('\n── 4. 最新 M_N 出现在所有文档 ──');

const latestM = extractLatestMilestone(changelog);
check('CHANGELOG 含最新 M_N', !!latestM, `latestM=${latestM}`);

if (latestM) {
  const mTag = `M${latestM}`;
  check(`01.md 提及 ${mTag}`, m01 && hasKeyword(m01, mTag));
  check(`02.md 提及 ${mTag}`, m02 && hasKeyword(m02, mTag));
  check(`04.md 提及 ${mTag}`, m04 && hasKeyword(m04, mTag));
  check(`CLAUDE.md 提及 ${mTag}`, claudeMd && hasKeyword(claudeMd, mTag));
}

// ==================== 5. 04.md §十二状态统计准确性 ====================
console.log('\n── 5. 04.md §十二状态统计准确性 ──');

if (m04) {
  // 数 ✅ 段实际行数
  const completedMatch = m04.match(/### ✅ 已完成（(\d+) 项）/);
  const plannedMatch = m04.match(/### ⏳ 计划中（[\s\S]+?）/);
  const totalMatch = m04.match(/\*\*合计\*\* \| \*\*(\d+)\*\* \| —/);

  if (completedMatch) {
    const declared = parseInt(completedMatch[1], 10);
    // 实际数：✅ 段到 ⏳ 段之间的 | **M_N** | 行
    const startIdx = m04.indexOf('### ✅ 已完成');
    const endIdx = m04.indexOf('### ⏳ 计划中', startIdx);
    const section = m04.slice(startIdx, endIdx === -1 ? m04.length : endIdx);
    const actual = (section.match(/^\| (\*\*)?M\d+(\*\*)? \|/gm) || []).length;
    check('✅ 段声明数量 = 实际行数', declared === actual, `声明 ${declared} vs 实际 ${actual}`);
  } else {
    warn('✅ 段', '未找到 "### ✅ 已完成（N 项）" 标题');
  }

  if (totalMatch) {
    const declaredTotal = parseInt(totalMatch[1], 10);
    // 04.md §十二 通常只列最近 16 项 history（前 20 截断），不一定包含全部
    // 所以这里只验证 declaredTotal >= history.length（M_N 都进了 ✅ 段）
    const evolutionPlan = readJson(path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json'));
    if (evolutionPlan) {
      const historyCount = evolutionPlan.history?.length || 0;
      const nextCount = evolutionPlan.next?.length || 0;
      // 04.md 声明的合计 = (✅ 实际行数) + (⏳ 实际行数) → 跟 history+next 不一定相等（因为 history 有 20 截断）
      // 改为更宽松：declaredTotal >= ✅ 实际行数 + next 数量
      const completedActual = parseInt(completedMatch?.[1] || '0', 10);
      check('合计 = ✅ 实际 + next 数量',
        declaredTotal === completedActual + nextCount,
        `声明 ${declaredTotal} vs ✅ ${completedActual} + ⏳ ${nextCount}`);
    }
  }
}

// ==================== 6. package.json version ====================
console.log('\n── 6. package.json ──');

if (pkg) {
  check('package.json 有 version 字段', !!pkg.version);
  check('package.json version 是 semver', /^\d+\.\d+\.\d+/.test(pkg.version || ''));
}

// ==================== 7. sync-roadmap.js 集成 ====================
console.log('\n── 7. sync-roadmap.js 集成 ──');

const syncRoadmap = require('./sync-roadmap.js');
check('sync-roadmap.js 模块可加载', !!syncRoadmap);
check('sync-roadmap.js 导出 sync 函数', typeof syncRoadmap.sync === 'function');
check('sync-roadmap.js 导出 ROADMAP_MD 路径', typeof syncRoadmap.ROADMAP_MD === 'string');
check('sync-roadmap.js 导出 EVOLUTION_PLAN 路径', typeof syncRoadmap.EVOLUTION_PLAN === 'string');

// evolution-lock.js 钩子
const evolutionLock = require('./evolution-lock.js');
const lockSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'evolution-lock.js'), 'utf8');
check('evolution-lock.js queue 包含 sync-roadmap 钩子',
  /queue[\s\S]*?sync-roadmap\.js/.test(lockSrc));
check('evolution-lock.js complete 包含 sync-roadmap 钩子',
  /complete[\s\S]*?sync-roadmap\.js/.test(lockSrc));

// ==================== 8. 子模块覆盖检测 ====================
console.log('\n── 8. 子模块覆盖检测（A/B/C/D/E/F/G 子模块在 01/02/04/CLAUDE 中提及）──');

/**
 * 从 04.md §0.4 提取最近一个增量的子模块列表
 * 格式：#### 增量 M24：...（A+B+C+D · 教程 + 自愈 + ...）
 * @returns {{id: string, submodules: string[], keywords: string[]} | null}
 */
function extractLatestIncrementWithSubmodules(md) {
  if (!md) return null;
  // 找最新 "#### 增量 M_N："
  const re = /####\s+增量\s+(M\d+)[：:]\s*([^\n]+)/g;
  const all = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    all.push({ id: m[1], title: m[2] });
  }
  if (all.length === 0) return null;
  // 取最后一个（最新增量）
  const latest = all[all.length - 1];

  // 提取子模块标记（A、B、C、D 等）和关键词
  // 标题格式：M24：handoff 链路下一增强（A+B+C+D · 教程 + 自愈 + 双向桥 + 同步脚本）
  const subMatch = latest.title.match(/[（(]([A-Z](?:\+[A-Z])+)\s*[·•]?\s*([^）)]*)/);
  if (!subMatch) return { id: latest.id, submodules: [], keywords: [] };

  const submodules = subMatch[1].split('+');
  const keywordStr = subMatch[2] || '';
  // 关键词：按 · + 分割
  const keywords = keywordStr.split(/[·•+]/).map(k => k.trim()).filter(k => k.length > 1);

  return { id: latest.id, submodules, keywords };
}

if (m04 && m01 && m02 && claudeMd) {
  const latest = extractLatestIncrementWithSubmodules(m04);
  if (latest && latest.submodules.length > 0) {
    console.log(`  检测到最新增量: ${latest.id} (子模块: ${latest.submodules.join('+')})`);

    // 每个子模块都应有关键词
    latest.submodules.forEach((sub, idx) => {
      const kw = latest.keywords[idx] || '';
      if (kw) {
        // 关键词至少出现在 01/02/04/CLAUDE 中 2 个
        const in01 = m01.includes(kw);
        const in02 = m02.includes(kw);
        const in04 = m04.includes(kw);
        const inClaude = claudeMd.includes(kw);
        const count = [in01, in02, in04, inClaude].filter(Boolean).length;
        check(`M${latest.id.slice(1)}-${sub} 关键词 "${kw}" 跨 4 文档覆盖 (>=2 文档)`,
          count >= 2,
          `01=${in01} 02=${in02} 04=${in04} CLAUDE=${inClaude}`);
      }
    });
  } else {
    warn('子模块检测', '最新增量无子模块标记（A+B+C+D 格式）');
  }
}

// ==================== 总结 ====================
console.log('');
console.log('━'.repeat(60));
console.log(`📊 doc-sync 检查: ${pass} 通过 / ${fail} 失败 / ${warnings.length} 警告`);
if (warnings.length > 0) {
  console.log('⚠️  警告:');
  warnings.forEach(w => console.log(`  - ${w}`));
}
if (fail > 0) {
  console.log('❌ 失败项:');
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
