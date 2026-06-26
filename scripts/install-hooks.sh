#!/bin/bash
# scripts/install-hooks.sh
# 安装 doc-sync pre-commit hook（一次配置，永久生效）
#
# 用法：
#   bash scripts/install-hooks.sh
#
# 作用：
#   - 设置 git core.hooksPath 为 .githooks
#   - 让每次 git commit 自动跑 npm run doc:check
#   - doc:check 失败 → 拒绝 commit
#
# 仅本机配置（不入 git config 文件），团队成员各自跑一次

set -e

WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$WORKSPACE_ROOT"

if [ ! -d ".githooks" ]; then
  echo "❌ .githooks/ 目录不存在（应该在 scripts/install-hooks.sh 同级）"
  exit 1
fi

# 确保 .githooks/pre-commit 有执行权限
chmod +x .githooks/pre-commit

# 设置 core.hooksPath（仅本仓库）
git config core.hooksPath .githooks

echo "✅ Git hooks 已配置: core.hooksPath = .githooks"
echo ""
echo "现在每次 git commit 会自动跑:"
echo "  npm run doc:check (test-doc-sync.js 26 项测试)"
echo ""
echo "失败 → 拒绝 commit（防止 6 文档漂移）"
echo "跳过（不推荐）：git commit --no-verify"
echo ""
echo "💡 验证："
echo "  echo '测试' >> CHANGELOG.md"
echo "  git add CHANGELOG.md"
echo "  git commit -m test"
echo "  → 应该看到 doc:check 报错"
