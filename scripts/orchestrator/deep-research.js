#!/usr/bin/env node
/**
 * deep-research.js — 横纵双轴深度研究 CLI（M49 · hv-analysis 借鉴）
 *
 * 设计原则：
 *   - 借鉴核心 = 方法论（横纵双轴），不抄 PDF 输出
 *   - AiCode 风格：离线纯函数 + 模板驱动 + 数据收集清单
 *   - 不依赖 LLM：用户手工填数据 / 联网后粘入
 *   - 输出 3 段结构化 markdown 报告框架（纵向/横向/交汇）
 *
 * 用法：
 *   node deep-research.js analyze "Claude Code"            # 生成报告框架
 *   node deep-research.js analyze "Claude Code" --json     # 输出 JSON 结构
 *   node deep-research.js template "Claude Code"            # 输出空模板（待填数据）
 *   node deep-research.js from-data result.json             # 从 JSON 数据生成报告
 *
 * @since v3.0.7 (2026-06-29) — M49 deep-research 升级
 * @source 04_自我演进路线.md §0.4 增量 M49
 * @origin github.com/KKKKhazix/khazix-skills/hv-analysis
 */

const fs = require('fs');
const path = require('path');

// ── 方法论配置 ───────────────────────────────────────

const METHODOLOGY = {
  name: '横纵双轴分析（hv-analysis）',
  origin: '数字生命卡兹克（Khazix）+ 索绪尔历时-共时 + 商学院案例研究法 + 竞争战略分析',
  axes: {
    vertical: {
      name: '纵向分析（Diachronic / Longitudinal）',
      description: '沿时间轴，完整还原研究对象从诞生到现在的发展全貌',
      key_questions: [
        '起源追溯：诞生的背景、基于什么技术/理念/需求、创始团队',
        '诞生节点：首次发布/成立时间、最初形态',
        '演进历程：按时间顺序梳理所有关键节点',
        '决策逻辑：每个关键节点的"为什么"',
        '阶段划分：萌芽期/增长期/转型期',
      ],
      recommended_length: '6000-15000 字',
    },
    horizontal: {
      name: '横向分析（Synchronic / Cross-sectional）',
      description: '以当前时间点为切面，与同赛道竞品/同类进行全面对比',
      scenarios: {
        A: '无直接竞品 → 分析壁垒 + 间接替代方案',
        B: '少量竞品（1-2个）→ 逐一深入',
        C: '竞品充分（3+）→ 选 3-5 个代表性',
      },
      comparison_dimensions: [
        '核心差异：技术路线 / 商业模式 / 目标用户',
        '用户视角：口碑 / 体验 / 真实使用方式',
        '生态位：占据什么位置 / 填补什么空白',
        '趋势判断：机会 / 风险',
      ],
      recommended_length: '3000-10000 字',
    },
    intersection: {
      name: '横纵交汇洞察',
      description: '把纵向发展脉络和横向竞争格局结合，给出综合性新判断',
      core_questions: [
        '历史如何塑造了当下竞争位置',
        '竞品的纵向对比（起源和演变路径差异）',
        '优势的历史根源',
        '劣势的历史根源 / "好决策"变成"包袱"',
        '未来推演：3 个剧本（最可能 / 最危险 / 最乐观）',
      ],
      recommended_length: '1500-3000 字',
    },
  },
  total_range: '10,000 - 30,000 字',
  adopted_changes: [
    '砍掉 PDF 输出（WeasyPrint 不适合工程场景）',
    '砍掉"卡兹克文风"（个人公众号风格不适合工程文档）',
    '保留方法论：双轴 + 三段结构 + 子场景判断',
    '适配 AiCode 风格：纯函数 + 模板 + 用户填数据',
    // M49+3 (2026-06-30): 方法论闭环
    'M49+3 新增 "机遇/风险/痛点" 模块（来源：卡兹克公众号 Prompt）',
    'M49+3 新增 "分人群落地行动建议" 模块（来源：卡兹克公众号 Prompt）',
    '段位：4 段 (定义/纵向/横向/交汇) -> 6 段 (+ 机遇风险/行动建议)',
  ],
};

// ── 工具函数 ─────────────────────────────────────────

/**
 * 加载研究对象数据（缺失字段用 placeholder）
 */
function loadObject(name, data = null) {
  return {
    name,
    type: data?.type || '待确定（产品 / 公司 / 概念 / 人物 / 技术）',
    background: data?.background || `[待填] ${name} 的核心定位 / 一句话定义`,
    origin: data?.origin || '[待填] 起源时间 / 创始人 / 触发事件',
    timeline: data?.timeline || [],
    competitors: data?.competitors || [],
    advantage_roots: data?.advantage_roots || [],
    disadvantage_roots: data?.disadvantage_roots || [],
    future_scenarios: data?.future_scenarios || [],
    // M49+3: 方法论闭环 - 机遇/风险/痛点 + 行动建议
    pain_points: data?.pain_points || [],
    opportunities: data?.opportunities || [],
    risks: data?.risks || [],
    actions_by_persona: data?.actions_by_persona || {
      entrepreneur: '',
      practitioner: '',
      learner: '',
      investor: '',
    },
  };
}

/**
 * 生成纵向分析段（带占位符待用户填）
 */
function renderVertical(obj) {
  const lines = [
    `## 二、纵向分析：从诞生到当下`,
    ``,
    `**研究对象**：${obj.name}`,
    `**类型**：${obj.type}`,
    ``,
    `> **本段方法**：沿时间轴还原研究对象从诞生到现在的发展全貌。重点 5 维度：起源追溯 / 诞生节点 / 演进历程 / 决策逻辑 / 阶段划分。`,
    ``,
    `### 起源追溯`,
    `${obj.origin}`,
    ``,
    `### 诞生节点`,
    `[待填] 首次发布/成立时间、最初形态`,
    ``,
    `### 演进历程`,
  ];
  if (obj.timeline.length === 0) {
    lines.push('[待填] 按时间顺序的关键节点：版本更新 / 融资 / 团队变动 / 战略转型 / 用户里程碑');
  } else {
    obj.timeline.forEach((t, i) => {
      lines.push(`- **${t.date || '[日期]'}** ${t.event || '[事件]'}`);
    });
  }
  lines.push(``, `### 决策逻辑`, `[待填] 每个关键节点的"为什么这么选"`, ``,
    `### 阶段划分`, `[待填] 萌芽期 / 增长期 / 转型期 的核心矛盾`, ``,
    `**字数参考**：${METHODOLOGY.axes.vertical.recommended_length}`, ``);
  return lines.join('\n');
}

/**
 * 生成横向分析段
 */
function renderHorizontal(obj) {
  const lines = [
    `## 三、横向分析：竞争图谱`,
    ``,
    `> **本段方法**：以当前时间点为切面，对比同赛道竞品。`,
    ``,
    `### 竞品场景判断（先选一项）`,
    `- [ ] 场景 A：无直接竞品（全新品类 / 独占性极强）`,
    `- [ ] 场景 B：少量竞品（1-2 个）`,
    `- [x] 场景 C：竞品充分（3+） — 默认勾选，根据实际调整`,
    ``,
    `### 核心竞品列表`,
  ];
  if (obj.competitors.length === 0) {
    lines.push('[待填] 主要竞品名 + 一句话定位');
  } else {
    obj.competitors.forEach((c, i) => {
      lines.push(`${i + 1}. **${c.name || '[名称]'}** — ${c.description || '[一句话定位]'}`);
    });
  }
  lines.push(``, `### 对比维度`,
    `- **核心差异**：${METHODOLOGY.axes.horizontal.comparison_dimensions[0]}`,
    `- **用户视角**：${METHODOLOGY.axes.horizontal.comparison_dimensions[1]}`,
    `- **生态位**：${METHODOLOGY.axes.horizontal.comparison_dimensions[2]}`,
    `- **趋势判断**：${METHODOLOGY.axes.horizontal.comparison_dimensions[3]}`,
    ``,
    `### 详细对比分析`, `[待填] 每个主要竞品至少 1500 字独立分析`, ``,
    `**字数参考**：${METHODOLOGY.axes.horizontal.recommended_length}`, ``);
  return lines.join('\n');
}

/**
 * 生成横纵交汇段
 */
function renderIntersection(obj) {
  const lines = [
    `## 四、横纵交汇洞察`,
    ``,
    `> **本段方法**：纵向 + 横向交叉，产出新判断（不是前面内容的缩写版）。`,
    ``,
    `### 1. 历史如何塑造了当下竞争位置`,
    `[待填] 纵向中的哪些决策，决定了横向对比中的位置`,
    ``,
    `### 2. 竞品的纵向对比`,
    `[待填] 起源和演变路径差异如何导致今天各自特点`,
    ``,
    `### 3. 优势的历史根源`,
  ];
  if (obj.advantage_roots.length === 0) {
    lines.push('[待填] 每个核心优势追溯到历史上的哪个节点');
  } else {
    obj.advantage_roots.forEach((r, i) => {
      lines.push(`- **${r.advantage || '[优势]'}** ← 来自 ${r.historical_event || '[历史事件]'}`);
    });
  }
  lines.push(``, `### 4. 劣势的历史根源`,
    `[待填] "当初的好决策有没有变成今天的包袱"`, ``,
    `### 5. 未来推演（3 个剧本）`,
  );
  if (obj.future_scenarios.length === 0) {
    lines.push('- **最可能**：', '- **最危险**：', '- **最乐观**：');
  } else {
    obj.future_scenarios.forEach((s, i) => {
      const label = ['最可能', '最危险', '最乐观'][i] || `剧本${i + 1}`;
      lines.push(`- **${label}**：${s.scenario || '[剧本描述]'}`);
      if (s.support) lines.push(`  - 逻辑支撑：${s.support}`);
    });
  }
  lines.push(``, `**字数参考**：${METHODOLOGY.axes.intersection.recommended_length}`, ``);
  return lines.join('\n');
}
/**
 * 生成机遇/风险/痛点段 (M49+3: 方法论闭环)
 */
function renderOpportunitiesRisks(obj) {
  const lines = [
    `## 五、机遇 / 风险 / 痛点`,
    ``,
    `> **本段方法**: 在纵向 + 横向 + 交汇洞察的基础上, 归纳行业现存痛点、未来机遇、潜在风险. 这是"行业研究"的实用价值段, 区别于学术研究的纯描述.`,
    ``,
    `### 5.1 行业现存痛点 / 局限性`,
  ];
  if (obj.pain_points.length === 0) {
    lines.push('[待填] 行业尚未解决的核心痛点 + 现存局限性', '');
  } else {
    obj.pain_points.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.title || '[痛点]'}** -- ${p.detail || '[描述]'}`);
    });
    lines.push('');
  }
  lines.push(`### 5.2 未来增长机遇 / 增量市场`);
  if (obj.opportunities.length === 0) {
    lines.push('[待填] 增量市场空间 + 技术拐点 + 政策红利 + 用户需求未被满足的场景', '');
  } else {
    obj.opportunities.forEach((o, i) => {
      lines.push(`${i + 1}. **${o.title || '[机遇]'}** -- ${o.detail || '[描述]'}`);
    });
    lines.push('');
  }
  lines.push(`### 5.3 政策 / 技术 / 市场潜在风险`);
  if (obj.risks.length === 0) {
    lines.push('[待填] 政策风险 + 技术替代风险 + 市场萎缩风险 + 竞品打压风险', '');
  } else {
    obj.risks.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title || '[风险]'}** -- ${r.detail || '[描述]'} | 概率: ${r.probability || '?'} | 影响: ${r.impact || '?'}`);
    });
    lines.push('');
  }
  lines.push(`**字数参考**: 1000-3000 字 (行业研究必含维度)`, ``);
  return lines.join('\n');
}

/**
 * 生成落地行动建议段 (M49+3: 分人群)
 */
function renderActions(obj) {
  const lines = [
    `## 六、落地行动建议`,
    ``,
    `> **本段方法**: 基于全报告的综合洞察, 分 4 类典型人群给具体的"今天/本周/本月能做什么"建议. 不写空洞建议, 写"用什么工具、查什么资料、找谁聊、避什么坑".`,
    ``,
    `### 6.1 创业者 (entrepreneur)`,
    obj.actions_by_persona.entrepreneur || '[待填] 针对创业者的具体建议: 切入点 + 资源建议 + 避坑清单',
    ``,
    `### 6.2 从业者 (practitioner)`,
    obj.actions_by_persona.practitioner || '[待填] 针对从业者的具体建议: 技能升级 + 转型方向 + 人脉扩展',
    ``,
    `### 6.3 学习者 (learner)`,
    obj.actions_by_persona.learner || '[待填] 针对学习者的具体建议: 入门路径 + 必读书单 + 实战项目',
    ``,
    `### 6.4 投资人 (investor)`,
    obj.actions_by_persona.investor || '[待填] 针对投资人的具体建议: 评估维度 + 标的清单 + 退出时机',
    ``,
    `**字数参考**: 1000-2000 字 (4 类人群 * 200-500 字)`, ``];
  return lines.join('\n');
}

/**
 * 生成完整报告框架
 */
function generateReport(obj) {
  return [
    `# ${obj.name} 横纵分析报告`,
    ``,
    `> **方法论**：${METHODOLOGY.name}`,
    `> **生成时间**：${new Date().toISOString().slice(0, 10)}`,
    `> **研究对象类型**：${obj.type}`,
    `> **字数参考**：${METHODOLOGY.total_range}`,
    ``,
    `---`,
    ``,
    `## 一、一句话定义`,
    ``,
    obj.background,
    ``,
    `---`,
    ``,
    renderVertical(obj),
    `---`,
    ``,
    renderHorizontal(obj),
    `---`,
    ``,
    renderIntersection(obj),
    `---`,
    ``,
    renderOpportunitiesRisks(obj),
    `---`,
    ``,
    renderActions(obj),
    `---`,
    ``,
    `## 七、信息来源`,
    ``,
    `[待填] 所有引用 URL + 访问时间`,
    ``,
    `## 八、方法论说明`,
    ``,
    `${METHODOLOGY.origin}。本报告采用横纵双轴分析：纵向追时间深度，横向追同期广度，最后交叉两条轴产出洞察。M49+3 升级追加"机遇/风险/痛点"与"分人群落地行动建议"2 模块（方法论闭环）。来源：卡兹克公众号通用 Prompt。`,
  ].join('\n');
}

// ── CLI ──────────────────────────────────────────────

function analyzeCmd(name, args) {
  const obj = loadObject(name);
  const jsonIdx = args.indexOf('--json');
  if (jsonIdx >= 0) {
    console.log(JSON.stringify({
      methodology: METHODOLOGY.name,
      axes: {
        vertical: METHODOLOGY.axes.vertical.name,
        horizontal: METHODOLOGY.axes.horizontal.name,
        intersection: METHODOLOGY.axes.intersection.name,
      },
      object: obj,
    }, null, 2));
    return;
  }
  console.log(generateReport(obj));
}

function templateCmd(name) {
  // 输出空模板（更简洁，待用户填数据）
  console.log(`# ${name} 横纵分析模板\n`);
  console.log('## 一、基础信息（必填）');
  console.log('- 类型： [产品 / 公司 / 概念 / 人物]');
  console.log('- 一句话定义：');
  console.log('- 起源时间 / 创始人：');
  console.log('- 核心使命：');
  console.log('');
  console.log('## 二、纵向数据');
  console.log('### 关键节点（按时间）');
  console.log('| 日期 | 事件 | 决策原因 |');
  console.log('|------|------|---------|');
  console.log('| YYYY-MM | [事件1] | [原因] |');
  console.log('');
  console.log('## 三、横向数据');
  console.log('### 主要竞品');
  console.log('1. [竞品1] — [一句话定位]');
  console.log('2. [竞品2] — [一句话定位]');
  console.log('3. [竞品3] — [一句话定位]');
  console.log('');
  console.log('## 四、交汇洞察（基于上面数据推理）');
  console.log('### 优势历史根源');
  console.log('- [优势] ← 来自 [历史事件]');
  console.log('');
  console.log('### 劣势历史根源');
  console.log('- [劣势] ← 来自 [历史决策]');
  console.log('');
  console.log('### 未来 3 个剧本');
  console.log('- 最可能：');
  console.log('- 最危险：');
  console.log('- 最乐观：');
}

function fromDataCmd(jsonFile) {
  if (!fs.existsSync(jsonFile)) {
    console.error(`❌ 文件不存在: ${jsonFile}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const obj = loadObject(data.name, data);
  console.log(generateReport(obj));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const name = args[1];
  const rest = args.slice(2);
  return { cmd, name, args: rest };
}

function main() {
  const { cmd, name, args } = parseArgs();

  if (!cmd) {
    console.log(`\n📊 deep-research · 横纵双轴分析 CLI（M49）\n`);
    console.log(`用法：\n`);
    console.log(`  node deep-research.js analyze "对象名"            # 生成报告框架`);
    console.log(`  node deep-research.js analyze "对象名" --json     # 输出 JSON 结构`);
    console.log(`  node deep-research.js template "对象名"           # 输出空模板`);
    console.log(`  node deep-research.js from-data result.json       # 从 JSON 生成报告`);
    console.log(``);
    console.log(`示例：\n  node deep-research.js analyze "Claude Code"`);
    return;
  }

  if (cmd === 'analyze') {
    if (!name) {
      console.error('❌ 缺研究对象名');
      process.exit(1);
    }
    analyzeCmd(name, args);
  } else if (cmd === 'template') {
    if (!name) {
      console.error('❌ 缺研究对象名');
      process.exit(1);
    }
    templateCmd(name);
  } else if (cmd === 'from-data') {
    if (!name) {
      console.error('❌ 缺 JSON 文件路径');
      process.exit(1);
    }
    fromDataCmd(name);
  } else {
    console.error(`❌ 未知命令: ${cmd}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateReport, loadObject, renderVertical, renderHorizontal, renderIntersection, renderOpportunitiesRisks, renderActions, METHODOLOGY };
