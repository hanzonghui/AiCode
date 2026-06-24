#!/usr/bin/env node
/**
 * semantic-recall.js — 向量语义检索引擎（增量 E / M6，方案 E1 TF-IDF）
 *
 * 核心目标：让"模糊想找啥"也能命中 → recall 召回率 ↑ 50%
 *
 * 设计原则：
 *   - 零外部依赖（Node 内置 fs/path）
 *   - 算法：TF-IDF + 倒排索引 + 余弦相似度
 *   - 中文支持：双字 unigram（避免分词器依赖）
 *   - 缓存：索引存 memory/embeddings/tfidf-index.json（KB 变化时自动失效）
 *   - 兼容：与原 grep-based recall 输出格式一致
 *
 * 调用方式：
 *   const { search } = require('./semantic-recall');
 *   const results = search('上次那个 dispatcher 优化', { topK: 10, minScore: 0.1 });
 *
 * @since v2.1.0 (2026-06-24) — 增量 E / M6 E1 方案
 * @source 04_自我演进路线.md §0.4 增量 E
 */

const fs = require('fs');
const path = require('path');

// ── 路径配置 ─────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills', 'left-brain', 'memory');
const KNOWLEDGE_DIR = path.join(MEMORY_DIR, 'knowledge');
const EMBEDDINGS_DIR = path.join(MEMORY_DIR, 'embeddings');
const INDEX_FILE = path.join(EMBEDDINGS_DIR, 'tfidf-index.json');

// ── 分词（双字 unigram + 英文单词） ─────────────────

// 中文常见停用词（避免影响 TF-IDF 区分度）
const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '也', '都', '就', '还',
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个',
  '一个', '一些', '什么', '怎么', '为什么', '可以', '不能', '没有',
  '有', '没', '做', '做做', '了', '吧', '呢', '啊', '哦', '嗯',
  '对于', '关于', '通过', '进行', '实现', '使用', '完成', '添加',
  '应该', '需要', '已经', '正在', '将会', '可能', '或者',
]);

/**
 * 中文/英文混合分词
 *  - 中文：连续中文按双字滑动（bigram）切分
 *  - 英文：按 [a-zA-Z0-9]+ 切分，转小写
 *  - 过滤：停用词、长度 < 2 的 token
 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 提取中文片段
  const chineseRuns = text.match(/[一-龥]+/g) || [];
  for (const run of chineseRuns) {
    // 双字滑动
    for (let i = 0; i < run.length - 1; i++) {
      const bigram = run.slice(i, i + 2);
      if (!STOPWORDS.has(bigram)) tokens.push(bigram);
    }
    // 单字也算（捕获单字高频词）
    if (run.length === 1 && !STOPWORDS.has(run)) {
      tokens.push(run);
    }
  }
  // 提取英文片段
  const englishWords = text.match(/[a-zA-Z][a-zA-Z0-9]+/g) || [];
  for (const w of englishWords) {
    const lw = w.toLowerCase();
    if (lw.length >= 2 && !STOPWORDS.has(lw)) tokens.push(lw);
  }
  return tokens;
}

// ── 读 KB 文件 ──────────────────────────────────────

/**
 * 解析单条 KB 的 frontmatter
 * 返回 { id, content, category, keywords, ... }
 */
function parseKB(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const id = path.basename(filePath, '.md');
  const meta = {};
  const fmMatch = text.match(/^---([\s\S]*?)\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) {
        let v = m[2].trim();
        // 去掉列表方括号
        if (v.startsWith('[') && v.endsWith(']')) {
          v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean).join(', ');
        }
        meta[m[1]] = v;
      }
    }
  }
  return {
    id,
    file: filePath,
    content: meta.content || '',
    category: meta.category || '其他',
    keywords: meta.keywords || '',
    confidence: parseFloat(meta.confidence || '0.8'),
  };
}

/**
 * 加载所有 KB
 */
function loadAllKB() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => parseKB(path.join(KNOWLEDGE_DIR, f)));
}

// ── TF-IDF 索引构建 ──────────────────────────────────

/**
 * 索引结构：
 * {
 *   built_at: ISO,
 *   kb_count: N,
 *   df: { term: docFreq },          // 文档频率
 *   docs: [                         // 与 KB 数组对齐
 *     { id, tokens: [t1, t2, ...], tf: { term: count }, length: N }
 *   ]
 * }
 */
function buildIndex(kbList) {
  const docs = [];
  const df = {};
  for (const kb of kbList) {
    // 文本 = content + keywords（keywords 权重自然提升）
    const text = `${kb.content} ${kb.keywords}`;
    const tokens = tokenize(text);
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
    docs.push({ id: kb.id, file: kb.file, category: kb.category, content: kb.content, tokens, tf, length: tokens.length });
  }
  return {
    built_at: new Date().toISOString(),
    kb_count: kbList.length,
    df,
    docs,
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveIndex(idx) {
  ensureDir(EMBEDDINGS_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx));
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return null; }
}

/**
 * 取索引（KB 数量变化则重建）
 */
function getIndex() {
  const kbList = loadAllKB();
  const cached = loadIndex();
  if (cached && cached.kb_count === kbList.length) {
    // 检查是否 KB 文件本身变了（粗略：按 mtime）
    let needRebuild = false;
    for (const d of cached.docs) {
      if (fs.existsSync(d.file)) {
        const stat = fs.statSync(d.file);
        if (!d.mtime || stat.mtimeMs > d.mtime) { needRebuild = true; break; }
      }
    }
    if (!needRebuild) return cached;
  }
  const idx = buildIndex(kbList);
  // 补 mtime 用于下次对比
  for (const d of idx.docs) {
    if (fs.existsSync(d.file)) d.mtime = fs.statSync(d.file).mtimeMs;
  }
  saveIndex(idx);
  return idx;
}

// ── 余弦相似度查询 ──────────────────────────────────

function search(query, opts = {}) {
  const { topK = 10, minScore = 0.05 } = opts;
  const idx = getIndex();
  if (!idx || idx.docs.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // query TF
  const qtf = {};
  for (const t of queryTokens) qtf[t] = (qtf[t] || 0) + 1;

  const N = idx.kb_count;
  const scores = [];

  for (const doc of idx.docs) {
    if (doc.length === 0) continue;
    let dot = 0, qNorm = 0, dNorm = 0;
    // 向量化点积
    for (const t of Object.keys(qtf)) {
      const df = idx.df[t] || 0;
      if (df === 0) continue;
      const idf = Math.log(1 + N / df);
      const qWeight = qtf[t] * idf;
      const dWeight = (doc.tf[t] || 0) * idf;
      dot += qWeight * dWeight;
      qNorm += qWeight * qWeight;
    }
    if (dot === 0) continue;
    // 文档范数
    for (const t of Object.keys(doc.tf)) {
      const df = idx.df[t] || 0;
      if (df === 0) continue;
      const dWeight = doc.tf[t] * Math.log(1 + N / df);
      dNorm += dWeight * dWeight;
    }
    if (qNorm === 0 || dNorm === 0) continue;
    const sim = dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
    if (sim >= minScore) {
      scores.push({ id: doc.id, category: doc.category, content: doc.content, score: sim });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

// ── 重建索引（手动触发） ──────────────────────────────

function rebuild() {
  if (fs.existsSync(INDEX_FILE)) fs.unlinkSync(INDEX_FILE);
  return getIndex();
}

// ── CLI ─────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('用法:');
    console.log('  node semantic-recall.js search <query> [--top N] [--min S]   检索');
    console.log('  node semantic-recall.js rebuild                                 重建索引');
    console.log('  node semantic-recall.js stats                                   索引统计');
    process.exit(0);
  }

  const cmd = args[0];
  if (cmd === 'search') {
    const query = args[1] || '';
    let topK = 10, minScore = 0.05;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--top') topK = parseInt(args[++i], 10) || 10;
      else if (args[i] === '--min') minScore = parseFloat(args[++i]) || 0.05;
    }
    const results = search(query, { topK, minScore });
    console.log(`🧠 语义检索: "${query}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (results.length === 0) {
      console.log('  (无匹配结果)');
    } else {
      results.forEach((r, i) => {
        const star = r.category === '偏好' ? '⭐' : ' ';
        const pct = (r.score * 100).toFixed(1);
        console.log(`  ${i + 1}. ${star}[${r.id}] [${r.category} 相似度${pct}%] ${r.content.slice(0, 80)}`);
      });
    }
  } else if (cmd === 'rebuild') {
    const idx = rebuild();
    console.log(`✅ 索引已重建: ${idx.kb_count} 条 KB, ${Object.keys(idx.df).length} 个 term`);
  } else if (cmd === 'stats') {
    const idx = getIndex();
    console.log(`📊 索引统计`);
    console.log(`  构建时间: ${idx.built_at}`);
    console.log(`  KB 数: ${idx.kb_count}`);
    console.log(`  词项数: ${Object.keys(idx.df).length}`);
  } else {
    console.error(`未知命令: ${cmd}`);
    process.exit(1);
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}

module.exports = {
  tokenize,
  search,
  rebuild,
  getIndex,
  loadAllKB,
  parseKB,
  INDEX_FILE,
  KNOWLEDGE_DIR,
};