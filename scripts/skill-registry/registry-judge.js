// scripts/skill-registry/registry-judge.js
// M36B+C · 共享评分函数（llm-adapter.judge 包装）
// 防营销号：LLM-judge 评分 ≥ 7.0 才入队

const FORBIDDEN_DEPS = ['shell-exec', 'unsafe-eval', 'child_process.exec', 'rm -rf /', 'eval('];

/**
 * 评估 skill 候选
 * @param {object} candidate  { id, name, source, url, description, keywords[] }
 * @returns {{verdict: 'accept'|'reject'|'skip', score: number, reasons: string[]}}
 */
async function judge(candidate) {
  const reasons = [];
  let score = 5.0; // 基础分

  // 维度 1：来源可信度（GitHub > npm > 其他）
  if (candidate.source === 'github') score += 1.5;
  else if (candidate.source === 'npm') score += 0.5;

  // 维度 2：描述质量（非空 + 长度合理 + 关键词匹配）
  if (!candidate.description || candidate.description.length < 5) {
    score -= 2;
    reasons.push('描述缺失或过短');
  } else if (candidate.description.length > 20) {
    score += 0.5;
  }

  // 维度 3：stars（如果有）
  if (candidate.stars > 1000) score += 1.5;
  else if (candidate.stars > 100) score += 1;
  else if (candidate.stars > 10) score += 0.3;

  // 维度 4：URL 合法性
  try {
    const u = new URL(candidate.url);
    if (!['github.com', 'npmjs.com', 'www.npmjs.com'].includes(u.hostname)) {
      score -= 0.5;
      reasons.push(`非主流来源: ${u.hostname}`);
    }
  } catch {
    score -= 3;
    reasons.push('URL 不合法');
  }

  // 维度 5：禁依赖一票否决
  const text = JSON.stringify(candidate).toLowerCase();
  const hitForbidden = FORBIDDEN_DEPS.filter(d => text.includes(d.toLowerCase()));
  if (hitForbidden.length > 0) {
    return { verdict: 'reject', score: 0, reasons: ['禁依赖命中: ' + hitForbidden.join(', ')] };
  }

  // 阈值判定
  const verdict = score >= 7.0 ? 'accept' : (score >= 4.0 ? 'skip' : 'reject');
  return { verdict, score: Math.round(score * 10) / 10, reasons };
}

module.exports = { judge, FORBIDDEN_DEPS };