#!/usr/bin/env node
/**
 * self-reflect.js — 自我反思引擎（v1.9.1 智能增量 A）
 *
 * 触发位置：PostToolUse hook（每次 Claude Edit/Write 后）
 * 作用：让 Claude "写完代码自己检查"，不用用户当裁判
 *
 * 4 个内置规则：
 *   1. code-completeness  — 代码完整性（console.log/debugger/未闭合括号）
 *   2. test-trigger       — 测试触发（改非 test-*.js 时提醒更新测试）
 *   3. todo-scan          — TODO/FIXME/XXX 扫描
 *   4. doc-version        — 文档版本号一致性（过时版本关键词）
 *
 * 设计原则：
 *   - 永不阻塞主流程（任何异常包 try/catch + 返回）
 *   - 轻量（不调 LLM，纯规则）
 *   - 去重（同一文件同一规则不重复）
 *   - JSONL 落盘 + SessionStart 顶部展示
 *
 * @since v1.9.1 (2026-06-24)
 * @source 04_自我进化循环系统设计.md §0.4 增量 A
 */

const fs = require('fs');
const path = require('path');

const {
  addToQueue,
  formatQueue,
  loadQueue,
} = require('./secondary-review');

// ── 配置 ─────────────────────────────────────────────

const SKILL_DIR = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'left-brain');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const REFLECTION_FILE = path.join(MEMORY_DIR, 'reflections.jsonl');

// 规则开关（可外部覆盖）
const RULES_ENABLED = {
  'code-completeness': true,
  'test-trigger': true,
  'todo-scan': true,
  'doc-version': true,
  'high-stakes-trigger': true,
};

// 过时版本关键词（文档里不应再提这些）
const STALE_VERSIONS = ['v1.0', 'v1.5', 'v1.3.2', 'v1.3.1', 'v1.2', 'v1.1'];

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

function deduplicate(filePath, rule, message) {
  // 同一文件同一规则同一消息：最近 100 条内不再追加
  if (!fs.existsSync(REFLECTION_FILE)) return false;
  const content = fs.readFileSync(REFLECTION_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean).slice(-100);
  const sig = `${filePath}|${rule}|${message}`;
  return lines.some(line => {
    try {
      const entry = JSON.parse(line);
      return `${entry.file_path || ''}|${entry.rule || ''}|${entry.message || ''}` === sig;
    } catch { return false; }
  });
}

function appendReflection(entry) {
  if (deduplicate(entry.file_path, entry.rule, entry.message)) return false;
  ensureDir(MEMORY_DIR);
  fs.appendFileSync(REFLECTION_FILE, JSON.stringify(entry) + '\n');
  return true;
}

// ── 规则 1：代码完整性 ──────────────────────────────

function checkCodeCompleteness(filePath, content) {
  if (!filePath.endsWith('.js')) return [];
  const findings = [];

  // console.log 残留（开发期常用，但生产代码不应有）
  const consoleMatches = content.match(/^\s*console\.log\(/gm);
  if (consoleMatches && consoleMatches.length > 0) {
    findings.push({
      rule: 'code-completeness',
      severity: 'warning',
      file_path: filePath,
      message: `发现 ${consoleMatches.length} 处 console.log（生产代码应移除）`,
      hint: '保留用 logger.js（v1.9 P1-1），避免 console.log 污染输出',
    });
  }

  // debugger 断点
  if (/\bdebugger\b/.test(content)) {
    findings.push({
      rule: 'code-completeness',
      severity: 'error',
      file_path: filePath,
      message: '发现 debugger 断点（生产代码必须移除）',
      hint: '调试完成后删除 debugger 语句',
    });
  }

  // 括号匹配（粗略检查：左右大括号数量）
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    findings.push({
      rule: 'code-completeness',
      severity: 'error',
      file_path: filePath,
      message: `大括号不匹配: { ${openBraces} 个 vs } ${closeBraces} 个`,
      hint: '检查文件末尾是否漏写闭合括号',
    });
  }

  return findings;
}

// ── 规则 2：测试触发 ────────────────────────────────

function checkTestTrigger(filePath) {
  // 改的是 .js 但不是 test-*.js → 提醒更新测试
  if (!filePath.endsWith('.js')) return [];
  const basename = path.basename(filePath);
  if (basename.startsWith('test-') || basename.endsWith('.test.js')) return [];
  if (basename.includes('index.js') || basename.includes('config')) return [];

  return [{
    rule: 'test-trigger',
    severity: 'info',
    file_path: filePath,
    message: `修改了 ${basename}，对应的 test-${basename.replace(/\.js$/, '')}.js 是否需要更新？`,
    hint: '新增/修改逻辑应有对应测试，跑 npm test 验证',
  }];
}

// ── 规则 3：TODO 扫描 ──────────────────────────────

function checkTodoScan(filePath, content) {
  if (!filePath.endsWith('.js')) return [];
  const findings = [];

  // 匹配 TODO/FIXME/XXX（不在注释里也扫）
  const matches = content.match(/\b(TODO|FIXME|XXX|HACK)\b/g);
  if (matches && matches.length > 0) {
    const counts = matches.reduce((acc, m) => {
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ');
    findings.push({
      rule: 'todo-scan',
      severity: 'warning',
      file_path: filePath,
      message: `发现待办标记: ${summary}`,
      hint: 'TODO/FIXME 应该有 owner 和预计完成时间，避免无限堆积',
    });
  }

  return findings;
}

// ── 规则 4：文档版本号一致性 ────────────────────────

function checkDocVersion(filePath, content) {
  if (!filePath.endsWith('.md')) return [];
  const findings = [];

  for (const stale of STALE_VERSIONS) {
    // 用词边界匹配，避免误判 v1.0 包含 v1.0.0
    const re = new RegExp(`\\b${stale.replace(/\./g, '\\.')}\\b`, 'g');
    const matches = content.match(re);
    if (matches && matches.length > 0) {
      findings.push({
        rule: 'doc-version',
        severity: 'info',
        file_path: filePath,
        message: `文档提到过时版本 ${stale}（${matches.length} 次）`,
        hint: '当前版本 v1.9.x，文档里如有旧版本描述请同步更新',
      });
    }
  }

  return findings;
}

// ── 规则 5：高风险改动触发二次采样（增量 A 方案 B）────────────────

function checkHighStakes(filePath, content, toolName) {
  const result = addToQueue({
    file_path: filePath,
    content,
    tool_name: toolName,
    batch_size: 1,
  });

  if (!result.added) return [];

  return [{
    rule: 'high-stakes-trigger',
    severity: 'warning',
    file_path: filePath,
    message: `高风险改动已加入二次采样队列: ${result.item.id}`,
    hint: `原因: ${result.item.reasons.join('; ')}。运行 /secondary-review 查看队列`,
  }];
}

// ── 主入口 ─────────────────────────────────────────

function selfReflect(toolName, filePath, content) {
  // 只对 Edit/Write 触发
  if (toolName !== 'Edit' && toolName !== 'Write') return [];

  if (!filePath) return [];
  if (!content) content = readFileSafe(filePath) || '';

  const allFindings = [];

  // 各规则独立 try/catch，单个规则挂了不影响其他
  if (RULES_ENABLED['code-completeness']) {
    try {
      allFindings.push(...checkCodeCompleteness(filePath, content));
    } catch (e) { /* 兜底 */ }
  }

  if (RULES_ENABLED['test-trigger']) {
    try {
      allFindings.push(...checkTestTrigger(filePath));
    } catch (e) { /* 兜底 */ }
  }

  if (RULES_ENABLED['todo-scan']) {
    try {
      allFindings.push(...checkTodoScan(filePath, content));
    } catch (e) { /* 兜底 */ }
  }

  if (RULES_ENABLED['doc-version']) {
    try {
      allFindings.push(...checkDocVersion(filePath, content));
    } catch (e) { /* 兜底 */ }
  }

  if (RULES_ENABLED['high-stakes-trigger']) {
    try {
      allFindings.push(...checkHighStakes(filePath, content, toolName));
    } catch (e) { /* 兜底 */ }
  }

  // 写入反馈队列（带 timestamp + 去重）
  const written = [];
  for (const f of allFindings) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...f,
    };
    try {
      if (appendReflection(entry)) written.push(entry);
    } catch (e) { /* 写失败不影响 */ }
  }

  return written;
}

// ── CLI 入口 ────────────────────────────────────────

if (require.main === module) {
  // 输入格式：stdin JSON（Claude Code hook 协议）
  // 或：第一参数是 JSON 字符串（兼容测试）
  let input = '';
  if (process.argv[2]) {
    input = process.argv[2];
  } else {
    input = fs.readFileSync(0, 'utf8');  // stdin
  }

  let toolName = null, filePath = null, content = null;
  try {
    const data = JSON.parse(input);
    toolName = data.tool_use_name || data.toolName || data.tool_name;
    filePath = data.file_path || data.filePath || data.path;
    content = data.content || data.new_content || data.newContent;
  } catch (e) {
    // 不是 JSON 也不致命，exit 0
    process.exit(0);
  }

  try {
    const findings = selfReflect(toolName, filePath, content);
    // 输出到 stdout（CC 会记录），但绝不 throw
    if (findings.length > 0) {
      console.log(`[self-reflect] ${findings.length} 项反馈已记录`);
      for (const f of findings) {
        const icon = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🟢';
        console.log(`  ${icon} [${f.rule}] ${f.message}`);
      }
    }
  } catch (e) {
    // 永不 throw
  }
  process.exit(0);
}

module.exports = {
  selfReflect,
  checkCodeCompleteness,
  checkTestTrigger,
  checkTodoScan,
  checkDocVersion,
  checkHighStakes,
  REFLECTION_FILE,
};
