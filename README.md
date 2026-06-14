# Double Jump（双人跳）

一款 **2D 横版双人在线协作跳跃游戏**。两名玩家被一根弹性绳拴在一起，必须互相配合跨越越来越危险的地形。单人掉坑不会死 —— 但需要队友救；双人一起掉，game over。

> 详细需求见 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)。

## 当前状态

- [x] 需求文档 v0.1
- [x] 技术决策（Web + Phaser 3 + matter.js）
- [x] 客户端脚手架（Vite + TS + Phaser）
- [x] **M1：本地双人原型**（角色、弹性绳、地形坑、悬挂/失败规则）
- [ ] M2：5 种地形 + 程序化关卡 + 难度曲线
- [ ] M3：在线联机（房间 + 同步）
- [ ] M4：UI / 音效 / 打磨

## 目录结构

```
double-jump/
├── client/      # 客户端（待实现）
├── server/      # 服务端（待实现）
├── shared/      # 共享代码与类型（待实现）
├── assets/      # 美术 / 音效资源（待补充）
└── docs/        # 文档
    └── REQUIREMENTS.md
```

## 技术栈（待 M1 启动时确认）

- **客户端**：TypeScript + Phaser 3 / PixiJS + matter.js（候选）
- **服务端**：Node.js + TypeScript + WebSocket
- **构建**：Vite

## 怎么跑

### 本地开发

```bash
cd client
pnpm install      # 已安装可跳过
pnpm dev          # 启动 Vite，浏览器打开 http://localhost:5173
```

> 服务端（M3 联机）已实现，`server/src/index.ts` 单进程同时承担 HTTP 静态服务 + WebSocket。
> 联机调试：
> ```bash
> # 终端 A
> cd client && pnpm dev
> # 终端 B
> cd server && pnpm dev
> ```
> 客户端代码走 `/ws` 相对路径，Vite 代理到 8787，LAN / localhost / 公网（natapp）三种部署形态用同一份代码。

### 部署到服务器

参见 [`DEPLOY.md`](DEPLOY.md)：单 Docker 镜像 + Caddy 反代 + GitHub Actions 自动化，¥24/月级别。

## 玩法速览（M1 阶段）

- 两人向**右**前进，越远越难。
- 5 种地形（M2 实现）：普通地面、坑、浮空固定板、浮空移动板、浮空限时板。
- 1 人掉坑 = 悬挂 = 队友拉你回来。
- 2 人同时掉 = 游戏失败。

### M1 控制

| 玩家 | 移动 | 跳跃 | 拉绳 |
|---|---|---|---|
| P1（青） | A / D | Space | Shift |
| P2（粉） | ← / → | Enter | ↑ |

- 失败后按 **R** 重启。
- 绳索张力高时变红；中点带轻微下垂模拟真实弹性。
- 物理调参集中在 `client/src/game/config.ts` 的 `PHYSICS` 常量里。

---

Co-designed with AI 🤖 · 2026-06-12
