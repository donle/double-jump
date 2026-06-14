# =============================================================================
# Double Jump — 单镜像构建
# 产物：一个 node:22-alpine 镜像，单进程同时承担 HTTP 静态文件 + WebSocket
# 构建上下文：仓库根（用 docker build -t double-jump . 即可）
# =============================================================================

# ---------- Stage 1: 装 client 依赖并构建 ----------
FROM node:22-alpine AS client-build
RUN npm install -g pnpm@10
WORKDIR /build/client
# 把 package.json 和 lockfile 先拷过来，最大化缓存命中
COPY pnpm-lock.yaml pnpm-workspace.yaml /build/
COPY client/package.json ./
RUN pnpm fetch --frozen-lockfile
# 再拷源码
COPY client/ ./
RUN pnpm install --offline --frozen-lockfile
RUN pnpm run build

# ---------- Stage 2: 装 server 依赖 ----------
FROM node:22-alpine AS server-deps
RUN npm install -g pnpm@10
WORKDIR /build/server
COPY pnpm-lock.yaml pnpm-workspace.yaml /build/
COPY server/package.json ./
RUN pnpm fetch --frozen-lockfile
COPY server/ ./
COPY shared/ /build/shared/
RUN pnpm install --offline --frozen-lockfile

# ---------- Stage 3: 运行时 ----------
FROM node:22-alpine
RUN npm install -g pnpm@10
WORKDIR /app

# dist 放 /app/client/dist —— 与 server/src/index.ts 中
#   new URL('../../client/dist', import.meta.url)
# 在 Docker 内的解析结果一致。这样 dev 模式和生产用同一份路径代码，无 if 分支。
COPY --from=client-build /build/client/dist /app/client/dist
COPY --from=server-deps /build/server /app/server
COPY --from=server-deps /build/shared /app/shared

WORKDIR /app/server
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "src/index.ts"]
