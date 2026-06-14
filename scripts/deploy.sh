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
#   3. SSH 到服务器 → 下载 tarball（绕过 github.com 封锁）→ ./deploy.sh local
#
# 前置：
#   - 仓库根目录运行
#   - ssh / git 在 PATH
#   - $HOME/.ssh/double_jump_deploy（或 SSH_KEY_PATH 环境变量）能登录 root@117.72.204.51
#
# 安全：
#   - 用 StrictHostKeyChecking=accept-new（不是 no）。首次连接会接受并存到
#     known_hosts，之后若服务器密钥变了会拒接，避免 MITM。
#
# 关于"为什么不用 git pull"：
#   - 京东云（以及大多数中国云）出口到 github.com 经常被墙 / 抖动
#   - 但 codeload.github.com（Cloudflare CDN 上的 tarball 服务）通常能通
#   - 所以服务器侧用 tarball 下载 + 解压替代 git pull
#   - 代价：服务器上没有 .git 目录（只是部署目标，不需要）
# =============================================================================

set -euo pipefail

SERVER="${SERVER:-root@117.72.204.51}"
REPO="${REPO:-donle/double-jump}"  # GitHub user/repo
BRANCH="${BRANCH:-main}"
SSH_KEY="${SSH_KEY_PATH:-$HOME/.ssh/double_jump_deploy}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$HOME/.ssh/known_hosts")
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
git push origin "$BRANCH"

echo
echo "=== [2/3] ssh 到服务器拉 tarball ==="
echo

# 服务器走 codeload.github.com（CDN，国内能通）拉 tarball
# 保留 .env（部署配置）—— 其他覆盖
ssh "${SSH_OPTS[@]}" "$SERVER" bash -s -- "$REPO" "$BRANCH" <<'REMOTE'
set -e
REPO="$1"
BRANCH="$2"
DEPLOY_DIR="/opt/double-jump"
ENV_FILE="$DEPLOY_DIR/.env"

# 备份 .env（如果存在）
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" /tmp/.env.bak

# 清空目录（保留 .ssh 等隐藏目录不动，但这里只有 .git 和代码，清干净更安全）
rm -rf "$DEPLOY_DIR"/* "$DEPLOY_DIR"/.[!.]* 2>/dev/null || true

# 下载并解压
curl -sSLf -o /tmp/repo.tar.gz \
  "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"
tar -xzf /tmp/repo.tar.gz -C "$DEPLOY_DIR" --strip-components=1
rm /tmp/repo.tar.gz

# 恢复 .env
[ -f /tmp/.env.bak ] && mv /tmp/.env.bak "$ENV_FILE"

# 恢复可执行权限
chmod +x "$DEPLOY_DIR/deploy.sh"

echo "拉取完成（$REPO @ $BRANCH）"
REMOTE

echo
echo "=== [3/3] 服务器构建 + 重启容器 ==="
echo

ssh "${SSH_OPTS[@]}" "$SERVER" \
  "cd /opt/double-jump && ./deploy.sh local"

echo
echo "=== ✅ 部署完成 ==="
echo "访问 http://117.72.204.51/"
