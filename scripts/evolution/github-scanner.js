#!/usr/bin/env node

/**
 * GitHub Scanner — 从 GitHub Trending + Search API 抓取 Claude 相关项目
 *
 * 数据源：
 *   1. GitHub Trending（HTML 解析）
 *   2. GitHub Search API（按关键词搜索）
 *
 * 输出：data/github/trending.json
 *
 * 用法：
 *   node github-scanner.js              # 完整扫描
 *   node github-scanner.js --trending   # 只扫 Trending
 *   node github-scanner.js --search     # 只搜 Search API
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ── 配置 ──────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'github')
const TRENDING_FILE = path.join(DATA_DIR, 'trending.json')
const CACHE_FILE = path.join(DATA_DIR, 'scanner-cache.json')

const SEARCH_KEYWORDS = [
  'claude code', 'claude-code', 'claude code extensions',
  'claude code hooks', 'claude code agent', 'claude code mcp',
  'claude code automation', 'claude code self-improvement',
  'claude memory', 'claude code tools',
  'anthropic claude code', 'claude code custom',
]

const GITHUB_API = 'https://api.github.com'
const GITHUB_TRENDING = 'https://github.com/trending'

// ── GitHub Auth（v3.0.2 M18）────────────────────────────

/**
 * 读 GitHub Token（通过 gh CLI 拿，不进对话）
 * 优先级：
 *   1. `gh auth token`（gh CLI 已登录时返回 token）— 推荐路径
 *   2. 环境变量 GH_TOKEN / GITHUB_TOKEN（fallback）
 *   3. null（匿名模式，限流 60 次/小时）
 *
 * @returns {string|null}
 */
let _cachedToken = null;
let _tokenChecked = false;
function getGitHubToken() {
  if (_tokenChecked) return _cachedToken;
  _tokenChecked = true;

  // 1. gh auth token
  try {
    const out = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const tok = (out || '').trim();
    if (tok && tok.length > 10) {
      _cachedToken = tok;
      return tok;
    }
  } catch { /* gh 未登录或不存在 */ }

  // 2. 环境变量
  const envTok = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envTok && envTok.length > 10) {
    _cachedToken = envTok;
    return envTok;
  }

  // 3. 匿名
  _cachedToken = null;
  return null;
}

/**
 * 测试 gh CLI 是否已登录（给用户友好提示用）
 * @returns {boolean}
 */
function isGhLoggedIn() {
  try {
    execSync('gh auth status', { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/**
 * 构建带 token 的 headers（如有）
 * @param {object} baseHeaders
 * @returns {object}
 */
function authHeaders(baseHeaders) {
  const headers = { ...baseHeaders };
  const token = getGitHubToken();
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

// ── 工具函数 ──────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return { seen: {}, lastScan: null }
  }
}

function saveCache(cache) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

// ── 相关度评分 ────────────────────────────────────────

function calcRelevance(repo) {
  let score = 0
  const name = (repo.full_name || '').toLowerCase()
  const desc = (repo.description || '').toLowerCase()
  const topics = (repo.topics || []).map(t => t.toLowerCase())
  const combined = `${name} ${desc} ${topics.join(' ')}`

  // 名称匹配
  if (name.includes('claude-code') || name.includes('claude_code')) score += 10
  else if (name.includes('claude') && /(extension|hook|tool|agent|mcp|memory)/i.test(name)) score += 8
  else if (name.includes('claude')) score += 5
  else if (name.includes('mcp') && name.includes('claude')) score += 7

  // topics 匹配
  if (topics.some(t => t.includes('claude'))) score += 5
  if (topics.some(t => t.includes('mcp'))) score += 3
  if (topics.some(t => /(agent|memory|automation|extension)/i.test(t))) score += 3

  // stars
  if (repo.stargazers_count > 100) score += 3
  else if (repo.stargazers_count > 30) score += 2
  else if (repo.stargazers_count > 10) score += 1

  // 活跃度
  if (repo.updated_at && new Date(repo.updated_at) > new Date(daysAgo(7))) score += 2
  if (repo.pushed_at && new Date(repo.pushed_at) > new Date(daysAgo(3))) score += 2

  // 语言
  const lang = (repo.language || '').toLowerCase()
  if (['javascript', 'typescript', 'shell', 'bash'].includes(lang)) score += 2

  // description 方向匹配
  if (/(memory|agent|automation|extension|hook|mcp)/i.test(desc)) score += 3

  return score
}

// ── GitHub Trending 解析 ──────────────────────────────

async function fetchTrending() {
  console.log('📡 抓取 GitHub Trending...')

  try {
    const headers = authHeaders({
      'User-Agent': 'Mozilla/5.0 (compatible; ai-workspace-scanner/1.0)',
      'Accept': 'text/html',
    });
    if (headers.Authorization) console.log('  🔑 使用 GitHub Token 认证');

    const resp = await fetch(GITHUB_TRENDING, { headers });

    if (!resp.ok) {
      console.warn(`  ⚠ Trending 返回 ${resp.status}，跳过`)
      return []
    }

    const html = await resp.text()
    return parseTrendingHTML(html)
  } catch (err) {
    console.warn(`  ⚠ Trending 抓取失败: ${err.message}`)
    return []
  }
}

function parseTrendingHTML(html) {
  const repos = []

  // 匹配 article 块中的 repo 信息
  // GitHub Trending 页面结构：<h2 class="h3 lh-condensed"> <a href="/owner/repo"> ...
  const repoPattern = /href="\/([^"\/]+\/[^"\/]+)"/g
  const seen = new Set()

  let match
  while ((match = repoPattern.exec(html)) !== null) {
    const fullName = match[1]
    // 过滤非 repo 链接
    if (fullName.includes('/') && !fullName.includes('.') && !seen.has(fullName)) {
      seen.add(fullName)
      repos.push({
        full_name: fullName,
        source: 'trending',
      })
    }
  }

  // 去重（Trending 页面可能有重复链接）
  const unique = []
  const namesSeen = new Set()
  for (const r of repos) {
    if (!namesSeen.has(r.full_name)) {
      namesSeen.add(r.full_name)
      unique.push(r)
    }
  }

  console.log(`  ✅ Trending 解析到 ${unique.length} 个 repo`)
  return unique
}

// ── GitHub Search API ─────────────────────────────────

async function searchGitHub(keyword, perPage = 10) {
  const encoded = encodeURIComponent(keyword)
  const url = `${GITHUB_API}/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=${perPage}`

  try {
    const headers = authHeaders({
      'User-Agent': 'ai-workspace-scanner/1.0',
      'Accept': 'application/vnd.github.v3+json',
    });

    const resp = await fetch(url, { headers });

    if (resp.status === 403) {
      const hasToken = !!getGitHubToken();
      const hint = hasToken
        ? '（token 已用但仍限流，可能超额）'
        : '（未认证模式 60 次/小时限制，建议 gh auth login）';
      console.warn(`  ⚠ API 限流，跳过关键词: ${keyword} ${hint}`);
      return []
    }

    if (!resp.ok) {
      console.warn(`  ⚠ 搜索 "${keyword}" 返回 ${resp.status}`)
      return []
    }

    const data = await resp.json()
    return (data.items || []).map(item => ({
      full_name: item.full_name,
      description: item.description,
      html_url: item.html_url,
      stargazers_count: item.stargazers_count,
      language: item.language,
      topics: item.topics || [],
      created_at: item.created_at,
      updated_at: item.updated_at,
      pushed_at: item.pushed_at,
      source: 'search',
      matched_keyword: keyword,
    }))
  } catch (err) {
    console.warn(`  ⚠ 搜索 "${keyword}" 失败: ${err.message}`)
    return []
  }
}

async function fetchSearchResults() {
  console.log('🔍 搜索 GitHub 关键词...')

  const allRepos = []

  for (const keyword of SEARCH_KEYWORDS) {
    console.log(`  搜索: "${keyword}"`)
    const results = await searchGitHub(keyword)
    allRepos.push(...results)

    // GitHub API 限流保护：每请求间隔 1 秒
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`  ✅ 搜索共获取 ${allRepos.length} 条结果`)
  return allRepos
}

// ── 补全 Trending 的 repo 信息 ────────────────────────

async function enrichTrendingRepos(trendingRepos) {
  console.log(' enrich Trending repo 信息...')

  const enriched = []

  // 只 enrich 名称看起来和 Claude Code 生态相关的 repo，避免 832 次 API 调用
  const relevantPattern = /claude|mcp|agent|memory|automation|extension|hook|tool|anthropic/i
  const candidatesToEnrich = trendingRepos.filter(repo =>
    relevantPattern.test(repo.full_name) || relevantPattern.test(repo.description || '')
  )

  console.log(`  📌 命中相关过滤: ${candidatesToEnrich.length}/${trendingRepos.length} 个需要 enrich`)

  for (const repo of candidatesToEnrich) {
    // 对 Trending 里没搜到详细信息的，调 API 补全
    if (repo.stargazers_count !== undefined) {
      enriched.push(repo)
      continue
    }

    try {
      const url = `${GITHUB_API}/repos/${repo.full_name}`
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'ai-workspace-scanner/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      })

      if (resp.ok) {
        const data = await resp.json()
        enriched.push({
          full_name: data.full_name,
          description: data.description,
          html_url: data.html_url,
          stargazers_count: data.stargazers_count,
          language: data.language,
          topics: data.topics || [],
          created_at: data.created_at,
          updated_at: data.updated_at,
          pushed_at: data.pushed_at,
          source: 'trending',
        })
      }

      await new Promise(r => setTimeout(r, 1000))
    } catch {
      // 补全失败就跳过
    }
  }

  // 未被 enrich 的 repo 也保留（带基本字段），后续评分会自然过滤掉低相关度的
  const enrichedNames = new Set(enriched.map(r => r.full_name))
  for (const repo of trendingRepos) {
    if (!enrichedNames.has(repo.full_name)) {
      enriched.push(repo)
    }
  }

  return enriched
}

// ── 去重 + 合并 + 评分 ───────────────────────────────

function dedupeAndScore(repos) {
  const map = new Map()

  for (const repo of repos) {
    const key = repo.full_name
    if (map.has(key)) {
      // 合并：保留信息更完整的
      const existing = map.get(key)
      if (!existing.stargazers_count && repo.stargazers_count) {
        map.set(key, { ...repo, source: `${existing.source}+${repo.source}` })
      }
    } else {
      map.set(key, repo)
    }
  }

  // 评分 + 过滤
  const scored = []
  for (const repo of map.values()) {
    const relevance = calcRelevance(repo)
    // 只保留相关度 >= 5 的
    if (relevance >= 5) {
      scored.push({
        ...repo,
        relevance_score: relevance,
      })
    }
  }

  // 按相关度排序，取 top 20
  scored.sort((a, b) => b.relevance_score - a.relevance_score)
  return scored.slice(0, 20)
}

// ── 保留历史（7天）──────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf8'))
  } catch {
    return { history: [] }
  }
}

function saveHistory(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(TRENDING_FILE, JSON.stringify(data, null, 2))
}

// ── 主入口 ────────────────────────────────────────────

async function scan(mode = 'full') {
  const scanDate = today()
  console.log(`\n🧬 AiCode 自我进化 — GitHub 扫描 (${scanDate})`)
  console.log('='.repeat(50))

  let trendingRepos = []
  let searchRepos = []

  // 1. Trending
  if (mode === 'full' || mode === 'trending') {
    trendingRepos = await fetchTrending()
    trendingRepos = await enrichTrendingRepos(trendingRepos)
  }

  // 2. Search API
  if (mode === 'full' || mode === 'search') {
    searchRepos = await fetchSearchResults()
  }

  // 3. 合并去重 + 评分
  const allRepos = [...trendingRepos, ...searchRepos]
  const candidates = dedupeAndScore(allRepos)

  console.log(`\n📊 结果：${allRepos.length} 条原始 → ${candidates.length} 个高相关候选`)

  // 4. 保存
  const history = loadHistory()
  const todayEntry = {
    date: scanDate,
    trending_count: trendingRepos.length,
    search_count: searchRepos.length,
    candidates: candidates,
  }

  // 更新历史（保留最近 7 天）
  history.history = history.history.filter(h => {
    const d = new Date(h.date)
    return d > new Date(daysAgo(7))
  })
  history.history.push(todayEntry)
  history.lastScan = scanDate

  saveHistory(history)

  // 5. 输出当前候选
  console.log('\n🏆 今日高相关候选：')
  console.log('-'.repeat(50))
  for (const [i, c] of candidates.entries()) {
    const stars = c.stargazers_count || '?'
    console.log(`  ${i + 1}. [${c.relevance_score}分] ${c.full_name} (⭐${stars})`)
    if (c.description) console.log(`     ${c.description.slice(0, 80)}`)
  }
  console.log('-'.repeat(50))

  return candidates
}

// ── CLI ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  let mode = 'full'

  if (args.includes('--trending')) mode = 'trending'
  else if (args.includes('--search')) mode = 'search'

  // v3.0.2 M18: Token 状态检查（友好提示）
  if (isGhLoggedIn()) {
    console.log('🔑 检测到 gh CLI 已登录 — /evolve 走认证模式（5000 次/小时）');
  } else if (getGitHubToken()) {
    console.log('🔑 检测到 GH_TOKEN 环境变量 — /evolve 走认证模式');
  } else {
    console.log('⚠️  未配置 GitHub Token — /evolve 走匿名模式（60 次/小时限制）');
    console.log('   建议：gh auth login --web （token 存 Credential Manager，不进对话）');
  }
  console.log('');

  await scan(mode)
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 扫描失败:', err.message)
    process.exit(1)
  })
}

module.exports = {
  scan,
  calcRelevance,
  parseTrendingHTML,
  fetchTrending,   // v3.0.2 M18（测试用）
  searchGitHub,    // v3.0.2 M18（测试用）
  SEARCH_KEYWORDS,
  getGitHubToken,    // v3.0.2 M18
  isGhLoggedIn,      // v3.0.2 M18
  authHeaders,       // v3.0.2 M18
}
