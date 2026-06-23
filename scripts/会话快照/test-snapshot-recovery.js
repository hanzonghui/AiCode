#!/usr/bin/env node
/**
 * 快照恢复真实效果测试
 * 验证 save.js + load.js 能生成完整可恢复的快照上下文
 *
 * 覆盖：
 *   1. 快照文件包含会话摘要、最近 KB、关键文件状态
 *   2. load.js 能提取正确的恢复指令
 *   3. 恢复指令中包含继续任务
 *
 * 注意：测试会临时修改 latest_summary.md 和 00_ROOT_快速加载会话.md，
 *       测试结束后自动恢复。
 *
 * @since v1.7.1 (2026-06-22)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_DIR = __dirname;
const SNAPSHOT_DIR = path.join(ROOT, '.claude', 'snapshots');
const QUICK_LOAD_FILE = path.join(ROOT, '00_ROOT_快速加载会话.md');
const SUMMARY_FILE = path.join(ROOT, '.claude', 'skills', 'left-brain', 'memory', 'sessions', 'latest_summary.md');
const KB_DIR = path.join(ROOT, '.claude', 'skills', 'left-brain', 'memory', 'knowledge');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

function backup(file) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file + '.test-backup');
    return true;
  }
  return false;
}

function restore(file) {
  const backupFile = file + '.test-backup';
  if (fs.existsSync(backupFile)) {
    fs.copyFileSync(backupFile, file);
    fs.unlinkSync(backupFile);
  } else if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

(async () => {
  console.log('========================================');
  console.log('📸 快照恢复真实效果测试');
  console.log('========================================\n');

  const testTag = `test-recovery-${Date.now()}`;
  const testTitle = '测试快照恢复能力';
  const testNext = '继续完成 P1-4 真实效果测试';
  let snapshotFile = null;

  // 1. 备份并准备测试数据
  const hadSummary = backup(SUMMARY_FILE);
  const hadQuickLoad = backup(QUICK_LOAD_FILE);

  try {
    fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
    fs.writeFileSync(SUMMARY_FILE, `## 测试会话摘要\n\n本次测试验证快照恢复机制。\n继续任务: ${testNext}`, 'utf8');

    // 2. 创建临时 KB
    const testKbFile = path.join(KB_DIR, `KB-TEST-${Date.now()}.md`);
    fs.writeFileSync(testKbFile, `[KB-TEST-${Date.now()}] 测试 KB: 快照应包含最近知识`, 'utf8');

    // 3. 运行 save.js 创建快照
    const saveOutput = execSync(
      `node "${path.join(SCRIPT_DIR, 'save.js')}" "${testTitle}" "${testTag}" -m "${testNext}"`,
      { cwd: ROOT, encoding: 'utf8' }
    );
    const match = saveOutput.match(/快照已保存:\s*(.+)/);
    check('save.js 成功创建快照', !!match);

    if (match) {
      snapshotFile = match[1].trim();
      const snapshotPath = path.join(SNAPSHOT_DIR, snapshotFile);
      check('快照文件真实存在', fs.existsSync(snapshotPath));

      const content = fs.readFileSync(snapshotPath, 'utf8');
      check('快照包含会话摘要', content.includes('测试会话摘要'));
      check('快照包含继续任务', content.includes(testNext));
      check('快照包含最近 KB 列表', content.includes('测试 KB'));
    }

    // 4. 运行 load.js latest 获取恢复指令
    const loadOutput = execSync(
      `node "${path.join(SCRIPT_DIR, 'load.js')}" latest`,
      { cwd: ROOT, encoding: 'utf8' }
    );
    check('load.js 能输出恢复指令', loadOutput.includes('快速启动指令'));
    check('恢复指令包含快照标题', loadOutput.includes(testTitle));
    check('恢复指令包含继续任务', loadOutput.includes(testNext));
    check('恢复指令指向正确快照文件', snapshotFile && loadOutput.includes(snapshotFile));

    // 5. 清理临时快照
    if (snapshotFile) {
      const snapshotPath = path.join(SNAPSHOT_DIR, snapshotFile);
      if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
    }
    if (fs.existsSync(testKbFile)) fs.unlinkSync(testKbFile);
  } finally {
    // 6. 恢复备份
    restore(SUMMARY_FILE);
    restore(QUICK_LOAD_FILE);
  }

  console.log(`\n📊 快照恢复测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
