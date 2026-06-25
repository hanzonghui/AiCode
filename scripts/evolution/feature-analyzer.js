#!/usr/bin/env node

/**
 * Feature Analyzer — 评估 GitHub 候选项目的可行性
 *
 * 输入：data/github/trending.json（扫描结果）
 * 输出：data/github/candidates.json（评分后的候选）
 *
 * 评估维度：
 *   - 实用性 (relevance): 这个功能对我们的工作流有什么帮助？
 *   - 可行性 (feasibility): 以现有架构能实现吗？
 *   - 独立性 (independence): 是否依赖外部服务？
 *   - 风险度 (risk): 引入后会不会破坏现有系统？
 *   - 新鲜度 (freshness): 是不是我们还没有的能力？
 *
 * 用法：
 *   node feature-analyzer.js                    # 分析所有候选
 *   node feature-analyzer.js --top 5            # 只分析 top 5
 *   node feature-analyzer.js --reanalyze        # 重新分析（忽略缓存）
 */

const fs = require('fs')
const path = require('path')

// ── 配置 ──────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'github')
const TRENDING_FILE = path.join(DATA_DIR, 'trending.json')
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json')

// 我们已有的能力（用于判断"新鲜度"）
const EXISTING_CAPABILITIES = [
  'smart-dispatch',       // 智能调度
  'session-snapshot',     // 会话快照
  'left-brain-memory',    // 左脑记忆
  'auto-perception',      // 自动感知
  'knowledge-graph',      // 知识图谱
  'mcp-server',           // MCP 服务
  'token-monitor',        // Token 监控
  'worktree-parallel',    // 并行执行
  'qa-verification',      // QA 验证
  'self-discipline',      // 自我约束
  'hook-system',          // Hook 系统
  'subagent',             // 子代理
  'code-review',          // 代码审查
  'mermaid-flow',         // Mermaid 流程图
]

// 我们没有的能力（用于判断"新鲜度"加分）
const MISSING_CAPABILITIES = [
  'vector-search',        // 向量语义搜索
  'embedding',            // Embedding 本地推理
  'multi-modal',          // 多模态（截图/语音）
  'code-graph',           // 代码图谱
  'workflow-template',    // 工作流模板
  'failure-memory',       // 错误记忆库
  'feedback-loop',        // 反馈闭环
  'consolidation',        // 知识整合（睡眠）
  'predictive-context',   // 上下文预加载
  'self-evolution',       // 自我进化（本项目）
  'trend-watching',       // 趋势感知
  'github-integration',   // GitHub 集成
]

// ── 工具函数 ──────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadTrending() {
  try {
    const data = JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf8'))
    // 取最新的 history 条目
    if (data.history && data.history.length > 0) {
      return data.history[data.history.length - 1].candidates || []
    }
    return []
  } catch {
    return []
  }
}

function loadCandidates() {
  try {
    const data = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    // 容错：空文件 / {} / 缺 candidates 字段
    if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) {
      return { analyzed_at: null, candidates: [] };
    }
    return data;
  } catch {
    return { analyzed_at: null, candidates: [] }
  }
}

function saveCandidates(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(data, null, 2))
}

// ── 评估函数 ──────────────────────────────────────────

function analyzeFeature(repo) {
  const name = (repo.full_name || '').toLowerCase()
  const desc = (repo.description || '').toLowerCase()
  const topics = (repo.topics || []).map(t => t.toLowerCase())
  const combined = `${name} ${desc} ${topics.join(' ')}`

  const scores = {
    relevance: 0,     // 实用性
    feasibility: 0,   // 可行性
    independence: 0,   // 独立性
    risk: 0,           // 风险度（越高越危险）
    freshness: 0,      // 新鲜度
  }

  // ── 实用性 (0-10) ──
  if (/(memory|知识|记忆)/i.test(combined)) scores.relevance += 4
  if (/(agent|代理|调度)/i.test(combined)) scores.relevance += 3
  if (/(hook|钩子|automation|自动)/i.test(combined)) scores.relevance += 3
  if (/(mcp|server)/i.test(combined)) scores.relevance += 2
  if (/(workflow|流程|pipeline)/i.test(combined)) scores.relevance += 2
  if (/(review|审查|lint)/i.test(combined)) scores.relevance += 2
  if (/(test|测试|qa)/i.test(combined)) scores.relevance += 2
  if (/(snapshot|快照|backup)/i.test(combined)) scores.relevance += 2
  scores.relevance = Math.min(10, scores.relevance)

  // ── 可行性 (0-10) ──
  const lang = (repo.language || '').toLowerCase()
  if (['javascript', 'typescript', 'shell', 'bash'].includes(lang)) scores.feasibility += 4
  else if (['python', 'json'].includes(lang)) scores.feasibility += 2
  else scores.feasibility += 1

  // 零依赖优先
  if (/(zero|零依赖|no.dep|lightweight|minimal)/i.test(combined)) scores.feasibility += 3

  // 与我们技术栈匹配
  if (/(node|js|ts|shell|bash)/i.test(combined)) scores.feasibility += 2

  // 项目大小适中
  if (repo.stargazers_count > 50) scores.feasibility += 1  // 有人用 = 可能稳定

  scores.feasibility = Math.min(10, scores.feasibility)

  // ── 独立性 (0-10) ──
  scores.independence = 7  // 默认高分
  if (/(requires|依赖|needs.*api|external)/i.test(combined)) scores.independence -= 3
  if (/(cloud|saas|online)/i.test(combined)) scores.independence -= 2
  if (/(self.hosted|local|offline)/i.test(combined)) scores.independence += 2
  if (/(cli|command.line|terminal)/i.test(combined)) scores.independence += 1
  scores.independence = Math.max(0, Math.min(10, scores.independence))

  // ── 风险度 (0-10, 越高越危险) ──
  scores.risk = 2  // 默认低风险
  if (/(deprecated|过时|abandoned)/i.test(combined)) scores.risk += 3
  if (/(breaking.change|迁移|migration)/i.test(combined)) scores.risk += 2
  if (/(security|安全|vulnerability)/i.test(combined)) scores.risk += 1
  if (/(stable|稳定|production|生产)/i.test(combined)) scores.risk -= 1
  scores.risk = Math.max(0, Math.min(10, scores.risk))

  // ── 新鲜度 (0-10) ──
  // 我们没有的能力 → 高分
  const missingMatches = MISSING_CAPABILITIES.filter(cap =>
    combined.includes(cap.replace(/-/g, ' ')) || combined.includes(cap)
  )
  scores.freshness = missingMatches.length > 0 ? 8 : 5

  // 我们已有的能力 → 低分
  const existingMatches = EXISTING_CAPABILITIES.filter(cap =>
    combined.includes(cap.replace(/-/g, ' ')) || combined.includes(cap)
  )
  if (existingMatches.length > 0) scores.freshness = 3

  // 近期创建 = 更新鲜
  if (repo.created_at) {
    const created = new Date(repo.created_at)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    if (created > thirtyDaysAgo) scores.freshness = Math.min(10, scores.freshness + 2)
  }

  scores.freshness = Math.max(0, Math.min(10, scores.freshness))

  // ── 综合评分 ──
  const composite = (
    scores.relevance * 0.30 +
    scores.feasibility * 0.25 +
    scores.independence * 0.20 +
    (10 - scores.risk) * 0.15 +
    scores.freshness * 0.10
  )

  // ── 建议 ──
  let suggestion, confidence
  if (composite >= 7.0) {
    suggestion = 'adopt'
    confidence = 'high'
  } else if (composite >= 5.0) {
    suggestion = 'adapt'
    confidence = 'medium'
  } else {
    suggestion = 'skip'
    confidence = 'low'
  }

  // ── 复杂度估算 ──
  let estimatedEffort
  if (composite >= 7.0 && scores.feasibility >= 7) estimatedEffort = 'small'
  else if (composite >= 5.0) estimatedEffort = 'medium'
  else estimatedEffort = 'large'

  // ── 生成摘要 ──
  const summary = generateSummary(repo, scores, composite, suggestion)

  return {
    name: repo.full_name,
    url: repo.html_url || `https://github.com/${repo.full_name}`,
    description: repo.description || '',
    stars: repo.stargazers_count || 0,
    language: repo.language || 'unknown',
    topics: repo.topics || [],
    source: repo.source || 'unknown',

    scores,
    composite_score: Math.round(composite * 100) / 100,
    suggestion,
    confidence,
    estimated_effort: estimatedEffort,
    summary,

    analyzed_at: today(),
  }
}

function generateSummary(repo, scores, composite, suggestion) {
  const name = repo.full_name
  const desc = repo.description || '无描述'
  const stars = repo.stargazers_count || 0

  const lines = []
  lines.push(`**${name}** — ${desc}`)

  if (suggestion === 'adopt') {
    lines.push(`✅ 建议采纳 (综合分 ${composite.toFixed(1)}/10)`)
    lines.push(`   实用性${scores.relevance}/10 可行性${scores.feasibility}/10 风险${scores.risk}/10`)
  } else if (suggestion === 'adapt') {
    lines.push(`🟡 建议改造 (综合分 ${composite.toFixed(1)}/10)`)
    lines.push(`   实用性${scores.relevance}/10 可行性${scores.feasibility}/10 风险${scores.risk}/10`)
  } else {
    lines.push(`🔴 跳过 (综合分 ${composite.toFixed(1)}/10)`)
    lines.push(`   原因: 实用性${scores.relevance}/10 或可行性${scores.feasibility}/10 不足`)
  }

  return lines.join('\n')
}

// ── 主入口 ────────────────────────────────────────────

function analyze(top = null, reanalyze = false) {
  console.log('\n🔬 AiCode 自我进化 — 特性评估')
  console.log('='.repeat(50))

  // 加载扫描结果
  let trending = loadTrending()
  if (trending.length === 0) {
    console.log('⚠ 没有扫描结果，请先运行 github-scanner.js')
    return []
  }

  // 加载已有候选（用于缓存）
  const existing = loadCandidates()
  const existingNames = new Set(existing.candidates.map(c => c.name))

  // 过滤：只分析新的（除非 --reanalyze）
  let toAnalyze = trending
  if (!reanalyze) {
    toAnalyze = trending.filter(t => !existingNames.has(t.full_name))
    console.log(`📊 ${trending.length} 个候选，${toAnalyze.length} 个需要新分析`)
  } else {
    console.log(`📊 重新分析全部 ${trending.length} 个候选`)
  }

  if (top) {
    toAnalyze = toAnalyze.slice(0, top)
    console.log(`   限制分析 top ${top} 个`)
  }

  // 评估
  const analyzed = toAnalyze.map(repo => analyzeFeature(repo))

  // 合并（新 + 旧）
  let allCandidates
  if (reanalyze) {
    allCandidates = analyzed
  } else {
    // 保留旧的 adopt/adapt，更新新的
    const keepOld = existing.candidates.filter(c =>
      c.suggestion !== 'skip' || existingNames.has(c.name) === false
    )
    allCandidates = [...analyzed, ...keepOld.filter(c => !analyzed.find(a => a.name === c.name))]
  }

  // 按综合分排序
  allCandidates.sort((a, b) => b.composite_score - a.composite_score)

  // 保存
  const output = {
    analyzed_at: today(),
    total: allCandidates.length,
    adopt: allCandidates.filter(c => c.suggestion === 'adopt').length,
    adapt: allCandidates.filter(c => c.suggestion === 'adapt').length,
    skip: allCandidates.filter(c => c.suggestion === 'skip').length,
    candidates: allCandidates,
  }

  saveCandidates(output)

  // 输出摘要
  console.log('\n📊 评估结果：')
  console.log('-'.repeat(50))
  for (const c of allCandidates) {
    const icon = c.suggestion === 'adopt' ? '🟢' : c.suggestion === 'adapt' ? '🟡' : '🔴'
    console.log(`  ${icon} [${c.composite_score.toFixed(1)}] ${c.name} (${c.estimated_effort})`)
  }
  console.log('-'.repeat(50))
  console.log(`  🟢 采纳: ${output.adopt}  🟡 改造: ${output.adapt}  🔴 跳过: ${output.skip}`)

  return allCandidates
}

// ── CLI ───────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  let top = null
  let reanalyze = false

  const topIdx = args.indexOf('--top')
  if (topIdx !== -1 && args[topIdx + 1]) {
    top = parseInt(args[topIdx + 1])
  }

  if (args.includes('--reanalyze')) reanalyze = true

  analyze(top, reanalyze)
}

if (require.main === module) {
  main()
}

module.exports = { analyze, analyzeFeature, EXISTING_CAPABILITIES, MISSING_CAPABILITIES }
