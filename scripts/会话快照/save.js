#!/usr/bin/env node
/**
 * 快照保存脚本（v2.0 - 可配置频率）
 * 用法: node save.js "<标题>" "<标签>" [-m "<继续任务>"] [--force]
 * 示例: node save.js "智能调度 v1.1 完成" "milestone-v1.1" -m "继续测试 P1"
 *
 * 配置: .claude/snapshot-config.json
 *   - mode: off | manual | milestone | auto
 *   - minIntervalMinutes: 两次快照最小间隔
 *   - excludeTags: 跳过的标签关键字
 *   - manualOverride: true 时显式调用可绕过模式限制
 *
 * 保存内容:
 * 1. 对话历史（从左脑 session-summary 拿）
 * 2. 关键文件状态（git status 或文件 mtime）
 * 3. 知识库快照（前 20 条 KB）
 * 4. 00_ROOT_快速加载会话.md 索引条目
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, '.claude', 'snapshots');
const QUICK_LOAD_FILE = path.join(ROOT, '00_ROOT_快速加载会话.md');
const LEFT_BRAIN_DIR = path.join(ROOT, '.claude', 'skills', 'left-brain', 'memory');
const CONFIG_FILE = path.join(ROOT, '.claude', 'snapshot-config.json');

// 默认配置
const DEFAULT_CONFIG = {
  mode: 'milestone',
  minIntervalMinutes: 30,
  autoCleanup: { enabled: true, keepCount: 30, keepDays: 14 },
  excludeTags: ['plan', 'test', 'temp', 'debug', 'wip'],
  manualOverride: true,
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_CONFIG;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('⚠️ 快照配置解析失败，使用默认配置:', e.message);
    return DEFAULT_CONFIG;
  }
}

const config = loadConfig();

// 解析参数
const args = process.argv.slice(2);
let title = args[0] || '未命名快照';
let tag = args[1] || 'manual';
let nextTaskMsg = null;
let force = false;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '-m' && i + 1 < args.length) {
    nextTaskMsg = args[i + 1];
    i++;
  } else if (args[i] === '--force') {
    force = true;
  }
}

// 标签清洗：去掉特殊字符，只保留中文/英文/数字/横线/下划线/逗号
tag = tag.replace(/[\\/:*?"<>+]/g, '-').substring(0, 50);

const isExplicitCall = !process.env.SNAPSHOT_AUTO;

// 模式检查
if (config.mode === 'off' && !force) {
  console.log('⏸️ 快照模式为 off，跳过保存（加 --force 可强制保存）');
  process.exit(0);
}

if (config.mode === 'manual' && !isExplicitCall && !force) {
  console.log('⏸️ 快照模式为 manual，自动调用跳过保存（显式调用 save.js 或加 --force 可保存）');
  process.exit(0);
}

if (config.mode === 'milestone' && !isExplicitCall && !force) {
  const milestoneKeywords = ['完成', '里程碑', '交付', 'done', 'milestone', 'verified', 'completed'];
  const isMilestone = milestoneKeywords.some(k => tag.toLowerCase().includes(k));
  if (!isMilestone) {
    console.log('⏸️ 快照模式为 milestone，非完成/里程碑标签跳过保存');
    process.exit(0);
  }
}

// 排除标签检查
if (config.excludeTags && config.excludeTags.length > 0) {
  const lowerTag = tag.toLowerCase();
  const excluded = config.excludeTags.find(et => lowerTag.includes(et.toLowerCase()));
  if (excluded && !force) {
    console.log(`⏸️ 标签命中排除规则 "${excluded}"，跳过保存（加 --force 可强制保存）`);
    process.exit(0);
  }
}

// 最小间隔检查
if (config.minIntervalMinutes > 0 && !force) {
  const files = fs.existsSync(SNAPSHOT_DIR)
    ? fs.readdirSync(SNAPSHOT_DIR)
        .filter(f => f.endsWith('.md') && !f.startsWith('plan-'))
        .map(f => ({ file: f, mtime: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)
    : [];
  if (files.length > 0) {
    const lastMtime = files[0].mtime;
    const minutesSince = (Date.now() - lastMtime) / 60000;
    if (minutesSince < config.minIntervalMinutes) {
      console.log(`⏸️ 距上次快照仅 ${Math.round(minutesSince)} 分钟（最小间隔 ${config.minIntervalMinutes} 分钟），跳过保存`);
      console.log(`   上次: ${files[0].file}`);
      process.exit(0);
    }
  }
}

// 确保目录
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

const now = new Date();
const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .substring(0, 19)
  .replace('T', ' ');
const timestamp = localISO.replace(/[: ]/g, '-');
const dateStr = localISO.substring(0, 10);
const timeStr = localISO.substring(11, 16);

const filename = `${timestamp}-${tag}.md`;
const filepath = path.join(SNAPSHOT_DIR, filename);

const data = {
  timestamp: localISO,
  title,
  tag,
  file: filename,
  nextTaskMsg,
};

// 1. 加载最近的 session 摘要
try {
  const summaryFile = path.join(LEFT_BRAIN_DIR, 'sessions', 'latest_summary.md');
  if (fs.existsSync(summaryFile)) {
    data.sessionSummary = fs.readFileSync(summaryFile, 'utf8');
  }
} catch (e) {
  data.sessionSummaryError = e.message;
}

// 2. 加载最近的 KB（前 20 条）
try {
  const kbDir = path.join(LEFT_BRAIN_DIR, 'knowledge');
  if (fs.existsSync(kbDir)) {
    const kbFiles = fs.readdirSync(kbDir)
      .filter(f => f.startsWith('KB-'))
      .sort()
      .reverse()
      .slice(0, 20);
    data.recentKB = kbFiles.map(f => {
      const content = fs.readFileSync(path.join(kbDir, f), 'utf8');
      const firstLine = content.split('\n').find(l => l.startsWith('[KB-')) || f;
      return { file: f, summary: firstLine.substring(0, 120) };
    });
  }
} catch (e) {
  data.recentKBError = e.message;
}

// 3. 关键文件状态（动态从存在的文件读取）
const keyFiles = [
  'CLAUDE.md',
  '.claude/settings.local.json',
  'PROJECT-CONTEXT.md',
  '00_ROOT_快速加载会话.md',
];

data.keyFiles = keyFiles.map(f => {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) {
    const stat = fs.statSync(fp);
    return { path: f, mtime: stat.mtime.toISOString(), size: stat.size };
  }
  return { path: f, exists: false };
});

// 4. 生成快照内容并保存
const content = generateSnapshot(data);
fs.writeFileSync(filepath, content, 'utf8');

console.log(`✅ 快照已保存: ${filename}`);
console.log(`   位置: ${filepath}`);
console.log(`   大小: ${(content.length / 1024).toFixed(1)} KB`);

// 5. 更新索引
updateQuickLoad(data);

// 6. 自动清理旧快照
if (config.autoCleanup && config.autoCleanup.enabled) {
  cleanupOldSnapshots(config.autoCleanup);
}

function generateSnapshot(d) {
  return `# 快照: ${d.title}

> **保存时间**: ${d.timestamp}
> **标签**: ${d.tag}
> **文件**: ${d.file}

---

## 📋 会话摘要

${d.sessionSummary || '_（无 session 摘要）_'}

---

## 🧠 最近知识库（前 20 条）

${(d.recentKB || []).map(kb => `- ${kb.file}: ${kb.summary}`).join('\n') || '_（无 KB）_'}

---

## 📁 关键文件状态

| 文件 | 修改时间 | 大小 |
|:-----|:---------|:-----|
${d.keyFiles.map(f =>
  f.exists !== false
    ? `| ${f.path} | ${f.mtime} | ${(f.size / 1024).toFixed(1)}KB |`
    : `| ${f.path} | _不存在_ | - |`
).join('\n')}

---

## 🔄 恢复指令

将以下内容复制到新会话开头，即可恢复本次会话上下文：

\`\`\`
我们之前的工作已快照在 ${d.file}。
标题: ${d.title}
时间: ${d.timestamp}
标签: ${d.tag}

会话摘要见上方"会话摘要"部分。
关键 KB 见上方"最近知识库"部分。
恢复后请先跑: bash .claude/skills/left-brain/scripts/session-summary.sh load
确认对话历史能加载。

继续任务: ${d.nextTaskMsg || '<填入你想继续做的事>'}
\`\`\`

---

_本快照由 scripts/会话快照/save.js 自动生成_
`;
}

function updateQuickLoad(d) {
  if (!fs.existsSync(QUICK_LOAD_FILE)) {
    console.error('❌ 00_ROOT_快速加载会话.md 不存在');
    return;
  }
  let content = fs.readFileSync(QUICK_LOAD_FILE, 'utf8');

  const anchorId = '启动-' + d.tag.replace(/[^\w一-龥]/g, '-');
  const tableHeader = '| 状态 | 时间 | 中文标签 | 标题 | 启动 |';
  const headerIdx = content.indexOf(tableHeader);
  if (headerIdx === -1) {
    console.error('❌ 找不到"快照列表"表格头');
    return;
  }

  const afterHeader = content.substring(headerIdx);
  const lines = afterHeader.split('\n');

  let sepLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|:--') || lines[i].startsWith('| :--') || lines[i].match(/^\|[-:\s|]+\|$/)) {
      sepLineIdx = i;
      break;
    }
  }
  if (sepLineIdx === -1) {
    console.error('❌ 找不到表格分隔行');
    return;
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('⭐ **最新**')) {
      lines[i] = lines[i].replace('⭐ **最新**', '                  ');
    }
  }

  const newRow = `| ⭐ **最新** | ${d.timestamp.substring(0, 16).replace('T', ' ')} | ${d.tag} | ${d.title} | [▶ 复制](#${anchorId}) |`;
  lines.splice(sepLineIdx + 1, 0, newRow);

  const newAfterHeader = lines.join('\n');
  content = content.substring(0, headerIdx) + newAfterHeader;

  const sectionMarker = /^## 🚀 快速启动命令/m;
  const match = content.match(sectionMarker);
  if (!match) {
    console.error('❌ 找不到 "## 🚀 快速启动命令" 段');
    return;
  }
  const sectionIdx = match.index;

  const afterSection = content.substring(sectionIdx);
  const dashMatch = afterSection.match(/\n---\n/);
  if (!dashMatch) {
    console.error('❌ 找不到启动段的 --- 分隔线');
    return;
  }
  const insertPos = sectionIdx + dashMatch.index + dashMatch[0].length;

  const nextTaskLine = nextTaskMsg || '<填入你想继续做的事>';

  let levelHint = '';
  const isCompletionTag = d.tag && (
    d.tag.includes('完成') ||
    d.tag.includes('里程碑') ||
    d.tag.includes('交付')
  );
  const hasArchive = fs.existsSync(path.join(ROOT, 'archives'));
  if (isCompletionTag && hasArchive) {
    levelHint = `\n\n> 💡 **三级检查点提示**：本任务完成（标签含"完成/里程碑/交付"）。可跑 \`bash scripts/parallel/global-archive.sh "${d.title}"\` 全局归档`;
  }

  const newSegment = `### <a id="${anchorId}"></a>📦 ${d.tag}（最新）

**时间**：${d.timestamp.substring(0, 19)}
**中文标签**：${d.tag}
**快照文件**：\`.claude/snapshots/${d.file}\`

\`\`\`
我们之前的工作已快照在 .claude/snapshots/${d.file}。
标题: ${d.title}
标签: ${d.tag}

${nextTaskLine}${levelHint}
\`\`\`

---

`;

  content = content.replace(/（最新）\n/g, '\n').replace(/（最新） /g, ' ');
  content = content.substring(0, insertPos) + newSegment + content.substring(insertPos);

  fs.writeFileSync(QUICK_LOAD_FILE, content, 'utf8');
  console.log(`✅ 索引已更新: 00_ROOT_快速加载会话.md`);
}

function cleanupOldSnapshots(opts) {
  if (!fs.existsSync(SNAPSHOT_DIR)) return;
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ file: f, path: path.join(SNAPSHOT_DIR, f), mtime: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) return;

  let removed = 0;
  const nowMs = Date.now();
  const keepDaysMs = (opts.keepDays || 14) * 24 * 60 * 60 * 1000;
  const keepCount = opts.keepCount || 30;

  files.forEach((f, idx) => {
    if (idx >= keepCount || (nowMs - f.mtime) > keepDaysMs) {
      fs.unlinkSync(f.path);
      removed++;
    }
  });

  if (removed > 0) {
    console.log(`🧹 自动清理: 移除 ${removed} 个过期快照，保留 ${files.length - removed} 个`);
  }
}
