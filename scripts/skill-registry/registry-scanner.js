// scripts/skill-registry/registry-scanner.js
// M36B · 扫 GitHub 3 仓 + npm 关键词搜索 → 内存清单 + 离线缓存
// 复用 github-scanner.js 关键词

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'skill-registry', 'skill-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const REPOS = [
  'awesome-claude-skills/awesome-claude-skills',
  'NirDiamant/Prompt-Engineering-Guide',
  'NirDiamant/awesome-ai-agents'
];

const KEYWORDS = [
  'claude-skill', 'agent-template', 'prompt-library',
  'awesome-claude', 'mcp-server', 'agent-workflow',
  'awesome-ai', 'awesome-prompts', 'awesome-agents',
  'claude-prompt', 'prompt-collection', 'skill-collection',
  'chart', 'visualization', 'data-viz',           // M36B 新增：能力导向
  'database', 'orm', 'devops', 'deploy',
  'animation', 'framer-motion', 'tailwind'
];

/**
 * 搜索 skills（关键词匹配 GitHub repos + npm）
 * @param {string} query 用户查询（如 "添加 chart 能力"）
 * @returns {Promise<Array<{id, name, source, repo|url, description, stars, keywords[]}>>}
 */
async function search(query) {
  const cached = readCache(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.results;
  }
  const q = (query || '').toLowerCase();
  const qKeywords = q.split(/\s+/).filter(Boolean);
  const matchedKw = KEYWORDS.filter(k => qKeywords.some(qk => k.includes(qk) || qk.includes(k)));

  const results = [];

  // 1. 扫 GitHub 3 仓（README.md 列表）
  for (const repo of REPOS) {
    try {
      const meta = await fetchRepoReadme(repo);
      // 从 README 提取候选（heuristic：匹配关键词的行）
      const lines = meta.split('\n');
      let inList = false;
      for (const line of lines) {
        if (/^#+\s/.test(line)) { inList = /skill|template|prompt|agent/i.test(line); continue; }
        if (!inList) continue;
        const m = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (!m) continue;
        const [, name, url] = m;
        if (!matchedKw.length || matchedKw.some(k => (name + ' ' + url).toLowerCase().includes(k))) {
          results.push({
            id: `${repo.replace('/', '__')}__${name.replace(/[^\w-]/g, '-')}`,
            name,
            source: 'github',
            repo,
            url,
            description: `From ${repo} README`,
            stars: 0,
            keywords: matchedKw.slice(0, 3)
          });
        }
      }
    } catch (e) {
      // 单仓失败不阻塞
    }
  }

  // 2. npm 关键词搜索（保留接口，限流时跳过）
  // 注：实际接入留给 M36C+ ，本里程碑先 stub
  results.push(...await npmSearchStub(matchedKw));

  // 去重 + 排序
  const dedup = Array.from(new Map(results.map(r => [r.id, r])).values());
  dedup.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  writeCache(query, dedup);
  return dedup.slice(0, 20); // top 20
}

async function fetchRepoReadme(repo) {
  const url = `https://api.github.com/repos/${repo}/readme`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const headers = { 'User-Agent': 'AiCode-skill-registry/1.0', 'Accept': 'application/vnd.github+json' };
    // 复用 github-scanner 的 gh token
    try {
      const { execSync } = require('child_process');
      const token = execSync('gh auth token 2>/dev/null', { encoding: 'utf-8' }).trim();
      if (token) headers.Authorization = `token ${token}`;
    } catch { /* 无 gh CLI */ }
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } finally {
    clearTimeout(t);
  }
}

async function npmSearchStub(keywords) {
  // M36B stub：基于关键词生成候选名（实际接入留给 M36C+）
  if (keywords.length === 0) return [];
  const stub = [];
  const pkgs = ['@anthropic-ai/sdk', 'openai', 'langchain', 'recharts', 'framer-motion', 'prisma', 'drizzle-orm'];
  for (const kw of keywords.slice(0, 2)) {
    const matched = pkgs.filter(p => p.includes(kw));
    for (const m of matched) {
      stub.push({
        id: `npm__${m}`, name: m, source: 'npm', url: `https://www.npmjs.com/package/${m}`,
        description: `NPM package: ${m}`, stars: 0, keywords: [kw]
      });
    }
  }
  return stub;
}

function readCache(query) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const all = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return all[query] || null;
  } catch { return null; }
}

function writeCache(query, results) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let all = {};
    try { all = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch {}
    all[query] = { ts: Date.now(), results };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2));
  } catch { /* 缓存失败不影响 */ }
}

module.exports = { search, REPOS, KEYWORDS };