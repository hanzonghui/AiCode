#!/usr/bin/env node
/**
 * 全量对话历史备份
 * 把 CC 的 history.jsonl 复制到快照目录
 * 用法: node backup-history.js "标签"
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, '.claude', 'snapshots');

// CC 历史文件位置（多平台兼容）
const possiblePaths = [
  'C:/Users/Administrator/.claude/history.jsonl',  // Windows
  '/c/Users/Administrator/.claude/history.jsonl',  // Git Bash
  path.join(process.env.HOME || '', '.claude/history.jsonl'),  // Mac/Linux
  path.join(process.env.USERPROFILE || '', '.claude/history.jsonl'),  // Windows env
];

// 标签清洗：去掉特殊字符
let tag = process.argv[2] || 'full-backup';
tag = tag.replace(/[\\/:*?"<>+]/g, '-').substring(0, 30);
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);

let sourceFile = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    sourceFile = p;
    break;
  }
}

if (!sourceFile) {
  console.error('❌ 找不到 history.jsonl，尝试过的路径:');
  possiblePaths.forEach(p => console.error('   - ' + p));
  process.exit(1);
}

const stat = fs.statSync(sourceFile);
const targetFile = path.join(SNAPSHOT_DIR, `${timestamp}-history-${tag}.jsonl`);

console.log(`📋 源文件: ${sourceFile}`);
console.log(`   大小: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

// 流式复制（大文件不爆内存）
const readStream = fs.createReadStream(sourceFile, { encoding: 'utf8' });
const writeStream = fs.createWriteStream(targetFile);

readStream.pipe(writeStream);

writeStream.on('finish', () => {
  console.log(`✅ 备份完成: ${path.basename(targetFile)}`);
  console.log(`   行数: ~${countLines(targetFile)}`);
});

writeStream.on('error', err => {
  console.error('❌ 写入失败:', err.message);
  process.exit(1);
});

function countLines(file) {
  const content = fs.readFileSync(file, 'utf8');
  return content.split('\n').filter(Boolean).length;
}