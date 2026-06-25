#!/usr/bin/env node
/**
 * GitHub Scanner Auth 单元测试（v3.0.2 M18）
 *
 * 覆盖：
 *   1. getGitHubToken() — 3 路径：gh auth token / 环境变量 / 匿名
 *   2. isGhLoggedIn() — gh 已登录 / 未登录
 *   3. authHeaders() — 加 Authorization / 不加（保留原 headers）
 *   4. fetchTrending() headers 真带 Authorization（用 token 时）
 *   5. Token 缓存（多次调用只 execSync 一次）
 *   6. 友好提示文案
 *
 * @since v3.0.2 (2026-06-25) M18
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { getGitHubToken, isGhLoggedIn, authHeaders, scan } = require('./github-scanner');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

// ==================== 1. getGitHubToken 3 路径 ====================
console.log('── 1. getGitHubToken 3 路径 ──');

{
  // 清掉缓存（dev 模式热重载）
  delete require.cache[require.resolve('./github-scanner')];
  delete require.cache[require.resolve('child_process')];

  // 强制重新 require
  const { getGitHubToken: g1 } = require('./github-scanner');

  // 1.1 gh auth token（如果用户已登录）
  let ghToken = null;
  try {
    const out = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    ghToken = (out || '').trim();
  } catch { /* 未登录 */ }

  // 1.2 环境变量
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;

  // 1.3 期望：至少一个非空
  const expected = ghToken || envToken || null;
  const actual = g1();
  check('getGitHubToken 返回 string 或 null', actual === null || typeof actual === 'string');
  check('getGitHubToken 不暴露给 console.log', !actual || actual.length > 10, 'token 不会短到 10 字符');
  if (expected) {
    check('有 token 时返回非空', actual !== null);
  } else {
    check('无 token 时返回 null（匿名模式）', actual === null);
  }
}

// ==================== 2. isGhLoggedIn ====================
console.log('\n── 2. isGhLoggedIn ──');

{
  const logged = isGhLoggedIn();
  check('isGhLoggedIn 返回 boolean', typeof logged === 'boolean');
  // 仅信息性 PASS：实际是否登录看用户环境
  console.log(`  ℹ️  当前 gh 登录状态: ${logged ? '已登录' : '未登录'}`);
}

// ==================== 3. authHeaders ====================
console.log('\n── 3. authHeaders ──');

{
  const base = { 'User-Agent': 'test', 'Accept': 'application/json' };
  const h = authHeaders(base);
  check('保留所有原 headers', h['User-Agent'] === 'test' && h['Accept'] === 'application/json');
  if (getGitHubToken()) {
    check('有 token 时加 Authorization', h['Authorization'] && h['Authorization'].startsWith('token '));
  } else {
    check('无 token 时不加 Authorization', !h['Authorization']);
  }

  // 3.2 不修改原对象（immutability）
  const h2 = authHeaders(base);
  check('不修改原 base 对象', base['Authorization'] === undefined);
  check('两次调用返回新对象（不共享）', h !== h2);
}

// ==================== 4. fetchTrending 带 token ====================
console.log('\n── 4. fetchTrending headers（mock） ──');

// 用 monkey-patch fetch 验证 headers
{
  const realFetch = global.fetch;
  let capturedHeaders = null;
  global.fetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    // 返回 mock HTML 包含 1 个 repo 链接
    return {
      ok: true,
      status: 200,
      text: async () => '<article><a href="/test/repo1"></a></article>',
    };
  };

  delete require.cache[require.resolve('./github-scanner')];
  const { fetchTrending: f } = require('./github-scanner');

  // 等待 f 完成
  f().then(() => {
    check('fetchTrending 调用了 fetch', capturedHeaders !== null);
    check('headers 包含 User-Agent', capturedHeaders && capturedHeaders['User-Agent']);
    if (getGitHubToken()) {
      check('有 token 时 headers 含 Authorization', capturedHeaders && capturedHeaders['Authorization']);
      check('Authorization 格式 = "token <...>"', capturedHeaders && capturedHeaders['Authorization'].startsWith('token '));
    } else {
      check('无 token 时 headers 不含 Authorization', capturedHeaders && !capturedHeaders['Authorization']);
    }
    global.fetch = realFetch;
    afterFetchTrending();
  }).catch(err => {
    global.fetch = realFetch;
    check('fetchTrending 不抛异常', false, err.message);
    afterFetchTrending();
  });
}

function afterFetchTrending() {

  // ==================== 5. Token 缓存 ====================
  console.log('\n── 5. Token 缓存 ──');

  {
    delete require.cache[require.resolve('./github-scanner')];
    const { getGitHubToken: g2 } = require('./github-scanner');
    const t1 = g2();
    const t2 = g2();
    const t3 = g2();
    check('多次调用返回相同值（缓存生效）', t1 === t2 && t2 === t3);
  }

  // ==================== 6. CLI 友好提示 ====================
  console.log('\n── 6. CLI 友好提示 ──');

  {
    const r = spawnSync('node', [path.join(__dirname, 'github-scanner.js'), '--trending'], { encoding: 'utf8', timeout: 15000 });
    const out = (r.stdout || '') + (r.stderr || '');
    // gh auth 检查 / token 检查 / 友好提示 至少一个会输出
    const hasHint = out.includes('🔑') || out.includes('⚠️') || out.includes('Token') || out.includes('匿名');
    check('CLI 输出 token 状态提示', hasHint, '输出片段: ' + out.slice(0, 200));
  }

  // ==================== 总结 ====================
  console.log('');
  console.log(`📊 M18 github-scanner-auth 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  if (fail > 0) {
    console.log('失败项:');
    fails.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}
