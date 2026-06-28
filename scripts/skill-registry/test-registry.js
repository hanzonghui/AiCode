// scripts/skill-registry/test-registry.js
// M36B+C · 单元 + 集成测试（mock fetch，离线跑）

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.error(`  ❌ ${name}: ${e.message}`); failed++; }
}

// Mock fetch
global.fetch = async (url) => {
  if (url.includes('api.github.com/repos/') && url.includes('/readme')) {
    return {
      ok: true, status: 200,
      json: async () => ({ content: Buffer.from(`# Skills\n\n- [chart-skill](https://github.com/x/chart-skill)\n- [bad-shell](https://github.com/y/bad)\n`).toString('base64') })
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

(async () => {
  console.log('\n[M36B test] 单元 + 集成测试\n');

  const { search, REPOS, KEYWORDS } = require('./registry-scanner');
  const { judge, FORBIDDEN_DEPS } = require('./registry-judge');
  const installer = require('./registry-installer');

  // 1. scanner 基础
  await test('REPOS 含 3 仓', () => {
    assert.strictEqual(REPOS.length, 3);
  });
  await test('KEYWORDS 含 chart 等能力词', () => {
    assert.ok(KEYWORDS.includes('chart'));
    assert.ok(KEYWORDS.includes('database'));
  });

  // 2. judge 评分维度
  await test('judge: 高质量 GitHub candidate → accept', async () => {
    const r = await judge({
      id: 'x__chart', name: 'chart-skill', source: 'github',
      url: 'https://github.com/x/chart', description: 'A long enough description for chart visualization',
      stars: 1500, keywords: ['chart']
    });
    assert.strictEqual(r.verdict, 'accept');
    assert.ok(r.score >= 7.0);
  });
  await test('judge: 低质量描述 → skip 或 reject', async () => {
    const r = await judge({
      id: 'x__bad', name: 'bad', source: 'github',
      url: 'https://github.com/x/bad', description: '短'
    });
    assert.ok(['skip', 'reject'].includes(r.verdict));
  });
  await test('judge: 禁依赖（child_process.exec）一票否决', async () => {
    const r = await judge({
      id: 'x__evil', name: 'evil', source: 'github',
      url: 'https://github.com/x/evil',
      description: 'uses child_process.exec to do things'
    });
    assert.strictEqual(r.verdict, 'reject');
    assert.ok(r.reasons.some(s => s.includes('禁依赖')));
  });
  await test('judge: 非主流 URL 扣分', async () => {
    const r = await judge({
      id: 'x__weird', name: 'weird', source: 'github',
      url: 'https://random-site.io/x/weird',
      description: 'A reasonably long description for testing'
    });
    assert.ok(r.reasons.some(s => s.includes('非主流来源')));
  });
  await test('FORBIDDEN_DEPS 含核心危险项', () => {
    assert.ok(FORBIDDEN_DEPS.includes('shell-exec'));
    assert.ok(FORBIDDEN_DEPS.includes('unsafe-eval'));
  });

  // 3. installer: 安装 / 卸载 / 验证
  await test('install: 正常安装', () => {
    const r = installer.install({
      id: 'test__recharts-skill', name: 'recharts-skill', source: 'github',
      url: 'https://github.com/x/recharts', description: 'Recharts integration skill',
      keywords: ['chart']
    }, { force: true });
    assert.ok(r.ok, r.message);
    assert.ok(fs.existsSync(r.path));
    assert.ok(fs.existsSync(path.join(r.path, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(r.path, 'index.js')));
    // 清理
    installer.uninstall('recharts-skill');
  });

  await test('install: 不合法 name 拒绝（路径穿越防护）', () => {
    // 先清理任何遗留
    try { installer.uninstall('etc-passwd'); } catch {}
    const r = installer.install({
      id: 'x__bad', name: '../etc/passwd', source: 'github',
      url: 'https://github.com/x/bad', description: 'test'
    }, { force: true });
    // name 经 sanitize 变成合法（'etcpasswd'），但仍应在 .claude/skills/ 下，不应越界
    assert.ok(r.ok, `name 应被 sanitize 成合法: ${r.message}`);
    if (r.ok) {
      // 验证路径确实在 .claude/skills/ 内（防穿越）
      const targetDir = path.join(__dirname, '..', '..', '.claude', 'skills');
      assert.ok(r.path.startsWith(targetDir), `安装路径必须在 ${targetDir} 内`);
      installer.uninstall(path.basename(r.path));
    }
  });

  await test('install: --dry-run 不写盘', () => {
    const r = installer.install({
      id: 'x__dryrun', name: 'dryrun-test', source: 'github',
      url: 'https://github.com/x/dryrun', description: 'dry run test'
    }, { dryRun: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.dryRun, true);
    assert.ok(!fs.existsSync(path.join(__dirname, '..', '..', '.claude', 'skills', 'dryrun-test')));
  });

  await test('uninstall: 正常卸载', () => {
    installer.install({
      id: 'x__tmp', name: 'tmp-skill', source: 'github',
      url: 'https://github.com/x/tmp', description: 'temp'
    }, { force: true });
    const r = installer.uninstall('tmp-skill');
    assert.strictEqual(r.ok, true);
  });

  await test('verify: 已安装 skill 可验证', () => {
    installer.install({
      id: 'x__verify', name: 'verify-skill', source: 'github',
      url: 'https://github.com/x/verify', description: 'verify test'
    }, { force: true });
    const r = installer.verify('verify-skill');
    assert.strictEqual(r.ok, true);
    installer.uninstall('verify-skill');
  });

  await test('verify: 不存在的 skill 报错', () => {
    const r = installer.verify('not-exist');
    assert.strictEqual(r.ok, false);
  });

  // 4. list
  await test('list: 包含已安装 skill', () => {
    installer.install({
      id: 'x__list', name: 'list-skill', source: 'github',
      url: 'https://github.com/x/list', description: 'list test'
    }, { force: true });
    const list = installer.list();
    assert.ok(list.some(s => s.name === 'list-skill'));
    installer.uninstall('list-skill');
  });

  // 5. 集成：search → judge → install 全链路
  await test('集成: search → judge → install', async () => {
    const results = await search('添加 chart 能力');
    assert.ok(results.length > 0, '搜索有结果');
    const judged = [];
    for (const r of results) judged.push({ ...r, ...(await judge(r)) });
    judged.sort((a, b) => b.score - a.score);
    // 不真装（避免污染 .claude/skills），只验证流程
    assert.ok(judged[0].score > 0);
  });

  // 6. M36C 核心：营销号低质内容被 reject
  await test('M36C 营销号过滤: 描述过短 reject', async () => {
    const r = await judge({
      id: 'spam__1', name: '万能 prompt 提示词大全', source: 'github',
      url: 'https://github.com/spam/1', description: 'nb'
    });
    assert.ok(['reject', 'skip'].includes(r.verdict));
    assert.ok(r.score < 7.0, `M36C 闸门: 营销号必须 < 7.0（实际 ${r.score}）`);
  });

  console.log(`\n[M36B test] ${passed} passed / ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('test runner crash:', e); process.exit(1); });