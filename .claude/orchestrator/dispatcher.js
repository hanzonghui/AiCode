#!/usr/bin/env node
/**
 * Layer 1 规则引擎
 * 输入：用户任务文本
 * 输出：{ dispatch: bool, agents: number, reason: string }
 *
 * 逻辑：
 * 1. 先匹配 should_dispatch 强信号
 * 2. 再匹配 dont_dispatch 强信号
 * 3. 都不命中 → 返回 null（灰区，交给 Layer 2 LLM 评分）
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 加载规则（支持 YAML 或 JSON）
function loadRules() {
  const rulesPath = path.join(__dirname, 'rules.yaml');
  const content = fs.readFileSync(rulesPath, 'utf8');
  return yaml.load(content);
}

// 关键词匹配（支持中英文）
function matchKeywords(text, keywords) {
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

// 估算涉及文件数（启发式）
function estimateFileCount(text) {
  // 显式提到文件路径
  const filePathPattern = /[\w\-]+\.(java|ts|js|vue|py|go|rs|tsx|jsx)/g;
  const fileMatches = text.match(filePathPattern) || [];

  // 关键词启发
  const fileKeywords = {
    '文件': 1,
    '模块': 2,
    '组件': 1,
    '页面': 1,
    '前后端': 3,
    '全栈': 5,
    '数据库': 2,
    '缓存': 1,
    '接口': 1,
  };

  let estimate = fileMatches.length;
  for (const [kw, weight] of Object.entries(fileKeywords)) {
    if (text.includes(kw)) {
      estimate = Math.max(estimate, weight);
    }
  }

  return estimate;
}

// 估算涉及模块数
function estimateModuleCount(text) {
  const moduleKeywords = {
    '前端': 1, '后端': 1, '数据库': 1, '缓存': 1,
    'controller': 1, 'service': 1, 'dao': 1, 'mapper': 1,
    'vue': 1, 'react': 1,
  };

  const modules = new Set();
  for (const kw of Object.keys(moduleKeywords)) {
    if (text.toLowerCase().includes(kw)) {
      modules.add(kw);
    }
  }

  return Math.max(modules.size, 1);
}

// 判断任务类型
function detectTaskType(text) {
  const lower = text.toLowerCase();

  if (/解释|是什么|为什么|怎么/.test(lower)) return 'explanation';
  if (/推荐|建议|区别|对比/.test(lower)) return 'question';
  if (/修.*bug|fix.*bug|排查.*bug/.test(lower)) return 'bug_fix';
  if (/重构|refactor/.test(lower)) return 'refactor';
  if (/添加.*功能|新增.*功能|实现.*功能/.test(lower)) return 'feature_full';
  if (/迁移|migration/.test(lower)) return 'migration';
  if (/优化|整理/.test(lower)) return 'optimization';
  if (/分析|看看|排查/.test(lower)) return 'analysis';
  if (/改一下|修改|调整/.test(lower)) return 'single_edit';

  return 'unknown';
}

// 核心决策函数
function decide(taskText) {
  const rules = loadRules();

  // ========== 阶段 1: 匹配 should_dispatch 强信号 ==========
  const dispatchKw = matchKeywords(taskText, rules.should_dispatch.keywords);
  if (dispatchKw) {
    return {
      dispatch: true,
      agents: 2,  // 默认派 2 个，后续可调整
      reason: `命中"派子代理"关键词: "${dispatchKw}"`,
      layer: 1,
      confidence: 'high',
    };
  }

  // 文件数/模块数硬阈值
  const fileCount = estimateFileCount(taskText);
  const moduleCount = estimateModuleCount(taskText);

  if (fileCount >= rules.should_dispatch.file_estimate_min) {
    return {
      dispatch: true,
      agents: Math.min(3, Math.ceil(fileCount / 3)),
      reason: `预估涉及 ${fileCount} 个文件（≥${rules.should_dispatch.file_estimate_min}）`,
      layer: 1,
      confidence: 'high',
    };
  }

  if (moduleCount >= rules.should_dispatch.module_estimate_min) {
    return {
      dispatch: true,
      agents: Math.min(3, moduleCount),
      reason: `预估涉及 ${moduleCount} 个模块`,
      layer: 1,
      confidence: 'high',
    };
  }

  // 任务类型匹配
  const taskType = detectTaskType(taskText);
  if (rules.should_dispatch.task_types.includes(taskType)) {
    return {
      dispatch: true,
      agents: 2,
      reason: `任务类型 "${taskType}" 通常需要多角度分析`,
      layer: 1,
      confidence: 'medium',
    };
  }

  // ========== 阶段 2: 匹配 dont_dispatch 强信号 ==========
  const dontKw = matchKeywords(taskText, rules.dont_dispatch.keywords);
  if (dontKw) {
    return {
      dispatch: false,
      agents: 0,
      reason: `命中"不派子代理"关键词: "${dontKw}"`,
      layer: 1,
      confidence: 'high',
    };
  }

  if (fileCount <= rules.dont_dispatch.file_estimate_max) {
    return {
      dispatch: false,
      agents: 0,
      reason: `预估只涉及 ${fileCount} 个文件（≤${rules.dont_dispatch.file_estimate_max}），不值得派`,
      layer: 1,
      confidence: 'medium',
    };
  }

  if (rules.dont_dispatch.task_types.includes(taskType)) {
    return {
      dispatch: false,
      agents: 0,
      reason: `任务类型 "${taskType}" 由主会话处理`,
      layer: 1,
      confidence: 'high',
    };
  }

  // ========== 阶段 3: 灰区，交给 Layer 2 ==========
  return {
    dispatch: null,  // 待 LLM 评分
    agents: 0,
    reason: `灰区任务: 文件数=${fileCount}, 模块数=${moduleCount}, 类型=${taskType}`,
    layer: 1,
    confidence: 'low',
    gray_zone_data: {
      fileCount,
      moduleCount,
      taskType,
      text: taskText,
    },
  };
}

// CLI 入口（测试用）
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
