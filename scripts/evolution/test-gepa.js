#!/usr/bin/env node
/**
 * test-gepa.js — GEPA 集成测试套件（M34 原型）
 *
 * 测试覆盖：
 *   - skill-evaluator: 4 个 fitness 维度 + composite
 *   - constraint-gates: 硬约束（结构/大小/命令）+ 软约束（版本/增长/兼容）
 *   - gepa-optimizer: 变异/交叉/选择 + 整轮优化
 *   - trace-collector: 解析 logs/app.jsonl
 *   - gepa-runner: 端到端 dry-run + 实际运行
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const { SkillEvaluator, DEFAULT_WEIGHTS } = require('./skill-evaluator')
const { ConstraintValidator, DEFAULT_LIMITS } = require('./constraint-gates')
const { GEPAOptimizer, DEFAULT_OPTS, SYNONYMS } = require('./gepa-optimizer')
const { TraceCollector } = require('./trace-collector')

// ── 测试框架 ──────────────────────────────────────────

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅ ' + name)
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    console.log('  ❌ ' + name + ': ' + e.message)
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    passed++
    console.log('  ✅ ' + name)
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    console.log('  ❌ ' + name + ': ' + e.message)
  }
}

function group(name) {
  console.log('\n── ' + name + ' ──')
}

// ── 测试用的固定 body 字符串（避免反引号转义问题）─────

const CLEAR_BODY = '# 扫描\n\n运行 `scan` 命令扫描 GitHub。\n\n## 分析\n\n- 第一步：分析\n- 第二步：评估\n\n```bash\nnpm test\n```'
const VAGUE_BODY = '# Skill\n\n这是一个 skill。\n\n它可以做很多事情。\n\n具体参考相关文档。'
const COVERED_BODY = 'Use scan to query GitHub. Then analyze each candidate.'
const UNCOVERED_BODY = 'Just a random text without keywords.'
const DENSE_BODY = '```js\nfoo\n```\n# Title\n```js\nbar\n```\n# Another\n```js\nbaz\n```'

// ── skill-evaluator 测试 ──────────────────────────────

async function testSkillEvaluator() {
  group('skill-evaluator.js')

  await testAsync('clarity 评估：清晰 body 得高分', async () => {
    const ev = new SkillEvaluator()
    const r1 = await ev.evaluate(CLEAR_BODY, CLEAR_BODY, [])
    const r2 = await ev.evaluate(VAGUE_BODY, VAGUE_BODY, [])
    assert.ok(r1.fitness.clarity > r2.fitness.clarity,
      'clear (' + r1.fitness.clarity + ') should > vague (' + r2.fitness.clarity + ')')
  })

  await testAsync('coverage 评估：覆盖关键词得高分', async () => {
    const dataset = [
      { id: 'scan', keywords: ['scan', 'github'] },
      { id: 'analyze', keywords: ['analyze', 'candidate'] },
    ]
    const ev = new SkillEvaluator({ evalDataset: dataset })
    const r1 = await ev.evaluate(COVERED_BODY, COVERED_BODY, [])
    const r2 = await ev.evaluate(UNCOVERED_BODY, UNCOVERED_BODY, [])
    assert.ok(r1.fitness.coverage > r2.fitness.coverage,
      'covered (' + r1.fitness.coverage + ') should > uncovered (' + r2.fitness.coverage + ')')
  })

  await testAsync('error_reduction：无 traces 时返回 0.5', async () => {
    const ev = new SkillEvaluator()
    const r = await ev.evaluate('body', 'body', [])
    assert.strictEqual(r.fitness.errorReduction, 0.5)
  })

  await testAsync('size_efficiency：信息密度高得高分', async () => {
    const ev = new SkillEvaluator()
    const bloated = 'word '.repeat(500)
    const r1 = await ev.evaluate(DENSE_BODY, DENSE_BODY, [])
    const r2 = await ev.evaluate(bloated, bloated, [])
    assert.ok(r1.fitness.sizeEff > r2.fitness.sizeEff,
      'dense (' + r1.fitness.sizeEff + ') should > bloated (' + r2.fitness.sizeEff + ')')
  })

  await testAsync('composite 在 0-1 范围', async () => {
    const ev = new SkillEvaluator()
    const r = await ev.evaluate('# Title\n\nRun scan.', '# Title\n\nRun scan.', [])
    assert.ok(r.composite >= 0 && r.composite <= 1, 'composite ' + r.composite + ' out of range')
  })

  await testAsync('权重可覆盖', async () => {
    const ev = new SkillEvaluator({ weights: { clarity: 1, coverage: 0, error_reduction: 0, size_eff: 0 } })
    const r1 = await ev.evaluate(CLEAR_BODY, CLEAR_BODY, [])
    const r2 = await ev.evaluate(VAGUE_BODY, VAGUE_BODY, [])
    assert.ok(r1.fitness.clarity > r2.fitness.clarity)
  })

  await testAsync('DEFAULT_WEIGHTS 存在', () => {
    assert.ok(DEFAULT_WEIGHTS.clarity)
    assert.ok(DEFAULT_WEIGHTS.coverage)
    assert.ok(DEFAULT_WEIGHTS.error_reduction)
    assert.ok(DEFAULT_WEIGHTS.size_eff)
  })
}

// ── constraint-gates 测试 ─────────────────────────────

function testConstraintGates() {
  group('constraint-gates.js')

  test('硬约束：frontmatter 缺字段拒绝', () => {
    const v = new ConstraintValidator()
    const result = v.validate({ frontmatter: { name: 'x' }, body: 'body' })
    assert.strictEqual(result.allowed, false)
    assert.ok(result.reasons.some(r => r.includes('version')))
  })

  test('硬约束：body 超大拒绝', () => {
    const v = new ConstraintValidator()
    const result = v.validate({
      frontmatter: { name: 'x', version: '1.0', description: 'x' },
      body: 'x'.repeat(DEFAULT_LIMITS.maxBodySize + 1),
    })
    assert.strictEqual(result.allowed, false)
    assert.ok(result.reasons.some(r => r.includes('body 大小')))
  })

  test('硬约束：破坏性命令拒绝', () => {
    const v = new ConstraintValidator()
    const result = v.validate({
      frontmatter: { name: 'x', version: '1.0', description: 'x' },
      body: 'rm -rf /',
    })
    assert.strictEqual(result.allowed, false)
    assert.ok(result.reasons.some(r => r.includes('禁止命令')))
  })

  test('软约束：版本降级扣分', () => {
    const v = new ConstraintValidator()
    const result = v.validate(
      { frontmatter: { name: 'x', version: '0.5', description: 'x' }, body: 'body' },
      { frontmatter: { name: 'x', version: '1.0', description: 'x' }, body: 'body' }
    )
    assert.strictEqual(result.allowed, true)
    assert.ok(result.score < 1.0)
    assert.ok(result.reasons.some(r => r.includes('版本号降级')))
  })

  test('软约束：丢失原命令扣分', () => {
    const v = new ConstraintValidator()
    const result = v.validate(
      { frontmatter: { name: 'x', version: '1.1', description: 'x' }, body: 'Run `only-this`' },
      { frontmatter: { name: 'x', version: '1.0', description: 'x' }, body: 'Run `scan` `analyze` `only-this`' }
    )
    assert.ok(result.reasons.some(r => r.includes('丢失原有命令')))
  })

  test('通过：完全合规候选', () => {
    const v = new ConstraintValidator()
    const result = v.validate(
      { frontmatter: { name: 'x', version: '1.1', description: 'x' }, body: 'Run `scan` `analyze`' },
      { frontmatter: { name: 'x', version: '1.0', description: 'x' }, body: 'Run `scan` `analyze`' }
    )
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.score, 1.0)
  })

  test('versionGte 解析正确', () => {
    // 隐式测试 parseVersion
    const v = new ConstraintValidator()
    v.validate(
      { frontmatter: { name: 'x', version: '2.0.1', description: 'x' }, body: 'x' },
      { frontmatter: { name: 'x', version: '2.0.0', description: 'x' }, body: 'x' }
    )
    // 通过 = score = 1
  })
}

// ── gepa-optimizer 测试 ───────────────────────────────

async function testGEPAOptimizer() {
  group('gepa-optimizer.js')

  await testAsync('种群初始化大小正确', async () => {
    const opt = new GEPAOptimizer({ populationSize: 5, maxIterations: 1, mutationRate: 0.5 })
    const baseline = 'baseline body'
    const pop = opt.initializePopulation(baseline)
    assert.strictEqual(pop.length, 5)
    assert.strictEqual(pop[0], baseline) // baseline 始终是第 1 个
  })

  await testAsync('同义词替换变异有效', () => {
    const opt = new GEPAOptimizer({ mutationRate: 1.0 })
    const body = '扫描 GitHub 候选，分析可行性。'
    const mutated = opt._synonymReplace(body)
    assert.ok(typeof mutated === 'string')
  })

  await testAsync('整轮优化：best 至少有评估结果', async () => {
    const opt = new GEPAOptimizer({ populationSize: 4, maxIterations: 2, mutationRate: 0.5 })
    const ev = new SkillEvaluator({ evalDataset: [{ id: 's', keywords: ['scan', 'analyze'] }] })
    const val = new ConstraintValidator()
    const baseline = '# Evolve\n\nRun `scan` to scan. Use `analyze` to analyze candidate. Run `implement`.'
    const frontmatter = { name: 'evolve', version: '1.0', description: 'x' }
    const result = await opt.optimize(baseline, frontmatter, ev, val, [])
    assert.ok(result.best, 'should return best')
    assert.ok(typeof result.best.composite === 'number')
    assert.strictEqual(result.history.length, 2)
  })

  await testAsync('frontmatter 缺失时 composite 不应被错算成 0', async () => {
    // 这个测试保护：以前 frontmatter 空 → validator 拒 → composite=0
    const opt = new GEPAOptimizer({ populationSize: 3, maxIterations: 1, mutationRate: 0.3 })
    const ev = new SkillEvaluator({ evalDataset: [{ id: 's', keywords: ['scan'] }] })
    const val = new ConstraintValidator()
    const baseline = '# Test\n\nRun `scan`.'
    const frontmatter = { name: 'test', version: '1.0', description: 'x' }
    const result = await opt.optimize(baseline, frontmatter, ev, val, [])
    assert.ok(result.best.composite > 0, `composite 应该 > 0，实际 ${result.best.composite}`)
  })

  await testAsync('selection：elite 数量正确', async () => {
    const opt = new GEPAOptimizer({ elitism: 3 })
    const evaluated = [
      { body: 'a', composite: 0.3 },
      { body: 'b', composite: 0.7 },
      { body: 'c', composite: 0.5 },
      { body: 'd', composite: 0.9 },
      { body: 'e', composite: 0.1 },
    ]
    const elite = opt._selectElite(evaluated)
    assert.strictEqual(elite.length, 3)
    assert.strictEqual(elite[0].body, 'd') // best first
  })

  await testAsync('tournament 选择：返回 best of N', () => {
    const opt = new GEPAOptimizer({ tournamentSize: 2 })
    const evaluated = [
      { body: 'a', composite: 0.3 },
      { body: 'b', composite: 0.7 },
      { body: 'c', composite: 0.5 },
    ]
    const selected = opt._tournamentSelect(evaluated)
    assert.ok(['a', 'b', 'c'].includes(selected.body))
  })

  await testAsync('SYNONYMS 包含核心词', () => {
    assert.ok(SYNONYMS['扫描'])
    assert.ok(SYNONYMS['分析'])
    assert.ok(SYNONYMS['GitHub'])
  })
}

// ── trace-collector 测试 ──────────────────────────────

function testTraceCollector() {
  group('trace-collector.js')

  const tmpDir = path.join(__dirname, '..', '..', 'tmp_test_logs')
  const tmpLog = path.join(tmpDir, 'app.jsonl')

  test('空日志返回空数组', () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(tmpLog, '')
    const c = new TraceCollector({ logFile: tmpLog })
    const result = c.collect({ component: 'evolve' })
    assert.deepStrictEqual(result, [])
  })

  test('按 component 过滤', () => {
    const events = [
      { ts: new Date().toISOString(), level: 'info', component: 'evolve', msg: 'scan start' },
      { ts: new Date().toISOString(), level: 'error', component: 'dispatcher', msg: 'fail' },
      { ts: new Date().toISOString(), level: 'info', component: 'evolve', action: 'success', msg: 'done' },
    ]
    fs.writeFileSync(tmpLog, events.map(e => JSON.stringify(e)).join('\n'))
    const c = new TraceCollector({ logFile: tmpLog })
    const result = c.collect({ component: 'evolve' })
    assert.strictEqual(result.length, 2)
    assert.ok(result.every(t => t.component === 'evolve'))
  })

  test('outcome 推断：error level → fail', () => {
    fs.writeFileSync(tmpLog, JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      component: 'evolve',
      msg: 'something broke',
    }))
    const c = new TraceCollector({ logFile: tmpLog })
    const result = c.collect({ component: 'evolve' })
    assert.strictEqual(result[0].outcome, 'fail')
  })

  test('extractPatterns 分类正确', () => {
    fs.writeFileSync(tmpLog, JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      component: 'evolve',
      msg: 'scan failed github timeout',
    }))
    const c = new TraceCollector({ logFile: tmpLog })
    const traces = c.collect({ component: 'evolve' })
    const patterns = c.extractPatterns(traces)
    assert.strictEqual(patterns.totalFail, 1)
    assert.ok(patterns.failurePatterns.length > 0)
  })

  // cleanup
  try {
    if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog)
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir)
  } catch {}
}

// ── gepa-runner dry-run 端到端测试 ────────────────────

async function testRunnerDryRun() {
  group('gepa-runner.js dry-run')

  await testAsync('dry-run 模式输出计划不实际跑', async () => {
    const { run } = require('./gepa-runner')
    const result = await run('evolve', { dryRun: true })
    assert.strictEqual(result.dryRun, true)
    assert.ok(result.original)
    assert.ok(Array.isArray(result.traces))
    assert.ok(Array.isArray(result.evalDataset))
  })
}

// ── 入口 ──────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('🧬 GEPA 集成测试套件')
  console.log('═══════════════════════════════════════')

  await testSkillEvaluator()
  testConstraintGates()
  await testGEPAOptimizer()
  testTraceCollector()
  await testRunnerDryRun()

  console.log('\n═══════════════════════════════════════')
  console.log('结果: ' + passed + ' 通过 / ' + failed + ' 失败 / ' + (passed + failed) + ' 总计')

  if (failures.length > 0) {
    console.log('\n失败明细:')
    for (const f of failures) {
      console.log('  ❌ ' + f.name)
      console.log('     ' + f.error)
    }
    process.exit(1)
  } else {
    console.log('✅ 全部通过')
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('test runner crashed:', e)
    process.exit(1)
  })
}

module.exports = { main }
