#!/usr/bin/env node
/**
 * gepa-runner.js — GEPA 主控器（M34 原型）
 *
 * 协调全流程：
 *   1. 读取目标 skill 的当前 SKILL.md
 *   2. 加载 eval dataset
 *   3. 收集 execution traces
 *   4. 跑 GEPA 优化
 *   5. 校验 candidate
 *   6. 输出候选到 data/gepa/<skill>/
 *
 * 用法：
 *   node gepa-runner.js                          # 默认优化 evolve skill
 *   node gepa-runner.js --skill=audit            # 指定 skill
 *   node gepa-runner.js --skill=evolve --iterations=3 --population=6
 *   node gepa-runner.js --dry-run                # 只输出计划
 *   node gepa-runner.js --apply                  # 跑完后直接覆盖原 SKILL.md
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

const fs = require('fs')
const path = require('path')

const { SkillEvaluator } = require('./skill-evaluator')
const { ConstraintValidator } = require('./constraint-gates')
const { GEPAOptimizer } = require('./gepa-optimizer')
const { TraceCollector } = require('./trace-collector')

const { createLogger } = require('../orchestrator/logger')

const log = createLogger('gepa-runner')

// ── 路径配置 ──────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..')
const GEPA_DATA_DIR = path.join(WORKSPACE_ROOT, 'data', 'gepa')

// ── 工具函数 ──────────────────────────────────────────

function now() { return new Date().toISOString() }
function today() { return new Date().toISOString().slice(0, 10) }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!m) return { frontmatter: {}, body: text }
  try {
    // 简单 YAML 解析（只支持 flat key: value）
    const yamlText = m[1]
    const frontmatter = {}
    for (const line of yamlText.split('\n')) {
      const kv = line.match(/^(\w[\w_]*):\s*(.*)$/)
      if (kv) {
        let v = kv[2].trim()
        if (/^['"].*['"]$/.test(v)) v = v.slice(1, -1)
        if (v === 'true') v = true
        else if (v === 'false') v = false
        else if (/^\d+$/.test(v)) v = parseInt(v, 10)
        frontmatter[kv[1]] = v
      }
    }
    return { frontmatter, body: m[2] }
  } catch {
    return { frontmatter: {}, body: text }
  }
}

function readSkillFile(skillName) {
  const skillPath = path.join(WORKSPACE_ROOT, '.claude', 'skills', skillName, 'SKILL.md')
  if (!fs.existsSync(skillPath)) {
    throw new Error(`skill 文件不存在: ${skillPath}`)
  }
  const text = fs.readFileSync(skillPath, 'utf8')
  return parseFrontmatter(text)
}

function loadEvalDataset(skillName) {
  const file = path.join(GEPA_DATA_DIR, skillName, 'eval-dataset.json')
  if (!fs.existsSync(file)) {
    log.warn({ skillName }, 'eval dataset 不存在，使用空数据集')
    return []
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).evals || []
  } catch (e) {
    log.error({ error: e.message }, 'eval dataset 解析失败')
    return []
  }
}

function bumpVersion(v) {
  const parts = (v || '1.0.0').replace(/^v/, '').split('.').map(Number)
  parts[parts.length - 1] = (parts[parts.length - 1] || 0) + 1
  return parts.join('.')
}

function reconstructSkill(frontmatter, body) {
  const fmLines = ['---']
  for (const [k, v] of Object.entries(frontmatter)) {
    if (typeof v === 'string' && v.includes('\n')) {
      fmLines.push(`${k}: |`)
      for (const line of v.split('\n')) fmLines.push(`  ${line}`)
    } else {
      fmLines.push(`${k}: ${v}`)
    }
  }
  fmLines.push('---')
  return fmLines.join('\n') + '\n\n' + body
}

// ── 主流程 ────────────────────────────────────────────

async function run(skillName, opts = {}) {
  const startTime = Date.now()
  log.info({ skillName, opts }, 'GEPA runner 启动')

  // 1. 读取原始 skill
  const original = readSkillFile(skillName)
  log.info({ version: original.frontmatter.version }, '原始 skill 已加载')

  // 2. 加载 eval dataset
  const evalDataset = loadEvalDataset(skillName)

  // 3. 收集 traces
  const collector = new TraceCollector({ skillName })
  const traces = collector.collect({ component: skillName })
  const patterns = collector.extractPatterns(traces)
  log.info({
    traceCount: traces.length,
    failCount: patterns.totalFail,
    successCount: patterns.totalSuccess,
  }, 'traces 已收集')

  // 4. dry-run 输出计划
  if (opts.dryRun) {
    console.log('\n🔍 GEPA DRY-RUN 计划')
    console.log('='.repeat(50))
    console.log(`  skill: ${skillName}`)
    console.log(`  baseline version: ${original.frontmatter.version}`)
    console.log(`  eval dataset: ${evalDataset.length} items`)
    console.log(`  traces: ${traces.length} (${patterns.totalFail} 失败 / ${patterns.totalSuccess} 成功)`)
    console.log(`  population: ${opts.population || 8}, iterations: ${opts.iterations || 5}`)
    return { dryRun: true, original, evalDataset, traces, patterns }
  }

  // 5. 构造 evaluator / validator / optimizer
  const evaluator = new SkillEvaluator({ evalDataset })
  const validator = new ConstraintValidator()
  const optimizer = new GEPAOptimizer({
    populationSize: opts.population || 8,
    maxIterations: opts.iterations || 5,
  })

  // 6. 跑 baseline 评估
  const baselineEval = await evaluator.evaluate(original.body, original.body, traces)
  log.info({ composite: baselineEval.composite }, 'baseline 评估完成')
  console.log(`\n📊 Baseline composite: ${baselineEval.composite}`)

  // 7. 跑 GEPA
  console.log(`\n🧬 启动 GEPA 优化 (population=${optimizer.opts.populationSize}, iterations=${optimizer.opts.maxIterations})`)
  const result = await optimizer.optimize(original.body, original.frontmatter, evaluator, validator, traces)
  log.info({ composite: result.best.composite }, 'GEPA 完成')

  // 8. 校验候选
  const candidateVersion = bumpVersion(original.frontmatter.version)
  const candidateSkill = {
    frontmatter: { ...original.frontmatter, version: candidateVersion },
    body: result.best.body,
  }
  const validation = validator.validate(candidateSkill, original)
  log.info({ allowed: validation.allowed, score: validation.score }, '候选校验完成')

  // 9. 输出候选
  const outDir = path.join(GEPA_DATA_DIR, skillName, today())
  ensureDir(outDir)

  const report = {
    skill: skillName,
    timestamp: now(),
    elapsed_sec: ((Date.now() - startTime) / 1000).toFixed(2),
    baseline: {
      version: original.frontmatter.version,
      composite: baselineEval.composite,
      fitness: baselineEval.fitness,
    },
    candidate: {
      version: candidateVersion,
      composite: result.best.composite,
      fitness: result.best.fitness,
      validation,
    },
    improvement: round((result.best.composite - baselineEval.composite) * 100),
    history: result.history,
    config: {
      population: optimizer.opts.populationSize,
      iterations: optimizer.opts.maxIterations,
      eval_dataset_size: evalDataset.length,
      trace_count: traces.length,
    },
    trace_patterns: patterns,
  }
  fs.writeFileSync(path.join(outDir, 'gepa-report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(outDir, 'SKILL.md.candidate'), reconstructSkill(candidateSkill.frontmatter, candidateSkill.body))

  // 10. 备份原 SKILL.md
  const backupDir = path.join(GEPA_DATA_DIR, skillName, 'backup')
  ensureDir(backupDir)
  fs.copyFileSync(
    path.join(WORKSPACE_ROOT, '.claude', 'skills', skillName, 'SKILL.md'),
    path.join(backupDir, `SKILL.md.v${original.frontmatter.version}.bak`)
  )

  console.log('\n' + '='.repeat(60))
  console.log('🧬 GEPA 优化结果')
  console.log('='.repeat(60))
  console.log(`  baseline:  v${original.frontmatter.version} → composite ${baselineEval.composite}`)
  console.log(`  candidate: v${candidateVersion} → composite ${result.best.composite}`)
  console.log(`  提升: ${report.improvement}%`)
  console.log(`  校验: ${validation.allowed ? '✅ 通过' : '⚠️ 有扣分'}`)
  if (validation.deductions && validation.deductions.length > 0) {
    console.log(`  扣分项: ${validation.deductions.join('; ')}`)
  }
  console.log(`\n  输出目录: ${outDir}`)
  console.log(`  报告: gepa-report.json`)
  console.log(`  候选 SKILL.md: SKILL.md.candidate`)
  console.log(`  原 SKILL.md 备份: backup/SKILL.md.v${original.frontmatter.version}.bak`)

  // 11. apply 模式
  if (opts.apply) {
    if (!validation.allowed) {
      console.log('\n  ⛔ 候选校验未通过，不 apply')
      return report
    }
    fs.copyFileSync(
      path.join(outDir, 'SKILL.md.candidate'),
      path.join(WORKSPACE_ROOT, '.claude', 'skills', skillName, 'SKILL.md')
    )
    console.log(`\n  ✅ 已应用候选到 .claude/skills/${skillName}/SKILL.md`)
  } else {
    console.log(`\n  💡 用 --apply 应用候选到原 SKILL.md`)
  }

  return report
}

function round(n) { return Math.round(n * 100) / 100 }

// ── CLI ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const opts = {}

  for (const arg of args) {
    if (arg.startsWith('--skill=')) opts.skill = arg.split('=')[1]
    else if (arg.startsWith('--iterations=')) opts.iterations = parseInt(arg.split('=')[1], 10)
    else if (arg.startsWith('--population=')) opts.population = parseInt(arg.split('=')[1], 10)
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--apply') opts.apply = true
  }

  const skillName = opts.skill || 'evolve'

  try {
    await run(skillName, opts)
  } catch (e) {
    log.error({ error: e.message, stack: e.stack }, '执行失败')
    console.error(`❌ GEPA 执行失败: ${e.message}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { run, parseFrontmatter, reconstructSkill }
