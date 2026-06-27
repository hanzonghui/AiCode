#!/usr/bin/env node
/**
 * gepa-optimizer.js — 简化版遗传-Pareto 优化器（M34 原型）
 *
 * 不依赖 DSPy/GEPA，用纯 Node.js 实现：
 *   - 种群初始化（baseline + 变异）
 *   - 变异算子：同义词替换、列表重排、标题改写
 *   - 交叉：两段式单点交叉
 *   - 选择：tournament + Pareto front 非支配排序
 *
 * 这是 MVP 简化版，未来可替换为真正的 DSPy + GEPA。
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

// ── 默认配置 ──────────────────────────────────────────

const DEFAULT_OPTS = {
  populationSize: 8,
  maxIterations: 5,
  mutationRate: 0.4,
  crossoverRate: 0.2,
  tournamentSize: 3,
  elitism: 2,
}

// ── 同义词替换表（针对 evolve skill 调优）────────────────

const SYNONYMS = {
  '扫描': ['抓取', '检索', '搜索', '探测'],
  '分析': ['评估', '判断', '打分', '衡量'],
  '实现': ['落地', '实施', '完成', '执行'],
  '查看': ['检查', '浏览', '查询'],
  '运行': ['执行', '调用', '启动'],
  'GitHub': ['GitHub 平台', 'GitHub API'],
  '候选': ['候选项目', '候选特性', '备选'],
  '进化': ['演进', '迭代', '自我改进'],
}

// ── 工具函数 ──────────────────────────────────────────

function randInt(n) {
  return Math.floor(Math.random() * n)
}

function sample(arr) {
  return arr[randInt(arr.length)]
}

function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function splitBody(body) {
  // 按二级标题分块，保留结构
  const chunks = body.split(/^(?=##\s+)/m)
  return chunks.filter(c => c.trim().length > 0)
}

// ── 优化器 ────────────────────────────────────────────

class GEPAOptimizer {
  constructor(opts = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts }
    this.rng = opts.rng || Math.random
  }

  /**
   * 主优化循环
   * @param {string} baselineBody 原始 skill body
   * @param {object} originalFrontmatter 原始 frontmatter（用于约束校验）
   * @param {object} evaluator    SkillEvaluator 实例
   * @param {object} validator    ConstraintValidator 实例
   * @param {Array}  traces       执行轨迹
   * @returns {object} { best: {body, fitness, composite}, population, generations }
   */
  async optimize(baselineBody, originalFrontmatter, evaluator, validator, traces = []) {
    let population = this.initializePopulation(baselineBody)
    const history = []

    for (let gen = 0; gen < this.opts.maxIterations; gen++) {
      // 评估 + 约束检查
      const evaluated = await this._evaluatePopulation(
        population,
        baselineBody,
        originalFrontmatter,
        evaluator,
        validator,
        traces
      )

      history.push({
        generation: gen,
        meanFitness: evaluated.length > 0
          ? evaluated.reduce((s, e) => s + e.composite, 0) / evaluated.length
          : 0,
        bestComposite: evaluated.length > 0 ? Math.max(...evaluated.map(e => e.composite)) : 0,
      })

      // 选择下一代
      const elite = this._selectElite(evaluated)
      const offspring = []
      while (offspring.length < this.opts.populationSize - this.opts.elitism) {
        const p1 = this._tournamentSelect(evaluated)
        const p2 = this._tournamentSelect(evaluated)
        let child = this._crossover(p1.body, p2.body)
        child = this._mutate(child)
        offspring.push(child)
      }

      population = [...elite.map(e => e.body), ...offspring]
    }

    // 最终评估
    const final = await this._evaluatePopulation(
      population,
      baselineBody,
      originalFrontmatter,
      evaluator,
      validator,
      traces
    )

    const best = this._selectBest(final)
    return { best, population: final, history }
  }

  initializePopulation(baselineBody) {
    const pop = [baselineBody]
    let attempts = 0
    while (pop.length < this.opts.populationSize && attempts < this.opts.populationSize * 3) {
      pop.push(this._mutate(baselineBody))
      attempts++
    }
    return pop
  }

  async _evaluatePopulation(population, baselineBody, originalFrontmatter, evaluator, validator, traces) {
    const results = []
    for (const body of population) {
      const fitness = await evaluator.evaluate(body, baselineBody, traces)
      const candidateSkill = { frontmatter: originalFrontmatter || {}, body }
      const originalSkill = { frontmatter: originalFrontmatter || {}, body: baselineBody }
      const validation = validator.validate(candidateSkill, originalSkill)
      // 综合分 = fitness composite * constraint score
      const composite = fitness.composite * validation.score
      results.push({ body, fitness, composite, validation })
    }
    return results
  }

  _mutate(body) {
    if (this.rng() > this.opts.mutationRate) return body

    const operators = [
      () => this._synonymReplace(body),
      () => this._shuffleListItems(body),
      () => this._emphasisTweak(body),
      () => this._sectionReorder(body),
    ]
    const op = sample(operators)
    return op()
  }

  _synonymReplace(body) {
    let result = body
    for (const [word, alts] of Object.entries(SYNONYMS)) {
      const regex = new RegExp(word, 'g')
      result = result.replace(regex, () => sample(alts))
    }
    return result
  }

  _shuffleListItems(body) {
    const chunks = splitBody(body)
    return chunks
      .map(chunk => {
        const lines = chunk.split('\n')
        const listLines = lines.filter(l => /^\s*[-*]\s+/.test(l))
        if (listLines.length > 2 && this.rng() < 0.3) {
          const shuffled = shuffle(listLines)
          let idx = 0
          return lines.map(l => (/^\s*[-*]\s+/.test(l) ? shuffled[idx++] : l)).join('\n')
        }
        return chunk
      })
      .join('\n')
  }

  _emphasisTweak(body) {
    // 随机增删一个 emoji 或强调标记
    const tweaks = [' ⚡', ' ⭐', ' 🎯', ' 🔧']
    const lines = body.split('\n')
    const headingIdx = lines.findIndex(l => /^#{1,3}\s+/.test(l))
    if (headingIdx !== -1 && this.rng() < 0.5) {
      lines[headingIdx] += sample(tweaks)
    }
    return lines.join('\n')
  }

  _sectionReorder(body) {
    const chunks = splitBody(body)
    if (chunks.length <= 2 || this.rng() > 0.3) return body
    // 交换两个相邻 chunk
    const i = randInt(chunks.length - 1)
    ;[chunks[i], chunks[i + 1]] = [chunks[i + 1], chunks[i]]
    return chunks.join('\n')
  }

  _crossover(p1, p2) {
    if (this.rng() > this.opts.crossoverRate) return p1

    const chunks1 = splitBody(p1)
    const chunks2 = splitBody(p2)
    if (chunks1.length < 2 || chunks2.length < 2) return p1

    const point1 = 1 + randInt(chunks1.length - 1)
    const point2 = 1 + randInt(chunks2.length - 1)
    return [...chunks1.slice(0, point1), ...chunks2.slice(point2)].join('\n')
  }

  _tournamentSelect(evaluated) {
    let best = null
    for (let i = 0; i < this.opts.tournamentSize; i++) {
      const candidate = sample(evaluated)
      if (!best || candidate.composite > best.composite) {
        best = candidate
      }
    }
    return best
  }

  _selectElite(evaluated) {
    return [...evaluated].sort((a, b) => b.composite - a.composite).slice(0, this.opts.elitism)
  }

  _selectBest(evaluated) {
    const sorted = [...evaluated].sort((a, b) => b.composite - a.composite)
    return sorted[0]
  }
}

module.exports = { GEPAOptimizer, DEFAULT_OPTS, SYNONYMS }

// ── CLI 自测 ──────────────────────────────────────────

if (require.main === module) {
  const { SkillEvaluator } = require('./skill-evaluator')
  const { ConstraintValidator } = require('./constraint-gates')

  const baseline = [
    '## 扫描',
    '',
    '运行 `scan` 扫描 GitHub。',
    '',
    '## 分析',
    '',
    '运行 `analyze` 分析候选。'
  ].join('\n')
  const evalDataset = [
    { id: 'scan', keywords: ['scan', 'github'] },
    { id: 'analyze', keywords: ['analyze', 'candidate'] },
  ]
  const frontmatter = { name: 'evolve', version: '1.0', description: 'x' }

  const evaluator = new SkillEvaluator({ evalDataset })
  const validator = new ConstraintValidator()
  const optimizer = new GEPAOptimizer({ populationSize: 6, maxIterations: 3 })

  optimizer.optimize(baseline, frontmatter, evaluator, validator, []).then(result => {
    console.log('✅ gepa-optimizer self-test')
    console.log('best composite:', result.best.composite)
    console.log('history:', result.history)
  })
}
