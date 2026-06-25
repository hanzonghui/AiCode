#!/usr/bin/env node
/**
 * proactive-scan.js — 主动发现问题引擎（v1.9.1 智能增量 C）
 *
 * 触发位置：SessionStart hook（在 evolution-hook.sh 后追加）
 * 作用：让 Claude "自己看项目状态"，不用用户问也能主动发现问题
 *
 * 7 个内置检测维度（每类 anomaly 一个）：
 *   1. ci-status           — CI 最近 run 红/绿
 *   2. uncommitted         — 未提交改动
 *   3. todo-accumulate     — TODO/FIXME 累积数
 *   4. test-coverage       — 测试覆盖率（coverage-summary.json）
 *   5. deps-outdated       — npm outdated 依赖过期
 *   6. stale-files         — 30 天未访问的 .js / .md
 *   7. candidate-pending   — candidates.json 采纳但未实现
 *
 * 设计原则：
 *   - 永不阻塞主流程（任何异常包 try/catch + 返回）
 *   - 轻量（不调 LLM，纯规则）
 *   - 单维度失败不拖垮其他（独立 try/catch）
 *   - 状态缓存（.last-scan.json 避免每次重扫）
 *   - 顶部展示格式（1 行总结 + 详细列表）
 *
 * @since v1.9.1 (2026-06-24)
 * @source 04_自我进化循环系统设计.md §0.4 增量 C
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const ANOMALY_FILE = path.join(MEMORY_DIR, 'anomalies.json');
const LAST_SCAN_FILE = path.join(MEMORY_DIR, '.last-scan.json');

// 维度开关（可外部覆盖）
const DIMENSIONS_ENABLED = {
  'ci-status': true,
  'uncommitted': true,
  'todo-accumulate': true,
  'test-coverage': true,
  'deps-outdated': true,
  'stale-files': true,
  'candidate-pending': true,
};

// 缓存 TTL（秒）：5 分钟内不重扫
const CACHE_TTL = 5 * 60;

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

function loadLastScan() {
  if (!fs.existsSync(LAST_SCAN_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(LAST_SCAN_FILE, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

function saveLastScan(summary) {
  try {
    ensureDir(MEMORY_DIR);
    fs.writeFileSync(LAST_SCAN_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
    }));
  } catch { /* 写失败不影响 */ }
}

function execSafe(cmd, cwd) {
  try {
    return execSync(cmd, {
      cwd: cwd || WORKSPACE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// ── 维度 1：CI 红/绿 ────────────────────────────────
// 看 .github/workflows/ 下最近 run 状态。
// 简化处理：读 trend-watch-log.json 里最近的 CI 警报数。

function detectCiStatus() {
  try {
    const logPath = path.join(WORKSPACE_ROOT, 'data', 'github', 'trend-watch-log.json');
    if (!fileExists(logPath)) return [];

    const content = readFileSafe(logPath);
    if (!content) return [];

    const data = JSON.parse(content);
    const daily = (data.entries || []).filter(e => e.layer === 'daily');
    if (daily.length === 0) return [];

    const latest = daily[daily.length - 1];
    const alertCount = latest.alerts || 0;

    if (alertCount > 0) {
      return [{
        dimension: 'ci-status',
        severity: 'error',
        message: `CI/趋势监控触发 ${alertCount} 个警报`,
        hint: '查看 data/github/trend-watch-log.json 最近 daily 条目',
      }];
    }

    return [];
  } catch {
    return [];
  }
}

// ── 维度 2：未提交改动 ──────────────────────────────

function detectUncommitted() {
  try {
    const output = execSafe('git status --porcelain');
    if (!output) return [];

    const lines = output.split('\n').filter(Boolean);
    if (lines.length === 0) return [];

    return [{
      dimension: 'uncommitted',
      severity: lines.length > 5 ? 'error' : 'warning',
      message: `${lines.length} 个未提交的改动`,
      hint: '运行 git status 查看详情，commit 或 stash',
    }];
  } catch {
    return [];
  }
}

// ── 维度 3：TODO 累积 ──────────────────────────────
// 扫所有 .js 的 TODO/FIXME/XXX 数（排除 node_modules / archives）

function detectTodoAccumulate() {
  try {
    const output = execSafe('git ls-files "*.js" "*.ts" "*.md" 2>/dev/null | head -1000');
    if (!output) return [];

    const files = output.split('\n').filter(Boolean);
    let totalTodos = 0;
    const fileHits = [];

    for (const file of files) {
      // 跳过排除目录
      if (file.includes('node_modules') || file.includes('archives/') || file.includes('.skill/')) continue;

      const content = readFileSafe(path.join(WORKSPACE_ROOT, file));
      if (!content) continue;

      const matches = content.match(/\b(TODO|FIXME|XXX|HACK)\b/g);
      if (matches) {
        totalTodos += matches.length;
        if (matches.length >= 3) {
          fileHits.push(`${path.basename(file)}(${matches.length})`);
        }
      }
    }

    if (totalTodos === 0) return [];
    if (totalTodos < 5) return []; // 少量 TODO 不算异常

    return [{
      dimension: 'todo-accumulate',
      severity: totalTodos > 20 ? 'error' : 'warning',
      message: `项目累计 ${totalTodos} 处 TODO/FIXME/XXX 标记`,
      hint: fileHits.length > 0
        ? `热点文件: ${fileHits.slice(0, 5).join(', ')}`
        : '建议分配 owner 或清理过时项',
    }];
  } catch {
    return [];
  }
}

// ── 维度 4：测试覆盖率 ──────────────────────────────

function detectTestCoverage() {
  try {
    const covPath = path.join(WORKSPACE_ROOT, 'coverage', 'coverage-summary.json');
    if (!fileExists(covPath)) return [];

    const content = readFileSafe(covPath);
    if (!content) return [];

    const data = JSON.parse(content);
    const total = data.total;
    if (!total) return [];

    const lines = total.lines?.pct;
    if (typeof lines !== 'number') return [];

    if (lines >= 80) return []; // 健康

    return [{
      dimension: 'test-coverage',
      severity: lines < 50 ? 'error' : 'warning',
      message: `测试覆盖率 ${lines.toFixed(1)}%（lines）`,
      hint: '低于 80% 建议补测试，跑 npm test 生成新报告',
    }];
  } catch {
    return [];
  }
}

// ── 维度 5：依赖过期 ──────────────────────────────

function detectDepsOutdated() {
  try {
    const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
    if (!fileExists(pkgPath)) return [];

    // 不实际跑 npm outdated（太慢），改用 package.json 的版本字段判断
    const pkg = JSON.parse(readFileSafe(pkgPath) || '{}');
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    // 简化：用 caret/tilde 前缀判断是否锁版本
    const loosePinned = Object.entries(deps).filter(([name, ver]) => {
      // 锁定的版本（如 "1.2.3"）反而安全；带 ^ 或 ~ 或 * 或 >= 才"过期风险"
      return typeof ver === 'string' && /[\^~*>=]/.test(ver);
    });

    if (loosePinned.length === 0) return [];
    if (loosePinned.length < 5) return []; // 少量不报警

    return [{
      dimension: 'deps-outdated',
      severity: 'info',
      message: `${loosePinned.length} 个依赖用浮动版本（^/~/*/>=）`,
      hint: '生产环境建议锁版本，跑 npm outdated 检查实际过期',
    }];
  } catch {
    return [];
  }
}

// ── 维度 6：遗忘文件 ──────────────────────────────
// 30 天未访问的 .js / .md

function detectStaleFiles() {
  try {
    const output = execSafe('git ls-files "*.js" "*.md" 2>/dev/null | head -500');
    if (!output) return [];

    const files = output.split('\n').filter(Boolean);
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const stale = [];

    for (const file of files) {
      if (file.includes('node_modules') || file.includes('archives/')) continue;
      const fullPath = path.join(WORKSPACE_ROOT, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && (now - stat.mtimeMs) > thirtyDaysMs) {
          stale.push(file);
        }
      } catch { continue; }
      if (stale.length >= 20) break; // 最多报 20 个
    }

    if (stale.length === 0) return [];
    if (stale.length < 10) return []; // 少量不报警

    return [{
      dimension: 'stale-files',
      severity: 'info',
      message: `${stale.length}+ 个文件 30 天未修改`,
      hint: stale.length > 0 ? `示例: ${stale.slice(0, 3).join(', ')}` : '考虑归档或重写',
    }];
  } catch {
    return [];
  }
}

// ── 维度 7：候选未消化 ─────────────────────────────
// candidates.json 中标记采纳但还没实现的

function detectCandidatePending() {
  try {
    const candPath = path.join(WORKSPACE_ROOT, 'data', 'github', 'candidates.json');
    if (!fileExists(candPath)) return [];

    const content = readFileSafe(candPath);
    if (!content) return [];

    const data = JSON.parse(content);
    const adopted = (data.candidates || []).filter(c =>
      c.status === 'adopted' || c.status === 'approved'
    );

    if (adopted.length === 0) return [];

    return [{
      dimension: 'candidate-pending',
      severity: adopted.length > 3 ? 'warning' : 'info',
      message: `${adopted.length} 个候选已采纳但未实现`,
      hint: adopted.length > 0
        ? `示例: ${adopted.slice(0, 3).map(c => c.name || c.id).join(', ')}`
        : '查看 data/github/candidates.json 排期',
    }];
  } catch {
    return [];
  }
}

// ── 主入口 ─────────────────────────────────────────

function detectAll(force = false) {
  // 缓存命中检查（5 分钟内不重扫）
  if (!force) {
    const last = loadLastScan();
    if (last && last.timestamp) {
      const age = (Date.now() - new Date(last.timestamp).getTime()) / 1000;
      if (age < CACHE_TTL) {
        return {
          cached: true,
          summary: last.summary,
        };
      }
    }
  }

  const detectors = [
    ['ci-status', detectCiStatus],
    ['uncommitted', detectUncommitted],
    ['todo-accumulate', detectTodoAccumulate],
    ['test-coverage', detectTestCoverage],
    ['deps-outdated', detectDepsOutdated],
    ['stale-files', detectStaleFiles],
    ['candidate-pending', detectCandidatePending],
  ];

  const findings = [];

  for (const [key, fn] of detectors) {
    if (!DIMENSIONS_ENABLED[key]) continue;
    try {
      const result = fn();
      if (result && result.length > 0) {
        findings.push(...result.map(f => ({ ...f, dimension: key, timestamp: new Date().toISOString() })));
      }
    } catch { /* 单维度失败兜底 */ }
  }

  const summary = {
    total: findings.length,
    error: findings.filter(f => f.severity === 'error').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
    findings,
  };

  saveLastScan(summary);

  return { cached: false, summary };
}

/**
 * 顶部展示格式：1 行总结 + 详细列表
 */
function formatReport(result) {
  if (result.cached) {
    return `📦 使用缓存扫描结果（<${CACHE_TTL}s 前）`;
  }

  const s = result.summary;
  if (s.total === 0) {
    return '✨ 主动扫描：项目状态健康（7 维度全过）';
  }

  const lines = [];
  const summaryParts = [];
  if (s.error > 0) summaryParts.push(`🔴${s.error}`);
  if (s.warning > 0) summaryParts.push(`🟡${s.warning}`);
  if (s.info > 0) summaryParts.push(`🟢${s.info}`);

  lines.push(`🔍 主动扫描：${s.total} 项问题（${summaryParts.join(' / ')}）`);

  for (const f of s.findings) {
    const icon = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🟢';
    lines.push(`  ${icon} [${f.dimension}] ${f.message}`);
    if (f.hint) lines.push(`     💡 ${f.hint}`);
  }

  return lines.join('\n');
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'scan';
  const force = process.argv.includes('--force');

  try {
    if (cmd === 'scan') {
      const result = detectAll(force);
      console.log(formatReport(result));

      // 落盘完整 findings 到 anomalies.json
      if (!result.cached) {
        ensureDir(MEMORY_DIR);
        fs.writeFileSync(ANOMALY_FILE, JSON.stringify(result.summary, null, 2));

        // M13：anomaly 写入后自动触发失败蒸馏器（零成本 heuristic 默认，不阻塞主流程）
        try {
          const distillerPath = path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'learning', 'distiller.js');
          if (fs.existsSync(distillerPath)) {
            require(distillerPath).distillAll().then(d => {
              if (d.reusable > 0) {
                process.stderr.write(`[M13] 蒸馏完成: ${d.reusable} 条可复用经验已写入 KB\n`);
              }
            }).catch(() => { /* 蒸馏失败不阻塞 */ });
          }
        } catch { /* 永不阻塞 proactive-scan */ }
      }
    } else if (cmd === 'list') {
      // 读上次扫描结果
      if (fileExists(ANOMALY_FILE)) {
        const data = JSON.parse(readFileSafe(ANOMALY_FILE));
        console.log(formatReport({ cached: false, summary: data }));
      } else {
        console.log('📋 无历史扫描结果（先跑 scan）');
      }
    } else if (cmd === 'clear') {
      if (fileExists(ANOMALY_FILE)) {
        fs.unlinkSync(ANOMALY_FILE);
        console.log('✅ 已清除 anomalies.json');
      } else {
        console.log('⚠️  anomalies.json 不存在');
      }
    } else {
      console.error(`未知命令: ${cmd}（支持: scan / list / clear）`);
      process.exit(1);
    }
  } catch (e) {
    // 永不 throw
  }
  process.exit(0);
}

module.exports = {
  detectAll,
  formatReport,
  detectCiStatus,
  detectUncommitted,
  detectTodoAccumulate,
  detectTestCoverage,
  detectDepsOutdated,
  detectStaleFiles,
  detectCandidatePending,
  ANOMALY_FILE,
};