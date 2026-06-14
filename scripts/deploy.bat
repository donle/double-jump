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
REM 保留 .env —— 其他覆盖
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="%KNOWN_HOSTS%" %SERVER% "DEPLOY_DIR=/opt/double-jump; ENV_FILE=\$DEPLOY_DIR/.env; cp \$ENV_FILE /tmp/.env.bak 2>/dev/null; rm -rf \$DEPLOY_DIR/* \$DEPLOY_DIR/.[!.]* 2>/dev/null; curl -sSLf -o /tmp/repo.tar.gz \"https://codeload.github.com/%REPO%/tar.gz/refs/heads/%BRANCH%\" && tar -xzf /tmp/repo.tar.gz -C \$DEPLOY_DIR --strip-components=1 && rm /tmp/repo.tar.gz; mv /tmp/.env.bak \$ENV_FILE 2>/dev/null; chmod +x \$DEPLOY_DIR/deploy.sh; echo 拉取完成（%REPO% @ %BRANCH%）" 1>&2
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
