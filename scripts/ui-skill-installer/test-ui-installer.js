// scripts/ui-skill-installer/test-ui-installer.js
// M36A · 单元 + 集成测试（mock fetch，离线跑）

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// ─── 测试框架（最小化） ───
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.error(`  ❌ ${name}: ${e.message}`); failed++; }
}

// ─── Mock fetch（避免真实 GitHub 请求） ───
global.fetch = async (url) => {
  if (url.includes('api.github.com')) {
    return { ok: true, status: 200, json: async () => ({ name: 'mock-template' }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

(async () => {
  console.log('\n[M36A test] 单元 + 集成测试\n');

  const { scanAll, guessScene } = require('./template-scanner');
  const { judge, judgeByKeywords, SCENE_KEYWORDS } = require('./template-judge');
  const { scaffold, SCENE_TEMPLATES } = require('./template-scaffolder');
  const v0 = require('./v0-adapter');

  // 1. scene 关键词推断
  await test('guessScene: landing', () => {
    assert.strictEqual(guessScene('examples/landing-page'), 'landing');
  });
  await test('guessScene: dashboard', () => {
    assert.strictEqual(guessScene('apps/www/registry/dashboard'), 'dashboard');
  });
  await test('guessScene: chat', () => {
    assert.strictEqual(guessScene('components/chat'), 'chat');
  });

  // 2. 关键词匹配
  await test('judgeByKeywords: SaaS 后台 → dashboard', () => {
    const templates = [
      { id: 'a__landing',   scene: 'landing',   description: 'Landing' },
      { id: 'b__dashboard', scene: 'dashboard', description: 'Dashboard' }
    ];
    const r = judgeByKeywords('做个 SaaS 后台', templates);
    assert.strictEqual(r.id, 'b__dashboard');
    assert.strictEqual(r.scene, 'dashboard');
  });
  await test('judgeByKeywords: 聊天 → chat', () => {
    const r = judgeByKeywords('做个聊天页面', [
      { id: 'a__chat', scene: 'chat', description: 'Chat' }
    ]);
    assert.strictEqual(r.scene, 'chat');
  });
  await test('SCENE_KEYWORDS 含 5 场景', () => {
    assert.deepStrictEqual(Object.keys(SCENE_KEYWORDS).sort(),
      ['admin', 'chat', 'dashboard', 'landing', 'portfolio']);
  });

  // 3. v0-adapter stub
  await test('v0.generate: landing 返回 indigo', () => {
    const r = v0.generate('landing', 'test');
    assert.strictEqual(r.stub, true);
    assert.strictEqual(r.tokens.primaryColor, 'indigo-600');
  });
  await test('v0.generate: 未知场景降级到 landing', () => {
    const r = v0.generate('unknown', 'test');
    assert.strictEqual(r.scene, 'landing');
  });

  // 4. scaffolder：5 大场景都能生成
  for (const scene of Object.keys(SCENE_TEMPLATES)) {
    await test(`scaffold: ${scene}`, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ui-test-${scene}-`));
      const tokens = v0.generate(scene, 'test').tokens;
      const r = scaffold(scene, tmpDir, tokens);
      assert.ok(r.filesWritten.length >= 7, `至少 7 个文件，实际 ${r.filesWritten.length}`);
      assert.ok(fs.existsSync(path.join(tmpDir, 'package.json')), 'package.json 存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'tailwind.config.ts')), 'tailwind.config.ts 存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'app/page.tsx')), 'app/page.tsx 存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'test-init.js')), 'test-init.js 存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'README.md')), 'README.md 存在');
      // 验证 package.json 有效
      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      assert.ok(pkg.dependencies.next, 'deps 含 next');
      // 清理
      fs.rmSync(tmpDir, { recursive: true });
    });
  }

  // 5. scaffolder：非空目录报错
  await test('scaffold: 非空目录报错', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-test-busy-'));
    fs.writeFileSync(path.join(tmpDir, 'exist.txt'), 'x');
    assert.throws(() => scaffold('landing', tmpDir, { primaryColor: 'red' }), /非空/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  // 6. 集成：扫描 + 选 + scaffold（mock fetch）
  await test('集成: scanAll + judge + scaffold 链路', async () => {
    const templates = await scanAll();
    assert.ok(templates.length >= 5, '至少 5 个模板');
    const winner = await judge('做个 landing page', templates);
    assert.ok(winner.id, '有 winner');
    assert.strictEqual(winner.scene, 'landing');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-test-int-'));
    const tokens = v0.generate(winner.scene, 'test').tokens;
    const r = scaffold(winner.scene, tmpDir, tokens);
    assert.ok(r.filesWritten.length >= 7);
    fs.rmSync(tmpDir, { recursive: true });
  });

  console.log(`\n[M36A test] ${passed} passed / ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('test runner crash:', e); process.exit(1); });