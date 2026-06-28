#!/usr/bin/env node
// scripts/ui-skill-installer/ui-skill-installer.js
// M36A · CLI 主入口（仿 evolution-lock.js 风格：永不 throw + 原子写）

const path = require('path');
const { scanAll } = require('./template-scanner');
const { judge } = require('./template-judge');
const { scaffold, SCENE_TEMPLATES } = require('./template-scaffolder');
const v0 = require('./v0-adapter');

const HELP = `
ui-skill-installer · M36A · 一键安装 shadcn + Tailwind + v0 模板

用法:
  node ui-skill-installer.js install "<需求>" --out <dir>
  node ui-skill-installer.js list
  node ui-skill-installer.js cache rebuild

示例:
  node ui-skill-installer.js install "做个 SaaS 后台" --out ./my-saas
  node ui-skill-installer.js install "landing page" --out ./marketing --dry-run
  node ui-skill-installer.js list
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  if (cmd === 'list') return runList();
  if (cmd === 'cache') return runCache(args);
  if (cmd === 'install') return runInstall(args);

  console.error(`未知命令: ${cmd}`);
  console.log(HELP);
  process.exit(1);
}

async function runInstall(args) {
  const userInput = args[0];
  if (!userInput) {
    console.error('❌ 缺少需求描述。用法: install "<需求>" --out <dir>');
    process.exit(1);
  }
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : `./ui-out-${Date.now()}`;
  const dryRun = args.includes('--dry-run');

  console.log(`[M36A] 🚀 启动 ui-skill-installer`);
  console.log(`[M36A] 📝 需求: ${userInput}`);
  console.log(`[M36A] 📂 目标: ${path.resolve(outDir)}`);
  console.log(`[M36A] 🔍 扫描 GitHub 3 仓 templates ...`);
  const templates = await scanAll();
  console.log(`[M36A] ✅ 找到 ${templates.length} 个候选模板`);

  console.log(`[M36A] 🎯 选最佳模板 ...`);
  const winner = await judge(userInput, templates);
  console.log(`[M36A]    → ${winner.reason}`);

  console.log(`[M36A] 🎨 调用 v0-adapter 生成设计 token ...`);
  const tokens = v0.generate(winner.scene, userInput);
  console.log(`[M36A]    ${tokens.note}`);

  if (dryRun) {
    console.log(`[M36A] 🟡 --dry-run：跳过文件写入`);
    console.log(JSON.stringify({ winner, tokens, outDir }, null, 2));
    return;
  }

  console.log(`[M36A] 🏗  生成脚手架 ...`);
  const result = scaffold(winner.scene, path.resolve(outDir), tokens.tokens);
  console.log(`[M36A] ✅ 完成！写入 ${result.filesWritten.length} 个文件`);
  console.log(`[M36A] 📦 来源: ${result.source}`);
  console.log(`[M36A] ▶  下一步:`);
  console.log(`       cd ${outDir}`);
  console.log(`       npm install`);
  console.log(`       npm run dev`);
}

async function runList() {
  console.log('支持的 5 大场景:');
  for (const [scene, tpl] of Object.entries(SCENE_TEMPLATES)) {
    console.log(`  ${scene.padEnd(12)} ${tpl.label.padEnd(20)} ← ${tpl.repo}/${tpl.path}`);
  }
}

async function runCache(args) {
  if (args[0] === 'rebuild') {
    const { scanAll } = require('./template-scanner');
    console.log('[M36A] 🔄 重建缓存 ...');
    const ts = await scanAll();
    console.log(`[M36A] ✅ 缓存已更新（${ts.length} 个模板）`);
    return;
  }
  console.log('用法: cache rebuild');
}

main().catch(e => {
  console.error('[M36A] ❌', e.message);
  process.exit(1);
});