#!/usr/bin/env node
/**
 * aris-poc.js — 借鉴 wanshuiyin/Auto-claude-code-research-in-sleep CLI（M38）
 *
 * 命令：
 *   node aris-poc.js review --file <path> [--subject "..."] [--focus correctness,security] [--max-rounds 4] [--strategy majority]
 *   node aris-poc.js idea --json <path> [--top-k 5] [--direction "..."]
 *   node aris-poc.js verdict --score 7 --verdict PASS --reason "looks good"
 *   node aris-poc.js demo
 *
 * @since v3.0.5 M38 (2026-06-28)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const reviewLoop = require('./review-loop');
const ideaDiscovery = require('./idea-discovery');
const verdictMod = require('./verdict');

const HELP = `
aris-poc.js — ARIS-inspired POC CLI (M38 · 借鉴 wanshuiyin/ARIS)

用法:
  node aris-poc.js review --file <path> [options]
  node aris-poc.js idea --json <path> [options]
  node aris-poc.js verdict --score <0-10> --verdict <state> [--reason "..."]
  node aris-poc.js demo

子命令:
  review   对一个文件运行 cross-model review loop
  idea     从 JSON 候选列表发现 Top-K idea
  verdict  构造 / 验证一个 verdict 对象
  demo     跑一个真实 demo（review + idea + verdict 串联）

verdict 状态: PASS | WARN | FAIL | BLOCKED | ERROR | NOT_APPLICABLE

示例:
  node aris-poc.js review --file scripts/aris-poc/review-loop.js
  node aris-poc.js review --file foo.js --focus correctness,security --max-rounds 2
  node aris-poc.js idea --json data/aris-demo/ideas.json --top-k 3
  node aris-poc.js verdict --score 7 --verdict PASS --reason "good code"
`.trim();

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function cmdReview(args) {
  const file = args.file;
  if (!file) {
    console.error('❌ --file <path> required');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }
  const body = fs.readFileSync(file, 'utf8');
  const subject = args.subject || path.basename(file);
  const focusAreas = args.focus ? String(args.focus).split(',').map(s => s.trim()) : undefined;
  const maxRounds = args['max-rounds'] ? parseInt(args['max-rounds'], 10) : undefined;
  const strategy = args.strategy;

  console.log(`\n🔍 Review: ${subject}`);
  console.log(`   File: ${file} (${body.length} chars)`);
  console.log(`   Focus: ${(focusAreas || 'all').join(',')}`);
  console.log(`   Max rounds: ${maxRounds || 4}`);
  console.log(`   Strategy: ${strategy || 'majority'}\n`);

  const opts = {};
  if (focusAreas) opts.focusAreas = focusAreas;
  if (maxRounds) opts.maxRounds = maxRounds;
  if (strategy) opts.aggregateStrategy = strategy;

  const result = reviewLoop.runReviewLoop({ subject, body }, opts);
  console.log(reviewLoop.formatReport(result));

  // 可选持久化
  if (args.save) {
    const p = reviewLoop.saveState(result, args.save);
    console.log(`\n💾 Saved state: ${p}`);
  }

  // Exit code：accepted = 0, 其他 = 1
  process.exit(result.status === 'accepted' ? 0 : 1);
}

function cmdIdea(args) {
  const jsonPath = args.json;
  if (!jsonPath) {
    console.error('❌ --json <path> required');
    process.exit(1);
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ JSON not found: ${jsonPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let candidates;
  try {
    candidates = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ JSON parse error: ${e.message}`);
    process.exit(1);
  }

  const opts = {};
  if (args['top-k']) opts.topK = parseInt(args['top-k'], 10);
  if (args.threshold) opts.positiveThreshold = parseFloat(args.threshold);
  if (args.direction) opts.direction = args.direction;

  const result = ideaDiscovery.discoverIdeas(candidates, opts);
  console.log(ideaDiscovery.formatReport(result, args.direction));
  process.exit(0);
}

function cmdVerdict(args) {
  const score = parseFloat(args.score);
  if (Number.isNaN(score)) {
    console.error('❌ --score <0-10> required (number)');
    process.exit(1);
  }
  const verdict = args.verdict;
  if (!verdict) {
    console.error('❌ --verdict <state> required');
    console.error('   states:', verdictMod.VERDICT_STATES.join(' | '));
    process.exit(1);
  }
  const v = verdictMod.makeVerdict({
    score,
    verdict,
    reason: args.reason || '',
    reviewer: args.reviewer || 'cli',
  });
  console.log(JSON.stringify(v, null, 2));
  console.log(`\n${verdictMod.formatVerdict(v)}`);
  console.log(`Next action: ${verdictMod.nextAction(v)}`);
  console.log(`Positive: ${verdictMod.isPositive(v)}`);
  console.log(`Stopping: ${verdictMod.isStopping(v)}`);
  process.exit(0);
}

function cmdDemo() {
  console.log('\n🎬 ARIS POC Demo — Cross-Model Review + Idea Discovery + 6-state Verdict\n');
  console.log('═'.repeat(70));

  // Demo 1: 6-state verdict
  console.log('\n📌 Demo 1: 6-state verdict contract');
  console.log('─'.repeat(70));
  const sampleVerdicts = [
    verdictMod.makeVerdict({ score: 8.5, verdict: 'PASS', reason: 'looks good', reviewer: 'demo-pass' }),
    verdictMod.makeVerdict({ score: 5.0, verdict: 'WARN', reason: 'has minor issues', reviewer: 'demo-warn' }),
    verdictMod.makeVerdict({ score: 3.0, verdict: 'FAIL', reason: 'missing tests', reviewer: 'demo-fail' }),
    verdictMod.makeVerdict({ score: 0, verdict: 'BLOCKED', reason: 'missing API key', reviewer: 'demo-blocked' }),
    verdictMod.makeVerdict({ score: 0, verdict: 'ERROR', reason: 'llm timeout', reviewer: 'demo-error' }),
    verdictMod.makeVerdict({ score: 0, verdict: 'NOT_APPLICABLE', reason: 'out of scope', reviewer: 'demo-na' }),
  ];
  for (const v of sampleVerdicts) {
    console.log(`  ${v.verdict.padEnd(15)} score=${String(v.score).padStart(4)}  positive=${String(v.positive).padEnd(5)}  next=${verdictMod.nextAction(v)}`);
  }

  // Demo 2: Cross-model review loop（评审 review-loop.js 自己）
  console.log('\n📌 Demo 2: Cross-model review loop (评审 review-loop.js 自己)');
  console.log('─'.repeat(70));
  const selfBody = fs.readFileSync(path.join(__dirname, 'review-loop.js'), 'utf8');
  const result = reviewLoop.runReviewLoop({
    subject: 'review-loop.js self-review',
    body: selfBody,
    meta: { allowConsole: false, testCount: 1 },
  }, { maxRounds: 2, focusAreas: ['correctness', 'security', 'style', 'performance', 'maintainability'] });
  console.log(`Status: ${result.status}`);
  console.log(`Total rounds: ${result.totalRounds}`);
  console.log(`Final: ${verdictMod.formatVerdict(result.finalVerdict)}`);
  console.log('\nLast round aggregated weaknesses:');
  const lastRound = result.rounds[result.rounds.length - 1];
  for (const w of lastRound.aggregated.weaknesses.slice(0, 5)) {
    console.log(`  ⚠️  ${w}`);
  }

  // Demo 3: Idea discovery（从 evolution-plan.json next 队列发现）
  console.log('\n📌 Demo 3: Idea discovery (从 evolution-plan.json next 队列评分)');
  console.log('─'.repeat(70));
  const planPath = path.join(__dirname, '..', '..', '.claude', 'skills', 'left-brain', 'memory', 'evolution-plan.json');
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const candidates = (plan.next || []).map((n, i) => ({
      id: n.id,
      title: n.title,
      description: n.note || '',
      priority: n.priority,
      keywords: n.title.split(/[-_/\s]+/).filter(w => w.length > 3),
      estimatedHours: 4,
      pocOnly: true,
    }));
    const ideaResult = ideaDiscovery.discoverIdeas(candidates, { topK: 5 });
    console.log(`📊 ${ideaResult.stats.total} 候选 → ${ideaResult.stats.ranked} 入榜（avg=${ideaResult.stats.avgScore}）\n`);
    for (const r of ideaResult.ranked) {
      console.log(`  #${r.rank}  ${r.label.padEnd(11)}  ${r.weighted.toFixed(2).padStart(5)}  ${r.idea.title}`);
    }
  }

  console.log('\n═'.repeat(70));
  console.log('✅ Demo complete\n');
  process.exit(0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  try {
    switch (cmd) {
      case 'review': return cmdReview(args);
      case 'idea': return cmdIdea(args);
      case 'verdict': return cmdVerdict(args);
      case 'demo': return cmdDemo();
      default:
        console.error(`❌ Unknown command: ${cmd}`);
        console.error('Run `node aris-poc.js help` for usage');
        process.exit(1);
    }
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

main();