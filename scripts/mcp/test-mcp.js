#!/usr/bin/env node
/**
 * MCP server 连接测试
 * 验证 filesystem / sqlite / fetch 三个 server 能正常启动和响应
 *
 * 用法：
 *   npm run test:mcp
 *   node scripts/mcp/test-mcp.js
 *
 * @since v1.7.0 (2026-06-22)
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

async function testServer(name, command, args, testFn) {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({ command, args });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    check(`${name}: 连接成功，tools 数量=${tools.tools?.length || 0}`, tools.tools?.length > 0);

    if (testFn) {
      await testFn(client);
    }

    await client.close();
    return true;
  } catch (e) {
    check(`${name}: 连接/调用失败`, false);
    console.error(`   ${e.message}`);
    try { await client.close(); } catch {}
    return false;
  }
}

(async () => {
  console.log('========================================');
  console.log('🔌 MCP server 连接测试');
  console.log('========================================\n');

  const root = process.cwd().replace(/\\/g, '/');

  // 1. filesystem
  await testServer(
    'filesystem',
    'npx',
    ['-y', '@modelcontextprotocol/server-filesystem', root],
    async (client) => {
      const result = await client.callTool({
        name: 'read_file',
        arguments: { path: path.join(root, 'package.json').replace(/\\/g, '/') },
      });
      const text = result.content?.[0]?.text || '';
      check('filesystem: 能读 package.json', text.includes('"name": "ai-workspace"'));
    }
  );

  // 2. sqlite
  const dbPath = path.join(root, 'data/workspace.db');
  // 测试 P0-3：父目录不存在时应自动创建
  const dbDir = path.dirname(dbPath);
  // Windows 上 rmSync 整个 data 目录可能 EPERM，只删测试 db 文件
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  } else if (fs.existsSync(dbDir)) {
    // 如果 db 文件不存在但目录存在，确保目录干净（不删目录本身）
    try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  await testServer(
    'sqlite',
    'node',
    [path.join(root, 'scripts/mcp/sqlite-server.js').replace(/\\/g, '/'), dbPath.replace(/\\/g, '/')],
    async (client) => {
      // 建表
      await client.callTool({
        name: 'execute',
        arguments: {
          sql: 'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)',
        },
      });
      await client.callTool({
        name: 'execute',
        arguments: { sql: "INSERT INTO test (name) VALUES ('hello')" },
      });
      const result = await client.callTool({
        name: 'query',
        arguments: { sql: 'SELECT * FROM test WHERE name = "hello"' },
      });
      const text = result.content?.[0]?.text || '';
      check('sqlite: 能读写数据库', text.includes('hello'));
    }
  );

  // 3. fetch
  await testServer(
    'fetch',
    'node',
    ['H:/AI-han/AiCode/scripts/mcp/fetch-server.js'],
    async (client) => {
      const result = await client.callTool({
        name: 'fetch',
        arguments: { url: 'https://example.com' },
      });
      const text = result.content?.[0]?.text || '';
      check('fetch: 能抓取 example.com', text.length > 0 && text.includes('Example'));
    }
  );

  console.log(`\n📊 MCP 测试: ${pass}/${pass + fail} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
