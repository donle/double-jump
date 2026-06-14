# 部署指南（京东云轻量云主机 + Docker + Caddy + GitHub Actions）

> 目标：用最少的钱（¥24/月级别）把 Double Jump 跑起来，CI/CD 自动更新。

---

## 0. 前置清单

| 资源 | 要求 |
|---|---|
| 京东云轻量云主机 | 1C1G 40G SSD，Ubuntu 22.04 LTS |
| 公网带宽 | ≥ 3 Mbps（轻量默认即可） |
| 域名 | 一个，解析到服务器公网 IP（境内需 ICP 备案，香港/境外节点免） |
| GitHub 仓库 | 本项目已 push 上去 |
| 本地 | Docker（仅测试 build 用，可选） |

---

## 1. 服务器初始化（首次，约 10 分钟）

### 1.1 京东云控制台

- 重置 root 密码
- 防火墙放通：`22 (SSH)`、`80 (HTTP)`、`443 (HTTPS)`
- 记下公网 IP，下文用 `YOUR.SERVER.IP` 代替

### 1.2 SSH 登录 + 装基础环境

```bash
ssh root@YOUR.SERVER.IP

# 装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 装 Caddy（自动 HTTPS）
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 防火墙（轻量云主机控制台已放通的话，ufw 可不开）
ufw allow 22/tcp 80/tcp 443/tcp
```

### 1.3 拉代码 + 首次手动部署

```bash
# 创建部署目录
mkdir -p /opt/double-jump
cd /opt/double-jump

# 拉代码（用 SSH 方式，HTTPS 方式需要 token）
git clone git@github.com:YOUR-USERNAME/double-jump.git .

# 配环境变量
cp .env.example .env
nano .env
# 把 IMAGE= 改成 ghcr.io/YOUR-USERNAME/double-jump

# 给 deploy.sh 加执行权限
chmod +x deploy.sh

# 首次构建（不依赖 ghcr.io 已有镜像）
./deploy.sh local
```

预期输出：容器启动 → `HTTP 200` 健康检查通过。

### 1.4 Caddy 接 HTTPS

```bash
nano /etc/caddy/Caddyfile
```

内容：

```
YOUR.DOMAIN.COM {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
systemctl reload caddy
```

打开浏览器访问 `https://YOUR.DOMAIN.COM/` —— 应能进游戏。

> **首次访问会等 10~30 秒**：Caddy 正在向 Let's Encrypt 申请证书。

---

## 2. CI/CD（git push 自动部署）

### 2.1 GitHub 仓库 → Settings → Secrets and variables → Actions，新增：

| Secret 名 | 值 | 说明 |
|---|---|---|
| `SERVER_HOST` | `YOUR.SERVER.IP` | 服务器公网 IP |
| `SERVER_USER` | `root` | SSH 用户 |
| `SERVER_SSH_KEY` | 服务器私钥全文（含 BEGIN/END 行） | 见下 |
| `PUBLIC_URL` | `https://YOUR.DOMAIN.COM` | 部署完冒烟测试用 |

#### 生成专属 SSH 密钥对

在**本地**生成（不要用 root 的现有密钥）：

```bash
ssh-keygen -t ed25519 -C "github-actions-double-jump" -f ~/.ssh/double-jump_deploy
```

把公钥加到服务器：

```bash
# 本地
cat ~/.ssh/double-jump_deploy.pub | ssh root@YOUR.SERVER.IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

把私钥全文（`cat ~/.ssh/double_jump_deploy`）贴到 GitHub Secret `SERVER_SSH_KEY`。

### 2.2 启用 ghcr.io 公开拉取

默认 ghcr.io 的包是私有的，服务器要拉必须先登录。

- 第一次 push 完，到 GitHub 仓库页面 → 顶部 Packages 链接 → `double-jump` → Package settings → Change visibility → Public
- 或者在服务器上登录：`echo TOKEN | docker login ghcr.io -u USERNAME --password-stdin`（更复杂但保留私有）

### 2.3 测试

```bash
# 在本地改一行无关紧要的代码
git add . && git commit -m "test ci" && git push origin main
# GitHub Actions 应在 1~3 分钟内：build 镜像 → push → SSH 部署 → 冒烟测试通过
```

---

## 3. 日常运维

| 操作 | 命令 |
|---|---|
| 看实时日志 | `docker logs -f double-jump` |
| 进容器调试 | `docker exec -it double-jump sh` |
| 重启 | `docker restart double-jump` |
| 手动部署指定版本 | `cd /opt/double-jump && ./deploy.sh v1.2.3` |
| 回滚到上一个 | `cd /opt/double-jump && ./deploy.sh <上一个 tag>`（tag 在 GitHub Packages 找） |
| 看容器资源 | `docker stats double-jump` |
| 磁盘清理 | `docker system prune -af --filter "until=72h"` |

---

## 4. 故障排查

### `pnpm install` 在 Docker 内失败，提示 `ERR_PNPM_IGNORED_BUILDS`
仓库根 `pnpm-workspace.yaml` 已声明 `onlyBuiltDependencies: [esbuild]`。如果还报错：
- 在**本地**跑一次 `pnpm approve-builds`，勾 esbuild，生成 `pnpm-lock.yaml` 后 commit
- 然后再 push，CI 用 `--frozen-lockfile` 才能稳

### 服务器连不上 ghcr.io
- 检查防火墙是否放通 443（不是 80）
- `docker pull ghcr.io/YOUR-USERNAME/double-jump:latest` 看具体报错
- 如果是未登录，参考 2.2 把包公开或登录

### 容器起得来但页面 502
- `docker logs double-jump` 看启动日志（应该看到 `listening on ws://localhost:3000`）
- `curl -i http://127.0.0.1:3000/` 从服务器本地测
- Caddy 没配好？`systemctl status caddy` 看错误

### WebSocket 连不上
- 浏览器 F12 → Network → WS 标签
- 应该看到 `wss://YOUR.DOMAIN.COM/ws` 状态 101 Switching Protocols
- 如果一直 pending：Caddy 反代没透传 Upgrade 头
  - 改 Caddyfile：
    ```
    reverse_proxy 127.0.0.1:3000 {
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
    }
    ```

### 服务器重启后容器没起来
- `docker ps -a` 看状态
- 如果是 Exited：`docker logs double-jump` 看为什么
- `--restart unless-stopped` 应该在机器重启后自动拉起，但如果 docker daemon 没启动就要 `systemctl start docker`

### 磁盘满了
```bash
df -h                          # 看哪个分区满了
docker system df               # 看 docker 占多少
docker system prune -af        # 清掉所有不用了的镜像/容器/网络
```

---

## 5. 安全清单（上线前确认）

- [ ] 服务器 SSH 改用密钥登录，禁用密码登录
- [ ] 防火墙只开 22/80/443
- [ ] 不要用 root 跑应用（容器内虽然不是真 root，但宿主机 SSH 还是 root）
- [ ] Caddy 自动续期证书，不用管
- [ ] `.env` 不要进 git（已在 `.gitignore`）
- [ ] GitHub Personal Access Token 不用开太宽权限
- [ ] 服务器定期 `apt update && apt upgrade`
