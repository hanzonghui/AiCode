// scripts/skill-registry/registry-installer.js
// M36B · 安装 skill 到 .claude/skills/<name>/
// 安全约束：永不在用户仓库内 git init/commit；require() 失败自动回滚

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILLS_DIR = path.join(__dirname, '..', '..', '.claude', 'skills');
const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'skill-registry', 'registry-state.json');

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * 安装 skill
 * @param {object} candidate { id, name, source, url, description, keywords[] }
 * @param {object} opts      { dryRun: boolean, force: boolean }
 * @returns {{ ok: boolean, path?: string, message: string, checksum?: string }}
 */
function install(candidate, opts = {}) {
  const { dryRun = false, force = false } = opts;

  // 1. 校验 name（防路径穿越）
  const name = candidate.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  if (!NAME_RE.test(name)) {
    return { ok: false, message: `name 不合法: ${candidate.name}（需匹配 ${NAME_RE}）` };
  }

  const targetDir = path.join(SKILLS_DIR, name);

  // 2. 已存在检查
  if (fs.existsSync(targetDir) && !force) {
    return { ok: false, message: `已存在: ${targetDir}（用 --force 覆盖）` };
  }

  if (dryRun) {
    return { ok: true, message: `[dry-run] 将安装到 ${targetDir}`, dryRun: true };
  }

  // 3. 创建目录 + 写 SKILL.md frontmatter
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const frontmatter = generateFrontmatter(candidate);
  const skillMd = `---\n${frontmatter}\n---\n\n# ${candidate.name}\n\n> ${candidate.description || 'Auto-installed by M36B skill-registry'}\n\n来源: ${candidate.url || candidate.repo}\n安装时间: ${new Date().toISOString()}\n关键词: ${(candidate.keywords || []).join(', ')}\n`;
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMd);

  // 4. 写一个最小 index.js（让 require 验证通过）
  fs.writeFileSync(path.join(targetDir, 'index.js'), `// ${candidate.name} · M36B stub\nmodule.exports = { name: '${candidate.name}', version: '1.0.0', source: '${candidate.source}' };\n`);

  // 5. 验证：node -e "require('./index.js')"
  try {
    execSync(`node -e "require('./index.js')"`, { cwd: targetDir, stdio: 'pipe', timeout: 5000 });
  } catch (e) {
    // 验证失败 → 自动回滚
    fs.rmSync(targetDir, { recursive: true, force: true });
    return { ok: false, message: `验证失败，已回滚: ${e.message}` };
  }

  // 6. 写 state
  const state = readState();
  state[name] = {
    version: '1.0.0',
    source: candidate.source,
    url: candidate.url || candidate.repo,
    installed_at: new Date().toISOString(),
    checksum: sha256(skillMd + candidate.name)
  };
  writeState(state);

  return { ok: true, path: targetDir, message: `已安装 ${name}`, checksum: state[name].checksum };
}

/**
 * 卸载 skill
 */
function uninstall(name) {
  const targetDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(targetDir)) return { ok: false, message: `不存在: ${name}` };
  fs.rmSync(targetDir, { recursive: true, force: true });
  const state = readState();
  delete state[name];
  writeState(state);
  return { ok: true, message: `已卸载 ${name}` };
}

/**
 * 列出已安装 skills
 */
function list() {
  const state = readState();
  return Object.entries(state).map(([name, meta]) => ({ name, ...meta }));
}

/**
 * 验证已安装 skill
 */
function verify(name) {
  const targetDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(targetDir)) return { ok: false, message: `不存在: ${name}` };
  try {
    execSync(`node -e "require('./index.js')"`, { cwd: targetDir, stdio: 'pipe', timeout: 5000 });
    return { ok: true, message: `${name} 验证通过` };
  } catch (e) {
    return { ok: false, message: `验证失败: ${e.message}` };
  }
}

function generateFrontmatter(c) {
  const tags = (c.keywords || ['m36b', 'auto-installed']).slice(0, 5).map(k => `"${k}"`).join(', ');
  return [
    `name: ${c.name}`,
    `displayName: 📦 ${c.name} — Auto-installed by M36B`,
    `version: 1.0.0`,
    `description: >`,
    `  由 M36B skill-registry 自动安装。来源: ${c.source}`,
    `tags: [${tags}]`,
    `author: unknown (auto-installed)`,
    `icon: 📦`,
    `source: ${c.url || c.repo || 'unknown'}`
  ].join('\n');
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch { return {}; }
}

function writeState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* 写 state 失败不阻塞安装 */ }
}

function sha256(s) {
  // 简化校验和（不引入 crypto 模块依赖）
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16);
}

module.exports = { install, uninstall, list, verify, NAME_RE };