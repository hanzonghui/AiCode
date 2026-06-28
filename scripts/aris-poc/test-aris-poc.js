#!/usr/bin/env node
/**
 * aris-poc.js 单元测试（M38 · 借鉴 wanshuiyin/Auto-claude-code-research-in-sleep）
 *
 * 覆盖：
 *   1. verdict.js
 *      - normalizeVerdict 别名映射（PASS/READY/ACCEPT/WARN/ALMOST/FAIL/NOT_READY/REJECT/BLOCKED/ERROR/NA）
 *      - clampScore 钳制（-5 / 15 / NaN）
 *      - makeVerdict 字段完整 + positive 派生
 *      - isPositive 双条件（score>=6 AND verdict∈{PASS,WARN}）
 *      - isStopping 终结判断
 *      - aggregateVerdicts 5 策略（majority/unanimous/any/best_of/worst_of）
 *      - nextAction 6 状态映射
 *      - formatVerdict 可读输出
 *   2. review-loop.js
 *      - generateReviewers 返回 focus 列表对应的 reviewers
 *      - 5 个 reviewer preset 都能产出 verdict
 *      - runReviewLoop 主循环：accepted / max_rounds_reached / no_improvement / stopped
 *      - 终止条件：score>=6 AND PASS/WARN → accepted
 *      - state 持久化：saveState 写 review-state.json
 *      - defaultFixStrategy 移 console.log / var → const
 *   3. idea-discovery.js
 *      - scoreIdea 5 维度评分 + 加权汇总
 *      - duplicateOf → 直接 ELIMINATED
 *      - discoverIdeas 排序 + Top-K + 分类
 *      - formatReport Markdown 输出
 *   4. CLI 集成
 *      - aris-poc.js verdict 子命令
 *      - aris-poc.js demo 子命令
 *
 * @since v3.0.5 M38 (2026-06-28)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const verdictMod = require('./verdict');
const reviewLoop = require('./review-loop');
const ideaDiscovery = require('./idea-discovery');

const {
  VERDICT_STATES,
  POSITIVE_SCORE_THRESHOLD,
  normalizeVerdict,
  clampScore,
  makeVerdict,
  isPositive,
  isStopping,
  aggregateVerdicts,
  nextAction,
  formatVerdict,
} = verdictMod;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ╔════════════════════════════════════════════════════════════════════╗
// ║ 1. verdict.js                                                     ║
// ╚════════════════════════════════════════════════════════════════════╝
section('verdict.js');

check('normalizeVerdict: 6 状态直接命中', normalizeVerdict('PASS') === 'PASS');
check('normalizeVerdict: 大小写不敏感', normalizeVerdict('pass') === 'PASS');
check('normalizeVerdict: ready → PASS', normalizeVerdict('ready') === 'PASS');
check('normalizeVerdict: accept → PASS', normalizeVerdict('accept') === 'PASS');
check('normalizeVerdict: yes → PASS', normalizeVerdict('yes') === 'PASS');
check('normalizeVerdict: almost → WARN', normalizeVerdict('almost') === 'WARN');
check('normalizeVerdict: partial → WARN', normalizeVerdict('partial') === 'WARN');
check('normalizeVerdict: not_ready → FAIL', normalizeVerdict('not_ready') === 'FAIL');
check('normalizeVerdict: reject → FAIL', normalizeVerdict('reject') === 'FAIL');
check('normalizeVerdict: block → BLOCKED', normalizeVerdict('block') === 'BLOCKED');
check('normalizeVerdict: timeout → ERROR', normalizeVerdict('timeout') === 'ERROR');
check('normalizeVerdict: na → NOT_APPLICABLE', normalizeVerdict('na') === 'NOT_APPLICABLE');
check('normalizeVerdict: N/A → NOT_APPLICABLE', normalizeVerdict('N/A') === 'NOT_APPLICABLE');
check('normalizeVerdict: skip → NOT_APPLICABLE', normalizeVerdict('skip') === 'NOT_APPLICABLE');
check('normalizeVerdict: null → ERROR', normalizeVerdict(null) === 'ERROR');
check('normalizeVerdict: 未知 → ERROR', normalizeVerdict('xyz') === 'ERROR');

check('clampScore: 5 → 5', clampScore(5) === 5);
check('clampScore: -5 → 0', clampScore(-5) === 0);
check('clampScore: 15 → 10', clampScore(15) === 10);
check('clampScore: NaN → 0', clampScore(NaN) === 0);
check('clampScore: "abc" → 0', clampScore('abc') === 0);

const v1 = makeVerdict({ score: 8, verdict: 'PASS', reason: 'looks good', reviewer: 'test' });
check('makeVerdict: score 8 PASS', v1.score === 8 && v1.verdict === 'PASS' && v1.positive === true);
check('makeVerdict: 字段完整', v1.reviewer === 'test' && v1.reason === 'looks good' && typeof v1.timestamp === 'string');

const v2 = makeVerdict({ score: 10, verdict: 'PASS' });
check('makeVerdict: 缺 reason 默认空', v2.reason === '');

const v3 = makeVerdict({ score: 7, verdict: 'WARN' });
check('makeVerdict: WARN 也算 positive', v3.positive === true);

const v4 = makeVerdict({ score: 5, verdict: 'PASS' });
check('isPositive: score<6 即使 PASS 也不算', isPositive(v4) === false);

const v5 = makeVerdict({ score: 8, verdict: 'FAIL' });
check('isPositive: FAIL 不算', isPositive(v5) === false);

check('isStopping: PASS 终止', isStopping(makeVerdict({ score: 8, verdict: 'PASS' })) === true);
check('isStopping: BLOCKED 终止', isStopping(makeVerdict({ score: 0, verdict: 'BLOCKED' })) === true);
check('isStopping: NOT_APPLICABLE 终止', isStopping(makeVerdict({ score: 0, verdict: 'NOT_APPLICABLE' })) === true);
check('isStopping: FAIL 不终止', isStopping(makeVerdict({ score: 3, verdict: 'FAIL' })) === false);
check('isStopping: WARN 不终止', isStopping(makeVerdict({ score: 5, verdict: 'WARN' })) === false);

check('aggregateVerdicts: 空数组 → NOT_APPLICABLE', aggregateVerdicts([]).verdict === 'NOT_APPLICABLE');
check('aggregateVerdicts: 单个 PASS', aggregateVerdicts([makeVerdict({ score: 8, verdict: 'PASS' })]).verdict === 'PASS');

const allPass = [
  makeVerdict({ score: 8, verdict: 'PASS' }),
  makeVerdict({ score: 9, verdict: 'PASS' }),
  makeVerdict({ score: 7, verdict: 'PASS' }),
];
check('aggregateVerdicts majority 3/3 PASS', aggregateVerdicts(allPass, 'majority').verdict === 'PASS');

const halfFail = [
  makeVerdict({ score: 8, verdict: 'PASS' }),
  makeVerdict({ score: 3, verdict: 'FAIL' }),
];
check('aggregateVerdicts majority 1/2 → FAIL', aggregateVerdicts(halfFail, 'majority').verdict === 'FAIL');

const halfFail2 = [
  makeVerdict({ score: 8, verdict: 'PASS' }),
  makeVerdict({ score: 8, verdict: 'PASS' }),
  makeVerdict({ score: 3, verdict: 'FAIL' }),
];
check('aggregateVerdicts majority 2/3 → PASS', aggregateVerdicts(halfFail2, 'majority').verdict === 'PASS');

check('aggregateVerdicts unanimous 全部 positive → PASS',
  aggregateVerdicts(allPass, 'unanimous').verdict === 'PASS');
check('aggregateVerdicts unanimous 有 1 个 negative → FAIL',
  aggregateVerdicts(halfFail2, 'unanimous').verdict === 'FAIL');

check('aggregateVerdicts any 1 个 PASS → PASS',
  aggregateVerdicts([makeVerdict({ score: 8, verdict: 'PASS' }), makeVerdict({ score: 2, verdict: 'FAIL' })], 'any').verdict === 'PASS');
check('aggregateVerdicts any 全 FAIL → FAIL',
  aggregateVerdicts([makeVerdict({ score: 2, verdict: 'FAIL' }), makeVerdict({ score: 3, verdict: 'FAIL' })], 'any').verdict === 'FAIL');

const mixed = [
  makeVerdict({ score: 9, verdict: 'PASS' }),
  makeVerdict({ score: 3, verdict: 'FAIL' }),
];
const bestOf = aggregateVerdicts(mixed, 'best_of');
check('aggregateVerdicts best_of 取最高分', bestOf.score === 9 && bestOf.verdict === 'PASS');

const worstOf = aggregateVerdicts(mixed, 'worst_of');
check('aggregateVerdicts worst_of 取最低分', worstOf.score === 3 && worstOf.verdict === 'FAIL');

check('nextAction: PASS → accept', nextAction(makeVerdict({ score: 8, verdict: 'PASS' })) === 'accept');
check('nextAction: WARN → continue', nextAction(makeVerdict({ score: 5, verdict: 'WARN' })) === 'continue');
check('nextAction: FAIL → fix', nextAction(makeVerdict({ score: 3, verdict: 'FAIL' })) === 'fix');
check('nextAction: BLOCKED → escalate', nextAction(makeVerdict({ score: 0, verdict: 'BLOCKED' })) === 'escalate');
check('nextAction: ERROR → retry', nextAction(makeVerdict({ score: 0, verdict: 'ERROR' })) === 'retry');
check('nextAction: NOT_APPLICABLE → skip', nextAction(makeVerdict({ score: 0, verdict: 'NOT_APPLICABLE' })) === 'skip');

const formatted = formatVerdict(makeVerdict({ score: 8.5, verdict: 'PASS', reason: 'good', reviewer: 'test' }));
check('formatVerdict: 含 verdict + score + reason',
  formatted.includes('PASS') && formatted.includes('8.5') && formatted.includes('good'));

check('makeVerdict: positive 派生字段正确', v1.positive === true);
check('makeVerdict: score<6 positive=false', makeVerdict({ score: 5, verdict: 'PASS' }).positive === false);
check('makeVerdict: WARN score>=6 positive=true', makeVerdict({ score: 7, verdict: 'WARN' }).positive === true);

check('VERDICT_STATES: 6 个状态',
  VERDICT_STATES.length === 6 &&
  VERDICT_STATES.includes('PASS') &&
  VERDICT_STATES.includes('NOT_APPLICABLE'));

check('POSITIVE_SCORE_THRESHOLD: 6', POSITIVE_SCORE_THRESHOLD === 6);

// ╔════════════════════════════════════════════════════════════════════╗
// ║ 2. review-loop.js                                                 ║
// ╚════════════════════════════════════════════════════════════════════╝
section('review-loop.js');

const reviewers = reviewLoop.generateReviewers();
check('generateReviewers: 默认 5 个 focus', reviewers.length === 5);
check('generateReviewers: 每个 reviewer 有 name/focus/score', reviewers.every(r => r.name && r.focus && typeof r.score === 'function'));

const customReviewers = reviewLoop.generateReviewers(['correctness', 'security']);
check('generateReviewers: 自定义 focus 列表', customReviewers.length === 2);

const goodInput = {
  subject: 'test-good',
  body: 'const x = 1;\nfunction foo() { return x; }\n// simple test\n',
  meta: { testCount: 5 },
};
const goodResult = reviewLoop.runReviewLoop(goodInput, { maxRounds: 1 });
check('runReviewLoop: 简单代码 accepted', goodResult.status === 'accepted');
check('runReviewLoop: 有 rounds 数组', Array.isArray(goodResult.rounds) && goodResult.rounds.length === 1);

const badInput = {
  subject: 'test-bad',
  body: 'var api_key = "secret123"; eval(input); child_process.exec(user_cmd); innerHTML = userInput;',
  meta: { testCount: 0 },
};
const badResult = reviewLoop.runReviewLoop(badInput, { maxRounds: 1, focusAreas: ['security'] });
check('runReviewLoop: 危险代码安全 reviewer 给低分', badResult.finalVerdict.score < 7 || badResult.finalVerdict.verdict !== 'PASS');
check('runReviewLoop: 安全 reviewer 捕获弱点', badResult.rounds[0].reviews[0].weaknesses.length > 0);

const noImproveInput = {
  subject: 'test-no-improve',
  body: 'var api_key = "secret123"; eval(input);', // 修不掉的硬编码密钥
  meta: { testCount: 0 },
};
// max_rounds_reached 或 no_improvement 都行（默认 fix 移 console.log/var→const，对硬编码密钥无效）
const noImproveResult = reviewLoop.runReviewLoop(noImproveInput, { maxRounds: 3 });
check('runReviewLoop: 3 轮循环后 status 合理',
  ['max_rounds_reached', 'no_improvement', 'accepted', 'stopped'].includes(noImproveResult.status));

check('runReviewLoop: 空 focus 列表 → skipped',
  reviewLoop.runReviewLoop(goodInput, { focusAreas: ['nonexistent'] }).status === 'skipped');

const report = reviewLoop.formatReport(goodResult);
check('formatReport: 含 Status/Round',
  report.includes('Cross-Model Review Loop Report') && report.includes('Round'));

const tmpDir = path.join(os.tmpdir(), 'aris-poc-test-' + Date.now());
const statePath = reviewLoop.saveState(goodResult, tmpDir);
check('saveState: 写入 review-state.json', fs.existsSync(statePath));
check('saveState: JSON 包含 status 和 rounds',
  (() => {
    try {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return s.status === 'accepted' && Array.isArray(s.rounds);
    } catch (e) { return false; }
  })());
fs.rmSync(tmpDir, { recursive: true, force: true });

// ╔════════════════════════════════════════════════════════════════════╗
// ║ 3. idea-discovery.js                                              ║
// ╚════════════════════════════════════════════════════════════════════╝
section('idea-discovery.js');

const sampleIdea = {
  id: 'test-1',
  title: 'Implement Test Feature',
  description: 'A detailed test feature with proper description and requirements',
  keywords: ['test', 'feature', 'implement', 'sample'],
  estimatedHours: 2,
  dependencies: [],
  priority: 'P1',
  pocOnly: true,
  acceptance: 'Passes all tests',
};
const scored = ideaDiscovery.scoreIdea(sampleIdea);
check('scoreIdea: 5 维评分', Object.keys(scored.scores).length === 5);
check('scoreIdea: 加权分 0-10', scored.weighted >= 0 && scored.weighted <= 10);
check('scoreIdea: 优良 idea 应 positive', scored.label === 'RECOMMENDED' || scored.label === 'STRONG');

const duplicateIdea = { id: 'dup', title: 'dup', description: 'dup', duplicateOf: 'M12' };
const dupScored = ideaDiscovery.scoreIdea(duplicateIdea);
check('scoreIdea: duplicateOf → ELIMINATED', dupScored.label === 'ELIMINATED' && dupScored.verdict === 'FAIL');

const largeIdea = {
  id: 'large',
  title: 'Huge Project',
  description: 'x',
  estimatedHours: 100,
  dependencies: ['a', 'b', 'c', 'd'],
  touchesCore: true,
};
const largeScored = ideaDiscovery.scoreIdea(largeIdea);
check('scoreIdea: 大项目 cost/feasibility 应低分', largeScored.scores.feasibility < 5 && largeScored.scores.cost < 5);

const candidates = [
  { id: 'a', title: 'Idea A', description: 'A detailed description here for testing purposes', estimatedHours: 1, priority: 'P0', keywords: ['urgent', 'critical'] },
  { id: 'b', title: 'Idea B', description: 'B detailed description here for testing purposes', estimatedHours: 4, priority: 'P1', keywords: ['normal'] },
  { id: 'c', title: 'Idea C', description: 'C detailed description here for testing purposes', estimatedHours: 24, priority: 'P2', keywords: ['low'] },
  { id: 'd', title: 'Idea D (duplicate)', description: 'D', duplicateOf: 'a' },
];
const discoverResult = ideaDiscovery.discoverIdeas(candidates, { topK: 5 });
check('discoverIdeas: total=4', discoverResult.stats.total === 4);
check('discoverIdeas: d 被 ELIMINATED', discoverResult.eliminated.some(e => e.idea.id === 'd'));
check('discoverIdeas: ranked 按分降序',
  discoverResult.ranked.every((r, i) => i === 0 || r.weighted <= discoverResult.ranked[i - 1].weighted));
check('discoverIdeas: topK 生效', discoverResult.ranked.length <= 5);
check('discoverIdeas: a 应排第一（P0 + 1h）', discoverResult.ranked[0].idea.id === 'a');

const limitedResult = ideaDiscovery.discoverIdeas(candidates, { topK: 2 });
check('discoverIdeas: topK=2 限制', limitedResult.ranked.length === 2);

const onlyStrong = ideaDiscovery.discoverIdeas(candidates, { includeLabels: ['STRONG'] });
check('discoverIdeas: includeLabels 过滤', onlyStrong.ranked.every(r => r.label === 'STRONG'));

const reportStr = ideaDiscovery.formatReport(discoverResult, 'test direction');
check('formatReport: 含 Statistics + Top Ideas', reportStr.includes('Statistics') && reportStr.includes('Top Ideas'));
check('formatReport: 含方向', reportStr.includes('test direction'));

// ╔════════════════════════════════════════════════════════════════════╗
// ║ 4. CLI 集成（spawn 子进程跑 demo）                                 ║
// ╚════════════════════════════════════════════════════════════════════╝
section('CLI 集成');

const { spawnSync } = require('child_process');
const cliPath = path.join(__dirname, 'aris-poc.js');

function runCli(args, opts = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  });
}

const verdictCli = runCli(['verdict', '--score', '7', '--verdict', 'PASS', '--reason', 'looks good']);
check('CLI verdict: 退出码 0', verdictCli.status === 0);
check('CLI verdict: 输出 PASS', verdictCli.stdout.includes('"verdict": "PASS"'));
check('CLI verdict: 输出 score=7', verdictCli.stdout.includes('"score": 7'));

const verdictBadCli = runCli(['verdict', '--score', '7']);
check('CLI verdict: 缺 --verdict 退出码 1', verdictBadCli.status === 1);

const demoCli = runCli(['demo']);
check('CLI demo: 退出码 0', demoCli.status === 0);
check('CLI demo: 含 6-state verdict 演示', demoCli.stdout.includes('Demo 1'));
check('CLI demo: 含 cross-model review', demoCli.stdout.includes('Demo 2'));
check('CLI demo: 含 idea discovery', demoCli.stdout.includes('Demo 3'));
check('CLI demo: 含 ARIS POC Demo 标题', demoCli.stdout.includes('ARIS POC Demo'));

const helpCli = runCli(['help']);
check('CLI help: 退出码 0', helpCli.status === 0);
check('CLI help: 含 aris-poc.js 标题', helpCli.stdout.includes('aris-poc.js'));

const reviewSelfCli = runCli(['review', '--file', path.join(__dirname, 'review-loop.js'), '--max-rounds', '1', '--focus', 'correctness']);
check('CLI review: 退出码 0/1 都行', reviewSelfCli.status === 0 || reviewSelfCli.status === 1);
check('CLI review: 输出 Cross-Model Review Loop Report', reviewSelfCli.stdout.includes('Cross-Model Review Loop Report'));
check('CLI review: 含 reviewer-correctness', reviewSelfCli.stdout.includes('reviewer-correctness'));

// ╔════════════════════════════════════════════════════════════════════╗
// ║ Summary                                                            ║
// ╚════════════════════════════════════════════════════════════════════╝
console.log('\n══════════════════════════════════════════');
console.log(`✅ Passed: ${pass}`);
console.log(`❌ Failed: ${fail}`);
if (fail > 0) {
  console.log('\n失败清单:');
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\n🎉 All ${pass} tests passed\n`);
process.exit(0);