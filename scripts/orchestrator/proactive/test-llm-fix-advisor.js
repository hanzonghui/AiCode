#!/usr/bin/env node
/**
 * llm-fix-advisor.js 单元测试
 * 验证 prompt 构造、advise 接口、LLM fallback
 */

const { buildPrompt, advise } = require('./llm-fix-advisor');

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

// ==================== 1. buildPrompt 结构 ====================
section('buildPrompt 结构');

{
  const p = buildPrompt('test-coverage', { missingTests: ['a.js', 'b.js'] });
  assert(typeof p === 'string', '返回字符串');
  assert(p.includes('测试覆盖率'), '含维度名');
  assert(p.includes('a.js'), '含文件列表');
  assert(p.includes('mock'), '含 mock 提示');
}

{
  const p = buildPrompt('deps-outdated', { loosePinned: [['foo', '^1.0.0']] });
  assert(p.includes('foo@^1.0.0'), '含依赖版本');
  assert(p.includes('升级风险'), '含风险等级提示');
}

{
  const p = buildPrompt('candidate-pending', { candidate: { name: 'ctx-mode', description: '上下文模式', repo: 'x/ctx' } });
  assert(p.includes('ctx-mode'), '含候选名');
  assert(p.includes('x/ctx'), '含来源');
  assert(p.includes('最小步骤'), '含步骤提示');
}

{
  const p = buildPrompt('unknown', { foo: 1 });
  assert(p.includes('unknown'), '未知维度含维度名');
  assert(p.includes('foo'), '未知维度含上下文');
}

// ==================== 2. advise 接口 ====================
section('advise 接口');

(async () => {

{
  const r = await advise('test-coverage', { missingTests: ['scripts/a.js'] });
  assert(r.ok === true, 'advise 成功');
  assert(r.dimension === 'test-coverage', 'dimension 正确');
  assert(typeof r.advice === 'string', 'advice 是字符串');
  assert(r.advice.length > 0, 'advice 非空');
  assert(r.backend === 'heuristic', '默认 backend 是 heuristic');
}

{
  const r = await advise('deps-outdated', { loosePinned: [['x', '^1']] });
  assert(r.ok === true, 'deps advise 成功');
  assert(r.advice.includes('npm'), '建议含 npm');
}

// ==================== 3. 异常输入不抛错 ====================
section('异常输入不抛错');

{
  let threw = false;
  try {
    await advise('test-coverage', null);
    await advise(null, {});
    buildPrompt(null, null);
  } catch (e) {
    threw = true;
  }
  assert(!threw, '异常输入不抛错');
}

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 llm-fix-advisor 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);

})();
