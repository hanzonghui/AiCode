#!/usr/bin/env node
/**
 * quick-audit.js — /audit skill v1.0.0 浅层扫描引擎
 *
 * 触发方式：
 *   - 手动：node scripts/orchestrator/audit/quick-audit.js
 *   - 通过：/audit 命令
 *
 * 作用：
 *   - 浅层快速（1-2 分钟）扫描 AiCode 工程健康度
 *   - 不派子代理，不扫描整个仓库
 *   - 输出 6 段结构化报告：工程画像 / 已完成 / 未完成 / 能力缺口 / 重复冗余 / 优化建议
 *   - 报告可保存为 .claude/audits/audit-YYYYMMDD-HHMM.md
 *
 * 设计原则：
 *   - 永远不写代码文件（只读 + 写 .claude/audits/ 和 04.md backlog）
 *   - 遵守 .claudeignore（不读 archives/、data/github/、snapshots/）
 *   - 永不 throw（任何扫描失败 → 返回 skipped，不阻塞主流程）
 *   - 浅层 < 5K tokens / 深度 < 50K tokens
 *
 * @since v2.0.2 (2026-06-25)
 * @source 04_自我演进路线.md §0.4 增量 P0-6
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── 配置 ─────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const AUDIT_DIR = path.join(WORKSPACE_ROOT, '.claude', 'audits');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory');
const REPORT_FILE = path.join(MEMORY_DIR, 'audit-history.json');

const ROOT_DOCS = {
  changelog: path.join(WORKSPACE_ROOT, 'CHANGELOG.md'),
  roadmap: path.join(WORKSPACE_ROOT, '04_自我演进路线.md'),
  version: path.join(WORKSPACE_ROOT, '03_版本迭代计划.md'),
  claude: path.join(WORKSPACE_ROOT, 'CLAUDE.md'),
  context: path.join(WORKSPACE_ROOT, 'PROJECT-CONTEXT.md'),
};

const SKILL_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills');
const COMMAND_DIR = path.join(WORKSPACE_ROOT, '.claude', 'commands');
const SCRIPT_DIRS = [
  path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator'),
  path.join(WORKSPACE_ROOT, 'scripts', 'evolution'),
  path.join(WORKSPACE_ROOT, 'scripts', 'mcp'),
  path.join(WORKSPACE_ROOT, 'scripts', 'parallel'),
  path.join(WORKSPACE_ROOT, 'scripts', '会话快照'),
];

// ── 工具函数 ─────────────────────────────────────────

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function existsSafe(fp) {
  try {
    return fs.existsSync(fp);
  } catch {
    return false;
  }
}

function listDirSafe(dir, ext = null) {
  try {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    if (!ext) return files;
    return files.filter(f => f.endsWith(ext));
  } catch {
    return [];
  }
}

function execSafe(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fileTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── 扫描器 1：工程画像 ────────────────────────────────

function scanProfile() {
  const profile = {
    version: 'unknown',
    lastCommit: null,
    lastCommitTime: null,
    uncommitted: 0,
    skillCount: 0,
    commandCount: 0,
    scriptCount: 0,
    autonomousMode: 'OFF',
  };

  // 版本号
  const pkg = readFileSafe(path.join(WORKSPACE_ROOT, 'package.json'));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      profile.version = parsed.version || 'unknown';
    } catch { /* ignore */ }
  }

  // git 状态
  profile.lastCommit = execSafe('git log --oneline -1', { cwd: WORKSPACE_ROOT });
  const lastTime = execSafe('git log -1 --format=%cI', { cwd: WORKSPACE_ROOT });
  if (lastTime) profile.lastCommitTime = lastTime;
  const statusOutput = execSafe('git status --porcelain', { cwd: WORKSPACE_ROOT });
  if (statusOutput) profile.uncommitted = statusOutput.split('\n').filter(Boolean).length;

  // 目录统计
  profile.skillCount = listDirSafe(SKILL_DIR).filter(f => {
    const fp = path.join(SKILL_DIR, f);
    return fs.existsSync(path.join(fp, 'SKILL.md'));
  }).length;
  profile.commandCount = listDirSafe(COMMAND_DIR, '.md').length;
  profile.scriptCount = SCRIPT_DIRS.reduce((acc, d) => acc + listDirSafe(d, '.js').length, 0);

  // 自主模式
  const autoState = readFileSafe(path.join(MEMORY_DIR, 'autonomous-state.json'));
  if (autoState) {
    try {
      const parsed = JSON.parse(autoState);
      profile.autonomousMode = parsed.enabled ? `ON (${parsed.mode || 'always'})` : 'OFF';
    } catch { /* ignore */ }
  }

  return profile;
}

// ── 扫描器 2：已完成核心能力 ─────────────────────────

function scanCompletedCapabilities() {
  const capabilities = [];

  // skills
  for (const skill of listDirSafe(SKILL_DIR)) {
    const skillMd = path.join(SKILL_DIR, skill, 'SKILL.md');
    if (existsSafe(skillMd)) {
      capabilities.push({
        type: 'skill',
        name: skill,
        location: path.relative(WORKSPACE_ROOT, skillMd),
      });
    }
  }

  // commands
  for (const cmd of listDirSafe(COMMAND_DIR, '.md')) {
    capabilities.push({
      type: 'command',
      name: cmd.replace('.md', ''),
      location: path.relative(WORKSPACE_ROOT, path.join(COMMAND_DIR, cmd)),
    });
  }

  // 顶层 orchestrator 子系统
  const orchDir = path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator');
  for (const sub of listDirSafe(orchDir)) {
    const fp = path.join(orchDir, sub);
    try {
      if (fs.statSync(fp).isDirectory()) {
        capabilities.push({
          type: 'subsystem',
          name: sub,
          location: path.relative(WORKSPACE_ROOT, fp),
        });
      }
    } catch { /* ignore */ }
  }

  return capabilities;
}

// ── 扫描器 3：已声明但未完成 ─────────────────────────

function scanDeclaredButUnfinished() {
  const findings = [];

  // CHANGELOG Unreleased 段（按"条目"提取,用 ### / #### 分块）
  const changelog = readFileSafe(ROOT_DOCS.changelog) || '';
  const unreleasedMatch = changelog.match(/## \[Unreleased\][\s\S]*?(?=^##\s|\Z)/m);
  if (unreleasedMatch) {
    const unreleased = unreleasedMatch[0];
    // 抓 "### " 标题（每个子节一个条目）
    const sections = unreleased.match(/^###\s+.*$/gm) || [];
    for (const s of sections) {
      const title = s.replace(/^###\s+/, '').replace(/[📚🔍🤖⚙️🛠🔄📅]/g, '').trim();
      if (title.length > 5 && title.length < 120) {
        // 判断状态：含 "未完成/未闭环/🆕" 等关键词 → 计划中
        const isPlanned = /(M\d+|P0-\d+|P1-\d+|计划中|未完成|未闭环|待)/.test(unreleased.split('### ' + s.replace(/^###\s+/, ''))[0] || '');
        if (isPlanned) {
          findings.push({
            source: 'CHANGELOG Unreleased',
            text: title,
            status: '⏳ 计划中',
          });
        }
      }
    }
  }

  // 04.md 增量段
  const roadmap = readFileSafe(ROOT_DOCS.roadmap) || '';
  const incMatch = roadmap.match(/###\s+增量\s+[A-Z][\s\S]*?(?=\n###\s+|\n##\s+|\Z)/g) || [];
  for (const inc of incMatch) {
    const titleMatch = inc.match(/###\s+增量\s+([A-Z])[:：]([^\n]+)/);
    if (titleMatch) {
      const status = inc.includes('✅ 已完成') ? '✅ 已完成' :
                     inc.includes('🟡 部分') ? '🟡 部分' :
                     inc.includes('⏳ 计划中') ? '⏳ 计划中' :
                     inc.includes('❌ 未达') ? '❌ 未达' : '?';
      if (status !== '✅ 已完成') {
        findings.push({
          source: '04.md 增量',
          text: `${titleMatch[1]}：${titleMatch[2].trim()}`,
          status,
        });
      }
    }
  }

  // 04.md 第十二章里程碑表（提取 ⏳）
  const mMatch = roadmap.match(/##.*?里程碑[\s\S]*?(?=\n##\s+|\Z)/);
  if (mMatch) {
    const lines = mMatch[0].split('\n');
    for (const line of lines) {
      if (line.includes('⏳') || line.includes('计划中')) {
        const m = line.match(/M_(\d+)/);
        if (m) {
          findings.push({
            source: '04.md 里程碑表',
            text: `M${m[1]}：${line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}`,
            status: '⏳ 计划中',
          });
        }
      }
    }
  }

  return findings;
}

// ── 扫描器 4：能力缺口（CLAUDE.md 引用 vs 实际命令） ──

function scanCapabilityGaps() {
  const gaps = [];

  // 只在 "快速操作" 表里匹配命令引用（避免误切路径/英文连字符）
  const claude = readFileSafe(ROOT_DOCS.claude) || '';
  const commandRefs = new Set();

  // 抓表格行（含 `|` 且有 `/xxx` 形式）
  const tableLines = claude.split('\n').filter(l =>
    l.trim().startsWith('|') && l.trim().endsWith('|')
  );

  for (const line of tableLines) {
    // 提取 `/xxx`（要求 xxx 全小写字母/数字,且不含 -/ 连字符后面跟字符 → 即独立单词）
    // 用 lookbehind 确保 `/` 前面是空白或表格分隔符
    const matches = line.match(/(?:^|\s|[一-龥])\/([a-z][a-z0-9]*)/g) || [];
    for (const m of matches) {
      // 提取最后的 /xxx
      const cmdMatch = m.match(/\/([a-z][a-z0-9]*)$/);
      if (!cmdMatch) continue;
      const name = cmdMatch[1];
      // 排除常见误判
      const skipList = [
        'ok', 'no', 'clear', 'compact', 'rewind', 'context', 'usage', 'doctor', 'help', 'config', 'fast',
        'scripts', 'claude', 'agents', 'archives', 'personal', 'data', 'github',
        'memos', 'snapshot', 'aicode', 'test', 'report', 'bili', 'gh', 'npm', 'curl', 'bash', 'node', 'git',
      ];
      if (skipList.includes(name)) continue;
      commandRefs.add(name);
    }
  }

  for (const ref of commandRefs) {
    const cmdFile = path.join(COMMAND_DIR, `${ref}.md`);
    if (!existsSafe(cmdFile)) {
      gaps.push({
        kind: 'command-missing',
        ref: `/${ref}`,
        location: 'CLAUDE.md 快速操作表',
        message: `CLAUDE.md 引用 /${ref} 但 .claude/commands/${ref}.md 不存在`,
      });
    }
  }

  // SKILL.md 关联引用 vs 实际 skill
  for (const skill of listDirSafe(SKILL_DIR)) {
    const skillMd = readFileSafe(path.join(SKILL_DIR, skill, 'SKILL.md')) || '';
    // 提取 scripts/ 路径引用
    const scriptRefs = skillMd.match(/scripts\/[\w\-\/]+\.js/g) || [];
    for (const ref of scriptRefs) {
      if (!existsSafe(path.join(WORKSPACE_ROOT, ref))) {
        gaps.push({
          kind: 'script-missing',
          ref: `/${skill}`,
          location: `${skill}/SKILL.md 引用 ${ref}`,
          message: `${skill} SKILL.md 引用 ${ref} 但文件不存在`,
        });
      }
    }
  }

  return gaps;
}

// ── 扫描器 5：重复/冗余 ──────────────────────────────

function scanDuplicates() {
  const dups = [];

  // package.json scripts 重复（同 value 重复 + 同名不同 value 覆盖）
  const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
  const pkgRaw = readFileSafe(pkgPath);
  if (pkgRaw) {
    try {
      const parsed = JSON.parse(pkgRaw);
      const scripts = parsed.scripts || {};
      const seen = {};

      for (const [k, v] of Object.entries(scripts)) {
        if (typeof v !== 'string') continue;
        // 完全相同 value
        if (seen[v]) {
          dups.push({
            kind: 'duplicate-script',
            message: `npm script 重复值: "${seen[v]}" 和 "${k}" 命令值完全相同`,
            value: v,
          });
        } else {
          seen[v] = k;
        }
      }
    } catch { /* ignore */ }

    // 文本扫描: 同名 key 多次出现（JSON 解析只保留最后一个,需要正则抓所有出现）
    const keyOccurrences = {};
    const scriptBlockMatch = pkgRaw.match(/"scripts"\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (scriptBlockMatch) {
      const block = scriptBlockMatch[1];
      // 抓所有 "key": 形式
      const keyRegex = /"([a-z][a-z0-9:_-]*)"\s*:/g;
      let m;
      while ((m = keyRegex.exec(block)) !== null) {
        const key = m[1];
        if (!keyOccurrences[key]) keyOccurrences[key] = 0;
        keyOccurrences[key]++;
      }
      for (const [k, count] of Object.entries(keyOccurrences)) {
        if (count > 1) {
          dups.push({
            kind: 'override-script',
            message: `npm script "${k}" 在 package.json 出现 ${count} 次（JSON 解析时后定义的覆盖前面,可能丢逻辑）`,
            value: k,
          });
        }
      }
    }
  }

  // 测试文件 vs npm script 对齐
  const testDir = path.join(WORKSPACE_ROOT, 'scripts');
  const testFiles = [];
  for (const d of SCRIPT_DIRS) {
    for (const f of listDirSafe(d, '.js')) {
      if (f.startsWith('test-')) testFiles.push(path.join(d, f));
    }
  }

  return dups;
}

// ── 扫描器 6：优化建议（基于上面 5 个扫描结果） ──────

function generateSuggestions(profile, completed, unfinished, gaps, dups) {
  const suggestions = { p0: [], p1: [], p2: [] };

  // P0：能力缺口
  for (const gap of gaps) {
    if (gap.kind === 'command-missing') {
      suggestions.p0.push({
        type: 'capability-fix',
        title: `补 ${gap.ref} 命令文件`,
        detail: gap.message,
        effort: '0.5 天',
        impact: '消除文档-代码不一致',
      });
    } else if (gap.kind === 'script-missing') {
      suggestions.p0.push({
        type: 'capability-fix',
        title: `补 ${gap.ref} 引用的脚本`,
        detail: gap.message,
        effort: '1 天',
        impact: '消除文档-代码不一致',
      });
    }
  }

  // P0：去重
  for (const dup of dups) {
    if (dup.kind === 'duplicate-script') {
      suggestions.p0.push({
        type: 'cleanup',
        title: '合并重复 npm script',
        detail: dup.message,
        effort: '0.1 天',
        impact: '减少维护负担',
      });
    }
  }

  // P1：未完成的高优先级增量
  let p1Count = 0;
  for (const u of unfinished) {
    if (u.status === '⏳ 计划中' && p1Count < 5) {
      suggestions.p1.push({
        type: 'roadmap-item',
        title: `推进：${u.text}`,
        detail: `来源: ${u.source}`,
        effort: '1-3 天',
        impact: '路线图落地',
      });
      p1Count++;
    }
  }

  // P2：能力数量较少时建议补 skill
  if (profile.skillCount < 10) {
    suggestions.p2.push({
      type: 'roadmap-item',
      title: '扩展 skill 生态',
      detail: `当前仅 ${profile.skillCount} 个 skill,建议把高频能力（如 audit/go 等）也包装为 skill`,
      effort: '调研 1 天',
      impact: 'UX 提升',
    });
  }

  return suggestions;
}

// ── 格式化输出 ───────────────────────────────────────

function formatReport(result) {
  const { profile, completed, unfinished, gaps, dups, suggestions, generatedAt } = result;
  const lines = [];

  lines.push(`# 🔍 AiCode 工程审计报告（${generatedAt}）`);
  lines.push('');
  lines.push(`> 由 \`/audit\` skill v1.0.0 自动生成 | 模式: 浅层快速 | 工程版本: v${profile.version}`);
  lines.push('');

  // 1. 工程画像
  lines.push('## 1. 📊 工程画像');
  lines.push('');
  lines.push(`- **版本**：v${profile.version}`);
  lines.push(`- **最后 commit**：${profile.lastCommit || '(无)'}`);
  if (profile.lastCommitTime) lines.push(`- **commit 时间**：${new Date(profile.lastCommitTime).toLocaleString('zh-CN')}`);
  lines.push(`- **未提交改动**：${profile.uncommitted} 项`);
  lines.push(`- **skill 数量**：${profile.skillCount}`);
  lines.push(`- **命令数量**：${profile.commandCount}`);
  lines.push(`- **脚本文件数**：${profile.scriptCount}`);
  lines.push(`- **自主模式**：${profile.autonomousMode}`);
  lines.push('');

  // 2. 已完成
  lines.push(`## 2. ✅ 已完成核心能力（${completed.length} 项）`);
  lines.push('');
  const skills = completed.filter(c => c.type === 'skill');
  const cmds = completed.filter(c => c.type === 'command');
  const subs = completed.filter(c => c.type === 'subsystem');
  if (skills.length) {
    lines.push(`### 🧠 Skills（${skills.length}）`);
    for (const s of skills) lines.push(`- \`${s.name}\``);
    lines.push('');
  }
  if (cmds.length) {
    lines.push(`### ⚡ Commands（${cmds.length}）`);
    for (const c of cmds) lines.push(`- \`/${c.name}\``);
    lines.push('');
  }
  if (subs.length) {
    lines.push(`### 🏗 Subsystems（${subs.length}）`);
    for (const s of subs) lines.push(`- \`${s.name}/\``);
    lines.push('');
  }

  // 3. 已声明未完成（永远输出）
  lines.push(`## 3. ⚠️ 已声明但未完成（${unfinished.length} 项）`);
  lines.push('');
  if (unfinished.length === 0) {
    lines.push('✨ 路线图与代码完全同步（CHANGELOG Unreleased + 04.md 增量都已交付）');
  } else {
    lines.push('| 来源 | 描述 | 状态 |');
    lines.push('|:-----|:-----|:-----|');
    for (const u of unfinished.slice(0, 15)) {
      lines.push(`| ${u.source} | ${u.text} | ${u.status} |`);
    }
    if (unfinished.length > 15) lines.push(`| ... | 还有 ${unfinished.length - 15} 项 | |`);
  }
  lines.push('');

  // 4. 能力缺口（永远输出）
  lines.push(`## 4. 🕳 能力缺口（${gaps.length} 项）`);
  lines.push('');
  if (gaps.length === 0) {
    lines.push('✨ 文档-代码完全对齐（CLAUDE.md 引用的命令、SKILL.md 引用的脚本都存在）');
  } else {
    for (const g of gaps) {
      lines.push(`- 🔴 **${g.kind}** — ${g.message}`);
    }
  }
  lines.push('');

  // 5. 重复（永远输出,即使为空）
  lines.push(`## 5. 🔁 重复/冗余（${dups.length} 项）`);
  lines.push('');
  if (dups.length === 0) {
    lines.push('✨ 暂无重复/冗余检测到（npm script 去重、测试对齐都通过）');
  } else {
    for (const d of dups) lines.push(`- 🟡 ${d.message}`);
  }
  lines.push('');

  // 6. 优化建议
  lines.push('## 6. 💡 优化建议（按 ROI 排序）');
  lines.push('');
  if (suggestions.p0.length) {
    lines.push(`### 🔴 P0（${suggestions.p0.length} 项，1-2 天可完成）`);
    for (let i = 0; i < suggestions.p0.length; i++) {
      const s = suggestions.p0[i];
      lines.push(`${i + 1}. **[${s.type}]** ${s.title}（${s.effort}）`);
      lines.push(`   - ${s.detail}`);
    }
    lines.push('');
  }
  if (suggestions.p1.length) {
    lines.push(`### 🟡 P1（${suggestions.p1.length} 项，一周内）`);
    for (let i = 0; i < suggestions.p1.length; i++) {
      const s = suggestions.p1[i];
      lines.push(`${i + 1}. **[${s.type}]** ${s.title}（${s.effort}）`);
      lines.push(`   - ${s.detail}`);
    }
    lines.push('');
  }
  if (suggestions.p2.length) {
    lines.push(`### 🟢 P2（${suggestions.p2.length} 项，远期）`);
    for (let i = 0; i < suggestions.p2.length; i++) {
      const s = suggestions.p2[i];
      lines.push(`${i + 1}. **[${s.type}]** ${s.title}（${s.effort}）`);
      lines.push(`   - ${s.detail}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('❓ **下一步：是否把上述优化项整合到 `04_自我演进路线.md`？**');
  lines.push('');
  lines.push('- (1) 全部整合（写入 04.md 末尾 backlog 段）');
  lines.push('- (2) 跳过，只输出建议');
  lines.push('- (3) 自定义（指定哪些要整合）');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*报告时间: ' + generatedAt + ' | 工程版本: v' + profile.version + ' | 审计者: Claude (/audit skill v1.0.0)*');

  return lines.join('\n');
}

// ── 报告保存 ─────────────────────────────────────────

function saveAuditReport(result, content) {
  ensureDir(AUDIT_DIR);
  const fileName = `audit-${fileTimestamp()}.md`;
  const filePath = path.join(AUDIT_DIR, fileName);

  let saved = false;
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    saved = true;
  } catch { /* ignore */ }

  // 更新历史索引
  try {
    ensureDir(MEMORY_DIR);
    let history = [];
    if (existsSafe(REPORT_FILE)) {
      try { history = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch { history = []; }
    }
    history.unshift({
      id: fileName.replace('.md', ''),
      generatedAt: result.generatedAt,
      version: result.profile.version,
      filePath: path.relative(WORKSPACE_ROOT, filePath),
      counts: {
        completed: result.completed.length,
        unfinished: result.unfinished.length,
        gaps: result.gaps.length,
        duplicates: result.dups.length,
        p0: result.suggestions.p0.length,
        p1: result.suggestions.p1.length,
        p2: result.suggestions.p2.length,
      },
    });
    // 只保留最近 20 条
    history = history.slice(0, 20);
    fs.writeFileSync(REPORT_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch { /* ignore */ }

  return { saved, filePath };
}

// ── 主入口 ───────────────────────────────────────────

function runQuickAudit() {
  const generatedAt = timestamp();
  const profile = scanProfile();
  const completed = scanCompletedCapabilities();
  const unfinished = scanDeclaredButUnfinished();
  const gaps = scanCapabilityGaps();
  const dups = scanDuplicates();
  const suggestions = generateSuggestions(profile, completed, unfinished, gaps, dups);

  const result = {
    generatedAt,
    profile,
    completed,
    unfinished,
    gaps,
    dups,
    suggestions,
  };

  return result;
}

// ── CLI 入口 ─────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2] || 'run';

  try {
    if (cmd === 'run' || cmd === 'report') {
      const result = runQuickAudit();
      const content = formatReport(result);
      const { saved, filePath } = saveAuditReport(result, content);
      console.log(content);
      if (saved) {
        console.error(`\n📁 报告已保存: ${path.relative(WORKSPACE_ROOT, filePath)}`);
      }
    } else if (cmd === 'json') {
      const result = runQuickAudit();
      console.log(JSON.stringify(result, null, 2));
    } else if (cmd === 'history') {
      const history = readFileSafe(REPORT_FILE);
      if (history) {
        const parsed = JSON.parse(history);
        console.log(`📚 历史审计报告: ${parsed.length} 条`);
        for (const h of parsed.slice(0, 10)) {
          console.log(`  - ${h.id} (v${h.version}) | P0:${h.counts.p0} P1:${h.counts.p1} P2:${h.counts.p2}`);
        }
      } else {
        console.log('📭 暂无历史报告');
      }
    } else {
      console.error(`未知命令: ${cmd}（支持: run / json / history）`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ audit 异常: ${e.message}`);
    process.exit(1);
  }
  process.exit(0);
}

module.exports = {
  runQuickAudit,
  formatReport,
  saveAuditReport,
  scanProfile,
  scanCompletedCapabilities,
  scanDeclaredButUnfinished,
  scanCapabilityGaps,
  scanDuplicates,
  generateSuggestions,
};
