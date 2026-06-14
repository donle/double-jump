# =============================================================================
# Double Jump — 单镜像构建
# 产物：一个 node:22-alpine 镜像，单进程同时承担 HTTP 静态文件 + WebSocket
# 构建上下文：仓库根（用 docker build -t double-jump . 即可）
# =============================================================================

# ---------- Stage 1: 装 client 依赖并构建 ----------
FROM node:22-alpine AS client-build
RUN npm install -g pnpm@10
WORKDIR /build
# 把 workspace 根的 package.json + lockfile + workspace 配置先拷过来
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# 再拷子包。client 引用 shared/ 下的源码（没有 package.json，直接相对路径 import）
COPY client/ ./client/
COPY shared/ ./shared/
# vite.config.ts 的 publicDir 是 '../assets'（指向仓库根的 assets/，里面是
# 游戏素材 PNG：背景图、玩家立绘），这一行是必须的，否则 dist/ 里没有图
COPY assets/ ./assets/
# 整 workspace 一起 install（pnpm 10 严格要求 workspace 根有 package.json）
# --filter 只装 client 的依赖，跳过 server
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
# 试 --no-lockfile 跳过 lockfile 写，看 EPERM 是不是 lockfile 写入
RUN pnpm install --no-lockfile --filter double-jump-client... --config.strict-dep-builds=false --ignore-scripts 2>&1 | tail -20
# 手动跑 esbuild 的 install.js
RUN cd /build/node_modules/.pnpm/esbuild@*/node_modules/esbuild && node install.js
# 单独跑 client 的 build
RUN pnpm --filter double-jump-client run build

# ---------- Stage 2: 装 server 依赖 ----------
FROM node:22-alpine AS server-deps
RUN npm install -g pnpm@10
WORKDIR /build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/ ./server/
COPY shared/ ./shared/
# 显式把 store 放到 /tmp/pnpm-store，避开默认路径的写权限问题
ENV PNPM_HOME=/tmp/pnpm-home
ENV PNPM_STORE_DIR=/tmp/pnpm-store
RUN pnpm install --no-lockfile --filter double-jump-server... --config.strict-dep-builds=false --ignore-scripts 2>&1 | tail -10

# ---------- Stage 3: 运行时 ----------
FROM node:22-alpine
WORKDIR /app

# dist 放 /app/client/dist —— 与 server/src/index.ts 中
#   new URL('../../client/dist', import.meta.url)
# 在 Docker 内的解析结果一致。这样 dev 模式和生产用同一份路径代码，无 if 分支。
COPY --from=client-build /build/client/dist /app/client/dist
COPY --from=server-deps /build/server /app/server
COPY --from=server-deps /build/shared /app/shared
# pnpm 把 node_modules 集中放在 workspace 根 /build/node_modules，
# 整个搬过来给 runtime 用
COPY --from=server-deps /build/node_modules /app/node_modules

WORKDIR /app/server
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "src/index.ts"]
