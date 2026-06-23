#!/usr/bin/env node
/**
 * 快照保存脚本
 * 用法: node save.js "<标题>" "<标签>"
 * 示例: node save.js "智能调度 v1.1 完成" "milestone-v1.1"
 *
 * 保存内容:
 * 1. 对话历史（从左脑 session-summary 拿）
 * 2. 关键文件状态（git status 或文件 mtime）
 * 3. 知识库快照（前 20 条 KB）
 * 4. ROOT_QUICK_LOAD.md 索引条目
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, '.claude', 'snapshots');
const QUICK_LOAD_FILE = path.join(ROOT, '00_ROOT_快速加载会话.md');
const LEFT_BRAIN_DIR = path.join(ROOT, '.claude', 'skills', 'left-brain', 'memory');

// 确保目录
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

const title = process.argv[2] || '未命名快照';
// 标签清洗：去掉特殊字符，只保留中文/英文/数字/横线/下划线
let tag = process.argv[3] || 'manual';
tag = tag.replace(/[\\/:*?"<>+]/g, '-').substring(0, 30);

// v1.2 新增：支持 -m "消息" 参数（自定义"继续任务"内容）
let nextTaskMsg = null;
for (let i = 4; i < process.argv.length; i++) {
  if (process.argv[i] === '-m' && i + 1 < process.argv.length) {
    nextTaskMsg = process.argv[i + 1];
    break;
  }
}

const now = new Date();
// 用本地时间生成文件名（sv-SE 格式 = YYYY-MM-DD HH:mm:ss）
const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .substring(0, 19)
  .replace('T', ' ');  // 2026-06-22 08:17:59
const timestamp = localISO.replace(/[: ]/g, '-');  // 文件名用：2026-06-22-08-17-59
const dateStr = localISO.substring(0, 10);
const timeStr = localISO.substring(11, 16);

const filename = `${timestamp}-${tag}.md`;
const filepath = path.join(SNAPSHOT_DIR, filename);

// 收集数据
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

// 3. 关键文件状态
const keyFiles = [
  'CLAUDE.md',
  '.claude/settings.local.json',
  'scripts/orchestrator/dispatcher.js',
  'scripts/orchestrator/docs/DAILY-SUMMARY-20260622.md',
  'ROOT_QUICK_LOAD.md',
];

data.keyFiles = keyFiles.map(f => {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) {
    const stat = fs.statSync(fp);
    return { path: f, mtime: stat.mtime.toISOString(), size: stat.size };
  }
  return { path: f, exists: false };
});

// 生成快照内容
const content = generateSnapshot(data);
fs.writeFileSync(filepath, content, 'utf8');

console.log(`✅ 快照已保存: ${filename}`);
console.log(`   位置: ${filepath}`);
console.log(`   大小: ${(content.length / 1024).toFixed(1)} KB`);

// 更新 ROOT_QUICK_LOAD.md
updateQuickLoad(data);

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

_本快照由 scripts/snapshot/save.js 自动生成_
`;
}

function updateQuickLoad(d) {
  // 读现有内容
  if (!fs.existsSync(QUICK_LOAD_FILE)) {
    console.error('❌ 00_ROOT_快速加载会话.md 不存在');
    return;
  }
  let content = fs.readFileSync(QUICK_LOAD_FILE, 'utf8');

  // 生成表格锚点 ID（中文/特殊字符 → -）
  const anchorId = '启动-' + d.tag.replace(/[^\w一-龥]/g, '-');

  // ========== 1. 更新"快照列表"表格（加新行到开头）==========
  // 表格头固定为 "| 状态 | 时间 | 中文标签 | 标题 | 启动 |"
  const tableHeader = '| 状态 | 时间 | 中文标签 | 标题 | 启动 |';
  const headerIdx = content.indexOf(tableHeader);
  if (headerIdx === -1) {
    console.error('❌ 找不到"快照列表"表格头');
    return;
  }

  // 找表格后的换行
  const afterHeader = content.substring(headerIdx);
  const lines = afterHeader.split('\n');

  // 找分隔行（|:-----|...|）位置
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

  // 把所有"⭐ 最新"行改成普通（去标记，但保留列宽视觉对齐）
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('⭐ **最新**')) {
      // 用 18 个空格对齐（原列宽）
      lines[i] = lines[i].replace('⭐ **最新**', '                  ');
    }
  }

  // 新行（带 ⭐ 最新）插入到分隔行后
  const newRow = `| ⭐ **最新** | ${d.timestamp.substring(0, 16).replace('T', ' ')} | ${d.tag} | ${d.title} | [▶ 复制](#${anchorId}) |`;
  lines.splice(sepLineIdx + 1, 0, newRow);

  // 重组
  const newAfterHeader = lines.join('\n');
  content = content.substring(0, headerIdx) + newAfterHeader;

  // ========== 2. 把"快速启动命令"段插入到"## 🚀 快速启动命令"段开头 ==========
  // 用正则找二级标题（## 开头），不是文本里的"🚀"
  const sectionMarker = /^## 🚀 快速启动命令/m;
  const match = content.match(sectionMarker);
  if (!match) {
    console.error('❌ 找不到 "## 🚀 快速启动命令" 段');
    return;
  }
  const sectionIdx = match.index;

  // 找该段的 --- 分隔线（启动段开始位置）
  const afterSection = content.substring(sectionIdx);
  const dashMatch = afterSection.match(/\n---\n/);
  if (!dashMatch) {
    console.error('❌ 找不到启动段的 --- 分隔线');
    return;
  }
  const insertPos = sectionIdx + dashMatch.index + dashMatch[0].length;

  // 启动段：自定义消息 or 默认占位符
  const nextTaskLine = nextTaskMsg ? nextTaskMsg : '<填入你想继续做的事>';

  // v1.3 三级检查点：检测是否需要归档提示
  let levelHint = '';
  const isCompletionTag = d.tag && (
    d.tag.includes('完成') ||
    d.tag.includes('里程碑') ||
    d.tag.includes('交付')
  );
  const hasArchive = fs.existsSync(path.join(ROOT, 'archives'));
  if (isCompletionTag && hasArchive) {
    // 任务完成时提醒归档
    levelHint = `\n\n> 💡 **三级检查点提示**：本任务完成（标签含"完成/里程碑/交付"）。可跑 \`bash scripts/parallel/global-archive.sh "${d.title}"\` 全局归档`;
  }

  // 新启动段（无 "（最新）" 标记，避免累积）
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

  // 移除其他启动段的"（最新）"标记（只保留最新的）
  content = content.replace(/（最新）\n/g, '\n').replace(/（最新） /g, ' ');

  content = content.substring(0, insertPos) + newSegment + content.substring(insertPos);

  fs.writeFileSync(QUICK_LOAD_FILE, content, 'utf8');
  console.log(`✅ 索引已更新: 00_ROOT_快速加载会话.md`);
}