#!/usr/bin/env node
/**
 * dispatcher.js 全量测试脚本
 * 跑 12 个测试用例验证规则引擎准确性
 */

const { decide } = require('./dispatcher');

const TESTS = [
  // 应该派子代理
  { input: '排查订单添加菜品失败 BUG，可能涉及后端 categoryId 校验和前端 el-select.placeholder', expected: true, desc: 'BUG 排查（跨模块）' },
  { input: '全面排查点餐系统 BUG，前后端一起分析', expected: true, desc: '全面排查（强信号）' },
  { input: '实现一个完整的用户登录功能，前端 Vue + 后端 Spring Boot + Redis 缓存', expected: true, desc: '全栈完整功能' },
  { input: '重构 UserService 和 OrderService，处理 N+1 查询问题', expected: true, desc: '重构（多模块）' },
  { input: '把数据库从 MySQL 迁移到 PostgreSQL，包括表结构改造和数据迁移脚本', expected: true, desc: '迁移任务' },
  { input: '同时分析前端 Vue 组件和后端 Controller 的代码', expected: true, desc: '并行分析（强信号）' },

  // 应该不派
  { input: '解释下 Java 的 CountDownLatch 怎么用', expected: false, desc: '解释概念' },
  { input: 'Spring Boot 和 Spring Cloud 有什么区别', expected: false, desc: '询问区别' },
  { input: '帮我快速修一下 LoginController 里的一个 bug', expected: false, desc: '快速修（强约束）' },
  { input: '只改一下 UserController 第 50 行那个 null 判断', expected: false, desc: '只改（强约束）' },
  { input: '推荐一个好用的 Java IDE', expected: false, desc: '推荐' },

  // 灰区（取决于具体阈值）
  { input: '分析一下 UserService 的代码质量', expected: false, desc: '灰区：单文件分析' },

  // v1.2 新增：中文口语化（不派）
  { input: '瞄一下这段代码', expected: false, desc: '口语化：瞄一下' },
  { input: '帮我扫一眼 LoginController', expected: false, desc: '口语化：扫一眼' },
  { input: '聊聊 Spring Boot 的好处', expected: false, desc: '口语化：聊聊' },
];

let pass = 0, fail = 0;
const results = [];

for (const t of TESTS) {
  const result = decide(t.input);
  const actual = result.dispatch === true;
  const ok = actual === t.expected;

  results.push({
    desc: t.desc,
    input: t.input,
    expected: t.expected ? '派' : '不派',
    actual: actual ? '派' : '不派',
    pass: ok,
    reason: result.reason,
    agents: result.agents,
  });

  if (ok) pass++; else fail++;
}

console.log('\n========================================');
console.log(`📊 测试结果: ${pass}/${TESTS.length} 通过, ${fail} 失败`);
console.log('========================================\n');

for (const r of results) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.desc}`);
  console.log(`   输入: ${r.input}`);
  console.log(`   期望: ${r.expected} | 实际: ${r.actual} | Agents: ${r.agents}`);
  console.log(`   理由: ${r.reason}\n`);
}

process.exit(fail > 0 ? 1 : 0);