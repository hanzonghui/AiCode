#!/usr/bin/env node
/**
 * prompt-asset-manager.js — Prompt 资产版本管理
 *
 * 用法：
 *   node prompt-asset-manager.js list              # 列出所有 asset
 *   node prompt-asset-manager.js diff <agent-path> # 对比 agent 与组成它的 assets
 *   node prompt-asset-manager.js bump <asset-path> # 升级版本号
 *   node prompt-asset-manager.js compose <agent-path> # 拼合 assets 为完整 prompt
 *
 * @since v3.0.8 (2026-07-01) M54 Phase 3
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const ASSET_DIR = path.join(WORKSPACE_ROOT, '.claude', 'prompt-assets');

function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); }
  catch { return null; }
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: raw };
  const lines = m[1].split('\n');
  const fm = {};
  let currentKey = null;
  for (const line of lines) {
    const listMatch = line.match(/^(\s*)-\s*(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(listMatch[2].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim().replace(/^["']|["']$/g, '');
      fm[currentKey] = val;
    }
  }
  return { frontmatter: fm, body: m[2] };
}

function listAssets() {
  const assets = [];
  if (!fs.existsSync(ASSET_DIR)) return assets;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const fp = path.join(dir, entry);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        walk(fp);
      } else if (entry.endsWith('.md') && entry !== 'README.md') {
        const raw = readFileSafe(fp);
        const { frontmatter } = parseFrontmatter(raw || '');
        assets.push({
          path: path.relative(WORKSPACE_ROOT, fp),
          type: frontmatter['asset-type'] || 'unknown',
          version: frontmatter['asset-version'] || '0.0.0',
          role: frontmatter.role || '',
        });
      }
    }
  }

  walk(ASSET_DIR);
  return assets;
}

function compose(agentPath) {
  const raw = readFileSafe(path.resolve(WORKSPACE_ROOT, agentPath));
  if (!raw) throw new Error(`Agent file not found: ${agentPath}`);
  const { frontmatter, body } = parseFrontmatter(raw);
  const composedFrom = frontmatter['composed-from'] || [];
  if (!Array.isArray(composedFrom) || composedFrom.length === 0) {
    return { frontmatter, body, composedBody: body };
  }

  const parts = [];
  for (const assetRel of composedFrom) {
    const assetPath = path.resolve(WORKSPACE_ROOT, assetRel);
    const assetRaw = readFileSafe(assetPath);
    if (!assetRaw) {
      parts.push(`<!-- MISSING ASSET: ${assetRel} -->`);
      continue;
    }
    const { body: assetBody } = parseFrontmatter(assetRaw);
    parts.push(assetBody.trim());
  }

  return {
    frontmatter,
    body,
    composedBody: parts.join('\n\n---\n\n'),
    assets: composedFrom,
  };
}

function diff(agentPath) {
  const result = compose(agentPath);
  const normalizedBody = result.body.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  const normalizedComposed = result.composedBody.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  return {
    agentPath,
    composedFrom: result.assets || [],
    match: normalizedBody === normalizedComposed,
    bodyLength: result.body.length,
    composedLength: result.composedBody.length,
  };
}

function bump(assetPath) {
  const fp = path.resolve(WORKSPACE_ROOT, assetPath);
  const raw = readFileSafe(fp);
  if (!raw) throw new Error(`Asset file not found: ${assetPath}`);

  const { frontmatter, body } = parseFrontmatter(raw);
  const current = frontmatter['asset-version'] || '0.0.0';
  const parts = current.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  const next = parts.join('.');

  const newFm = { ...frontmatter, 'asset-version': next };
  const fmLines = Object.entries(newFm).map(([k, v]) => {
    if (Array.isArray(v)) {
      return `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`;
    }
    return `${k}: ${v}`;
  });

  const newRaw = `---\n${fmLines.join('\n')}\n---\n${body}`;
  fs.writeFileSync(fp, newRaw, 'utf8');
  return { path: assetPath, previous: current, next };
}

function printHelp() {
  console.log(`Usage: node prompt-asset-manager.js <cmd> [args]
  list                          列出所有 prompt assets
  compose <agent-path>          拼合 agent 引用的 assets
  diff <agent-path>             对比 agent body 与拼合结果
  bump <asset-path>            升级 asset patch 版本号
  help                          显示本帮助`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'list': {
      const assets = listAssets();
      console.log(`\n📦 Prompt Assets (${assets.length}):\n`);
      for (const a of assets) {
        console.log(`  ${a.path}`);
        console.log(`    type: ${a.type} | version: ${a.version} | role: ${a.role || '-'}`);
      }
      break;
    }
    case 'compose': {
      const agentPath = args[1];
      if (!agentPath) { console.error('请提供 agent 路径'); process.exit(1); }
      const result = compose(agentPath);
      console.log(result.composedBody);
      break;
    }
    case 'diff': {
      const agentPath = args[1];
      if (!agentPath) { console.error('请提供 agent 路径'); process.exit(1); }
      const d = diff(agentPath);
      console.log(`\nAgent: ${d.agentPath}`);
      console.log(`Assets: ${d.composedFrom.join(', ')}`);
      console.log(`Match: ${d.match ? '✅' : '❌'}`);
      console.log(`Body length: ${d.bodyLength}, Composed length: ${d.composedLength}`);
      break;
    }
    case 'bump': {
      const assetPath = args[1];
      if (!assetPath) { console.error('请提供 asset 路径'); process.exit(1); }
      const r = bump(assetPath);
      console.log(`\n⬆️  ${r.path}: ${r.previous} → ${r.next}`);
      break;
    }
    case 'help':
    default:
      printHelp();
  }
}

if (require.main === module) {
  main();
}

module.exports = { listAssets, compose, diff, bump, parseFrontmatter };
