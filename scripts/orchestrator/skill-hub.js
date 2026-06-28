#!/usr/bin/env node
/**
 * skill-hub.js — 统一 skill 发现中心（M40 · 借鉴 davepoon/buildwithclaude）
 *
 * 痛点：
 *   - 本地 skill 能力分散在 .claude/SKILL_INDEX.md、.claude/skills/各skill/SKILL.md、
 *     skill-registry 缓存、commands 目录等多个地方
 *   - 用户/AI 想找"有没有能帮我做 X 的 skill"需要翻多处
 *
 * 借鉴思路（davepoon/buildwithclaude）：
 *   - A single hub to find Claude Skills, Agents, Commands, Hooks, Plugins
 *   - 统一入口、可搜索、可推荐
 *
 * 本实现（M40 POC）：
 *   - 纯函数 + 本地文件读取（不接远程 API，避免网络限制）
 *   - 三源聚合：
 *     1. SKILL_INDEX.md 中的官方 skill（本地元能力）
 *     2. `.claude/skills/` 下已安装的 skill
 *     3. skill-registry 缓存中的远程候选
 *   - 统一搜索：query 匹配 name / description / keywords
 *   - 推荐排序：本地已装 > SKILL_INDEX > 远程缓存（按来源优先级 + 关键词相关分）
 *   - 输出 Markdown 表格（用户/AI 一眼可读）
 *
 * 与 M32/M36B 关系：
 *   - M32 SKILL_INDEX.md = 静态目录
 *   - M36B skill-registry = 远程发现+安装
 *   - M40 skill-hub = 把上面两个 + 本地已装 skill 统一检索/推荐
 *
 * @since v3.0.5 M40 (2026-06-28)
 * @source https://github.com/davepoon/buildwithclaude · 借鉴评估 7.3/10
 * @see scripts/skill-registry/registry-scanner.js（远程 skill 数据源）
 * @see .claude/SKILL_INDEX.md（本地 skill 目录）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const SKILL_INDEX_FILE = path.join(WORKSPACE_ROOT, '.claude', 'SKILL_INDEX.md');
const SKILLS_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills');
const REMOTE_CACHE_FILE = path.join(WORKSPACE_ROOT, 'data', 'skill-registry', 'skill-cache.json');

const DEFAULTS = {
  topK: 10,
  minScore: 0.01,
  // 来源优先级（数字越小越靠前）
  sourcePriority: {
    installed: 1,
    local: 2,
    remote: 3,
  },
};

/**
 * 分词：中文 2+ / 英文 2+ / 数字 2+
 */
function tokenize(text) {
  if (!text) return new Set();
  const tokens = new Set();
  const cn = (text.match(/[一-龥]{2,}/g) || []);
  cn.forEach(m => tokens.add(m));
  const en = (text.match(/[a-zA-Z]{2,}/g) || []);
  en.forEach(m => tokens.add(m.toLowerCase()));
  const num = (text.match(/\d{2,}/g) || []);
  num.forEach(m => tokens.add(m));
  return tokens;
}

/**
 * 从 SKILL_INDEX.md 解析 4 个官方 skill
 * @returns {Array<{id, name, source, description, command, files, learnCost}>}
 */
function loadLocalSkills() {
  if (!fs.existsSync(SKILL_INDEX_FILE)) return [];
  try {
    const md = fs.readFileSync(SKILL_INDEX_FILE, 'utf8');
    const lines = md.split('\n');
    const skills = [];
    let inTable = false;
    for (const line of lines) {
      if (line.startsWith('| Skill') || line.startsWith('|:------')) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith('| **')) {
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 5) {
          skills.push({
            id: `local-${cells[0].replace(/\*\*/g, '').replace(/\s+/g, '-').toLowerCase()}`,
            name: cells[0].replace(/\*\*/g, '').trim(),
            source: 'local',
            description: cells[1],
            command: cells[2],
            files: cells[3],
            learnCost: cells[4],
          });
        }
      }
      if (inTable && !line.startsWith('|')) {
        inTable = false;
      }
    }
    return skills;
  } catch {
    return [];
  }
}

/**
 * 扫描 `.claude/skills/` 下已安装的 skill
 * @returns {Array<{id, name, source, description, command, files}>}
 */
function loadInstalledSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  try {
    const dirs = fs.readdirSync(SKILLS_DIR)
      .map(f => path.join(SKILLS_DIR, f))
      .filter(f => fs.statSync(f).isDirectory());
    const skills = [];
    for (const dir of dirs) {
      const name = path.basename(dir);
      const skillMd = path.join(dir, 'SKILL.md');
      let description = '';
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf8');
        // 取第一段非空文本
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
        description = firstLine ? firstLine.trim() : '';
      }
      skills.push({
        id: `installed-${name}`,
        name,
        source: 'installed',
        description,
        command: `见 .claude/skills/${name}/SKILL.md`,
        files: `.claude/skills/${name}/`,
      });
    }
    return skills;
  } catch {
    return [];
  }
}

/**
 * 从 skill-registry 缓存读取远程候选
 * @returns {Array}
 */
function loadRemoteSkills() {
  if (!fs.existsSync(REMOTE_CACHE_FILE)) return [];
  try {
    const cache = JSON.parse(fs.readFileSync(REMOTE_CACHE_FILE, 'utf8'));
    const out = [];
    for (const [query, entry] of Object.entries(cache)) {
      if (!entry || !Array.isArray(entry.results)) continue;
      for (const r of entry.results) {
        out.push({
          id: `remote-${r.id || r.name}`,
          name: r.name,
          source: 'remote',
          description: r.description || `From ${r.repo || r.url}`,
          command: r.url || '',
          files: r.repo || '',
          keywords: r.keywords || [query],
        });
      }
    }
    // 去重
    return Array.from(new Map(out.map(s => [s.id, s])).values());
  } catch {
    return [];
  }
}

/**
 * 计算 query 与 skill 的相关分（支持子串匹配）
 */
function scoreSkill(query, skill) {
  const qTokens = tokenize(query);
  const text = [skill.name, skill.description, skill.command, skill.files, (skill.keywords || []).join(' ')].join(' ');
  const sTokens = tokenize(text);
  if (qTokens.size === 0 || sTokens.size === 0) return 0;
  let inter = 0;
  qTokens.forEach(t => {
    // 直接命中 或 子串包含（中文短语里搜短词）
    if ([...sTokens].some(st => st === t || st.includes(t) || t.includes(st))) {
      inter++;
    }
  });
  const union = qTokens.size + sTokens.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 统一搜索 + 推荐
 * @param {string} query
 * @param {object} [opts]
 * @returns {{
 *   hits: Array,
 *   total: number,
 *   bySource: {installed, local, remote},
 *   markdown: string,
 * }}
 */
function searchSkills(query, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const all = [
    ...loadInstalledSkills(),
    ...loadLocalSkills(),
    ...loadRemoteSkills(),
  ];

  const scored = all
    .map(s => ({ ...s, score: scoreSkill(query || '', s), priority: o.sourcePriority[s.source] || 99 }))
    .filter(s => !query || s.score >= o.minScore)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.score - a.score;
    })
    .slice(0, o.topK);

  const bySource = { installed: 0, local: 0, remote: 0 };
  for (const s of scored) bySource[s.source] = (bySource[s.source] || 0) + 1;

  const md = [];
  md.push(`## 🔍 Skill Hub 搜索结果（${scored.length} 条 · query="${query || ''}"）`);
  md.push('');
  md.push('| 来源 | 名称 | 一句话 | 入口 |');
  md.push('|:-----|:-----|:-------|:-----|');
  for (const s of scored) {
    const sourceLabel = s.source === 'installed' ? '已装' : s.source === 'local' ? '本地' : '远程';
    const entry = s.command || s.files || '';
    md.push(`| ${sourceLabel} | **${s.name}** | ${s.description.slice(0, 60)}${s.description.length > 60 ? '...' : ''} | ${entry.slice(0, 40)}${entry.length > 40 ? '...' : ''} |`);
  }
  md.push('');
  md.push(`> 来源分布: 已装 ${bySource.installed} / 本地 ${bySource.local} / 远程 ${bySource.remote}`);

  return {
    hits: scored,
    total: all.length,
    bySource,
    markdown: md.join('\n'),
  };
}

/**
 * 列出所有来源的 skill（无 query 时）
 */
function listSkills() {
  return searchSkills('', { topK: Infinity, minScore: 0 });
}

module.exports = {
  DEFAULTS,
  tokenize,
  loadLocalSkills,
  loadInstalledSkills,
  loadRemoteSkills,
  scoreSkill,
  searchSkills,
  listSkills,
  SKILL_INDEX_FILE,
  SKILLS_DIR,
  REMOTE_CACHE_FILE,
};
