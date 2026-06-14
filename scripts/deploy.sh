#!/usr/bin/env bash
# =============================================================================
# Double Jump — 一步部署脚本（Git Bash / WSL / macOS / Linux）
#
# 用法：
#   scripts/deploy.sh              推送本地所有未提交修改 + 服务器重建 + 重启
#   scripts/deploy.sh "fix xxx"    同上，commit 信息自定义
#
# 它会做：
#   1. git add -A && commit
#   2. git push origin main
#   3. SSH 到服务器 → git pull → ./deploy.sh local
#
# 前置：
#   - 仓库根目录运行
#   - ssh / git 在 PATH
#   - $HOME/.ssh/double_jump_deploy（或 SSH_KEY_PATH 环境变量）能登录 root@117.72.204.51
# =============================================================================

set -euo pipefail

SERVER="${SERVER:-root@117.72.204.51}"
SSH_KEY="${SSH_KEY_PATH:-$HOME/.ssh/double_jump_deploy}"
MSG="${1:-deploy: update}"

# 必须在仓库根
cd "$(git rev-parse --show-toplevel)"

echo
echo "=== [1/3] git commit + push ==="
echo

git add -A
if git diff --cached --quiet; then
  echo "没有未提交修改，跳过 commit"
else
  git commit -m "$MSG"
fi
git push origin main

echo
echo "=== [2/3] ssh 到服务器拉代码 ==="
echo

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$SERVER" \
  "cd /opt/double-jump && git config core.filemode false && git pull --rebase"

echo
echo "=== [3/3] 服务器构建 + 重启容器 ==="
echo

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$SERVER" \
  "cd /opt/double-jump && ./deploy.sh local"

echo
echo "=== ✅ 部署完成 ==="
echo "访问 http://117.72.204.51/"
