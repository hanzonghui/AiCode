// scripts/ui-skill-installer/template-scaffolder.js
// M36A · 5 大场景的脚手架生成：复制组件 + 写 package.json + tailwind.config + tsconfig + 测试

const fs = require('fs');
const path = require('path');

const SCENE_TEMPLATES = {
  landing:   { repo: 'vercel/next.js',          path: 'examples/landing-page',     label: 'Landing Page',         deps: ['next@15', 'react@19', 'tailwindcss@4', 'lucide-react'] },
  dashboard: { repo: 'shadcn-ui/ui',            path: 'apps/www/registry/dashboard', label: 'Dashboard',           deps: ['next@15', 'react@19', 'tailwindcss@4', 'recharts', 'lucide-react'] },
  chat:      { repo: 'vercel/ai-chatbot',       path: 'components/chat',           label: 'AI Chat',              deps: ['next@15', 'react@19', 'tailwindcss@4', 'ai', '@ai-sdk/react'] },
  admin:     { repo: 'shadcn-ui/ui',            path: 'apps/v4/registry/admin',    label: 'Admin Panel',          deps: ['next@15', 'react@19', 'tailwindcss@4', 'react-hook-form', 'zod', '@tanstack/react-table'] },
  portfolio: { repo: 'vercel/next.js',          path: 'examples/portfolio',        label: 'Portfolio',            deps: ['next@15', 'react@19', 'tailwindcss@4', 'framer-motion'] }
};

/**
 * 生成脚手架到目标目录
 * @param {string} scene     landing/dashboard/chat/admin/portfolio
 * @param {string} targetDir 目标目录（必须不存在或为空）
 * @param {object} tokens    v0-adapter 输出的设计 token
 * @returns {{filesWritten: string[]}}
 */
function scaffold(scene, targetDir, tokens) {
  const tpl = SCENE_TEMPLATES[scene];
  if (!tpl) throw new Error(`未知场景: ${scene}（支持: ${Object.keys(SCENE_TEMPLATES).join(', ')}）`);
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`目标目录非空: ${targetDir}`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const written = [];

  // 1. package.json
  const pkg = {
    name: path.basename(targetDir),
    version: '0.1.0',
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'node test-init.js' }
  };
  pkg.dependencies = Object.fromEntries(tpl.deps.map(d => {
    // 支持 @scope/name@version 和 name@version 两种格式
    const m = d.match(/^(.+?)@(\d.+)$/);
    return [m ? m[1] : d, m ? `^${m[2]}` : 'latest'];
  }));
  writeFile(path.join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2), written);

  // 2. tailwind.config.ts（用 v0 tokens）
  const tw = `import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: { primary: '${tokens.primaryColor}' },
      borderRadius: { DEFAULT: '${tokens.radius}' }
    }
  },
  plugins: []
} satisfies Config;
`;
  writeFile(path.join(targetDir, 'tailwind.config.ts'), tw, written);

  // 3. tsconfig.json
  writeFile(path.join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] } },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules']
  }, null, 2), written);

  // 4. app/layout.tsx + app/page.tsx（场景化）
  const layout = `import './globals.css';
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
export const metadata = { title: '${tpl.label}' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh"><body className={inter.className}>{children}</body></html>;
}
`;
  writeFile(path.join(targetDir, 'app', 'layout.tsx'), layout, written);

  const page = pageForScene(scene, tokens);
  writeFile(path.join(targetDir, 'app', 'page.tsx'), page, written);

  // 5. globals.css
  writeFile(path.join(targetDir, 'app', 'globals.css'), `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`, written);

  // 6. test-init.js（验证 npm install && npm run build）
  const testInit = `// test-init.js · M36A 自动生成的脚手架验证
// 跑通 = npm install && npm run build 都成功
const { execSync } = require('child_process');
try {
  console.log('[test-init] npm install ...');
  execSync('npm install', { stdio: 'inherit', timeout: 180000 });
  console.log('[test-init] npm run build ...');
  execSync('npm run build', { stdio: 'inherit', timeout: 180000 });
  console.log('[test-init] ✅ 通过');
} catch (e) {
  console.error('[test-init] ❌ 失败:', e.message);
  process.exit(1);
}
`;
  writeFile(path.join(targetDir, 'test-init.js'), testInit, written);

  // 7. .gitignore
  writeFile(path.join(targetDir, '.gitignore'), `node_modules\n.next\n.DS_Store\n*.log\n`, written);

  // 8. README.md（场景说明）
  const readme = `# ${tpl.label}

> 🤖 **由 M36A ui-skill-installer 生成** · 源模板：\`${tpl.repo}/${tpl.path}\`
> 🎨 设计 token：\`${JSON.stringify(tokens)}\`

## 启动
\`\`\`bash
npm install
npm run dev
\`\`\`

## 测试
\`\`\`bash
node test-init.js
\`\`\`
`;
  writeFile(path.join(targetDir, 'README.md'), readme, written);

  return { filesWritten: written, scene, label: tpl.label, source: `${tpl.repo}/${tpl.path}` };
}

function pageForScene(scene, tokens) {
  const head = `export default function Page() { return (`;
  const tail = `); }`;
  if (scene === 'landing') return `${head}<main className="min-h-screen flex flex-col items-center justify-center p-24">
  <h1 className="text-6xl font-bold text-primary">Landing Page</h1>
  <p className="mt-4 text-xl text-gray-600">由 M36A ui-skill-installer 生成</p>
  <button className="mt-8 px-6 py-3 bg-primary text-white rounded-${tokens.radius}">立即开始</button>
</main>${tail}`;
  if (scene === 'dashboard') return `${head}<main className="min-h-screen p-8 bg-slate-50">
  <h1 className="text-3xl font-bold text-${tokens.primaryColor}">Dashboard</h1>
  <div className="mt-8 grid grid-cols-3 gap-4">{['用户', '订单', '收入'].map(k => <div key={k} className="p-6 bg-white rounded-${tokens.radius} shadow"><h3 className="text-sm text-gray-500">{k}</h3><p className="mt-2 text-2xl font-bold">--</p></div>)}</div>
</main>${tail}`;
  if (scene === 'chat') return `${head}<main className="min-h-screen flex flex-col p-8">
  <h1 className="text-3xl font-bold mb-4 text-${tokens.primaryColor}">AI Chat</h1>
  <div className="flex-1 overflow-y-auto p-4 bg-gray-50 rounded-${tokens.radius}">
    <div className="mb-2 p-3 bg-white rounded">👋 你好，我是 AI 助手</div>
  </div>
  <input className="mt-4 p-3 border rounded-${tokens.radius}" placeholder="输入消息..." />
</main>${tail}`;
  if (scene === 'admin') return `${head}<main className="min-h-screen p-8">
  <h1 className="text-3xl font-bold text-${tokens.primaryColor}">Admin Panel</h1>
  <table className="mt-8 w-full bg-white rounded-${tokens.radius} shadow">
    <thead><tr className="bg-gray-100"><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email</th></tr></thead>
    <tbody>{['Alice', 'Bob'].map(n => <tr key={n} className="border-t"><td className="p-3">{n}</td><td className="p-3">{n.toLowerCase()}@example.com</td></tr>)}</tbody>
  </table>
</main>${tail}`;
  if (scene === 'portfolio') return `${head}<main className="min-h-screen p-8">
  <h1 className="text-5xl font-bold text-${tokens.primaryColor}">My Portfolio</h1>
  <div className="mt-8 grid grid-cols-3 gap-6">{['Project A', 'Project B', 'Project C'].map(p => <div key={p} className="p-6 bg-white rounded-${tokens.radius} shadow hover:shadow-lg transition"><h3 className="font-bold">{p}</h3></div>)}</div>
</main>${tail}`;
  return `${head}<main className="p-8"><h1>${scene}</h1></main>${tail}`;
}

function writeFile(p, content, written) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  written.push(p);
}

module.exports = { scaffold, SCENE_TEMPLATES };