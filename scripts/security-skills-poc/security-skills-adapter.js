#!/usr/bin/env node
/**
 * security-skills-adapter.js — 把 mukul975/Anthropic-Cybersecurity-Skills 映射到 AiCode 格式
 *
 * 核心能力：
 *   - 安全过滤：只保留防御/审计/合规类 skill，过滤掉主动攻击/武器化内容
 *   - 框架映射：解析 frontmatter 中的 nist_csf / mitre_attack 等字段
 *   - 格式转换：外部 SKILL.md → AiCode 内部 skill 片段（可注入 prompt）
 *
 * @since v3.0.5 M41 (2026-06-28)
 * @source https://github.com/mukul975/Anthropic-Cybersecurity-Skills · 借鉴评估 7.0/10
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── 安全过滤词表 ──────────────────────────────────────

// 保留：防御、审计、合规、取证、应急响应、安全开发
const DEFENSIVE_KEYWORDS = [
  'detect', 'detection', 'monitor', 'monitoring', 'audit', 'auditing',
  'forensic', 'forensics', 'incident', 'response', 'respond', 'remediate',
  'remediation', 'compliance', 'compliant', 'assess', 'assessment',
  'vulnerability', 'patch', 'harden', 'hardening', 'secure', 'security',
  'defend', 'defense', 'protect', 'protection', 'analyze', 'analysis',
  'investigate', 'investigation', 'log', 'logs', 'siem', 'threat',
  'malware', 'reverse', 'reverse-engineer', 'reverse-engineering',
  'risk', 'governance', 'framework', 'nist', 'csf', 'mitre', 'attack',
  'atlas', 'd3fend', 'ai rmf', 'f3', 'cmmc', 'iso', 'pci', 'soc',
  'chain', 'custody', 'image', 'acquisition', 'evidence',
];

// 拒绝：主动攻击、武器化、凭据窃取、权限提升、破坏性行为
const OFFENSIVE_KEYWORDS = [
  'exploit', 'exploitation', 'exploit-development',
  'privesc', 'privilege escalation', 'lateral movement',
  'credential access', 'credential dumping', 'password cracking',
  'brute force', 'brute-force', 'persistence', 'backdoor',
  'command and control', 'c2', 'exfiltrate', 'exfiltration',
  'weaponize', 'weaponization', 'payload', 'shellcode',
  'dpapi', 'shadow credentials', 'golden ticket', 'silver ticket',
  'kerberoast', 'asreproast', 'pass-the-hash', 'pass-the-ticket',
  'bloodhound', 'sharphound', 'mimikatz', 'cobalt strike',
  'bloodhound', 'sharphound',
];

// ── 工具函数 ──────────────────────────────────────────

function normalize(text) {
  return String(text || '').toLowerCase();
}

function matchesAny(text, keywords) {
  const t = normalize(text);
  return keywords.some(kw => t.includes(kw));
}

/**
 * 判断一个外部 skill 是否适合接入 AiCode（防御性安全研究/教育用途）
 * @param {object} skill
 * @returns {{allowed: boolean, reason: string}}
 */
function filterSkill(skill) {
  const name = normalize(skill.name);
  const desc = normalize(skill.description);
  const tags = Array.isArray(skill.tags) ? skill.tags.join(' ') : '';
  const combined = `${name} ${desc} ${tags}`;

  // 黑名单优先
  if (matchesAny(combined, OFFENSIVE_KEYWORDS)) {
    return { allowed: false, reason: 'offensive content filtered' };
  }

  // 白名单命中
  if (matchesAny(combined, DEFENSIVE_KEYWORDS)) {
    return { allowed: true, reason: 'defensive content allowed' };
  }

  // 默认拒绝（保守原则）
  return { allowed: false, reason: 'neither defensive nor offensive; default deny' };
}

/**
 * 解析 SKILL.md 的 frontmatter
 * @param {string} raw
 * @returns {{meta: object, body: string}}
 */
function parseSkillMarkdown(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }

  const fmText = match[1];
  const body = match[2].trim();
  const meta = {};

  const lines = fmText.split('\n');
  let currentKey = null;
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      meta[currentKey] = kv[2].trim();
      continue;
    }
    const listItem = line.match(/^-\s*(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(meta[currentKey])) {
        meta[currentKey] = [];
      }
      meta[currentKey].push(listItem[1].trim());
    }
  }

  return { meta, body };
}

/**
 * 将外部 skill 转换为 AiCode 可用片段
 * @param {object} skill
 * @param {string} rawMd 原始 SKILL.md 内容
 * @returns {object}
 */
function adaptSkill(skill, rawMd) {
  const { meta, body } = parseSkillMarkdown(rawMd);
  const frameworks = [];
  if (Array.isArray(meta.nist_csf) && meta.nist_csf.length > 0) frameworks.push({ name: 'NIST CSF', refs: meta.nist_csf });
  if (Array.isArray(meta.mitre_attack) && meta.mitre_attack.length > 0) frameworks.push({ name: 'MITRE ATT&CK', refs: meta.mitre_attack });
  if (Array.isArray(meta.mitre_atlas) && meta.mitre_atlas.length > 0) frameworks.push({ name: 'MITRE ATLAS', refs: meta.mitre_atlas });
  if (Array.isArray(meta.d3fend) && meta.d3fend.length > 0) frameworks.push({ name: 'D3FEND', refs: meta.d3fend });
  if (Array.isArray(meta.nist_ai_rmf) && meta.nist_ai_rmf.length > 0) frameworks.push({ name: 'NIST AI RMF', refs: meta.nist_ai_rmf });
  if (Array.isArray(meta.mitre_f3) && meta.mitre_f3.length > 0) frameworks.push({ name: 'MITRE F3', refs: meta.mitre_f3 });

  return {
    id: `security-${skill.name}`,
    name: skill.name,
    description: skill.description,
    domain: meta.domain || skill.domain || 'cybersecurity',
    subdomain: meta.subdomain || 'general',
    tags: meta.tags || skill.tags || [],
    frameworks,
    source: `https://github.com/mukul975/Anthropic-Cybersecurity-Skills/tree/main/${skill.path}`,
    adaptedAt: new Date().toISOString(),
    body,
    frontmatter: meta,
  };
}

/**
 * 生成可注入 Claude Code prompt 的 skill 上下文块
 * @param {object} adapted
 * @returns {string}
 */
function formatPromptBlock(adapted) {
  const fwLines = adapted.frameworks.map(f => `- ${f.name}: ${f.refs.join(', ')}`).join('\n');
  return `---
# AiCode Security Skill: ${adapted.name}
# Source: ${adapted.source}
# Domain: ${adapted.domain}${adapted.subdomain ? ` / ${adapted.subdomain}` : ''}
# Framework mapping:
${fwLines || '# (no framework mapping)'}
---

${adapted.description}

${adapted.body.slice(0, 3000)}${adapted.body.length > 3000 ? '\n\n... (truncated)' : ''}
`;
}

module.exports = {
  DEFENSIVE_KEYWORDS,
  OFFENSIVE_KEYWORDS,
  normalize,
  matchesAny,
  filterSkill,
  parseSkillMarkdown,
  adaptSkill,
  formatPromptBlock,
};
