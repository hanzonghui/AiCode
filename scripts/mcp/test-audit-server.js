#!/usr/bin/env node
/**
 * MCP audit-server 测试
 *
 * 验证：
 *   - audit-server 能正常启动
 *   - listTools 返回 audit tool
 *   - audit/quick/json 返回结构化结果
 *   - audit/full/json 返回任务清单
 *
 * 用法：
 *   node scripts/mcp/test-audit-server.js
 *
 * @since v3.0.6 (2026-07-01) M54
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

async function withClient(testFn) {
  const root = process.cwd().replace(/\\/g, '/');
  const client = new Client({ name: 'audit-test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(root, 'scripts/mcp/audit-server.js').replace(/\\/g, '/')],
  });

  try {
    await client.connect(transport);
    await testFn(client);
    await client.close();
  } catch (e) {
    check('client 连接/调用失败', false);
    console.error(`   ${e.message}`);
    try { await client.close(); } catch {}
  }
}

(async () => {
  console.log('========================================');
  console.log('🔍 MCP audit-server 测试');
  console.log('========================================\n');

  await withClient(async (client) => {
    const tools = await client.listTools();
    check('listTools 返回 1 个 tool', tools.tools?.length === 1);
    check('tool 名称为 audit', tools.tools?.[0]?.name === 'audit');
    check('audit tool 支持 depth 参数',
      tools.tools?.[0]?.inputSchema?.properties?.depth?.enum?.includes('quick') &&
      tools.tools?.[0]?.inputSchema?.properties?.depth?.enum?.includes('full'));
  });

  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'audit',
      arguments: { depth: 'quick', format: 'json' },
    });
    check('quick/json 调用成功', !result.isError);

    let parsed;
    try {
      parsed = JSON.parse(result.content?.[0]?.text || '{}');
    } catch {
      parsed = {};
    }
    check('quick/json 结果含 profile', parsed.profile && typeof parsed.profile === 'object');
    check('quick/json 结果含版本号', typeof parsed.profile?.version === 'string');
    check('quick/json 结果含 gaps 数组', Array.isArray(parsed.gaps));
    check('quick/json 结果含 suggestions', parsed.suggestions && typeof parsed.suggestions === 'object');
  });

  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'audit',
      arguments: { depth: 'full', format: 'json' },
    });
    check('full/json 调用成功', !result.isError);

    let parsed;
    try {
      parsed = JSON.parse(result.content?.[0]?.text || '{}');
    } catch {
      parsed = {};
    }
    check('full/json 结果含 tasks 数组', Array.isArray(parsed.tasks) && parsed.tasks.length > 0);
    check('full/json 结果含 quickSummary', parsed.quickSummary && typeof parsed.quickSummary === 'object');
    check('task 含 id/name/paths/focus', parsed.tasks?.[0]?.id && parsed.tasks?.[0]?.name && Array.isArray(parsed.tasks?.[0]?.focus));
  });

  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'audit',
      arguments: { depth: 'quick', format: 'text' },
    });
    check('quick/text 调用成功', !result.isError);
    const text = result.content?.[0]?.text || '';
    check('quick/text 输出含"工程审计报告"', text.includes('工程审计报告'));
  });

  console.log(`\n📊 MCP audit-server 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
