#!/usr/bin/env node
/**
 * Layer 1 规则引擎（纯 Node.js，无外部依赖）
 * 输入：用户任务文本
 * 输出：{ dispatch: bool, agents: number, reason: string }
 *
 * @since v1.0.0 (2026-06-21) 智能调度 v1.1 上线
 * @changed v1.1.0 (2026-06-22) 批次 1:
 *   - 灰区加 suggested_action 字段
 *   - estimateFileCount 改累加权重
 *   - 扩充中文口语词（7 个）
 *   - 钩子异常加 errorType
 *   - learn-rules 加 bad/good 命令
 *   - RULES.version 字段
 * @changed v1.2.0 (2026-06-22) 批次 2:
 *   - detectTaskType 加英文 deploy/rollback
 *   - confidence 改 0-1 数字（high=0.9/medium=0.6/low=0.3）
 *   - index.js 统一入口串联 4 工具
 *   - learn-rules prompt hash 去重
 *   - 钩子写日志文件
 */

// ==================== 规则配置（内联，避免 YAML 依赖）====================

const RULES = {
  version: '1.2.0',
  updated: '2026-06-22',
  changelog: 'v1.2.0: 英文detect+confidence数字化+统一入口+去重+钩子日志',

  // 强信号：不派子代理
  dont_dispatch: {
    keywords: [
      '快速', '简单', '小', '只改', '一个一个',
      '先 X 再 Y',  // 强顺序依赖
      '帮我看下', '解释', '是什么', '为什么', '怎么用', '如何',
      '对比', '区别', '推荐', '建议',
      // 口语化中文动词（v1.2 新增）
      '看下', '瞄一下', '瞄瞄', '扫一眼', '聊聊', '说说', '讲讲',
    ],
    file_estimate_max: 2,
    module_estimate_max: 1,
    task_types: ['explanation', 'question', 'single_edit'],
  },

  // 强信号：派子代理
  should_dispatch: {
    keywords: [
      '全面', '彻底', '完整', '并行', '同时', '一起',
      '多模块', '跨模块', '全栈', '前后端一起',
      '全部分析',
    ],
    file_estimate_min: 5,
    module_estimate_min: 2,
    task_types: ['bug_fix', 'refactor', 'feature_full', 'migration', 'multi_module'],
    max_agents: 3,  // 你设定：最多 2-3 个
  },
};

// ==================== 工具函数 ====================

// v1.2: confidence 改 0-1 数字（high=0.9, medium=0.6, low=0.3）
const CONFIDENCE_MAP = { high: 0.9, medium: 0.6, low: 0.3 };
const confidence = (kind) => CONFIDENCE_MAP[kind] ?? 0.5;

function matchKeywords(text, keywords) {
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

/**
 * 估算任务涉及的 JavaScript 文件数量（基于关键词启发）
 * @param {string} text 用户任务文本 * @returns {number} 估算的文件数（1-10）
 */
function estimateFileCount(text) {
  // 显式提到文件路径
  const filePathPattern = /[\w\-]+\.(java|ts|js|vue|py|go|rs|tsx|jsx)/g;
  const fileMatches = text.match(filePathPattern) || [];

  // 关键词权重（累加而非 max，保留多模块信号的叠加效果）
  const fileKeywords = {
    '文件': 1, '模块': 2, '组件': 1, '页面': 1,
    '前后端': 3, '全栈': 5, '数据库': 2, '缓存': 1, '接口': 1,
  };

  let estimate = fileMatches.length;
  for (const [kw, weight] of Object.entries(fileKeywords)) {
    if (text.includes(kw)) {
      // 用累加：保留多关键词的叠加效果，但不超过权重上限（10）
      estimate = Math.min(10, estimate + Math.ceil(weight / 2));
    }
  }

  return estimate;
}

function estimateModuleCount(text) {
  const moduleKeywords = ['前端', '后端', '数据库', '缓存',
    'controller', 'service', 'dao', 'mapper', 'vue', 'react'];

  const modules = new Set();
  for (const kw of moduleKeywords) {
    if (text.toLowerCase().includes(kw.toLowerCase())) {
      modules.add(kw);
    }
  }

  return Math.max(modules.size, 1);
}

function detectTaskType(text) {
  const lower = text.toLowerCase();

  // v1.2: 英文部署/回滚（CI/CD 场景）
  if (/\b(deploy|rollback|rollout)\b/.test(lower)) return 'deployment';

  if (/解释|是什么|为什么|怎么(用|做|实现)|如何/.test(lower)) return 'explanation';
  if (/推荐|建议|区别|对比|哪个好/.test(lower)) return 'question';
  if (/修.*bug|fix.*bug|排查.*bug|修复.*bug/.test(lower)) return 'bug_fix';
  if (/重构|refactor/.test(lower)) return 'refactor';
  if (/添加.*功能|新增.*功能|实现.*功能|完整.*功能/.test(lower)) return 'feature_full';
  if (/迁移|migration/.test(lower)) return 'migration';
  if (/多模块|跨模块|前后端一起/.test(lower)) return 'multi_module';
  if (/优化|整理|清理/.test(lower)) return 'optimization';
  if (/分析|看看|排查|检查/.test(lower)) return 'analysis';
  if (/改一下|修改|调整|修一下/.test(lower)) return 'single_edit';

  return 'unknown';
}

// ==================== 核心决策 ====================

function decide(taskText) {
  // === 优先级最高：先检查"明确不派"的强约束（"快速/简单/只改"等） ===
  // 这些词的意图是"别搞复杂"，优先级必须高于任务类型判断
  const dontKw = matchKeywords(taskText, RULES.dont_dispatch.keywords);
  if (dontKw) {
    return {
      dispatch: false,
      agents: 0,
      reason: `命中"不派子代理"关键词: "${dontKw}"（用户明确要求简单处理）`,
      layer: 1,
      confidence: confidence('high'),
    };
  }

  // 阶段 1: 匹配 should_dispatch
  const dispatchKw = matchKeywords(taskText, RULES.should_dispatch.keywords);
  if (dispatchKw) {
    return {
      dispatch: true,
      agents: 2,
      reason: `命中"派子代理"关键词: "${dispatchKw}"`,
      layer: 1,
      confidence: confidence('high'),
    };
  }

  const fileCount = estimateFileCount(taskText);
  const moduleCount = estimateModuleCount(taskText);

  if (fileCount >= RULES.should_dispatch.file_estimate_min) {
    return {
      dispatch: true,
      agents: Math.min(3, Math.ceil(fileCount / 3)),
      reason: `预估涉及 ${fileCount} 个文件（≥${RULES.should_dispatch.file_estimate_min}）`,
      layer: 1,
      confidence: confidence('high'),
    };
  }

  if (moduleCount >= RULES.should_dispatch.module_estimate_min) {
    return {
      dispatch: true,
      agents: Math.min(3, moduleCount),
      reason: `预估涉及 ${moduleCount} 个模块`,
      layer: 1,
      confidence: confidence('high'),
    };
  }

  const taskType = detectTaskType(taskText);
  if (RULES.should_dispatch.task_types.includes(taskType)) {
    return {
      dispatch: true,
      agents: 2,
      reason: `任务类型 "${taskType}" 通常需要多角度分析`,
      layer: 1,
      confidence: confidence('medium'),
    };
  }

  // 阶段 2: 匹配 dont_dispatch（兜底，前面已经优先检查过了，这里再走一遍文件数检查）
  // fileCount 和 moduleCount 在阶段 1 已经声明过了，直接复用

  if (fileCount <= RULES.dont_dispatch.file_estimate_max) {
    return {
      dispatch: false,
      agents: 0,
      reason: `预估只涉及 ${fileCount} 个文件（≤${RULES.dont_dispatch.file_estimate_max}），不值得派`,
      layer: 1,
      confidence: confidence('medium'),
    };
  }

  if (RULES.dont_dispatch.task_types.includes(taskType)) {
    return {
      dispatch: false,
      agents: 0,
      reason: `任务类型 "${taskType}" 由主会话处理`,
      layer: 1,
      confidence: confidence('high'),
    };
  }

  // 阶段 3: 灰区 - 默认保守派 2 个 Agent
  return {
    dispatch: null,
    agents: 0,
    reason: `灰区任务: 文件数=${fileCount}, 模块数=${moduleCount}, 类型=${taskType}`,
    layer: 1,
    confidence: confidence('low'),
    gray_zone_data: { fileCount, moduleCount, taskType, text: taskText },
    suggested_action: {
      action: 'dispatch',
      agents: 2,
      hint: '灰区任务，保守派 2 个 Agent',
    },
  };
}

// ==================== 入口 ====================

if (require.main === module) {
  const taskText = process.argv.slice(2).join(' ');
  if (!taskText) {
    console.error('用法: node dispatcher.js "你的任务描述"');
    process.exit(1);
  }

  const result = decide(taskText);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { decide, estimateFileCount, estimateModuleCount, detectTaskType };
