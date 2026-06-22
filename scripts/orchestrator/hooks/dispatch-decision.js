#!/usr/bin/env node
/**
 * PreToolUse 钩子入口（优化版）
 * 触发：每次 Claude 调用工具前
 * 作用：判断任务复杂度，决定是否需要在日志中提示"建议派子代理"
 *
 * 设计原则：
 * 1. 必须快速（< 200ms）→ 不阻塞主会话
 * 2. 失败兜底 → 任何异常都返回"不派"，不影响主流程
 * 3. 输出 JSON 到 stdout（CC 会记录到日志）
 */

const path = require('path');
const fs = require('fs');
const { decide } = require(path.join(__dirname, '..', '..', 'orchestrator', 'dispatcher'));

// v1.2: 复用 token-monitor 的日志路径，统一一处
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dispatch-decisions.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// 从 stdin 读取 CC 传入的 hook 数据
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // 提取用户 prompt（不同事件格式不同）
    let prompt = '';
    if (data.tool_name === 'UserPromptSubmit') {
      prompt = data.tool_input?.prompt || '';
    } else if (data.tool_name) {
      // 其他工具调用 - 不分析（避免噪音）
      outputDecision(null, '非 UserPromptSubmit，跳过');
      return;
    }

    // 空 prompt / 太短 → 跳过
    if (!prompt || prompt.trim().length < 5) {
      outputDecision(null, 'Prompt 太短，跳过');
      return;
    }

    // 跑 Layer 1 规则引擎
    const decision = decide(prompt);
    outputDecision(decision, null, prompt);

  } catch (err) {
    // 任何异常都兜底为"不派"，但标记 errorType 让调用方区分
    outputDecision({
      dispatch: false,
      reason: `钩子异常: ${err.message}`,
      layer: 0,
      error: true,
      errorType: 'crash',  // 区分"调用失败"，决策为 false 时没有这个字段
    }, null, null, err.message);
  }
});

function outputDecision(decision, fallbackReason, prompt, errMsg) {
  if (decision === null) {
    // 不输出决策，避免噪音（但仍记录"跳过"事件，便于回溯）
    appendLog({ prompt: prompt?.substring(0, 100), skipped: true, reason: fallbackReason });
    process.exit(0);
  }

  // v1.2: 同步写日志文件（不影响主流程，appendFileSync 异步安全）
  appendLog({
    prompt: prompt?.substring(0, 100),
    decision,
    error: errMsg || null,
  });

  // 输出 JSON 到 stdout（CC 会记日志）
  console.log(JSON.stringify({
    hook: 'dispatch-decision',
    timestamp: new Date().toISOString(),
    ...decision,
  }, null, 2));

  // 钩子退出码：0 = 成功（不阻塞主流程）
  process.exit(0);
}

function appendLog(entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + '\n');
  } catch (e) {
    // 写日志失败不影响钩子主流程
    process.stderr.write(`[dispatch-decision] 日志写入失败: ${e.message}\n`);
  }
}