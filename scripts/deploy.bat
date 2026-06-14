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
REM   3. SSH 到服务器 → git pull → ./deploy.sh local
REM
REM 前置：
REM   - PATH 里有 ssh / git
REM   - ~/.ssh/double_jump_deploy（或 SSH_KEY_PATH 环境变量）能登录 root@117.72.204.51
REM =============================================================================

setlocal

set "SERVER=root@117.72.204.51"
set "SSH_KEY=%USERPROFILE%\.ssh\double_jump_deploy"
if not "%SSH_KEY_PATH%"=="" set "SSH_KEY=%SSH_KEY_PATH%"

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
echo === [2/3] ssh 到服务器拉代码 ===
echo.

REM 丢弃服务器侧残留的本地改动（人工 scp / 调试残留），强制跟 origin/main 对齐
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL %SERVER% "cd /opt/double-jump && git config core.filemode false && git checkout -- . 2>nul && git clean -fd 2>nul && git fetch origin && git reset --hard origin/main" 1>&2
if errorlevel 1 (
  echo 服务器 git pull 失败
  exit /b 1
)

echo.
echo === [3/3] 服务器构建 + 重启容器 ===
echo.

ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL %SERVER% "cd /opt/double-jump && ./deploy.sh local" 1>&2
if errorlevel 1 (
  echo 部署失败
  exit /b 1
)

echo.
echo === ✅ 部署完成 ===
echo 访问 http://117.72.204.51/
echo.
endlocal
