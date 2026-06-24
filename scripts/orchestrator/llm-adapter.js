#!/usr/bin/env node
/**
 * LLM Adapter —— 标准接口 + 4 种 backend 实现
 *
 * 设计目的：
 *   - 暴露统一的 LLMAdapter 接口，未来接 Anthropic / Ollama / Claude CLI 都只需换 adapter
 *   - 启发式作为默认 backend（零成本、零依赖、确定性）
 *   - 失败降级：任何 LLM backend 失败时自动 fallback 到 heuristic
 *
 * 用法：
 *   const adapter = createAdapter();              // 根据 LLM_BACKEND 环境变量选择
 *   const result = await adapter.score(taskText, grayData);
 *
 * 环境变量：
 *   LLM_BACKEND=heuristic  (默认) | anthropic | ollama | cli
 *
 * @since v1.6.0 (2026-06-22) Tier 1 改造 T1.1
 */

const { heuristicScore } = require('./heuristic-scorer');

/**
 * LLMAdapter 接口（duck typing，无需继承）：
 *   - async score(taskText, grayData) → { scores, composite, reasons, backend }
 *   - string name                          // backend 名称
 */

// ==================== Heuristic Adapter（默认，零依赖）====================

class HeuristicAdapter {
  get name() { return 'heuristic'; }

  async score(taskText, grayData) {
    return heuristicScore(taskText, grayData);
  }

  /**
   * 启发式生成（零成本 fallback）
   * 根据 prompt 关键词返回模板化建议，不调用真实 LLM
   */
  async generate(prompt, opts = {}) {
    const p = (prompt || '').toLowerCase();
    const maxTokens = opts.maxTokens || 500;

    // test-coverage
    if (p.includes('test') || p.includes('测试') || p.includes('coverage')) {
      return {
        text: '建议为每个待测文件创建 `test-<basename>.js`，覆盖：\n1. 正常路径\n2. 边界条件\n3. 异常输入\n4. 与相邻模块的集成点\n\n优先补核心调度器、反射引擎、MCP server 的测试。',
        backend: this.name,
        tokens: { prompt: p.length, completion: 80 },
      };
    }

    // deps-outdated
    if (p.includes('depend') || p.includes('依赖') || p.includes('npm') || p.includes('version')) {
      return {
        text: '依赖升级建议：\n1. 先 `npm outdated` 看实际版本\n2. 只升级 patch/minor，major 版本需阅读 changelog\n3. 升级后跑 `npm test` 全量回归\n4. 关键依赖（如 MCP SDK） pinning 到精确版本',
        backend: this.name,
        tokens: { prompt: p.length, completion: 70 },
      };
    }

    // candidate-pending / implementation
    if (p.includes('implement') || p.includes('实现') || p.includes('candidate')) {
      return {
        text: '实现候选建议：\n1. 先阅读候选仓库 README 和核心入口\n2. 在 worktree 隔离环境中实验\n3. 写一个最小可运行 demo\n4. 通过后再合并到 main\n5. 补充测试和文档',
        backend: this.name,
        tokens: { prompt: p.length, completion: 75 },
      };
    }

    // 通用 fallback
    return {
      text: '建议：\n1. 明确问题范围\n2. 最小改动原则\n3. 补充测试\n4. 跑 `npm test` 验证\n5. 更新相关文档',
      backend: this.name,
      tokens: { prompt: p.length, completion: 40 },
    };
  }
}

// ==================== Anthropic Adapter（接口预留）====================

class AnthropicAdapter {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = opts.model || 'claude-haiku-4-5-20251001';  // 便宜快
    this.timeoutMs = opts.timeoutMs || 5000;
    if (!this.apiKey) {
      throw new Error('AnthropicAdapter 需要 ANTHROPIC_API_KEY 环境变量');
    }
  }

  get name() { return 'anthropic'; }

  async score(taskText, grayData) {
    // 接口预留：实际接入需 @anthropic-ai/sdk 依赖
    // 当前抛错 → 由工厂方法降级到 HeuristicAdapter
    throw new Error(
      '[AnthropicAdapter] 实际接入未启用（v1.6 仅保留接口）\n' +
      '  启用方式：npm install @anthropic-ai/sdk 并实现此方法\n' +
      '  或使用 cli adapter 通过 Claude Code CLI 调用'
    );
  }

  async generate(prompt, opts = {}) {
    throw new Error(
      '[AnthropicAdapter] generate 未启用\n' +
      '  启用方式：npm install @anthropic-ai/sdk，用 messages.create 实现 generate'
    );
  }
}

// ==================== Ollama Adapter（本地模型，接口预留）====================

class OllamaAdapter {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = opts.model || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    this.timeoutMs = opts.timeoutMs || 30000;
  }

  get name() { return 'ollama'; }

  async score(taskText, grayData) {
    throw new Error(
      '[OllamaAdapter] 实际接入未启用（v1.6 仅保留接口）\n' +
      '  启用方式：实现 POST ' + this.baseUrl + '/api/generate 调用\n' +
      '  或使用 cli adapter'
    );
  }

  async generate(prompt, opts = {}) {
    throw new Error(
      '[OllamaAdapter] generate 未启用\n' +
      '  启用方式：POST ' + this.baseUrl + '/api/generate'
    );
  }
}

// ==================== CLI Adapter（通过子进程调 Claude CLI，接口预留）====================

class CliAdapter {
  constructor(opts = {}) {
    this.command = opts.command || 'claude';
    this.timeoutMs = opts.timeoutMs || 30000;
  }

  get name() { return 'cli'; }

  async score(taskText, grayData) {
    throw new Error(
      '[CliAdapter] 实际接入未启用（v1.6 仅保留接口）\n' +
      '  启用方式：用 child_process.spawn 调 ' + this.command + ' -p "<prompt>"\n' +
      '  解析 stdout 提取 JSON 评分'
    );
  }

  async generate(prompt, opts = {}) {
    throw new Error(
      '[CliAdapter] generate 未启用\n' +
      '  启用方式：用 child_process.spawn 调 ' + this.command + ' -p "<prompt>" 并解析 stdout'
    );
  }
}

// ==================== 工厂方法 ====================

/**
 * 根据 LLM_BACKEND 环境变量创建 adapter
 * 默认 heuristic；任何 backend 创建失败 → 返回 HeuristicAdapter（永不抛错）
 */
function createAdapter(backendName) {
  const backend = (backendName || process.env.LLM_BACKEND || 'heuristic').toLowerCase();
  try {
    switch (backend) {
      case 'anthropic':
        return new AnthropicAdapter();
      case 'ollama':
        return new OllamaAdapter();
      case 'cli':
        return new CliAdapter();
      case 'heuristic':
      default:
        return new HeuristicAdapter();
    }
  } catch (e) {
    // 创建失败（缺 API key 等）→ 降级到 heuristic
    process.stderr.write(`[llm-adapter] ${backend} 创建失败，降级到 heuristic: ${e.message}\n`);
    return new HeuristicAdapter();
  }
}

/**
 * 带降级的 score 方法（推荐使用）
 *   - 任何 adapter 抛错 → 自动 fallback 到 heuristic
 *   - 永不抛错给调用方
 */
async function scoreWithFallback(taskText, grayData) {
  const adapter = createAdapter();
  try {
    return await adapter.score(taskText, grayData);
  } catch (e) {
    process.stderr.write(`[llm-adapter] ${adapter.name} 评分失败，降级到 heuristic: ${e.message}\n`);
    return heuristicScore(taskText, grayData);
  }
}

/**
 * 带降级的 generate 方法（推荐使用）
 *   - 任何 adapter 抛错 → 自动 fallback 到 HeuristicAdapter.generate
 *   - 永不抛错给调用方
 */
async function generateWithFallback(prompt, opts = {}) {
  const adapter = createAdapter();
  try {
    return await adapter.generate(prompt, opts);
  } catch (e) {
    process.stderr.write(`[llm-adapter] ${adapter.name} 生成失败，降级到 heuristic: ${e.message}\n`);
    return new HeuristicAdapter().generate(prompt, opts);
  }
}

module.exports = {
  HeuristicAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  CliAdapter,
  createAdapter,
  scoreWithFallback,
  generateWithFallback,
};
