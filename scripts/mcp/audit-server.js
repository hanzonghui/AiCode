#!/usr/bin/env node
/**
 * AiCode Audit MCP Server
 * 功能：把 /audit 能力暴露为 MCP tool
 *
 * 工具：
 *   - audit { depth?: 'quick'|'full', format?: 'text'|'json' }
 *
 * @since v3.0.6 (2026-07-01) M54 借鉴 prompt-optimizer MCP 服务化模式
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { execFileSync } = require('child_process');
const path = require('path');

process.env.MCP_SERVER_NAME = 'ai-audit-server';
const { safeCall } = require('./_shared');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');

const server = new Server(
  { name: 'ai-audit-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'audit',
        description: '对 AiCode 工程做只读健康审计：quick 模式 1-2 分钟输出结构化报告；full 模式生成深度调研任务清单（由外部 runtime 派子代理执行）',
        inputSchema: {
          type: 'object',
          properties: {
            depth: {
              type: 'string',
              enum: ['quick', 'full'],
              default: 'quick',
              description: 'quick: 浅层扫描; full: 生成深度调研任务清单',
            },
            format: {
              type: 'string',
              enum: ['text', 'json'],
              default: 'text',
              description: 'text: 人类可读报告; json: 结构化数据',
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'audit') {
    throw new Error(`未知工具: ${name}`);
  }

  return safeCall('audit', args, () => {
    const depth = args.depth || 'quick';
    const format = args.format || 'text';

    const scriptDir = path.join(WORKSPACE_ROOT, 'scripts', 'orchestrator', 'audit');
    const script = depth === 'full'
      ? path.join(scriptDir, 'full-audit.js')
      : path.join(scriptDir, 'quick-audit.js');

    const subCmd = format === 'json'
      ? 'json'
      : (depth === 'full' ? 'tasks' : 'run');

    const timeout = depth === 'full' ? 60000 : 300000; // full 生成任务清单很快

    const result = execFileSync('node', [script, subCmd], {
      encoding: 'utf8',
      cwd: WORKSPACE_ROOT,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
      content: [{ type: 'text', text: result }],
    };
  });
});

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  console.error('[audit-server] 启动失败:', e.message);
  process.exit(1);
});
