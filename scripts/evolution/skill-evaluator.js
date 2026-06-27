#!/usr/bin/env node
/**
 * skill-evaluator.js — GEPA fitness 函数（M34 原型）
 *
 * 多目标 Pareto 评估：
 *   - clarity: 指令清晰度（动词密度、步骤明确性）
 *   - coverage: 对 eval dataset 的覆盖度
 *   - error_reduction: 相比 baseline，trace 错误模式减少比例
 *   - size_eff: 信息密度
 *
 * MVP 阶段以启发式为主，预留 LLM evaluator 接口。
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

const fs = require('fs')
const path = require('path')

// ── 默认权重 ──────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  clarity: 0.30,
  coverage: 0.25,
  error_reduction: 0.25,
  size_eff: 0.20,
}

// ── 工具函数 ──────────────────────────────────────────

function countMatches(text, regex) {
  return (text.match(regex) || []).length
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// ── 启发式评估器 ──────────────────────────────────────

class SkillEvaluator {
  constructor(opts = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) }
    this.evalDataset = opts.evalDataset || []
    this.llmAdapter = opts.llmAdapter || null
  }

  /**
   * 评估候选 skill body
   * @param {string} candidateBody 候选 SKILL.md body
   * @param {string} baselineBody  原始 SKILL.md body
   * @param {Array}  traces       执行轨迹
   * @returns {object} { fitness: {clarity, coverage, errorReduction, sizeEff}, composite }
   */
  async evaluate(candidateBody, baselineBody, traces = []) {
    const clarity = this.evaluateClarity(candidateBody)
    const coverage = this.evaluateCoverage(candidateBody)
    const errorReduction = this.evaluateErrorReduction(candidateBody, baselineBody, traces)
    const sizeEff = this.evaluateSizeEfficiency(candidateBody)

    const composite =
      this.weights.clarity * clarity +
      this.weights.coverage * coverage +
      this.weights.error_reduction * errorReduction +
      this.weights.size_eff * sizeEff

    return {
      fitness: {
        clarity: round(clarity),
        coverage: round(coverage),
        errorReduction: round(errorReduction),
        sizeEff: round(sizeEff),
      },
      composite: round(composite),
    }
  }

  /**
   * 指令清晰度：动词密度 + 步骤明确性 + 结构完整
   */
  evaluateClarity(body) {
    const words = body.split(/\s+/).length || 1
    const verbs = countMatches(body, /\b(运行|执行|扫描|分析|查看|实现|检查|生成|添加|修改|删除|创建|提交|合并|回滚|安装|配置|使用|输入|选择|确认|触发)\b/g)
    const codeBlocks = countMatches(body, /```/g) / 2
    const headings = countMatches(body, /^#{1,3}\s+/gm)
    const lists = countMatches(body, /^\s*[-*]\s+/gm)

    const verbDensity = clamp(verbs / words * 10, 0, 1)
    const structureScore = clamp((headings * 0.1 + lists * 0.05 + codeBlocks * 0.1), 0, 1)
    return clamp((verbDensity * 0.5 + structureScore * 0.5), 0, 1)
  }

  /**
   * 覆盖率：eval dataset 中多少 case 能被 skill body 覆盖
   */
  evaluateCoverage(body) {
    if (!Array.isArray(this.evalDataset) || this.evalDataset.length === 0) return 0.5

    let covered = 0
    for (const item of this.evalDataset) {
      const expected = item.expected_actions || []
      const keywords = item.keywords || expected
      if (keywords.length === 0) {
        covered += 1
        continue
      }
      const matched = keywords.filter(k => body.toLowerCase().includes(k.toLowerCase())).length
      if (matched / keywords.length >= 0.5) covered += 1
    }
    return covered / this.evalDataset.length
  }

  /**
   * 错误减少：从 traces 中提取失败模式，看候选 body 是否更强调避免这些错误
   */
  evaluateErrorReduction(candidateBody, baselineBody, traces) {
    if (!Array.isArray(traces) || traces.length === 0) return 0.5

    const failures = traces.filter(t => t.outcome === 'fail' || t.level === 'error')
    if (failures.length === 0) return 0.8 // 无失败 = 较好

    const failureKeywords = failures
      .flatMap(t => {
        const txt = `${t.action || ''} ${t.error || ''} ${t.msg || ''}`
        return txt.split(/\s+/).filter(w => w.length >= 4)
      })
      .slice(0, 20)

    if (failureKeywords.length === 0) return 0.5

    const baselineCoverage = this._keywordCoverage(baselineBody, failureKeywords)
    const candidateCoverage = this._keywordCoverage(candidateBody, failureKeywords)

    // 如果候选覆盖了更多失败关键词，说明它更针对性地改进了
    return clamp(0.5 + (candidateCoverage - baselineCoverage), 0, 1)
  }

  _keywordCoverage(body, keywords) {
    const lower = body.toLowerCase()
    const matched = keywords.filter(k => lower.includes(k.toLowerCase())).length
    return matched / keywords.length
  }

  /**
   * 信息密度：有用内容 / 总长度，惩罚过度冗长
   */
  evaluateSizeEfficiency(body) {
    const total = body.length || 1
    const codeChars = (body.match(/```[\s\S]*?```/g) || []).join('').length
    const headingChars = (body.match(/^#{1,3}\s+.+$/gm) || []).join('').length
    const useful = codeChars + headingChars
    const density = useful / total
    // 理想密度 0.3-0.7，超过 0.7 不额外奖励，低于 0.2 惩罚
    if (density < 0.2) return clamp(density * 4, 0, 1)
    if (density > 0.7) return 1.0
    return clamp((density - 0.2) / 0.5, 0, 1)
  }
}

function round(n) {
  return Math.round(n * 100) / 100
}

// ── CLI 自测 ──────────────────────────────────────────

if (require.main === module) {
  const evalDataset = [
    { id: 'scan', keywords: ['scan', 'github', 'trending'] },
    { id: 'analyze', keywords: ['analyze', 'candidate', 'score'] },
  ]

  const baseline = "# Skill\n\n运行 scan 扫描 GitHub。"
  const candidate = [
    '# Skill',
    '',
    '## 扫描',
    '',
    '运行 `/evolve scan` 扫描 GitHub Trending。',
    '',
    '## 分析',
    '',
    '运行 `/evolve analyze` 分析候选并打分。'
  ].join('\n')

  const evaluator = new SkillEvaluator({ evalDataset })
  evaluator.evaluate(candidate, baseline, []).then(result => {
    console.log('✅ skill-evaluator self-test')
    console.log(JSON.stringify(result, null, 2))
  })
}

module.exports = { SkillEvaluator, DEFAULT_WEIGHTS }