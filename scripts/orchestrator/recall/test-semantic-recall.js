#!/usr/bin/env node
/**
 * semantic-recall.js 单元测试
 * 验证：分词 / 索引构建 / 余弦相似度 / 模糊检索 / CLI
 *
 * @since v2.1.0 — 增量 E / M6 E1
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = require('./semantic-recall');
const {
  tokenize,
  search,
  rebuild,
  getIndex,
  loadAllKB,
  parseKB,
  INDEX_FILE,
  KNOWLEDGE_DIR,
} = SR;

let pass = 0, fail = 0;
const fails = [];

function assert(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else {
    fail++;
    fails.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`);
  }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ==================== 1. 分词 ====================
section('1. 分词 tokenize');

{
  const t = tokenize('智能演进路线');
  assert(t.includes('智能') && t.includes('演进') && t.includes('路线'), '中文 bigram 切分');
  const tEn = tokenize('use dispatcher and plan');
  assert(tEn.includes('use') && tEn.includes('dispatcher') && tEn.includes('plan'), '英文单词切分（小写）');
  const t2 = tokenize('的 了 是 在 的'); // 全停用词
  assert(t2.length === 0, '全停用词返回空数组');
  assert(tokenize('').length === 0, '空字符串返回空数组');
  assert(tokenize(null).length === 0, 'null 返回空数组');
}

// ==================== 2. parseKB ====================
section('2. parseKB frontmatter 解析');

{
  const kbList = loadAllKB();
  assert(kbList.length > 0, `加载到 ${kbList.length} 条 KB`);
  if (kbList.length > 0) {
    const kb = kbList[0];
    assert(kb.id.startsWith('KB-'), 'id 以 KB- 开头');
    assert(typeof kb.content === 'string' && kb.content.length > 0, 'content 解析');
    assert(typeof kb.category === 'string', 'category 解析');
  }
}

// ==================== 3. 索引构建/缓存 ====================
section('3. 索引 buildIndex + 缓存');

{
  if (fs.existsSync(INDEX_FILE)) fs.unlinkSync(INDEX_FILE);
  const idx1 = getIndex();
  assert(idx1.kb_count > 0, `索引构建: ${idx1.kb_count} 条`);
  assert(Object.keys(idx1.df).length > 0, `词项数 > 0: ${Object.keys(idx1.df).length}`);
  assert(fs.existsSync(INDEX_FILE), '索引文件已写入');

  // 第二次调用应走缓存（mtime 未变）
  const start = Date.now();
  const idx2 = getIndex();
  const elapsed = Date.now() - start;
  assert(idx2.built_at === idx1.built_at, '缓存命中（built_at 未变）');
  assert(elapsed < 100, `缓存读取 < 100ms（实际 ${elapsed}ms）`);

  // rebuild 强制重建
  const idx3 = rebuild();
  assert(idx3.built_at !== idx1.built_at, 'rebuild 后 built_at 改变');
}

// ==================== 4. 余弦相似度 ====================
section('4. 余弦相似度 search');

{
  // 精确主题：智能演进路线 → 应该命中"智能调度"
  const r1 = search('智能演进路线', { topK: 5 });
  assert(r1.length > 0, '查询1返回结果');
  const hasDispatch = r1.some(r => /调度|dispatcher/i.test(r.content));
  assert(hasDispatch, '查询1命中"智能调度"相关 KB');

  // 模糊语义：dispatcher 调度 → 应该命中 dispatcher 相关
  const r2 = search('dispatcher 调度', { topK: 5 });
  assert(r2.length > 0, '查询2返回结果');
  assert(r2[0].id === 'KB-20260621-013' || /调度/.test(r2[0].content), '查询2 top1 是 dispatcher 相关');

  // 自然语言问句：上次跟调度器相关的
  const r3 = search('上次跟调度器相关的', { topK: 5 });
  assert(r3.length > 0, '查询3（自然语言）返回结果');
  const hasDispatch3 = r3.some(r => /调度|dispatcher/i.test(r.content));
  assert(hasDispatch3, '查询3 命中 dispatcher 相关（语义检索能力）');

  // 排序：分数递减
  for (let i = 1; i < r1.length; i++) {
    assert(r1[i].score <= r1[i - 1].score, `结果按分数降序: r${i}.score <= r${i - 1}.score`);
  }

  // minScore 过滤
  const r4 = search('zzz不存在的词', { topK: 5, minScore: 0.1 });
  assert(r4.length === 0, '不存在的查询返回空');
}

// ==================== 5. CLI ====================
section('5. CLI');

{
  const out1 = execFileSync('node', [
    path.join(__dirname, 'semantic-recall.js'),
    'search', '智能演进', '--top', '3',
  ], { encoding: 'utf8' });
  assert(out1.includes('语义检索'), 'CLI search 输出标题');
  assert(out1.includes('KB-'), 'CLI 输出 KB id');

  const out2 = execFileSync('node', [
    path.join(__dirname, 'semantic-recall.js'),
    'stats',
  ], { encoding: 'utf8' });
  assert(out2.includes('KB 数') && out2.includes('词项数'), 'CLI stats 输出统计');

  const out3 = execFileSync('node', [
    path.join(__dirname, 'semantic-recall.js'),
    'rebuild',
  ], { encoding: 'utf8' });
  assert(out3.includes('索引已重建'), 'CLI rebuild 输出确认');
}

// ==================== 6. 召回率粗测 ====================
section('6. 召回率（粗测）');

{
  // 测试用例：query → 期望命中的关键词集合（任一命中即算）
  const cases = [
    { q: '智能演进路线', expect: /演进|增量|路线/ },
    { q: 'dispatcher 调度器', expect: /dispatcher|调度/ },
    { q: '快照系统', expect: /快照/ },
    { q: '自我反思', expect: /反思|reflect/ },
    { q: 'plan 计划', expect: /plan|计划|规划/ },
  ];
  let hit = 0;
  for (const c of cases) {
    const results = search(c.q, { topK: 5 });
    const matched = results.some(r => c.expect.test(r.content));
    if (matched) hit++;
    console.log(`     "${c.q}" → ${matched ? '✅' : '❌'}（top5）`);
  }
  const recall = hit / cases.length;
  assert(recall >= 0.6, `召回率 ≥ 60%（实际 ${(recall * 100).toFixed(0)}%, ${hit}/${cases.length}）`);
}

// ==================== 汇总 ====================
console.log(`\n${'━'.repeat(40)}`);
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败详情:');
  fails.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail || ''}`));
  process.exit(1);
}
console.log('✅ 全部通过');