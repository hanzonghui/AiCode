#!/usr/bin/env node
/**
 * constraint-gates.js — GEPA 护栏（M34 原型）
 *
 * 硬约束（一票否决）：
 *   - YAML frontmatter 结构完整
 *   - body 大小不超过限制
 *   - 不能引入破坏性命令
 * 软约束（扣分）：
 *   - 版本号不降级
 *   - 向后兼容（保留原有命令子集）
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

// ── 默认约束配置 ──────────────────────────────────────

const DEFAULT_LIMITS = {
  maxBodySize: 5000,       // 字符
  maxSteps: 20,            // 指令步骤
  maxCodeBlocks: 10,       // 代码块
  maxPromptGrowth: 0.2,    // 相对原版最大增长比例
}

const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+\//,
  /git\s+push\s+--force/,
  /git\s+reset\s+--hard/,
  /--no-verify/,
  /curl\s+.*?\|\s*bash(?!\s*-c\s*['"]echo)/,
]

const REQUIRED_FRONTMATTER_FIELDS = ['name', 'version', 'description']

// ── 工具函数 ──────────────────────────────────────────

function parseVersion(v) {
  if (typeof v !== 'string') return [0, 0, 0]
  const parts = v.replace(/^v/, '').split('.').map(Number)
  return parts.map(n => (Number.isNaN(n) ? 0 : n))
}

function versionGte(a, b) {
  const av = parseVersion(a)
  const bv = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if ((av[i] || 0) > (bv[i] || 0)) return true
    if ((av[i] || 0) < (bv[i] || 0)) return false
  }
  return true
}

// ── 约束验证器 ────────────────────────────────────────

class ConstraintValidator {
  constructor(opts = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...(opts.limits || {}) }
    this.forbiddenPatterns = opts.forbiddenPatterns || FORBIDDEN_PATTERNS
    this.requiredFields = opts.requiredFields || REQUIRED_FRONTMATTER_FIELDS
  }

  /**
   * 完整检查
   * @param {object} candidateSkill { frontmatter, body }
   * @param {object} originalSkill  { frontmatter, body }
   * @returns {object} { allowed: boolean, score: number, reasons: string[], hardViolations: string[] }
   */
  validate(candidateSkill, originalSkill = null) {
    const hard = this.checkHardConstraints(candidateSkill)
    if (!hard.passed) {
      return {
        allowed: false,
        score: 0,
        reasons: hard.violations,
        hardViolations: hard.violations,
      }
    }

    const soft = this.checkSoftConstraints(candidateSkill, originalSkill)
    return {
      allowed: true,
      score: soft.score,
      reasons: soft.deductions,
      hardViolations: [],
    }
  }

  checkHardConstraints(skill) {
    const violations = []

    // 1. frontmatter 必须字段
    for (const f of this.requiredFields) {
      if (!skill.frontmatter || skill.frontmatter[f] === undefined || skill.frontmatter[f] === '') {
        violations.push(`frontmatter 缺少字段: ${f}`)
      }
    }

    // 2. body 大小
    const bodySize = (skill.body || '').length
    if (bodySize > this.limits.maxBodySize) {
      violations.push(`body 大小 ${bodySize} > 限制 ${this.limits.maxBodySize}`)
    }

    // 3. 步骤数
    const steps = (skill.body || '').split(/^\s*[-*]\s+/gm).length - 1
    if (steps > this.limits.maxSteps) {
      violations.push(`步骤数 ${steps} > 限制 ${this.limits.maxSteps}`)
    }

    // 4. 代码块数
    const codeBlocks = ((skill.body || '').match(/```/g) || []).length / 2
    if (codeBlocks > this.limits.maxCodeBlocks) {
      violations.push(`代码块数 ${codeBlocks} > 限制 ${this.limits.maxCodeBlocks}`)
    }

    // 5. 破坏性命令
    for (const pat of this.forbiddenPatterns) {
      if (pat.test(skill.body || '')) {
        violations.push(`命中禁止命令模式: ${pat.source}`)
      }
    }

    return { passed: violations.length === 0, violations }
  }

  checkSoftConstraints(candidateSkill, originalSkill) {
    const deductions = []
    let score = 1.0

    if (!originalSkill) return { score, deductions }

    // 1. 版本号不降级
    const origVersion = originalSkill.frontmatter?.version
    const candVersion = candidateSkill.frontmatter?.version
    if (origVersion && candVersion && !versionGte(candVersion, origVersion)) {
      deductions.push(`版本号降级: ${candVersion} < ${origVersion}`)
      score -= 0.3
    }

    // 2. 大小增长限制
    const origSize = (originalSkill.body || '').length
    const candSize = (candidateSkill.body || '').length
    if (origSize > 0) {
      const growth = (candSize - origSize) / origSize
      if (growth > this.limits.maxPromptGrowth) {
        deductions.push(`body 增长 ${(growth * 100).toFixed(1)}% > ${(this.limits.maxPromptGrowth * 100).toFixed(0)}%`)
        score -= 0.2
      }
    }

    // 3. 向后兼容：保留原有命令子集（简单检查 backtick 命令）
    const origCommands = this._extractBacktickCommands(originalSkill.body || '')
    const candCommands = this._extractBacktickCommands(candidateSkill.body || '')
    const missing = origCommands.filter(c => !candCommands.includes(c))
    if (missing.length > 0) {
      deductions.push(`丢失原有命令: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`)
      score -= 0.2
    }

    return { score: Math.max(0, score), deductions }
  }

  _extractBacktickCommands(body) {
    const matches = body.match(/`[^`]+`/g) || []
    return [...new Set(matches.map(m => m.replace(/`/g, '')))]
  }
}

// ── CLI 自测 ──────────────────────────────────────────

if (require.main === module) {
  const validator = new ConstraintValidator()

  const original = {
    frontmatter: { name: 'evolve', version: '1.0', description: 'x' },
    body: '# Evolve\n\n`scan` `analyze`',
  }

  const good = {
    frontmatter: { name: 'evolve', version: '1.1', description: 'x' },
    body: '# Evolve\n\n`scan` `analyze` `self-evolve`',
  }

  const bad = {
    frontmatter: { name: 'evolve', version: '0.9', description: 'x' },
    body: '# Evolve\n\n`analyze`\n\nrm -rf /',
  }

  console.log('good:', validator.validate(good, original))
  console.log('bad:', validator.validate(bad, original))
}

module.exports = { ConstraintValidator, DEFAULT_LIMITS, FORBIDDEN_PATTERNS }
