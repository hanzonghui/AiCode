#!/usr/bin/env node
/**
 * llm-fix-advisor.js — LLM 辅助 auto-fix 建议器（v2.0.1 智能增量 D 方案 B）
 *
 * 作用：对复杂修复维度（test-coverage / deps-outdated / candidate-pending）
 *       调用 LLM adapter 生成结构化建议，再交给 auto-fix 写入 proposal。
 *
 * 设计原则：
 *   - 默认启发式（零成本、零依赖）
 *   - 未来可切 ANTHROPIC_API_KEY 到真实模型
 *   - 任何 backend 失败都 fallback 到 heuristic
 *   - 永不 throw
 *
 * @since v2.0.1 (2026-06-25)
 * @source 04_自我演进路线.md §0.4 增量 D 方案 B
 */

const { generateWithFallback } = require('../llm-adapter');

/**
 * 构造 prompt
 * @param {string} dimension - test-coverage | deps-outdated | candidate-pending
 * @param {object} context - 该维度上下文
 */
function buildPrompt(dimension, context = {}) {
  const base = `你是 AiCode 工作空间的自动修复顾问。请针对以下问题给出简短、可执行的建议。`;

  switch (dimension) {
    case 'test-coverage': {
      const files = (context.missingTests || []).slice(0, 10);
      return `${base}
维度：测试覆盖率不足。
缺失测试的文件（${files.length} 个）：
${files.map(f => `- ${f}`).join('\n') || '（未提供具体文件）'}

请给出：
1. 应该优先补测试的 3 个文件及理由
2. 每个文件需要覆盖的关键场景
3. 写测试时应该 mock 的外部依赖`;
    }

    case 'deps-outdated': {
      const deps = (context.loosePinned || []).slice(0, 10);
      return `${base}
维度：依赖版本管理。
当前使用浮动版本的依赖（${deps.length} 个）：
${deps.map(([n, v]) => `- ${n}@${v}`).join('\n') || '（未提供具体依赖）'}

请给出：
1. 应该优先固定版本的依赖
2. 升级风险等级（高/中/低）
3. 验证升级后稳定性的步骤`;
    }

    case 'candidate-pending': {
      const c = context.candidate || {};
      return `${base}
维度：候选能力实现。
候选名称：${c.name || c.id || '未知'}
描述：${c.description || c.summary || '无描述'}
来源：${c.repo || c.url || '未知'}

请给出：
1. 实现该能力的最小步骤
2. 需要修改/新增的文件类型
3. 集成到现有工作空间时的注意事项`;
    }

    default:
      return `${base}\n维度：${dimension}\n上下文：${JSON.stringify(context, null, 2)}\n请给出可执行建议。`;
  }
}

/**
 * 获取 LLM 建议
 * @returns {{ok: boolean, dimension: string, advice: string, backend: string}}
 */
async function advise(dimension, context, opts = {}) {
  try {
    const prompt = buildPrompt(dimension, context);
    const result = await generateWithFallback(prompt, {
      maxTokens: opts.maxTokens || 500,
      temperature: opts.temperature || 0.3,
    });

    return {
      ok: true,
      dimension,
      advice: typeof result.text === 'string' ? result.text : JSON.stringify(result),
      backend: result.backend || 'unknown',
    };
  } catch (e) {
    return {
      ok: false,
      dimension,
      advice: `LLM 建议获取失败: ${e.message}`,
      backend: 'error',
    };
  }
}

module.exports = {
  buildPrompt,
  advise,
};
