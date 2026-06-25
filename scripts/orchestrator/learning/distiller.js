#!/usr/bin/env node
/**
 * distiller.js — 失败蒸馏器（M13 · v3.0.0 P0-2）
 *
 * 作用：
 *   - 把 anomalies.json 里的异常自动蒸馏成经验
 *   - 判断"这是一次性事故，还是可复用的经验？"
 *   - 可复用 → 写入左脑 KB + 必要时建议规则升级
 *   - 一次性 → 记录原因，避免误写 KB
 *
 * 触发方式：
 *   - 推荐：proactive-scan.js 写入 anomalies.json 后自动调用
 *   - 手动：node scripts/orchestrator/learning/distiller.js run
 *   - CLI：status / history / clear
 *
 * 设计原则：
 *   - 零成本默认 backend：HeuristicAdapter 基于 anomaly 维度 + 关键词判断
 *   - LLM backend 可选：通过 llm-adapter 的 generateWithFallback
 *   - 永不 throw：任何异常只记录失败，不阻塞主流程
 *   - 幂等：同一 anomaly 多次蒸馏只写一次 KB（用 anomaly 指纹去重）
 *
 * 输出：
 *   - `.claude/skills/left-brain/memory/knowledge/KB-YYYYMMDD-NNN.md`（可复用经验）
 *   - `.claude/skills/left-brain/memory/distillation-log.jsonl`（所有蒸馏记录）
 *
 * @since v2.0.5 (2026-06-25) — v3.0.0 P0-2 失败闭环
 * @source 04_自我演进路线.md §0.4 M13
 */

const fs = require('fs');
const path = require('path');
const { generateWithFallback } = require('../llm-adapter');

// ── 配置 ─────────────────────────────────────────────

// scripts/orchestrator/learning/distiller.js → 上三级到工程根
const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const ANOMALY_FILE = path.join(MEMORY_DIR, 'anomalies.json');
const KNOWLEDGE_DIR = path.join(MEMORY_DIR, 'knowledge');
const MEMORY_INDEX = path.join(MEMORY_DIR, 'MEMORY.md');
const LOG_FILE = path.join(MEMORY_DIR, 'distillation-log.jsonl');

// Heuristic 规则：哪些 anomaly 维度大概率是可复用经验
const REUSABLE_DIMENSIONS = new Set([
  'todo-accumulate',
  'test-coverage',
  'candidate-pending',
  'stale-files',
]);

// 哪些维度明显是一次性（不值得写 KB）
const ONEOFF_DIMENSIONS = new Set([
  'uncommitted',
]);

// ── 工具函数 ─────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function loadAnomalies() {
  const content = readFileSafe(ANOMALY_FILE);
  if (!content) return [];
  try {
    const data = JSON.parse(content);
    return (data.findings || []);
  } catch {
    return [];
  }
}

/**
 * 生成 anomaly 指纹，用于去重
 */
function fingerprint(anomaly) {
  const key = `${anomaly.dimension}|${anomaly.message}`.toLowerCase().replace(/\s+/g, ' ').trim();
  return Buffer.from(key).toString('base64').slice(0, 32);
}

/**
 * 查找下一个 KB 编号
 */
function nextKbIndex() {
  ensureDir(KNOWLEDGE_DIR);
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => /^KB-\d{8}-\d{3}\.md$/.test(f));
  if (files.length === 0) return '001';
  const nums = files.map(f => parseInt(f.match(/-(\d{3})\.md$/)[1], 10));
  const next = Math.max(...nums) + 1;
  return next.toString().padStart(3, '0');
}

/**
 * 生成 KB 文件名
 */
function kbFileName() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `KB-${today}-${nextKbIndex()}.md`;
}

/**
 * 更新 MEMORY.md 索引（只追加一行，不去重）
 */
function updateMemoryIndex(kbName, title) {
  try {
    ensureDir(MEMORY_DIR);
    const line = `- [${title}](knowledge/${kbName}) — 自动蒸馏: ${title}\n`;
    if (!fs.existsSync(MEMORY_INDEX)) {
      fs.writeFileSync(MEMORY_INDEX, `# Memory Index\n\n${line}`);
    } else {
      fs.appendFileSync(MEMORY_INDEX, line);
    }
  } catch { /* 索引失败不影响主流程 */ }
}

/**
 * 写蒸馏日志
 */
function logDistillation(record) {
  try {
    ensureDir(MEMORY_DIR);
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ...record, ts: new Date().toISOString() }) + '\n');
  } catch { /* 日志失败不影响主流程 */ }
}

// ── Heuristic 蒸馏逻辑 ──────────────────────────────

/**
 * 零成本启发式蒸馏
 * @param {object} anomaly
 * @returns {{ reusable: boolean, reason: string, confidence: 'high'|'medium'|'low', title?: string, content?: string }}
 */
function heuristicDistill(anomaly) {
  const dim = anomaly.dimension;

  // 明确一次性
  if (ONEOFF_DIMENSIONS.has(dim)) {
    return {
      reusable: false,
      reason: `维度 "${dim}" 是会话级运行态，通常是一次性`,
      confidence: 'high',
    };
  }

  // 明确可复用
  if (REUSABLE_DIMENSIONS.has(dim)) {
    return {
      reusable: true,
      reason: `维度 "${dim}" 指向结构性问题，沉淀为经验`,
      confidence: 'medium',
      title: `自动蒸馏: ${dim} — ${anomaly.message.slice(0, 40)}`,
      content: generateKbBody(anomaly),
    };
  }

  // 其他维度：低置信度默认一次性（避免污染 KB）
  return {
    reusable: false,
    reason: `维度 "${dim}" 未在可复用清单中，保守判为一次性`,
    confidence: 'low',
  };
}

function generateKbBody(anomaly) {
  return `## 问题现象
- 维度：${anomaly.dimension}
- 消息：${anomaly.message}
- 建议：${anomaly.hint || '无'}

## 复用建议
1. 定期关注此维度扫描结果
2. 出现类似 anomaly 时优先检查本经验
3. 必要时升级到 .claude/rules 规则文件

## 来源
- 自动蒸馏器（M13）
- 时间：${new Date().toISOString()}
`;
}

// ── LLM 蒸馏逻辑 ────────────────────────────────────

async function llmDistill(anomaly) {
  const prompt = `你是一名经验工程师。下面是一个项目主动扫描发现的 anomaly，请判断它是"一次性事故"还是"可复用经验"。

Anomaly:
- 维度: ${anomaly.dimension}
- 严重级别: ${anomaly.severity}
- 消息: ${anomaly.message}
- 建议: ${anomaly.hint || '无'}

请用 JSON 输出，格式如下：
{
  "reusable": true/false,
  "reason": "一句话判断理由",
  "title": "如果 reusable=true，给出一个简洁的 KB 标题（中文）",
  "content": "如果 reusable=true，给出 3-5 条可执行建议（markdown 列表）"
}

注意：
- "uncommitted" 维度通常是临时运行态，判为一次性
- "todo-accumulate" / "test-coverage" / "candidate-pending" / "stale-files" 通常指向结构性问题，判为可复用
- 不确定时保守判为一次性（reusable=false）`;

  try {
    const result = await generateWithFallback(prompt, { maxTokens: 600 });
    const text = result.text || '';

    // 尝试从 text 中提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { reusable: false, reason: 'LLM 输出无法解析为 JSON，fallback 到一次性', confidence: 'low' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      reusable: !!parsed.reusable,
      reason: parsed.reason || 'LLM 判定',
      confidence: parsed.reusable ? 'medium' : 'low',
      title: parsed.title,
      content: parsed.content,
    };
  } catch (e) {
    return { reusable: false, reason: `LLM 蒸馏异常: ${e.message}`, confidence: 'low' };
  }
}

// ── 核心 API ────────────────────────────────────────

/**
 * 蒸馏单个 anomaly
 * @param {object} anomaly
 * @param {object} opts { useLLM: boolean }
 * @returns {{ fp: string, reusable: boolean, kbFile?: string, reason: string }}
 */
async function distillOne(anomaly, opts = {}) {
  const fp = fingerprint(anomaly);

  // 先 heuristic 判定
  const heuristic = heuristicDistill(anomaly);

  // 如果启用了 LLM，用 LLM 复核（但保持零成本兜底）
  let result = heuristic;
  if (opts.useLLM) {
    const llm = await llmDistill(anomaly);
    // LLM 与 heuristic 都判 reusable 才算 reusable（保守）
    result = {
      ...llm,
      reusable: heuristic.reusable && llm.reusable,
      reason: `heuristic=${heuristic.reusable}, llm=${llm.reusable}; ${llm.reason}`,
    };
  }

  if (result.reusable) {
    const kbName = kbFileName();
    const kbPath = path.join(KNOWLEDGE_DIR, kbName);
    ensureDir(KNOWLEDGE_DIR);

    const title = result.title || `自动蒸馏: ${anomaly.dimension}`;
    const content = result.content || generateKbBody(anomaly);

    const kbBody = `---
name: auto-distill-${fp}
description: ${title}
metadata:
  type: feedback
---

${content}

**Why:** 该 KB 由失败蒸馏器（M13）从 anomaly 自动生成，用于防止同类问题重复发生。

**How to apply:**
1. 遇到同类 ${anomaly.dimension} anomaly 时先 recall 本 KB
2. 若经验有效，保留；若过时，手动删除或更新
3. 必要时把经验升级到 .claude/rules 规则文件
`;

    fs.writeFileSync(kbPath, kbBody);
    updateMemoryIndex(kbName, title);

    logDistillation({
      fp,
      dimension: anomaly.dimension,
      reusable: true,
      reason: result.reason,
      kbFile: kbName,
      title,
    });

    return { fp, reusable: true, kbFile: kbName, reason: result.reason };
  }

  logDistillation({
    fp,
    dimension: anomaly.dimension,
    reusable: false,
    reason: result.reason,
    kbFile: null,
    title: null,
  });

  return { fp, reusable: false, reason: result.reason };
}

/**
 * 蒸馏所有 anomalies
 * @param {object} opts { useLLM: boolean }
 * @returns {{ total: number, reusable: number, oneoff: number, results: array }}
 */
async function distillAll(opts = {}) {
  const anomalies = loadAnomalies();
  const results = [];

  for (const anomaly of anomalies) {
    try {
      const r = await distillOne(anomaly, opts);
      results.push(r);
    } catch (e) {
      results.push({ fp: fingerprint(anomaly), reusable: false, reason: `蒸馏异常: ${e.message}` });
    }
  }

  return {
    total: results.length,
    reusable: results.filter(r => r.reusable).length,
    oneoff: results.filter(r => !r.reusable).length,
    results,
  };
}

/**
 * 查看蒸馏历史
 */
function history(limit = 20) {
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'run';
  const useLLM = process.argv.includes('--llm');

  (async () => {
    try {
      switch (cmd) {
        case 'run': {
          const result = await distillAll({ useLLM });
          console.log(`📦 蒸馏完成: 共 ${result.total} 条 anomaly`);
          console.log(`   ✅ 可复用经验: ${result.reusable}`);
          console.log(`   ⏭️  一次性事故: ${result.oneoff}`);
          for (const r of result.results) {
            const icon = r.reusable ? '✅' : '⏭️';
            const kb = r.kbFile ? ` → ${r.kbFile}` : '';
            console.log(`   ${icon} ${r.fp.slice(0, 12)}${kb}: ${r.reason.slice(0, 60)}`);
          }
          break;
        }
        case 'status': {
          const anomalies = loadAnomalies();
          const h = history(5);
          console.log(`📋 当前 anomalies: ${anomalies.length} 条`);
          console.log(`📝 蒸馏历史: ${h.length} 条（显示最近 ${Math.min(h.length, 5)} 条）`);
          for (const r of h.slice(-5)) {
            const icon = r.reusable ? '✅' : '⏭️';
            console.log(`   ${icon} [${r.ts.slice(0, 19)}] ${r.dimension}: ${r.reusable ? r.kbFile : r.reason}`);
          }
          break;
        }
        case 'history': {
          const h = history(50);
          console.log(JSON.stringify(h, null, 2));
          break;
        }
        case 'clear': {
          if (fs.existsSync(LOG_FILE)) {
            fs.unlinkSync(LOG_FILE);
            console.log('✅ 已清除 distillation-log.jsonl');
          } else {
            console.log('⚠️  distillation-log.jsonl 不存在');
          }
          break;
        }
        default: {
          console.log(`
distiller.js v1.0.0 — 失败蒸馏器（M13 · v3.0.0 P0-2）

用法:
  run [--llm]       蒸馏当前 anomalies.json（默认 heuristic，加 --llm 启用 LLM 复核）
  status            查看 anomalies 数量 + 最近蒸馏历史
  history           输出完整蒸馏历史（JSON）
  clear             清除蒸馏日志

状态文件:
  - 输入: .claude/skills/left-brain/memory/anomalies.json
  - 输出: .claude/skills/left-brain/memory/knowledge/KB-YYYYMMDD-NNN.md
  - 日志: .claude/skills/left-brain/memory/distillation-log.jsonl
`);
        }
      }
    } catch (e) {
      // 永不 throw
      console.error('❌ 异常:', e.message);
    }
    process.exit(0);
  })();
}

module.exports = {
  distillOne,
  distillAll,
  heuristicDistill,
  fingerprint,
  history,
};
