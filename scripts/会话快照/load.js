#!/usr/bin/env node
/**
 * 快照加载脚本
 * 用法: node load.js [tag 或关键字]
 * 示例: node load.js v1.1
 *       node load.js latest
 *
 * 输出: 对应快照的"快速启动指令"，可直接复制到新会话
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, '.claude', 'snapshots');
const QUICK_LOAD_FILE = path.join(ROOT, 'ROOT_QUICK_LOAD.md');

const query = process.argv[2] || 'latest';

if (!fs.existsSync(SNAPSHOT_DIR)) {
  console.error('❌ 快照目录不存在:', SNAPSHOT_DIR);
  process.exit(1);
}

const files = fs.readdirSync(SNAPSHOT_DIR)
  .filter(f => f.endsWith('.md'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error('❌ 没有快照');
  process.exit(1);
}

let target = null;
if (query === 'latest') {
  target = files[0];
} else {
  // 模糊匹配
  target = files.find(f => f.toLowerCase().includes(query.toLowerCase()));
}

if (!target) {
  console.error(`❌ 没找到匹配 "${query}" 的快照`);
  console.log('可用快照:');
  files.slice(0, 10).forEach(f => console.log('  - ' + f));
  process.exit(1);
}

const content = fs.readFileSync(path.join(SNAPSHOT_DIR, target), 'utf8');

// 提取"恢复指令"部分
const match = content.match(/## 🔄 恢复指令([\s\S]*?)```\n([\s\S]*?)```/);
if (match) {
  console.log('='.repeat(60));
  console.log('📋 快速启动指令（复制下方到新会话）:');
  console.log('='.repeat(60));
  console.log('\n```\n' + match[2].trim() + '\n```\n');
  console.log('='.repeat(60));
  console.log(`快照文件: ${target}`);
  console.log(`位置: .claude/snapshots/${target}`);
  console.log('='.repeat(60));
} else {
  console.log('快照内容:');
  console.log(content);
}