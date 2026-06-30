#!/usr/bin/env node
/**
 * prompt-asset-manager 测试
 *
 * @since v3.0.8 (2026-07-01) M54 Phase 3
 */

const fs = require('fs');
const path = require('path');
const { listAssets, compose, diff, bump, parseFrontmatter } = require('./prompt-asset-manager');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

(async () => {
  console.log('========================================');
  console.log('📦 prompt-asset-manager 测试');
  console.log('========================================\n');

  // 1. parseFrontmatter
  const sample = `---\nasset-type: system-prompt\nasset-version: 1.0.0\ncomposed-from:\n  - a.md\n  - b.md\n---\nbody here`;
  const parsed = parseFrontmatter(sample);
  check('parseFrontmatter 解析 asset-type', parsed.frontmatter['asset-type'] === 'system-prompt');
  check('parseFrontmatter 解析版本', parsed.frontmatter['asset-version'] === '1.0.0');
  check('parseFrontmatter 解析数组', Array.isArray(parsed.frontmatter['composed-from']) && parsed.frontmatter['composed-from'].length === 2);
  check('parseFrontmatter 保留 body', parsed.body.includes('body here'));

  // 2. listAssets
  const assets = listAssets();
  check('listAssets 返回数组', Array.isArray(assets));
  check('listAssets 包含 qa system prompt', assets.some(a => a.path.includes('base-qa-system.v1.md')));
  check('listAssets 包含 qa constraint', assets.some(a => a.path.includes('read-only-constraint.v1.md')));
  check('listAssets 包含 qa report template', assets.some(a => a.path.includes('qa-report-template.v1.md')));

  // 3. compose qa-reviewer
  const composed = compose('.claude/agents/qa-reviewer.md');
  check('compose 返回 composedBody', typeof composed.composedBody === 'string' && composed.composedBody.length > 0);
  check('compose 包含 base-qa-system 内容', composed.composedBody.includes('资深 QA 工程师'));
  check('compose 包含 read-only-constraint 内容', composed.composedBody.includes('只读不写'));
  check('compose 包含 report-template 内容', composed.composedBody.includes('QA 报告'));
  check('compose 解析 composed-from 数组', Array.isArray(composed.assets) && composed.assets.length === 3);

  // 4. diff qa-reviewer
  const d = diff('.claude/agents/qa-reviewer.md');
  check('diff 返回 match', typeof d.match === 'boolean');
  check('diff 返回 composedFrom 数组', Array.isArray(d.composedFrom) && d.composedFrom.length === 3);

  // 5. bump
  const assetPath = '.claude/prompt-assets/system-prompts/base-qa-system.v1.md';
  const before = fs.readFileSync(path.resolve(__dirname, '..', '..', assetPath), 'utf8');
  const bumpResult = bump(assetPath);
  check('bump 升级 patch 版本', bumpResult.next.endsWith('.0.1') || bumpResult.next.endsWith('.1') || bumpResult.next.match(/^\d+\.\d+\.\d+$/) && bumpResult.next !== bumpResult.previous);
  const after = fs.readFileSync(path.resolve(__dirname, '..', '..', assetPath), 'utf8');
  check('bump 写入文件', after.includes(bumpResult.next));
  // restore
  fs.writeFileSync(path.resolve(__dirname, '..', '..', assetPath), before, 'utf8');

  console.log(`\n📊 prompt-asset-manager 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
