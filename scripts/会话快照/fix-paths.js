#!/usr/bin/env node
/**
 * 批量更新文档内的路径引用
 * 改完文件名后，把文档里的旧路径全部替换成新路径
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// 路径映射（旧 → 新）
const REPLACEMENTS = [
  // 目录改名
  { old: 'scripts/snapshot/', new: 'scripts/会话快照/' },
  { old: 'scripts/orchestrator/docs/', new: 'scripts/orchestrator/文档/' },
  { old: 'scripts/orchestrator/DECISION-GUIDE', new: 'scripts/orchestrator/决策指南' },
  { old: 'ROOT_QUICK_LOAD.md', new: '00_ROOT_快速加载会话.md' },

  // 文档改名
  { old: 'RESTART-GUIDE.md', new: '重启指南.md' },
  { old: 'PERMISSIONS-SETUP.md', new: '权限设置指南.md' },
  { old: 'PERMISSIONS-PATCH.md', new: '权限补丁模板.md' },
  { old: 'V1.2-IMPROVEMENTS.md', new: 'v1.2-改进清单.md' },
  { old: 'DAILY-SUMMARY-20260622.md', new: '每日总结-20260622.md' },
  { old: 'usage.md', new: '使用文档.md' },
];

// 要更新的文件（用户直接看的）
const TARGETS = [
  '00_ROOT_快速加载会话.md',
  'AI-ClaudeCode-最佳实践精简.md',
  'scripts/orchestrator/文档/重启指南.md',
  'scripts/orchestrator/文档/使用文档.md',
  'scripts/orchestrator/文档/权限设置指南.md',
  'scripts/orchestrator/文档/权限补丁模板.md',
  'scripts/orchestrator/文档/v1.2-改进清单.md',
  'scripts/orchestrator/文档/每日总结-20260622.md',
  'scripts/orchestrator/决策指南.md',
  '.claude/commands/dispatch.md',
  '.claude/commands/parallel.md',
  '.claude/snapshots/2026-06-21T22-39-07-milestone-v1.1+快照.md',
];

let totalChanges = 0;

for (const relPath of TARGETS) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  不存在: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let fileChanges = 0;

  for (const { old, new: newPath } of REPLACEMENTS) {
    // 全局替换
    const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) {
      content = content.replace(regex, newPath);
      fileChanges += matches.length;
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ ${relPath}: ${fileChanges} 处替换`);
    totalChanges += fileChanges;
  } else {
    console.log(`○  ${relPath}: 无需修改`);
  }
}

console.log(`\n总共 ${totalChanges} 处路径引用已更新`);