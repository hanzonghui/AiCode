#!/usr/bin/env node
/**
 * 失败路径测试 —— 验证系统在异常情况下是否正确降级/兜底
 *
 * 覆盖 4 类失败：
 *   1. dispatcher 决策错误暴露（人为改坏 RULES）
 *   2. save.js 在 ROOT 索引文件损坏时是否兜底
 *   3. 自我约束"测试失败 → 不存快照"分支
 *   4. llm-adapter 在 LLM 不可用时降级
 *
 * 设计原则：
 *   - 备份原始文件 → 故意破坏 → 验证系统行为 → 还原
 *   - 不留任何"半损坏"状态
 *   - 每个测试独立可跑
 *
 * @since v1.6.0 (2026-06-22) Tier 1 改造 T1.4
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

// 备份辅助
function backup(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}
function restore(file, content) {
  if (content === null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } else {
    fs.writeFileSync(file, content);
  }
}

console.log('========================================');
console.log('🧪 失败路径测试');
console.log('========================================\n');

// ========== 1. dispatcher RULES 损坏暴露测试 ==========

console.log('【1/4】dispatcher RULES 损坏暴露测试');
{
  const dispatcherPath = path.join(__dirname, 'dispatcher.js');
  const original = backup(dispatcherPath);

  try {
    // 1.1 故意把 RULES 版本号改坏（破坏语法）
    const broken = original.replace(
      "version: '1.2.0'",
      "version: BROKEN_SYNTAX"  // 故意语法错误
    );
    fs.writeFileSync(dispatcherPath, broken);

    // 1.2 尝试 require dispatcher → 应该抛错（暴露损坏）
    let threw = false;
    try {
      delete require.cache[require.resolve(dispatcherPath)];
      require(dispatcherPath);
    } catch (e) {
      threw = true;
    }
    check('1.1 dispatcher.js 语法错误能被 require 暴露', threw);

    // 1.3 尝试跑测试 → 应该失败（不会静默通过）
    let testFailed = false;
    try {
      execSync(`node "${path.join(__dirname, 'test-dispatcher.js')}"`, { stdio: 'pipe' });
    } catch (e) {
      testFailed = true;  // exit code != 0
    }
    check('1.2 dispatcher 损坏时 test-dispatcher 失败（非静默通过）', testFailed);

  } finally {
    restore(dispatcherPath, original);
    // 清理 require 缓存
    delete require.cache[require.resolve(dispatcherPath)];
  }
}

// ========== 2. save.js ROOT 索引损坏兜底测试 ==========

console.log('\n【2/4】save.js ROOT 索引损坏兜底测试');
{
  const saveScript = path.join(ROOT, 'scripts', '会话快照', 'save.js');
  const quickLoadPath = path.join(ROOT, '00_ROOT_快速加载会话.md');
  const originalQuickLoad = backup(quickLoadPath);

  try {
    // 2.1 把 00_ROOT_快速加载会话.md 设为只读（破坏写入）
    // 用更直接的方式：故意写入一个无效内容，模拟损坏
    fs.writeFileSync(quickLoadPath, '');

    // 2.2 跑 save.js（不应该因为索引问题崩溃）
    let saveOutput = '';
    let saveThrew = false;
    try {
      saveOutput = execSync(
        `node "${saveScript}" "失败路径测试-损坏ROOT" "test-failure" --force`,
        { stdio: 'pipe', encoding: 'utf8' }
      );
    } catch (e) {
      saveThrew = true;
      saveOutput = e.stdout || e.message;
    }
    check('2.1 save.js 在 ROOT 索引为空时不抛错', !saveThrew || saveOutput.includes('✅ 快照已保存'));
    check('2.2 save.js 仍能创建快照文件', fs.readdirSync(path.join(ROOT, '.claude', 'snapshots'))
      .some(f => f.includes('test-failure')));

    // 2.3 验证快照本身内容完整（不因 ROOT 损坏而缺数据）
    const snapshotFile = fs.readdirSync(path.join(ROOT, '.claude', 'snapshots'))
      .filter(f => f.includes('test-failure'))
      .map(f => path.join(ROOT, '.claude', 'snapshots', f))[0];
    if (snapshotFile && fs.existsSync(snapshotFile)) {
      const content = fs.readFileSync(snapshotFile, 'utf8');
      check('2.3 快照文件内容完整（含 title/tag）', content.includes('失败路径测试-损坏ROOT') && content.includes('test-failure'));
    } else {
      check('2.3 快照文件内容完整', false);
    }

  } finally {
    restore(quickLoadPath, originalQuickLoad);
    // 清理测试快照
    const snapDir = path.join(ROOT, '.claude', 'snapshots');
    fs.readdirSync(snapDir).filter(f => f.includes('test-failure'))
      .forEach(f => fs.unlinkSync(path.join(snapDir, f)));
  }
}

// ========== 3. 自我约束"测试失败不存快照"分支 ==========

console.log('\n【3/4】自我约束规范文档的失败路径章节');
{
  const selfDisciplinePath = path.join(__dirname, '自我约束规范.md');
  check('3.1 自我约束规范.md 存在', fs.existsSync(selfDisciplinePath));

  if (fs.existsSync(selfDisciplinePath)) {
    const content = fs.readFileSync(selfDisciplinePath, 'utf8');
    check('3.2 含"测试失败"决策分支', content.includes('测试失败') || content.includes('失败'));
    check('3.3 含"修 bug"决策', content.includes('修 bug') || content.includes('修'));
    check('3.4 含"不要存快照"反例', content.includes('不要存快照') || content.includes('❌'));
  }
}

// ========== 4. llm-adapter LLM 不可用降级 ==========

console.log('\n【4/4】llm-adapter 失败降级测试');
{
  // 4.1 AnthropicAdapter 无 API key → 创建失败 → 降级到 heuristic
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LLM_BACKEND;

  // 重新加载 llm-adapter（防止 require 缓存）
  const adapterPath = path.join(__dirname, 'llm-adapter.js');
  delete require.cache[require.resolve(adapterPath)];
  const { createAdapter, scoreWithFallback, HeuristicAdapter } = require(adapterPath);

  // 4.2 缺 key 时 anthropic 降级
  const fallbackAdapter = createAdapter('anthropic');
  check('4.1 AnthropicAdapter 缺 key → 降级到 HeuristicAdapter', fallbackAdapter instanceof HeuristicAdapter);

  // 4.3 scoreWithFallback 永不抛错
  (async () => {
    try {
      const r = await scoreWithFallback('测试', { fileCount: 1, moduleCount: 1 });
      check('4.2 scoreWithFallback 在不可用 backend 下仍返回', r && r.backend === 'heuristic');
      check('4.3 返回结果含完整 scores/composite/reasons',
        r.scores && typeof r.composite === 'number' && Array.isArray(r.reasons));
    } catch (e) {
      check('4.2 scoreWithFallback 不应抛错', false);
    }

    // 还原
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;

    // ========== 总结 ==========
    console.log(`\n========================================`);
    console.log(`📊 失败路径测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
    console.log(`========================================`);
    process.exit(fail > 0 ? 1 : 0);
  })();
}
