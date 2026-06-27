#!/usr/bin/env node
/**
 * trace-collector.js — 执行轨迹收集器（M34 原型）
 *
 * 从 logs/app.jsonl 收集与指定 skill 相关的执行轨迹。
 *
 * 收集维度：
 *   - timestamp, level, component
 *   - action（action 字段或 msg 解析）
 *   - outcome（success/fail）
 *   - error（error level 或 error 字段）
 *
 * MVP 简化：
 *   - 不接 Hermes-style 多源
 *   - 只读 logs/app.jsonl
 *   - 按 component 过滤
 *
 * @since v3.0.2 (2026-06-28) M34 GEPA 集成
 */

const fs = require('fs')
const path = require('path')

const { LOG_FILE } = require('../orchestrator/logger')

// ── 工具函数 ──────────────────────────────────────────

function inferOutcome(event) {
  if (event.level === 'error' || event.level === 'fatal') return 'fail'
  if (event.level === 'warn') return 'warn'
  if (event.action && /fail|error|reject|rollback/i.test(event.action)) return 'fail'
  if (event.action && /success|done|complete|merged|ok/i.test(event.action)) return 'success'
  return 'info'
}

function inferAction(event) {
  if (event.action) return event.action
  if (event.msg) {
    // 提取消息第一个动词
    const m = event.msg.match(/^([一-龥]{2,8}|[A-Za-z]{3,20})/)
    return m ? m[1] : event.msg.slice(0, 20)
  }
  return 'unknown'
}

// ── 收集器 ────────────────────────────────────────────

class TraceCollector {
  constructor(opts = {}) {
    this.logFile = opts.logFile || LOG_FILE
    this.skillName = opts.skillName || null
  }

  /**
   * 收集与 skill 相关的 traces
   * @param {object} opts
   * @param {string} opts.component  按 component 过滤
   * @param {number} opts.sinceDays  只看最近 N 天（默认 30）
   * @returns {Array} traces
   */
  collect(opts = {}) {
    const component = opts.component || this.skillName
    const sinceDays = opts.sinceDays || 30
    const sinceTs = Date.now() - sinceDays * 86400 * 1000

    if (!fs.existsSync(this.logFile)) {
      return []
    }

    const content = fs.readFileSync(this.logFile, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const traces = []

    for (const line of lines) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }

      if (event.component !== component) continue
      if (new Date(event.ts).getTime() < sinceTs) continue

      traces.push({
        timestamp: event.ts,
        level: event.level,
        component: event.component,
        action: inferAction(event),
        outcome: inferOutcome(event),
        error: event.error?.message || event.err?.message || null,
        msg: event.msg,
      })
    }

    return traces
  }

  /**
   * 提取失败模式
   * @param {Array} traces
   * @returns {object} { failurePatterns, successPatterns, totalFail, totalSuccess }
   */
  extractPatterns(traces) {
    const failures = traces.filter(t => t.outcome === 'fail')
    const successes = traces.filter(t => t.outcome === 'success')

    const failureKeywords = {}
    for (const t of failures) {
      const words = `${t.action} ${t.error || ''} ${t.msg || ''}`.split(/\s+/)
      for (const w of words) {
        if (w.length >= 4) {
          failureKeywords[w] = (failureKeywords[w] || 0) + 1
        }
      }
    }

    const successKeywords = {}
    for (const t of successes) {
      const words = `${t.action} ${t.msg || ''}`.split(/\s+/)
      for (const w of words) {
        if (w.length >= 4) {
          successKeywords[w] = (successKeywords[w] || 0) + 1
        }
      }
    }

    return {
      failurePatterns: Object.entries(failureKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw, count]) => ({ keyword: kw, count })),
      successPatterns: Object.entries(successKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw, count]) => ({ keyword: kw, count })),
      totalFail: failures.length,
      totalSuccess: successes.length,
    }
  }
}

module.exports = { TraceCollector }

// ── CLI 自测 ──────────────────────────────────────────

if (require.main === module) {
  const collector = new TraceCollector()
  const traces = collector.collect({ component: 'evolve' })
  const patterns = collector.extractPatterns(traces)
  console.log(`✅ trace-collector self-test`)
  console.log(`traces: ${traces.length}`)
  console.log(`patterns:`, JSON.stringify(patterns, null, 2))
}
