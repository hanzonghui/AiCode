#!/usr/bin/env node
/**
 * index.js 端到端测试
 * 验证：dispatch → 决策日志 + 灰区反馈队列 完整链路
 */

const fs = require('fs');
const path = require('path');
const { dispatch } = require('./index');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dispatch-decisions.log');
const FEEDBACK_FILE = path.join(LOG_DIR, 'feedback.jsonl');

// 备份 + 清空，避免污染真实数据
function snapshot(file) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file + '.bak', content);
  return content;
}

function restore(file) {
  const bak = file + '.bak';
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, file);
    fs.unlinkSync(bak);
  } else if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

const logBackup = snapshot(LOG_FILE);
const fbBackup = snapshot(FEEDBACK_FILE);
// 清空做测试
if (fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
if (fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, '');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

try {
  // 1. 强信号任务 → dispatch=true，不入反馈队列
  const r1 = dispatch('全面排查点餐系统 BUG，前后端一起分析');
  check('强信号：dispatch=true', r1.dispatch === true);
  check('强信号：confidence 是数字', typeof r1.confidence === 'number');

  // 2. 强约束不派 → dispatch=false，不入反馈队列
  const r2 = dispatch('瞄一下这段代码');
  check('强约束：dispatch=false', r2.dispatch === false);

  // 3. 灰区任务 → dispatch=null，自动入反馈队列
  // "整理订单相关的几个文件、组件、页面" 触发 fileCount=3, moduleCount=1, taskType=optimization → 灰区
  const r3 = dispatch('整理订单相关的几个文件、组件、页面的代码逻辑');
  check('灰区：dispatch=null', r3.dispatch === null);
  check('灰区：有 suggested_action', r3.suggested_action?.action === 'dispatch');

  // 4. 验证日志写入
  const logLines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  check('日志：3 条记录', logLines.length === 3);
  const logEntry = JSON.parse(logLines[0]);
  check('日志：source=index.js', logEntry.source === 'index.js');
  check('日志：含 decision', logEntry.decision != null);

  // 5. 验证反馈队列（只灰区入队，应该 1 条）
  const fbLines = fs.readFileSync(FEEDBACK_FILE, 'utf8').trim().split('\n').filter(Boolean);
  check('反馈队列：1 条（仅灰区）', fbLines.length === 1);
  const fbEntry = JSON.parse(fbLines[0]);
  check('反馈队列：status=pending', fbEntry.status === 'pending');

  // 6. 空 prompt
  const r6 = dispatch('');
  check('空 prompt：dispatch=null', r6.dispatch === null);

} finally {
  // 还原
  if (logBackup !== null) {
    fs.writeFileSync(LOG_FILE, logBackup);
    if (fs.existsSync(LOG_FILE + '.bak')) fs.unlinkSync(LOG_FILE + '.bak');
  } else {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
  }
  if (fbBackup !== null) {
    fs.writeFileSync(FEEDBACK_FILE, fbBackup);
    if (fs.existsSync(FEEDBACK_FILE + '.bak')) fs.unlinkSync(FEEDBACK_FILE + '.bak');
  } else {
    if (fs.existsSync(FEEDBACK_FILE)) fs.unlinkSync(FEEDBACK_FILE);
  }
}

console.log(`\n📊 E2E 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
