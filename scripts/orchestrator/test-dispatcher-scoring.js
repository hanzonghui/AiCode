#!/usr/bin/env node
/**
 * dispatcher.js scoreComplexity 单元测试（v2.5.0 M9）
 *
 * 覆盖：
 *   - 0-10 数字范围
 *   - 三档分类（no_dispatch / gray_zone / dispatch）
 *   - breakdown 字段完整性
 *   - decide() 返回 complexity_score + complexity_band
 *   - 边界（钳制 0 和 10）
 */

const { scoreComplexity, decide, agentsFromScore, RULES } = require('./dispatcher');

let pass = 0, fail = 0;
const fails = [];

function assert(cond, name, detail) {
  if (cond) { pass++; }
  else {
    fail++;
    fails.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ==================== 1. 返回结构 ====================
section('scoreComplexity 返回结构');

{
  const r = scoreComplexity('解释下 Java');
  assert(typeof r === 'object', '返回 object');
  assert(typeof r.score === 'number', 'r.score 是 number');
  assert(typeof r.band === 'string', 'r.band 是 string');
  assert(['no_dispatch', 'gray_zone', 'dispatch'].includes(r.band), 'r.band 在三档之内', `band=${r.band}`);
  assert(typeof r.breakdown === 'object', 'r.breakdown 是 object');
  assert(typeof r.breakdown.fileCount === 'number', 'breakdown.fileCount');
  assert(typeof r.breakdown.moduleCount === 'number', 'breakdown.moduleCount');
  assert(typeof r.breakdown.taskType === 'string', 'breakdown.taskType');
}

// ==================== 2. 分数范围 ====================
section('分数范围 [0, 10]');

{
  const cases = [
    '简单看下',
    '全面排查多模块问题',
    '实现完整功能，前端 Vue + 后端 Spring Boot + 数据库表',
    'fix bug in userService',
    '推荐一个库',
  ];
  for (const t of cases) {
    const s = scoreComplexity(t).score;
    assert(s >= 0 && s <= 10, `分数在 0-10: "${t}"`, `score=${s}`);
  }
}

// ==================== 3. 三档阈值 ====================
section('三档阈值分类');

{
  // 明确 no_dispatch：含 dont_dispatch 关键词，文件/模块少
  const r1 = scoreComplexity('简单解释下 Spring Boot');
  assert(r1.band === 'no_dispatch', '简单解释 → no_dispatch', `band=${r1.band} score=${r1.score}`);

  const r2 = scoreComplexity('推荐一个好用的 Java IDE');
  assert(r2.band === 'no_dispatch', '推荐 → no_dispatch', `band=${r2.band} score=${r2.score}`);

  // 明确 dispatch：强信号词
  const r3 = scoreComplexity('全面排查订单模块 BUG');
  assert(r3.band === 'dispatch' || r3.band === 'gray_zone', '全面排查 → dispatch 或 gray_zone', `band=${r3.band} score=${r3.score}`);

  const r4 = scoreComplexity('实现完整登录功能，前端 Vue + 后端 Spring Boot + 数据库');
  assert(r4.band === 'dispatch', '全栈完整功能 → dispatch', `band=${r4.band} score=${r4.score}`);

  const r5 = scoreComplexity('前后端一起重构，前后端跨模块改');
  assert(r5.band === 'dispatch', '跨模块重构 → dispatch', `band=${r5.band} score=${r5.score}`);
}

// ==================== 4. 灰区 ====================
section('灰区分类');

{
  // 中等复杂任务，无强信号词也无弱信号词
  const r = scoreComplexity('分析 OrderService 的代码');
  assert(r.band === 'gray_zone' || r.band === 'no_dispatch', '单服务分析进入灰区或简单', `band=${r.band} score=${r.score}`);

  // 多服务无强信号词
  const r2 = scoreComplexity('重构 UserService 和 OrderService，处理 N+1 问题');
  assert(['gray_zone', 'dispatch'].includes(r2.band), '多服务重构进入灰区或派', `band=${r2.band} score=${r2.score}`);
}

// ==================== 5. 钳制边界 ====================
section('边界钳制');

{
  // 极简单任务分应接近 0
  const low = scoreComplexity('看下');
  assert(low.score <= RULES.scoring.no_dispatch_max, '极简单任务分 < 4', `score=${low.score}`);

  // 复杂任务分应接近 10
  const high = scoreComplexity('全面完整并行分析前端 Vue + 后端 Spring Boot + 数据库表结构 + 缓存 Redis + 多模块全栈重构跨模块');
  assert(high.score >= RULES.scoring.gray_zone_max + 1, '极复杂任务分 > 7', `score=${high.score}`);

  // 极端叠加：分数应被钳制到 10
  const extreme = scoreComplexity('全面完整并行全栈跨模块同时一起彻底重构前端 Vue 组件 后端 Spring Boot Controller Service DAO mapper database 缓存 Redis');
  assert(extreme.score === 10, '极端信号叠加钳制到 10', `score=${extreme.score}`);
}

// ==================== 6. 关键词影响 ====================
section('关键词权重');

{
  // 加 dont_dispatch 关键词应降分
  const base = scoreComplexity('OrderService 文件');
  const withSuppress = scoreComplexity('简单看下 OrderService 文件');
  assert(withSuppress.score <= base.score, 'dont_dispatch 关键词降分', `base=${base.score} suppressed=${withSuppress.score}`);

  // 加 should_dispatch 关键词应加分
  const withBoost = scoreComplexity('全面 OrderService 文件');
  assert(withBoost.score > base.score, 'should_dispatch 关键词加分', `base=${base.score} boosted=${withBoost.score}`);
}

// ==================== 7. 任务类型影响 ====================
section('任务类型影响');

{
  // bug_fix 类型应加分
  const plain = scoreComplexity('OrderService 文件');
  const bug = scoreComplexity('修 OrderService 文件的 bug');
  assert(bug.score >= plain.score, 'bug_fix 类型加分或持平', `plain=${plain.score} bug=${bug.score}`);

  // explanation 类型应降分
  const explain = scoreComplexity('解释 OrderService 文件');
  assert(explain.score <= plain.score, 'explanation 类型降分或持平', `plain=${plain.score} explain=${explain.score}`);
}

// ==================== 8. decide() 集成 ====================
section('decide() 集成 complexity_score');

{
  // 所有 decide 返回都应包含 complexity_score 和 complexity_band
  const cases = [
    '简单解释下',
    '修一下 UserService',
    '全面排查多模块问题',
    '分析下代码',
  ];
  for (const t of cases) {
    const r = decide(t);
    assert(typeof r.complexity_score === 'number', `decide 返回 complexity_score: "${t}"`, JSON.stringify(r));
    assert(typeof r.complexity_band === 'string', `decide 返回 complexity_band: "${t}"`, JSON.stringify(r));
  }
}

// ==================== 9. 一致性：decide 与 scoreComplexity 分数一致 ====================
section('decide vs scoreComplexity 一致性');

{
  const cases = [
    '修一下 UserService 的 bug',
    '全面排查',
    '推荐 IDE',
  ];
  for (const t of cases) {
    const d = decide(t);
    const s = scoreComplexity(t);
    assert(d.complexity_score === s.score, `分数一致: "${t}"`, `decide=${d.complexity_score} scoreComplexity=${s.score}`);
    assert(d.complexity_band === s.band, `分档一致: "${t}"`, `decide=${d.complexity_band} scoreComplexity=${s.band}`);
  }
}

// ==================== 10. CLI 输出 ====================
section('CLI 输出 complexity 字段');

{
  const { execFileSync } = require('child_process');
  const out = execFileSync('node', ['dispatcher.js', '全面排查多模块 BUG'], { encoding: 'utf8', stdio: 'pipe', cwd: __dirname });
  const parsed = JSON.parse(out);
  assert(typeof parsed.complexity_score === 'number', 'CLI 输出含 complexity_score', `out=${out.slice(0, 200)}`);
  assert(typeof parsed.complexity_band === 'string', 'CLI 输出含 complexity_band');
}

// ==================== 11. agentsFromScore ====================
section('agentsFromScore 按复杂度派 Agent');

{
  assert(agentsFromScore(0) === 0, 'score 0 → 0 agent');
  assert(agentsFromScore(1) === 1, 'score 1 → 1 agent');
  assert(agentsFromScore(3) === 1, 'score 3 → 1 agent');
  assert(agentsFromScore(4) === 2, 'score 4 → 2 agents');
  assert(agentsFromScore(6) === 2, 'score 6 → 2 agents');
  assert(agentsFromScore(7) === 3, 'score 7 → 3 agents');
  assert(agentsFromScore(9) === 3, 'score 9 → 3 agents');
  assert(agentsFromScore(10) === 3, 'score 10 受 max_agents=3 限制');
}

// ==================== 12. decide agents 与 score 一致 ====================
section('decide agents 动态跟随复杂度');

{
  // 命中 should_dispatch 关键词
  const r1 = decide('全面排查多模块问题');
  assert(r1.dispatch === true, '强信号任务 dispatch=true');
  assert(r1.agents === agentsFromScore(r1.complexity_score), '关键词命中 agents 由 score 决定', `agents=${r1.agents} score=${r1.complexity_score}`);

  // 任务类型匹配
  const r2 = decide('修一下 UserService 的 bug');
  if (r2.dispatch === true) {
    assert(r2.agents === agentsFromScore(r2.complexity_score), 'bug_fix 类型 agents 由 score 决定', `agents=${r2.agents} score=${r2.complexity_score}`);
  }

  // 灰区 suggested_action.agents
  const r3 = decide('分析 OrderService 的代码');
  if (r3.suggested_action) {
    assert(r3.suggested_action.agents === agentsFromScore(r3.complexity_score), '灰区 suggested_action.agents 由 score 决定', `agents=${r3.suggested_action.agents} score=${r3.complexity_score}`);
  }

  // 高分任务应派 3 个
  const r4 = decide('全面完整并行分析前端 Vue + 后端 Spring Boot + 数据库表结构 + 缓存 Redis + 多模块全栈重构跨模块');
  if (r4.dispatch === true) {
    assert(r4.agents === RULES.should_dispatch.max_agents, '极复杂任务派满 max_agents', `agents=${r4.agents}`);
  }
}

// ==================== 汇总 ====================
console.log('\n========================================');
console.log(`📊 scoreComplexity 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
console.log('========================================');
if (fail > 0) {
  console.log('\n失败项:');
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? '  → ' + f.detail : ''}`);
}
process.exit(fail > 0 ? 1 : 0);
