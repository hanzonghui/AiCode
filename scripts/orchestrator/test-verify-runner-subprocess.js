#!/usr/bin/env node
/**
 * test-verify-runner-subprocess.js — verify-runner-subprocess.js 的回归测试包装
 *
 * 调用 verify-runner-subprocess.js（21 项检查）并断言通过。
 * 用于 npm test 链路回归测试。
 *
 * @since v3.0.6 (2026-06-28)
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('▶ 运行 verify-runner-subprocess.js 验证...');

try {
  execSync('node scripts/orchestrator/verify-runner-subprocess.js', {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
  });
  console.log('\n✅ verify-runner-subprocess 全部通过');
  process.exit(0);
} catch (e) {
  console.error('\n❌ verify-runner-subprocess 失败');
  process.exit(1);
}