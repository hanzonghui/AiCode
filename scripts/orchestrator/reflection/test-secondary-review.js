#!/usr/bin/env node
/**
 * secondary-review.js 单元测试
 * 验证风险评估、队列操作、CLI 入口、永不 throw 契约
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  assessRisk,
  addToQueue,
  markReviewed,
  clearQueue,
  loadQueue,
  formatQueue,
  isHighStakesFile,
  containsSecurityKeyword,
  QUEUE_FILE,
} = require('./secondary-review');

let pass = 0, fail = 0;
const fails = [];

function assert(cond, name, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// 备份/恢复队列
const BACKUP_FILE = `${QUEUE_FILE}.test-backup`;

function backupQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      fs.copyFileSync(QUEUE_FILE, BACKUP_FILE);
    }
  } catch {}
}

function restoreQueue() {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, QUEUE_FILE);
      fs.unlinkSync(BACKUP_FILE);
    } else {
      try { fs.unlinkSync(QUEUE_FILE); } catch {}
    }
  } catch {}
}

function resetQueue() {
  try { fs.unlinkSync(QUEUE_FILE); } catch {}
}

backupQueue();

// ==================== 1. 高风险文件判定 ====================
section('高风险文件判定');

{
  assert(isHighStakesFile('scripts/orchestrator/dispatcher.js'), 'dispatcher.js 高风险');
  assert(isHighStakesFile(path.resolve('scripts/orchestrator/dispatcher.js')), '绝对路径也识别');
  assert(isHighStakesFile('.claude/rules/behavior.md'), '规则文件高风险');
  assert(isHighStakesFile('package.json'), 'package.json 高风险');
  assert(isHighStakesFile('CLAUDE.md'), 'CLAUDE.md 高风险');
  assert(!isHighStakesFile('scripts/utils/helper.js'), '普通文件不高风险');
  assert(!isHighStakesFile('README.md'), 'README 不高风险');
}

// ==================== 2. 安全敏感关键词 ====================
section('安全敏感关键词');

{
  assert(containsSecurityKeyword('const token = "xxx"'), 'token 命中');
  assert(containsSecurityKeyword('api_key: process.env.SECRET'), 'api_key 命中');
  assert(containsSecurityKeyword('password hash'), 'password 命中');
  assert(containsSecurityKeyword('refresh token'), 'refresh token 命中');
  assert(!containsSecurityKeyword('normal text'), '普通文本不命中');
  assert(!containsSecurityKeyword(''), '空内容不命中');
}

// ==================== 3. 风险评估 ====================
section('风险评估');

{
  const r1 = assessRisk({ file_path: 'scripts/orchestrator/dispatcher.js' });
  assert(r1.highStakes, '高风险文件触发');
  assert(r1.reasons.length === 1, '只有 1 个原因');
  assert(r1.reasons[0].includes('dispatcher.js'), '原因含文件名');

  const r2 = assessRisk({ file_path: 'src/app.js', content: 'const token = "x"' });
  assert(r2.highStakes, '安全关键词触发');
  assert(r2.reasons.some(r => r.includes('安全敏感')), '原因含安全敏感');

  const r3 = assessRisk({ file_path: 'src/app.js', batch_size: 6 });
  assert(r3.highStakes, '批量 >5 触发');
  assert(r3.reasons.some(r => r.includes('6 个文件')), '原因含文件数');

  const r4 = assessRisk({ file_path: 'src/app.js' });
  assert(!r4.highStakes, '普通改动不触发');
  assert(r4.reasons.length === 0, '无原因');
}

// ==================== 4. 队列添加与去重 ====================
section('队列添加与去重');

{
  resetQueue();
  const result = addToQueue({
    file_path: 'scripts/orchestrator/dispatcher.js',
    content: 'exports.dispatch = () => {}',
    tool_name: 'Edit',
    batch_size: 1,
  });
  assert(result.added, '添加成功');
  assert(result.item.id.startsWith('review-'), 'id 格式正确');
  assert(result.item.status === 'pending', '状态 pending');

  const queue = loadQueue();
  assert(queue.length === 1, '队列 1 条');

  // 重复添加应去重
  const dup = addToQueue({
    file_path: 'scripts/orchestrator/dispatcher.js',
    content: 'exports.dispatch = () => {}',
    tool_name: 'Edit',
    batch_size: 1,
  });
  assert(!dup.added, '重复不添加');
  assert(loadQueue().length === 1, '队列仍 1 条');
}

// ==================== 5. markReviewed ====================
section('markReviewed');

{
  resetQueue();
  const { item } = addToQueue({
    file_path: 'package.json',
    tool_name: 'Edit',
  });

  const notFound = markReviewed('review-nonexistent', { approved: true });
  assert(!notFound.found, 'id 不存在返回 found:false');

  const approved = markReviewed(item.id, { approved: true });
  assert(approved.found, '找到 item');
  assert(approved.item.status === 'approved', '标记 approved');

  // 重复 reject 应覆盖
  const rejected = markReviewed(item.id, { approved: false });
  assert(rejected.item.status === 'rejected', '可改为 rejected');
}

// ==================== 6. clearQueue ====================
section('clearQueue');

{
  resetQueue();
  addToQueue({ file_path: 'CLAUDE.md', tool_name: 'Edit' });
  assert(loadQueue().length > 0, '清空前有数据');
  assert(clearQueue(), '清空成功');
  assert(loadQueue().length === 0, '清空后无数据');
}

// ==================== 7. formatQueue ====================
section('formatQueue');

{
  resetQueue();
  const empty = formatQueue([]);
  assert(empty.includes('为空'), '空队列提示');

  addToQueue({ file_path: 'scripts/orchestrator/dispatcher.js', tool_name: 'Edit' });
  const full = formatQueue(loadQueue());
  assert(full.includes('待复查'), '含待复查数量');
  assert(full.includes('dispatcher.js'), '含文件名');

  const compact = formatQueue(loadQueue(), true);
  assert(!compact.includes('dispatcher.js'), 'compact 不展示详情');
}

// ==================== 8. CLI 入口 ====================
section('CLI 入口');

{
  resetQueue();

  const outStatus = execFileSync('node', ['secondary-review.js', 'status'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outStatus.includes('为空') || outStatus.includes('待复查'), 'status 命令输出', `out=${outStatus.slice(0, 80)}`);
}

{
  resetQueue();
  const input = JSON.stringify({ file_path: 'package.json', tool_name: 'Edit' });
  const outAdd = execFileSync('node', ['secondary-review.js', 'add'], {
    cwd: __dirname, input, encoding: 'utf8', stdio: 'pipe',
  });
  const result = JSON.parse(outAdd);
  assert(result.added, 'add 命令成功');
}

{
  resetQueue();
  const { item } = addToQueue({ file_path: 'package.json', tool_name: 'Edit' });
  const outApprove = execFileSync('node', ['secondary-review.js', 'approve', item.id], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outApprove.includes('approve'), 'approve 命令输出', `out=${outApprove.slice(0, 80)}`);

  const outReject = execFileSync('node', ['secondary-review.js', 'reject', item.id], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outReject.includes('reject'), 'reject 命令输出', `out=${outReject.slice(0, 80)}`);
}

{
  resetQueue();
  addToQueue({ file_path: 'package.json', tool_name: 'Edit' });
  const outClear = execFileSync('node', ['secondary-review.js', 'clear'], {
    cwd: __dirname, encoding: 'utf8', stdio: 'pipe',
  });
  assert(outClear.includes('已清空'), 'clear 命令输出', `out=${outClear.slice(0, 80)}`);
}

// 未知命令 exit 1
{
  let code = 0;
  try {
    execFileSync('node', ['secondary-review.js', 'invalid-cmd'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 1, '未知命令 exit 1', `code=${code}`);
}

// ==================== 9. 永不 throw 契约 ====================
section('永不 throw 契约');

{
  let threw = false;
  try {
    addToQueue({ file_path: null, content: null });
    assessRisk({});
    markReviewed('x');
    formatQueue(null);
  } catch (e) {
    threw = true;
  }
  assert(!threw, '异常输入不抛错');

  let code = 0;
  try {
    execFileSync('node', ['secondary-review.js', 'status'], {
      cwd: __dirname, stdio: 'pipe',
    });
  } catch (e) {
    code = e.status;
  }
  assert(code === 0, 'CLI status 始终 exit 0', `code=${code}`);
}

// ==================== 10. 路径归一化 ====================
section('路径归一化');

{
  resetQueue();
  const abs = path.resolve('scripts/orchestrator/reflection/self-reflect.js');
  const result = addToQueue({ file_path: abs, tool_name: 'Edit' });
  assert(result.added, '绝对路径添加成功');
  assert(!result.item.file_path.includes('\\'), '保存为相对路径 + 正斜杠');
  assert(result.item.file_path.startsWith('scripts/'), '路径已相对化');
}

// ==================== 清理 + 恢复 ====================
restoreQueue();

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 secondary-review 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);
