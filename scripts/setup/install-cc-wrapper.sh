#!/bin/bash
# install-cc-wrapper.sh — 安装 cc 启动 wrapper（v2.0.0）
#
# 作用：把 ~/.bashrc 里的 `alias cc='claude'` 替换成函数
#   效果：cc 启动前自动显示项目顶部状态（Step 1-7）
#   然后才进 Claude Code 界面
#
# 可重入：脚本会自动检测是否已安装
# 可回滚：脚本会备份原 bashrc 到 ~/.bashrc.bak

set -e

BASHRC="$HOME/.bashrc"
BAK="$HOME/.bashrc.bak.$(date +%Y%m%d-%H%M%S)"
MARKER="# cc-wrapper-installed-by-aicode-v2.0.0"

# 检查是否已安装
if grep -q "$MARKER" "$BASHRC" 2>/dev/null; then
  echo "✅ 已经安装过 cc wrapper（标记：$MARKER）"
  echo "   位置: $BASHRC"
  echo "   如需重装：先手动删 $MARKER 那段"
  exit 0
fi

# 备份
cp "$BASHRC" "$BAK"
echo "📦 已备份原 bashrc: $BAK"

# 写入 wrapper 函数
cat >> "$BASHRC" <<EOF

$MARKER
# cc 启动前自动显示项目顶部状态（智能演进 + 自主模式）
cc() {
  if [ -f "H:/AI-han/AiCode/.claude/skills/left-brain/scripts/session-init.sh" ]; then
    bash H:/AI-han/AiCode/.claude/skills/left-brain/scripts/session-init.sh 2>&1 | head -30
  fi
  command claude "\$@"
}
EOF

echo "✅ cc wrapper 已写入 $BASHRC"
echo ""
echo "🚀 立即生效："
echo "   source ~/.bashrc"
echo ""
echo "📌 下次 cc 启动效果："
echo "   1. 终端顶部打印 30 行 session-init（Step 1-7 含自主模式状态）"
echo "   2. 才进入 Claude Code 界面"
echo ""
echo "🔙 回滚（如需）："
echo "   cp $BAK $BASHRC"