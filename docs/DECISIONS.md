# 技术决策记录

> 更新日期：2026-06-12
> 来源：docs/REQUIREMENTS.md 第 13 节开放问题

## 已确认决策

| # | 决策项 | 选择 | 备注 |
|---|---|---|---|
| 1 | 客户端平台 | **Web（TypeScript + Phaser 3）** | 跨平台、调试快、联机天然适配 |
| 2 | 物理库 | **matter.js** | 成熟、轻量、JS 原生 |
| 3 | 美术资源 | **用户提供** | M1 先用色块占位，资源接口预留好便于后期替换 |
| 4 | 联机方案 | 待 M3 决定 | M1 不涉及 |
| 5 | 关卡生成 | 待 M2 决定 | M1 仅手工摆放 |

## 影响

- `client/` 脚手架以 **Vite + TypeScript + Phaser 3** 为底。
- 物理接入 `matter-js`，自实现"弹性绳"组件（matter 的 constraint 调出橡皮筋手感再议）。
- 美术：M1 用 `Graphics` / `Rectangle` / `Circle` 绘制占位，**资源路径集中在 `assets/`**，所有贴图/精灵都通过统一 loader 加载，便于切换为真实素材。
- 资源替换流程：你把 PNG/SVG 放进 `assets/`，我在 `assets/manifest.ts` 注册即可。

## 待办

- M1 脚手架完成后，把 `npm run dev` 启动方式写进 README。
- M2 启动前再确认关卡生成是纯程序化还是程序化 + 手工章节。
- M3 启动前再确认自建 WebSocket 还是用 Colyseus / PlayFab。
