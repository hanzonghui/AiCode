#!/usr/bin/env node

/**
 * Daily Evolution — 每日进化主入口
 *
 * 协调：扫描 → 评估 → 候选展示
 *
 * 用法：
 *   node daily-evolution.js scan          # 扫描 GitHub
 *   node daily-evolution.js analyze       # 分析候选
 *   node daily-evolution.js run           # 完整流程（scan + analyze）
 *   node daily-evolution.js candidates    # 查看当前候选
 *   node daily-evolution.js log           # 查看进化历史
 *   node daily-evolution.js watch         # 检查已实现特性是否过时
 *   node daily-evolution.js report        # 生成趋势报告
 */

const fs = require('fs')
const path = require('path')

const { scan } = require('./github-scanner')
const { analyze } = require('./feature-analyzer')
const { implementCandidate, rollback, status: implStatus, markAsEvolved } = require('./implementer')
const { dailyCheck, weeklyCheck, monthlyAudit, autoCheck, status: watchStatus } = require('./trend-watcher')
const { run: gepaRun } = require('./gepa-runner')

// ── 配置 ──────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'github')
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json')
const EVOLUTION_LOG_FILE = path.join(DATA_DIR, 'evolution-log.json')
const EVOLVED_FEATURES_FILE = path.join(DATA_DIR, 'evolved-features.json')

// ── 工具函数 ──────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function now() {
  return new Date().toISOString()
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadCandidates() {
  try {
    return JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'))
  } catch {
    return { candidates: [] }
  }
}

function loadEvolutionLog() {
  try {
    return JSON.parse(fs.readFileSync(EVOLUTION_LOG_FILE, 'utf8'))
  } catch {
    return { entries: [] }
  }
}

function saveEvolutionLog(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(EVOLUTION_LOG_FILE, JSON.stringify(data, null, 2))
}

function loadEvolvedFeatures() {
  try {
    return JSON.parse(fs.readFileSync(EVOLVED_FEATURES_FILE, 'utf8'))
  } catch {
    return { features: [] }
  }
}

function saveEvolvedFeatures(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(EVOLVED_FEATURES_FILE, JSON.stringify(data, null, 2))
}

// ── scan 命令 ─────────────────────────────────────────

async function cmdScan() {
  return await scan('full')
}

// ── analyze 命令 ──────────────────────────────────────

function cmdAnalyze(top = null, reanalyze = false) {
  return analyze(top, reanalyze)
}

// ── run 命令（完整流程）──────────────────────────────

async function cmdRun() {
  console.log('\n🚀 AiCode 自我进化 — 完整流程')
  console.log('='.repeat(50))

  // Step 1: 扫描
  console.log('\n📡 Step 1: 扫描 GitHub...')
  await scan('full')

  // Step 2: 评估
  console.log('\n🔬 Step 2: 评估候选...')
  const candidates = analyze(null, true)

  // Step 3: 输出推荐
  const adoptable = candidates.filter(c => c.suggestion === 'adopt')
  const adaptable = candidates.filter(c => c.suggestion === 'adapt')

  console.log('\n' + '='.repeat(50))
  console.log('📋 进化建议：')
  console.log('='.repeat(50))

  if (adoptable.length > 0) {
    console.log('\n🟢 建议直接采纳：')
    for (const c of adoptable) {
      console.log(`  • ${c.name} (⭐${c.stars}) — ${c.description?.slice(0, 60) || '无描述'}`)
      console.log(`    综合分: ${c.composite_score}/10 | 复杂度: ${c.estimated_effort}`)
    }
  }

  if (adaptable.length > 0) {
    console.log('\n🟡 建议改造后采用：')
    for (const c of adaptable) {
      console.log(`  • ${c.name} (⭐${c.stars}) — ${c.description?.slice(0, 60) || '无描述'}`)
      console.log(`    综合分: ${c.composite_score}/10 | 复杂度: ${c.estimated_effort}`)
    }
  }

  if (adoptable.length === 0 && adaptable.length === 0) {
    console.log('\n  暂无可进化的特性，下次扫描继续关注。')
  }

  // 记录日志
  const log = loadEvolutionLog()
  log.entries.push({
    date: today(),
    timestamp: now(),
    action: 'run',
    candidates_found: candidates.length,
    adopt_count: adoptable.length,
    adapt_count: adaptable.length,
  })
  saveEvolutionLog(log)

  return { adoptable, adaptable }
}

// ── candidates 命令 ──────────────────────────────────

function cmdCandidates() {
  const data = loadCandidates()

  if (!data.candidates || data.candidates.length === 0) {
    console.log('⚠ 暂无候选，请先运行: node daily-evolution.js scan')
    return
  }

  console.log('\n📋 当前候选列表：')
  console.log(`   更新时间: ${data.analyzed_at || '未知'}`)
  console.log('='.repeat(60))

  for (const [i, c] of data.candidates.entries()) {
    const icon = c.suggestion === 'adopt' ? '🟢' : c.suggestion === 'adapt' ? '🟡' : '🔴'
    console.log(`\n${i + 1}. ${icon} ${c.name}`)
    console.log(`   ⭐${c.stars} | ${c.language} | ${c.source}`)
    console.log(`   ${c.description?.slice(0, 80) || '无描述'}`)
    console.log(`   综合分: ${c.composite_score}/10 | 建议: ${c.suggestion} | 复杂度: ${c.estimated_effort}`)
  }

  console.log('\n' + '-'.repeat(60))
  console.log(`  🟢 采纳: ${data.adopt || 0}  🟡 改造: ${data.adapt || 0}  🔴 跳过: ${data.skip || 0}`)
}

// ── log 命令 ──────────────────────────────────────────

function cmdLog() {
  const log = loadEvolutionLog()

  if (!log.entries || log.entries.length === 0) {
    console.log('⚠ 暂无进化记录')
    return
  }

  console.log('\n📜 进化历史：')
  console.log('='.repeat(50))

  // 显示最近 10 条
  const recent = log.entries.slice(-10)
  for (const entry of recent) {
    console.log(`  ${entry.date} | ${entry.action} | 候选${entry.candidates_found}个 | 采纳${entry.adopt_count || 0} 改造${entry.adapt_count || 0}`)
  }

  console.log(`\n  共 ${log.entries.length} 条记录`)
}

// ── watch 命令（持续感知）────────────────────────────

function cmdWatch() {
  const features = loadEvolvedFeatures()

  if (!features.features || features.features.length === 0) {
    console.log('⚠ 暂无已实现的特性，先完成一次进化后再用')
    return
  }

  console.log('\n👁️  已实现特性状态：')
  console.log('='.repeat(50))

  for (const f of features.features) {
    const status = f.status === 'current' ? '✅ 当前' :
                   f.status === 'outdated' ? '⚠️ 可能过时' : '🔄 需升级'
    console.log(`  ${status} | ${f.feature}`)
    console.log(`    来源: ${f.source_repo} | 实现时间: ${f.implemented_at}`)
    if (f.alternatives_found && f.alternatives_found.length > 0) {
      console.log(`    发现替代: ${f.alternatives_found.join(', ')}`)
    }
  }
}

// ── report 命令 ──────────────────────────────────────

function cmdReport() {
  const log = loadEvolutionLog()
  const features = loadEvolvedFeatures()
  const candidates = loadCandidates()

  console.log('\n📊 AiCode 进化趋势报告')
  console.log('='.repeat(50))
  console.log(`报告时间: ${now()}`)
  console.log('')

  // 总览
  console.log('📈 总览：')
  console.log(`  总扫描次数: ${log.entries.length}`)
  console.log(`  已实现特性: ${features.features.length}`)
  console.log(`  当前候选: ${candidates.candidates?.length || 0}`)

  // 已实现特性状态
  const statusCounts = {}
  for (const f of (features.features || [])) {
    statusCounts[f.status] = (statusCounts[f.status] || 0) + 1
  }
  if (Object.keys(statusCounts).length > 0) {
    console.log('\n  特性状态分布：')
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`    ${status}: ${count}`)
    }
  }

  // 候选分布
  if (candidates.candidates && candidates.candidates.length > 0) {
    console.log('\n  候选建议分布：')
    console.log(`    🟢 采纳: ${candidates.adopt || 0}`)
    console.log(`    🟡 改造: ${candidates.adapt || 0}`)
    console.log(`    🔴 跳过: ${candidates.skip || 0}`)

    // Top 3 候选
    console.log('\n  Top 3 候选：')
    const top3 = candidates.candidates.slice(0, 3)
    for (const c of top3) {
      console.log(`    ${c.composite_score}/10 | ${c.name} | ${c.suggestion}`)
    }
  }

  console.log('\n' + '='.repeat(50))
}

// ── CLI ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0] || 'run'

  switch (cmd) {
    case 'scan':
      await cmdScan()
      break
    case 'analyze': {
      let top = null
      const topIdx = args.indexOf('--top')
      if (topIdx !== -1 && args[topIdx + 1]) top = parseInt(args[topIdx + 1])
      const reanalyze = args.includes('--reanalyze')
      cmdAnalyze(top, reanalyze)
      break
    }
    case 'run':
      await cmdRun()
      break
    case 'candidates':
      cmdCandidates()
      break
    case 'log':
      cmdLog()
      break
    case 'watch':
      await autoCheck()
      break
    case 'report':
      cmdReport()
      break
    case 'implement': {
      const index = parseInt(args[1]) - 1
      const data = loadCandidates()
      if (!data.candidates || index < 0 || index >= data.candidates.length) {
        console.error('❌ 无效索引，用: node daily-evolution.js implement <1-based-index>')
        process.exit(1)
      }
      await implementCandidate(data.candidates[index], index)
      break
    }
    case 'status':
      implStatus()
      break
    case 'self-evolve': {
      const skillIdx = args.indexOf('--skill')
      const skillName = skillIdx !== -1 && args[skillIdx + 1] ? args[skillIdx + 1] : 'evolve'
      const iterIdx = args.indexOf('--iterations')
      const iterations = iterIdx !== -1 && args[iterIdx + 1] ? parseInt(args[iterIdx + 1], 10) : undefined
      const popIdx = args.indexOf('--population')
      const population = popIdx !== -1 && args[popIdx + 1] ? parseInt(args[popIdx + 1], 10) : undefined
      await gepaRun(skillName, {
        dryRun: args.includes('--dry-run'),
        apply: args.includes('--apply'),
        iterations,
        population,
      })
      break
    }
    default:
      console.log(`
AiCode 自我进化系统 v1.0

用法：
  node daily-evolution.js scan          # 扫描 GitHub
  node daily-evolution.js analyze       # 分析候选
  node daily-evolution.js run           # 完整流程
  node daily-evolution.js candidates    # 查看候选
  node daily-evolution.js implement <n> # 实现第 n 个候选
  node daily-evolution.js status        # 实现状态
  node daily-evolution.js log           # 进化历史
  node daily-evolution.js watch         # 持续感知（自动判断层级）
  node daily-evolution.js report        # 趋势报告
  node daily-evolution.js self-evolve [opts]  # GEPA skill 自我进化（M34）

self-evolve 选项：
  --skill=<name>        目标 skill（默认 evolve）
  --iterations=<N>      遗传迭代次数（默认 5）
  --population=<N>      种群大小（默认 8）
  --dry-run             只输出计划，不实际跑
  --apply               跑完后直接覆盖原 SKILL.md
`)
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行失败:', err.message)
    process.exit(1)
  })
}

module.exports = { cmdScan, cmdAnalyze, cmdRun, cmdCandidates, cmdLog, cmdWatch, cmdReport }
