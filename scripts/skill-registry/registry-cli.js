#!/usr/bin/env node
// scripts/skill-registry/registry-cli.js
// M36B · CLI 主入口：list / search / install / uninstall / update / verify

const { search } = require('./registry-scanner');
const { judge } = require('./registry-judge');
const installer = require('./registry-installer');

const HELP = `
skill-registry · M36B · 一键搜索+安装 Claude skill（自动评分 + 验证）

用法:
  node registry-cli.js search "<query>"          搜索 skill 候选
  node registry-cli.js install "<query>" [--dry-run]  安装 top-1 评分 ≥ 7.0 的 skill
  node registry-cli.js list                       列出已安装 skill
  node registry-cli.js uninstall <name>           卸载
  node registry-cli.js update <name>              重新安装（覆盖）
  node registry-cli.js verify <name>              验证 require 可加载

示例:
  node registry-cli.js search "添加 chart 能力"
  node registry-cli.js install "chart visualization" --dry-run
  node registry-cli.js install "chart"
  node registry-cli.js verify recharts-skill
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  // 把 flag 从 args 中移除，剩下的拼成 query
  const queryArgs = args.filter(a => !a.startsWith('--'));

  if (cmd === 'list') return runList();
  if (cmd === 'search') return runSearch(queryArgs.join(' '));
  if (cmd === 'install') return runInstall(queryArgs.join(' '), { dryRun, force });
  if (cmd === 'uninstall') return runUninstall(queryArgs[0]);
  if (cmd === 'update') return runUpdate(queryArgs[0]);
  if (cmd === 'verify') return runVerify(queryArgs[0]);

  console.error(`未知命令: ${cmd}`);
  console.log(HELP);
  process.exit(1);
}

async function runSearch(query) {
  console.log(`[M36B] 🔍 搜索: "${query}"`);
  const results = await search(query);
  console.log(`[M36B] ✅ 找到 ${results.length} 个候选\n`);
  for (const r of results.slice(0, 10)) {
    const verdict = await judge(r);
    const icon = verdict.verdict === 'accept' ? '✅' : (verdict.verdict === 'skip' ? '🟡' : '❌');
    console.log(`  ${icon} [${verdict.score}] ${r.name.padEnd(30)} ${r.source.padEnd(8)} ${r.url}`);
    if (verdict.reasons.length) console.log(`        理由: ${verdict.reasons.join('; ')}`);
  }
}

async function runInstall(query, opts) {
  if (!query) {
    console.error('❌ 缺少 query');
    process.exit(1);
  }
  console.log(`[M36B] 🔍 搜索: "${query}"`);
  const results = await search(query);
  console.log(`[M36B] ✅ 找到 ${results.length} 个候选`);

  // 评分所有候选
  const judged = [];
  for (const r of results) {
    judged.push({ ...r, ...(await judge(r)) });
  }
  judged.sort((a, b) => b.score - a.score);
  const top = judged[0];

  if (!top || top.verdict === 'reject') {
    console.error(`[M36B] ❌ 没有评分 ≥ 7 的候选（top: ${top ? top.score : 'none'}）`);
    console.error(`       这通常是营销号低质内容。换个查询词试试。`);
    process.exit(1);
  }

  if (top.verdict === 'skip') {
    console.warn(`[M36B] 🟡 top-1 评分 ${top.score}（< 7.0），但仍尝试安装`);
  } else {
    console.log(`[M36B] ✅ top-1: ${top.name}（评分 ${top.score}）`);
  }

  console.log(`[M36B] 📦 安装到 .claude/skills/${top.name}/ ...`);
  const result = installer.install(top, opts);
  console.log(`[M36B] ${result.ok ? '✅' : '❌'} ${result.message}`);
  if (!result.ok) process.exit(1);
}

function runList() {
  const list = installer.list();
  if (list.length === 0) {
    console.log('[M36B] 暂无已安装 skill（M36B 范围内）。试试: npm run skill-install -- "chart"');
    return;
  }
  console.log(`[M36B] 已安装 ${list.length} 个 skill:\n`);
  for (const s of list) {
    console.log(`  📦 ${s.name.padEnd(30)} v${s.version}  ${s.installed_at}`);
    console.log(`      来源: ${s.url}`);
  }
}

function runUninstall(name) {
  const r = installer.uninstall(name);
  console.log(`[M36B] ${r.ok ? '✅' : '❌'} ${r.message}`);
  if (!r.ok) process.exit(1);
}

async function runUpdate(name) {
  if (!name) {
    console.error('❌ 缺少 skill 名');
    process.exit(1);
  }
  console.log(`[M36B] 🔄 更新 ${name} ...`);
  const results = await search(name);
  const top = results[0];
  if (!top) { console.error('未找到候选'); process.exit(1); }
  const r = installer.install(top, { force: true });
  console.log(`[M36B] ${r.ok ? '✅' : '❌'} ${r.message}`);
}

function runVerify(name) {
  const r = installer.verify(name);
  console.log(`[M36B] ${r.ok ? '✅' : '❌'} ${r.message}`);
  if (!r.ok) process.exit(1);
}

main().catch(e => {
  console.error('[M36B] ❌', e.message);
  process.exit(1);
});