#!/usr/bin/env node
/**
 * skill-hub-cli.js — Skill Hub 命令行入口（M40）
 *
 * 子命令：
 *   list              列出所有 skill（已装 + 本地 + 远程）
 *   search <query>   按关键词搜索
 *   recommend         推荐 Top-K（默认 10）
 *   demo              跑预设 demo
 *
 * @since v3.0.5 M40 (2026-06-28)
 */

'use strict';

const { searchSkills, listSkills, loadLocalSkills, loadInstalledSkills, loadRemoteSkills } = require('./skill-hub');

const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

try {
  switch (cmd) {
    case 'list': {
      const result = listSkills();
      console.log(result.markdown);
      console.error(`\n[stats] total=${result.total} · installed=${result.bySource.installed} · local=${result.bySource.local} · remote=${result.bySource.remote}`);
      break;
    }
    case 'search': {
      if (!arg1) {
        console.log('用法: node skill-hub-cli.js search "<query>" [--topK N]');
        process.exit(1);
      }
      const topK = arg2 && arg2.startsWith('--topK=') ? parseInt(arg2.split('=')[1], 10) : 10;
      const result = searchSkills(arg1, { topK });
      console.log(result.markdown);
      console.error(`\n[stats] total=${result.total} · returned=${result.hits.length} · installed=${result.bySource.installed} · local=${result.bySource.local} · remote=${result.bySource.remote}`);
      break;
    }
    case 'recommend': {
      const queries = ['记忆', 'audit', '自主', 'evolve', 'chart', 'workflow'];
      const results = queries.map(q => ({ q, ...searchSkills(q, { topK: 3 }) }));
      console.log('## ⭐ Skill Hub 推荐（按场景）\n');
      for (const r of results) {
        console.log(`### 场景：${r.q}`);
        console.log(r.markdown.split('\n').slice(4, 7).join('\n'));
        console.log('');
      }
      break;
    }
    case 'sources': {
      console.log('## 📦 Skill Hub 数据源\n');
      console.log(`- 本地目录: ${loadInstalledSkills().length} 个已装 skill`);
      console.log(`- SKILL_INDEX: ${loadLocalSkills().length} 个官方 skill`);
      console.log(`- 远程缓存: ${loadRemoteSkills().length} 个候选`);
      break;
    }
    case 'demo': {
      console.log('━━━ M40 Skill Hub demo ━━━\n');
      console.log('[1] 列出所有来源:');
      const all = listSkills();
      console.log(all.markdown.split('\n').slice(0, 8).join('\n'));
      console.log(`\n... (共 ${all.hits.length} 条)\n`);

      const query = arg1 || 'chart';
      console.log(`[2] 搜索 "${query}":`);
      const result = searchSkills(query, { topK: 5 });
      console.log(result.markdown);
      console.error(`\n[stats] total=${result.total} · returned=${result.hits.length}`);
      break;
    }
    default: {
      console.log(`
skill-hub-cli.js — M40 统一 skill 发现中心（借鉴 davepoon/buildwithclaude）

用法:
  list                列出所有 skill
  search "<query>"   按关键词搜索
  recommend           按预设场景推荐
  sources             看数据来源统计
  demo [query]        端到端 demo

例子:
  node skill-hub-cli.js search "记忆"
  node skill-hub-cli.js search "chart" --topK=5
  node skill-hub-cli.js recommend
`);
    }
  }
} catch (e) {
  console.error('❌ 异常:', e.message);
  process.exit(1);
}
