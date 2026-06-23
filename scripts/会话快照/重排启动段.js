#!/usr/bin/env node
/**
 * 重排 00_ROOT_快速加载会话.md
 * 1. 把所有启动段（### <a id="启动-xxx">）收集起来
 * 2. 按时间倒序重新插入到 "## 🚀 快速启动命令" 段
 * 3. 删除错位的启动段（文件末尾、夹在中间）
 *
 * 运行: node scripts/会话快照/重排启动段.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, '00_ROOT_快速加载会话.md');

let content = fs.readFileSync(FILE, 'utf8');

// 1. 收集所有启动段（含代码块）
const lines = content.split('\n');
const segments = [];  // { startLine, content }

let currentStart = -1;
let currentContent = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 找到 "### <a id=\"启动-...\">" 开头
  if (line.match(/^### <a id="启动-/)) {
    // 如果已有段，先保存
    if (currentStart >= 0) {
      segments.push({ start: currentStart, content: currentContent });
    }
    currentStart = i;
    currentContent = [line];
  } else if (currentStart >= 0) {
    currentContent.push(line);
    // 段结束条件：遇到下一个 "### " 或 "## "
    if ((line.startsWith('### ') || line.startsWith('## ')) && i !== currentStart) {
      segments.push({ start: currentStart, content: currentContent });
      currentStart = -1;
      currentContent = [];
    }
  }
}
if (currentStart >= 0) {
  segments.push({ start: currentStart, content: currentContent });
}

console.log(`找到 ${segments.length} 个启动段`);

// 2. 删除所有启动段（按 startLine 倒序删，避免行号偏移）
const sortedSegments = [...segments].sort((a, b) => b.start - a.start);
for (const seg of sortedSegments) {
  lines.splice(seg.start, seg.content.length);
}
content = lines.join('\n');

// 3. 把启动段插入到 "## 🚀 快速启动命令（按时间倒序）" 之后
const marker = '## 🚀 快速启动命令（按时间倒序）';
const markerIdx = content.indexOf(marker);
if (markerIdx === -1) {
  console.error('❌ 找不到"## 🚀 快速启动命令"标题');
  process.exit(1);
}

// 找 marker 所在行
const beforeMarker = content.substring(0, markerIdx);
const beforeLines = beforeMarker.split('\n');
const insertLineIdx = beforeLines.length - 1;  // marker 所在行
const afterMarker = content.substring(markerIdx);

// 找 marker 之后第一个 --- 或 ## 行（这是"启动命令"段的结束位置）
const afterLines = afterMarker.split('\n');
let insertAfterLine = -1;
for (let i = 0; i < afterLines.length; i++) {
  if (i > 0 && (afterLines[i].startsWith('## ') || afterLines[i].match(/^---$/))) {
    insertAfterLine = i;
    break;
  }
}

if (insertAfterLine === -1) {
  console.error('❌ 找不到插入点');
  process.exit(1);
}

// 在 insertAfterLine 位置插入所有启动段
const newSegments = segments.map(s => s.content.join('\n')).join('\n\n');
afterLines.splice(insertAfterLine, 0, newSegments);

const newContent = beforeMarker + afterLines.join('\n');
fs.writeFileSync(FILE, newContent, 'utf8');

console.log(`✅ 已重排 ${segments.length} 个启动段到"🚀 快速启动命令"段内`);
console.log(`   文件总行数: ${newContent.split('\n').length}`);