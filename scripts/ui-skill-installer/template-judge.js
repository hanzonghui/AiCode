// scripts/ui-skill-installer/template-judge.js
// M36A · 双轨选模板：关键词轨道 A（默认） + LLM-judge 轨道 B（可选）
// 复用 scripts/orchestrator/llm-adapter.js（存在则用）

const SCENE_KEYWORDS = {
  landing:    ['landing', 'marketing', 'hero', 'pricing', '首页', '落地页', '官网'],
  dashboard:  ['dashboard', 'admin', 'analytics', 'chart', '后台', '看板', '数据'],
  chat:       ['chat', 'chatbot', 'ai', 'message', '聊天', '对话', 'gpt'],
  admin:      ['admin', 'crm', 'manage', 'table', '管理', '用户'],
  portfolio:  ['portfolio', 'personal', 'blog', '作品', '个人', '简历']
};

/**
 * 轨道 A：关键词 TF-IDF 风格匹配
 * @param {string} userInput 用户原始需求（如 "做个 SaaS 后台"）
 * @param {Array}  templates  候选模板列表
 * @returns {{id: string, scene: string, score: number, reason: string}}
 */
function judgeByKeywords(userInput, templates) {
  const input = (userInput || '').toLowerCase();
  // 1. 先识别场景
  const sceneScores = {};
  for (const [scene, kws] of Object.entries(SCENE_KEYWORDS)) {
    sceneScores[scene] = kws.reduce((s, kw) => s + (input.includes(kw) ? 1 : 0), 0);
  }
  const bestScene = Object.entries(sceneScores).sort((a, b) => b[1] - a[1])[0];
  const detectedScene = bestScene[1] > 0 ? bestScene[0] : 'landing';
  // 2. 在该场景的模板中选 stars 最高（或 offline=false 优先）
  const candidates = templates.filter(t => t.scene === detectedScene);
  const pool = candidates.length > 0 ? candidates : templates;
  const sorted = pool.slice().sort((a, b) => {
    if (a.offline && !b.offline) return 1;
    if (!a.offline && b.offline) return -1;
    return (b.stars || 0) - (a.stars || 0);
  });
  const winner = sorted[0];
  return {
    id: winner.id, scene: detectedScene, score: bestScene[1],
    reason: `关键词匹配场景=${detectedScene}（命中 ${bestScene[1]} 个关键词）→ 选 ${winner.repo}/${winner.path}`
  };
}

/**
 * 轨道 B：LLM-judge（可选，失败降级到轨道 A）
 */
async function judgeByLLM(userInput, templates) {
  let llmAdapter;
  try {
    llmAdapter = require('../orchestrator/llm-adapter');
  } catch {
    return judgeByKeywords(userInput, templates);
  }
  try {
    const adapter = llmAdapter.createAdapter ? llmAdapter.createAdapter() : null;
    if (!adapter) return judgeByKeywords(userInput, templates);
    const prompt = `用户需求: ${userInput}\n候选模板:\n${templates.map(t => `- ${t.id}: ${t.description}`).join('\n')}\n返回最佳模板 ID（一行）`;
    const result = await adapter.generate(prompt, { maxTokens: 80 });
    const matchId = (result.text || '').trim().split('\n')[0];
    const matched = templates.find(t => t.id === matchId || matchId.includes(t.id));
    if (matched) {
      return { id: matched.id, scene: matched.scene, score: 10, reason: `LLM-judge 选 ${matched.id}` };
    }
  } catch { /* 降级 */ }
  return judgeByKeywords(userInput, templates);
}

/**
 * 入口：自动选择轨道
 */
async function judge(userInput, templates) {
  if (process.env.LLM_BACKEND === 'anthropic') {
    return judgeByLLM(userInput, templates);
  }
  return judgeByKeywords(userInput, templates);
}

module.exports = { judge, judgeByKeywords, judgeByLLM, SCENE_KEYWORDS };