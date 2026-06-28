// scripts/ui-skill-installer/v0-adapter.js
// M36A · v0.dev API stub（设计感补齐）
// 默认 heuristic fallback，M41 真实接入

const AESTHETIC_RULES = {
  landing:   { primaryColor: 'indigo-600', radius: 'xl', font: 'Inter', layout: 'hero-centered' },
  dashboard: { primaryColor: 'slate-900',  radius: 'lg', font: 'Inter', layout: 'sidebar-main' },
  chat:      { primaryColor: 'blue-500',   radius: '2xl', font: 'Inter', layout: 'message-stack' },
  admin:     { primaryColor: 'zinc-800',   radius: 'md', font: 'Inter', layout: 'data-table-dense' },
  portfolio: { primaryColor: 'emerald-600',radius: 'lg', font: 'Inter', layout: 'grid-cards' }
};

/**
 * V0Adapter stub
 * @param {string} scene 场景
 * @param {string} userInput 用户原始需求
 * @returns {{tokens: object, stub: true, source: 'heuristic'}}
 */
function generate(scene, userInput) {
  const safeScene = AESTHETIC_RULES[scene] ? scene : 'landing';
  const tokens = AESTHETIC_RULES[safeScene];
  return {
    stub: true,
    source: 'heuristic',
    scene: safeScene,
    tokens,
    note: '[STUB] v0.dev 真实接入留给 M41。当前基于场景启发式输出设计 token。',
    input: userInput
  };
}

module.exports = { generate, AESTHETIC_RULES };