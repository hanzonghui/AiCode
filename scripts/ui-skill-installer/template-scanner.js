// scripts/ui-skill-installer/template-scanner.js
// M36A · 扫描 GitHub 3 仓 templates 目录 → 内存清单 + 离线缓存
// 复用 llm-adapter 不需要 → 纯 fetch + parse

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '..', '.claude', 'skills', 'ui-skill-installer', 'memory', 'ui-templates-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const REPOS = [
  { name: 'shadcn-ui/ui',       templates: ['apps/www/registry/dashboard', 'apps/v4/registry/admin'] },
  { name: 'vercel/next.js',     templates: ['examples/landing-page', 'examples/portfolio'] },
  { name: 'vercel/ai-chatbot',  templates: ['components/chat'] }
];

/**
 * 扫描所有仓库的 templates 路径（API: GitHub contents API）
 * @returns {Promise<Array<{id, repo, path, scene, description}>>}
 */
async function scanAll() {
  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.templates;
  }
  const out = [];
  for (const r of REPOS) {
    for (const t of r.templates) {
      try {
        const meta = await fetchRepoMeta(r.name, t);
        out.push({
          id: `${r.name.replace('/', '_')}__${t.replace(/[\/]/g, '_')}`,
          repo: r.name,
          path: t,
          scene: guessScene(t),
          description: meta.description || `${r.name}/${t}`,
          stars: meta.stars || 0
        });
      } catch (e) {
        // 单个失败不阻塞
        out.push({
          id: `${r.name.replace('/', '_')}__${t.replace(/[\/]/g, '_')}`,
          repo: r.name, path: t,
          scene: guessScene(t),
          description: `[OFFLINE] ${r.name}/${t}`,
          offline: true
        });
      }
    }
  }
  writeCache(out);
  return out;
}

/**
 * 从 path 关键词推断场景（离线 fallback）
 */
function guessScene(p) {
  if (/landing|hero|marketing|pricing/i.test(p)) return 'landing';
  if (/dashboard|analytics|chart/i.test(p))      return 'dashboard';
  if (/chat|message|ai/i.test(p))                return 'chat';
  if (/admin|crm|manage|users/i.test(p))         return 'admin';
  if (/portfolio|blog|personal/i.test(p))        return 'portfolio';
  return 'misc';
}

/**
 * 调 GitHub contents API（无需 token，60 req/h 限流）
 */
async function fetchRepoMeta(repo, p) {
  const url = `https://api.github.com/repos/${repo}/contents/${p}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AiCode-ui-installer/1.0', 'Accept': 'application/vnd.github+json' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { description: data.name, stars: 0 };
  } finally {
    clearTimeout(t);
  }
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch { return null; }
}

function writeCache(templates) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), templates }, null, 2));
  } catch { /* 缓存失败不影响主流程 */ }
}

module.exports = { scanAll, guessScene, REPOS };
