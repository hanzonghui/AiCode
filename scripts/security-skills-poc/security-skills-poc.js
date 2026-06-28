#!/usr/bin/env node
/**
 * security-skills-poc.js — 借鉴 mukul975/Anthropic-Cybersecurity-Skills 的防御性安全 skill POC
 *
 * 命令：
 *   node security-skills-poc.js cache                # 拉取 index.json 并缓存
 *   node security-skills-poc.js list                 # 列出已缓存的防御性 skill
 *   node security-skills-poc.js search "forensic"    # 按关键词搜索
 *   node security-skills-poc.js map NIST             # 按框架过滤
 *   node security-skills-poc.js adapt acquiring-disk-image-with-dd-and-dcfldd  # 转 AiCode 格式
 *   node security-skills-poc.js demo                 # 跑演示
 *
 * @since v3.0.5 M41 (2026-06-28)
 * @source https://github.com/mukul975/Anthropic-Cybersecurity-Skills · 借鉴评估 7.0/10
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const adapter = require('./security-skills-adapter');

// ── 配置 ──────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const CACHE_DIR = path.join(WORKSPACE_ROOT, 'data', 'security-skills-poc');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');
const SKILLS_DIR = path.join(CACHE_DIR, 'skills');
const REPO = 'mukul975/Anthropic-Cybersecurity-Skills';
const BRANCH = 'main';

// ── 工具函数 ──────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON(file, def = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ghApi(path) {
  const url = `repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const out = execSync(`gh api "${url}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

function ghRawContent(path) {
  const url = `repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const out = execSync(`gh api "${url}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const data = JSON.parse(out);
  if (data.content) {
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  throw new Error('no content');
}

// ── 缓存管理 ──────────────────────────────────────────

function loadIndex() {
  return readJSON(INDEX_FILE, { skills: [] });
}

function saveIndex(data) {
  writeJSON(INDEX_FILE, data);
}

function listCachedSkills() {
  const index = loadIndex();
  return index.skills || [];
}

function getSkillPath(skillName) {
  return path.join(SKILLS_DIR, `${skillName}.md`);
}

function loadSkillRaw(skillName) {
  const p = getSkillPath(skillName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

// ── 命令实现 ──────────────────────────────────────────

function cmdCache() {
  console.log('\n📡 拉取远程 index.json...');
  const raw = ghRawContent('index.json');
  const index = JSON.parse(raw);
  index.cached_at = new Date().toISOString();
  saveIndex(index);

  const allSkills = index.skills || [];
  console.log(`   共 ${allSkills.length} 个 skill，开始安全过滤...`);

  let allowed = 0;
  let skipped = 0;
  const defensive = [];
  for (const skill of allSkills) {
    const { allowed: ok, reason } = adapter.filterSkill(skill);
    if (ok) {
      defensive.push(skill);
      allowed++;
    } else {
      skipped++;
    }
  }

  console.log(`   ✅ 防御性 skill: ${allowed} 个`);
  console.log(`   ⏭️  跳过（主动攻击/未识别）: ${skipped} 个`);

  // 缓存前 50 个防御性 skill 的 SKILL.md（避免下载全部 817 个）
  const toCache = defensive.slice(0, 50);
  console.log(`\n💾 缓存前 ${toCache.length} 个防御性 skill 的 SKILL.md...`);
  let downloaded = 0;
  for (const skill of toCache) {
    const skillMdPath = path.join(skill.path, 'SKILL.md');
    try {
      const content = ghRaw(skillMdPath);
      const outPath = getSkillPath(skill.name);
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, content);
      downloaded++;
    } catch (e) {
      console.log(`   ⚠️  跳过 ${skill.name}: ${e.message.split('\n')[0]}`);
    }
  }

  // 写入元数据
  const meta = {
    cached_at: new Date().toISOString(),
    total_remote: allSkills.length,
    defensive_count: allowed,
    skipped_count: skipped,
    cached_skills: downloaded,
    sample: toCache.slice(0, 5).map(s => s.name),
  };
  writeJSON(path.join(CACHE_DIR, 'cache-meta.json'), meta);

  console.log(`\n✅ 缓存完成：${downloaded}/${toCache.length} 个 SKILL.md 已保存到 ${SKILLS_DIR}`);
  console.log(`   元数据: ${path.join(CACHE_DIR, 'cache-meta.json')}`);
}

function cmdList() {
  const skills = listCachedSkills();
  const meta = readJSON(path.join(CACHE_DIR, 'cache-meta.json'), {});
  console.log('\n📋 远程 index 概览');
  console.log(`   总数: ${meta.total_remote || skills.length}`);
  console.log(`   防御性: ${meta.defensive_count || '-'}`);
  console.log(`   已缓存 SKILL.md: ${meta.cached_skills || 0}`);
  console.log(`   缓存时间: ${meta.cached_at || '-'}`);

  const cachedFiles = fs.existsSync(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md')) : [];
  console.log(`\n💾 本地已缓存 ${cachedFiles.length} 个 skill:`);
  for (const f of cachedFiles.slice(0, 20)) {
    const name = f.replace(/\.md$/, '');
    const raw = loadSkillRaw(name);
    const { meta: fm } = raw ? adapter.parseSkillMarkdown(raw) : { meta: {} };
    const frameworks = [];
    if (Array.isArray(fm.nist_csf) && fm.nist_csf.length) frameworks.push('NIST');
    if (Array.isArray(fm.mitre_attack) && fm.mitre_attack.length) frameworks.push('ATT&CK');
    console.log(`  • ${name}${frameworks.length ? ` [${frameworks.join('/')}]` : ''}`);
  }
  if (cachedFiles.length > 20) {
    console.log(`  ... 还有 ${cachedFiles.length - 20} 个`);
  }
}

function cmdSearch(query) {
  if (!query) {
    console.error('❌ 用法: node security-skills-poc.js search "forensic"');
    process.exit(1);
  }
  const q = query.toLowerCase();
  const skills = listCachedSkills();
  const hits = skills.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  );

  // 对缓存的 skill 做适配，并二次安全过滤
  const results = [];
  for (const skill of hits) {
    const { allowed } = adapter.filterSkill(skill);
    if (!allowed) continue;
    const raw = loadSkillRaw(skill.name);
    if (!raw) continue;
    const adapted = adapter.adaptSkill(skill, raw);
    results.push(adapted);
  }

  console.log(`\n🔍 搜索 "${query}"：命中 ${results.length} 个防御性 skill`);
  for (const r of results.slice(0, 20)) {
    const fws = r.frameworks.map(f => f.name).join(', ') || 'none';
    console.log(`  • ${r.name}`);
    console.log(`    ${r.description.slice(0, 80)}${r.description.length > 80 ? '...' : ''}`);
    console.log(`    框架: ${fws}`);
  }
}

function cmdMap(framework) {
  if (!framework) {
    console.error('❌ 用法: node security-skills-poc.js map NIST');
    process.exit(1);
  }
  const fw = framework.toLowerCase();
  const keyMap = {
    nist: 'nist_csf',
    csf: 'nist_csf',
    attack: 'mitre_attack',
    'att&ck': 'mitre_attack',
    atlas: 'mitre_atlas',
    d3fend: 'd3fend',
    ai: 'nist_ai_rmf',
    rmf: 'nist_ai_rmf',
    f3: 'mitre_f3',
  };
  const fmKey = keyMap[fw] || fw;

  const cachedFiles = fs.existsSync(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md')) : [];
  const results = [];
  for (const f of cachedFiles) {
    const name = f.replace(/\.md$/, '');
    const raw = loadSkillRaw(name);
    if (!raw) continue;
    const { meta } = adapter.parseSkillMarkdown(raw);
    const refs = meta[fmKey];
    if (Array.isArray(refs) && refs.length > 0) {
      results.push({ name, refs });
    }
  }

  console.log(`\n🗺️  框架 "${framework}" 映射：${results.length} 个 skill`);
  for (const r of results.slice(0, 20)) {
    console.log(`  • ${r.name} → ${r.refs.join(', ')}`);
  }
}

function cmdAdapt(skillName) {
  if (!skillName) {
    console.error('❌ 用法: node security-skills-poc.js adapt <skill-name>');
    process.exit(1);
  }
  const raw = loadSkillRaw(skillName);
  if (!raw) {
    console.error(`❌ 找不到已缓存 skill: ${skillName}`);
    console.error('   先运行: node security-skills-poc.js cache');
    process.exit(1);
  }

  const skills = listCachedSkills();
  const skill = skills.find(s => s.name === skillName);
  if (!skill) {
    console.error(`❌ index.json 中找不到: ${skillName}`);
    process.exit(1);
  }

  const { allowed, reason } = adapter.filterSkill(skill);
  if (!allowed) {
    console.error(`❌ 该 skill 未通过安全过滤: ${reason}`);
    process.exit(1);
  }

  const adapted = adapter.adaptSkill(skill, raw);
  const block = adapter.formatPromptBlock(adapted);
  const outFile = path.join(CACHE_DIR, 'adapted', `${skillName}-adapted.md`);
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, block);

  console.log(`\n✅ 已适配: ${outFile}`);
  console.log(`   框架映射: ${adapted.frameworks.map(f => `${f.name}(${f.refs.length})`).join(', ') || '无'}`);
  console.log('\n--- 预览 ---\n');
  console.log(block.slice(0, 1200));
  if (block.length > 1200) {
    console.log('\n... (已截断)');
  }
}

function cmdDemo() {
  console.log('\n🎬 Security Skills POC Demo');
  console.log('═'.repeat(60));

  // Demo 1: 安全过滤
  console.log('\n📌 Demo 1: 安全过滤');
  console.log('─'.repeat(60));
  const samples = [
    { name: 'acquiring-disk-image-with-dd-and-dcfldd', description: 'Create forensically sound bit-for-bit disk images' },
    { name: 'abusing-dpapi-for-credential-access', description: 'Extract DPAPI-protected secrets such as credentials' },
    { name: 'analyzing-active-directory-acl-abuse', description: 'Detect dangerous ACL misconfigurations in Active Directory' },
  ];
  for (const s of samples) {
    const { allowed, reason } = adapter.filterSkill(s);
    console.log(`  ${allowed ? '✅' : '❌'} ${s.name} → ${reason}`);
  }

  // Demo 2: 框架映射
  console.log('\n📌 Demo 2: 解析 SKILL.md frontmatter');
  console.log('─'.repeat(60));
  const sampleRaw = `---
name: acquiring-disk-image-with-dd-and-dcfldd
description: Create forensically sound bit-for-bit disk images
nist_csf:
- RS.AN-01
- RS.MA-01
mitre_attack:
- T1006
---

# Disk Image Acquisition
...`;
  const skill = {
    name: 'acquiring-disk-image-with-dd-and-dcfldd',
    description: 'Create forensically sound bit-for-bit disk images',
    path: 'skills/acquiring-disk-image-with-dd-and-dcfldd',
  };
  const adapted = adapter.adaptSkill(skill, sampleRaw);
  console.log(`  ID: ${adapted.id}`);
  console.log(`  Frameworks: ${adapted.frameworks.map(f => f.name).join(', ')}`);
  for (const fw of adapted.frameworks) {
    console.log(`    - ${fw.name}: ${fw.refs.join(', ')}`);
  }

  // Demo 3: 生成 prompt 块
  console.log('\n📌 Demo 3: 生成 Claude Code prompt 块');
  console.log('─'.repeat(60));
  console.log(adapter.formatPromptBlock(adapted).slice(0, 700));
  console.log('...');

  // Demo 4: 本地缓存状态
  console.log('\n📌 Demo 4: 本地缓存状态');
  console.log('─'.repeat(60));
  const meta = readJSON(path.join(CACHE_DIR, 'cache-meta.json'), {});
  if (meta.total_remote) {
    console.log(`  远程: ${meta.total_remote} 个 skill`);
    console.log(`  防御性: ${meta.defensive_count} 个`);
    console.log(`  已缓存 SKILL.md: ${meta.cached_skills} 个`);
  } else {
    console.log('  尚未缓存。运行: node security-skills-poc.js cache');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Demo complete\n');
}

function showHelp() {
  console.log(`
security-skills-poc.js — 防御性网络安全 skill 适配 POC（M41）

用法:
  node security-skills-poc.js cache
  node security-skills-poc.js list
  node security-skills-poc.js search "forensic"
  node security-skills-poc.js map NIST
  node security-skills-poc.js adapt <skill-name>
  node security-skills-poc.js demo

说明:
  - 只缓存/适配防御性、审计、合规、取证类 skill
  - 主动攻击/武器化 skill 会被过滤
  - 需要 gh CLI 已登录（用于读 GitHub API）
`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  try {
    switch (cmd) {
      case 'cache': return cmdCache();
      case 'list': return cmdList();
      case 'search': return cmdSearch(args[1]);
      case 'map': return cmdMap(args[1]);
      case 'adapt': return cmdAdapt(args[1]);
      case 'demo': return cmdDemo();
      case 'help':
      case '-h':
      case '--help':
      default:
        return showHelp();
    }
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

main();
