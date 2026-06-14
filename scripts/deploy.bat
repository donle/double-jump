@echo off
REM =============================================================================
REM Double Jump — 一步部署脚本（Windows / PowerShell / CMD）
REM
REM 用法：
REM   scripts\deploy.bat            推送本地所有未提交修改 + 服务器重建 + 重启
REM   scripts\deploy.bat "fix xxx"  同上，commit 信息自定义
REM
REM 它会做：
REM   1. git add -A && commit（自定义 message 或默认 "deploy: update"）
REM   2. git push origin main
REM   3. SSH 到服务器 → 下载 tarball（绕过 github.com 封锁）→ ./deploy.sh local
REM
REM 前置：
REM   - PATH 里有 ssh / git
REM   - %USERPROFILE%\.ssh\double_jump_deploy（或 SSH_KEY_PATH 环境变量）
REM
REM 安全：
REM   - 用 StrictHostKeyChecking=accept-new（不是 no）。首次会接受并存到
REM     known_hosts，之后服务器密钥变了会拒接，避免 MITM。
REM   - 远程 tarball 解压用安全 flag（拒 .. 路径、拒越界 symlink）。
REM   - .env 备份走 mktemp + 600 + trap，结束即清。
REM
REM 关于"为什么不用 git pull"：
REM   - 京东云（以及大多数中国云）出口到 github.com 经常被墙 / 抖动
REM   - 但 codeload.github.com（Cloudflare CDN 上的 tarball 服务）通常能通
REM   - 所以服务器侧用 tarball 下载 + 解压替代 git pull
REM   - 代价：服务器上没有 .git 目录（只是部署目标，不需要）
REM =============================================================================

setlocal

set "SERVER=root@117.72.204.51"
set "REPO=donle/double-jump"
set "BRANCH=main"
set "SSH_KEY=%USERPROFILE%\.ssh\double_jump_deploy"
if not "%SSH_KEY_PATH%"=="" set "SSH_KEY=%SSH_KEY_PATH%"

set "KNOWN_HOSTS=%USERPROFILE%\.ssh\known_hosts"

set "MSG=%~1"
if "%MSG%"=="" set "MSG=deploy: update"

REM 早期校验 REPO/BRANCH 形态（防命令注入）。
REM /V 翻转：只接受 ^[A-Za-z0-9._/-]+$ —— 含其它字符或为空都被拒
echo %REPO% | findstr /R /V "^[A-Za-z0-9._/-]\{1,\}$" >nul && (
  echo bad REPO: %REPO%
  exit /b 1
)
echo %BRANCH% | findstr /R /V "^[A-Za-z0-9._/-]\{1,\}$" >nul && (
  echo bad BRANCH: %BRANCH%
  exit /b 1
)

echo.
echo === [1/3] git commit + push ===
echo.

git add -A
git diff --cached --quiet && (
  echo 没有未提交修改，直接进入部署
  goto push
)

git commit -m "%MSG%"
if errorlevel 1 (
  echo git commit 失败
  exit /b 1
)

:push
git push origin main
if errorlevel 1 (
  echo git push 失败
  exit /b 1
)

echo.
echo === [2/3] ssh 到服务器拉 tarball ===
echo.

REM 服务器走 codeload.github.com（CDN，国内能通）拉 tarball
REM 私有 .env 备份 + 安全解压 + 越界 symlink 拒绝 + 原子覆盖
REM 全部逻辑封装在远程 bash heredoc，避免本地 shell 解释任何变量。
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="%KNOWN_HOSTS%" %SERVER% "bash -s -- '%REPO%' '%BRANCH%'" 1>&2 <<'REMOTE'
set -euo pipefail

REPO="$1"
BRANCH="$2"
DEPLOY_DIR="/opt/double-jump"
ENV_FILE="$DEPLOY_DIR/.env"

# ---- 二次校验 ----
case "$REPO" in ''|*[!A-Za-z0-9._-]*/*[!A-Za-z0-9._-]*) echo "bad REPO: '$REPO'" >&2; exit 1 ;; esac
case "$BRANCH" in ''|*[!A-Za-z0-9._/-]*) echo "bad BRANCH: '$BRANCH'" >&2; exit 1 ;; esac

# ---- 私有 .env 备份 ----
BACKUP=""
cleanup() { [ -n "${BACKUP:-}" ] && [ -f "$BACKUP" ] && rm -f "$BACKUP" || true; }
trap cleanup EXIT
if [ -f "$ENV_FILE" ]; then
  BACKUP=$(mktemp /root/.env.bak.XXXXXX) || { echo "mktemp failed" >&2; exit 1; }
  chmod 600 "$BACKUP"
  cp -p "$ENV_FILE" "$BACKUP"
fi

# ---- 暂存目录 ----
STAGE=$(mktemp -d /root/dj-stage.XXXXXX) || { echo "mktemp -d failed" >&2; exit 1; }
chmod 700 "$STAGE"

# 下载（printf 显式 %s 拼接）
url=$(printf 'https://codeload.github.com/%s/tar.gz/refs/heads/%s' "$REPO" "$BRANCH")
curl -sSLf -o "$STAGE/repo.tar.gz" "$url"

# 安全解压（CentOS 7 tar 1.26 不认 --no-absolute-names，靠 -C + find 兜底）
tar --no-same-owner --no-same-permissions --no-acls --no-xattrs \
    -xzf "$STAGE/repo.tar.gz" -C "$STAGE" --strip-components=1

# 拒 .. 路径
if find "$STAGE" -mindepth 1 \( -name '..' -o -name '*../*' \) -print -quit | grep -q .; then
  echo "tarball contains '..' path components, refusing" >&2; exit 1
fi

# 拒绝对路径
if find "$STAGE" -mindepth 1 -printf '%p\n' | grep -E '^/'; then
  echo "tarball contains absolute paths, refusing" >&2; exit 1
fi

# 拒越界 symlink
badlink=$(find "$STAGE" -type l -printf '%l\n' | grep -E '^/|\.\./' || true)
if [ -n "$badlink" ]; then
  echo "tarball contains escaping symlinks: $badlink" >&2; exit 1
fi

rm -f "$STAGE/repo.tar.gz"

# 原子覆盖 DEPLOY_DIR（保留 .env）
mkdir -p "$DEPLOY_DIR"
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' -exec rm -rf {} +
cp -a "$STAGE"/. "$DEPLOY_DIR"/

# 恢复 .env
if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
  cp -p "$BACKUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

chmod +x "$DEPLOY_DIR/deploy.sh"

rm -rf "$STAGE"
cleanup
trap - EXIT

echo "拉取完成（$REPO @ $BRANCH）"
REMOTE

if errorlevel 1 (
  echo 服务器拉代码失败
  exit /b 1
)

echo.
echo === [3/3] 服务器构建 + 重启容器 ===
echo.

ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="%KNOWN_HOSTS%" %SERVER% "cd /opt/double-jump && ./deploy.sh local" 1>&2
if errorlevel 1 (
  echo 部署失败
  exit /b 1
)

echo.
echo === ✅ 部署完成 ===
echo 访问 http://117.72.204.51/
echo.
endlocal
