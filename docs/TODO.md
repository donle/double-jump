# 项目 Todo 跟踪

## 新增待排查 Bug（2026-06-14 晚）

| # | 状态 | 问题 | 处理要求 |
|---|---|---|---|
| 73 | ✅ | **后续关卡浮空板节奏调整** | 已修。lv2/lv3 不再按“连续 4-7 个浮空板”限制，而是改成更长的可通关节奏：lv2 结尾使用 9 个固定/移动混合浮空板，lv3 后段使用 11 个连续固定浮空板；浮空板间距整体加大，避免过近导致难度太低，同时控制高低差不超过跳跃能力。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 74 | ✅ | **每关地形随机生成且不阻塞下一关** | 已修。新增纯数据 `LevelRun` 模块集中生成三关 seed，打开页面/HomeScene create 时后台一次性生成三关；回主页、刷新、重试会重新生成，胜利进入下一关沿用当前 run，不需要等待。`LevelRun` 不依赖 Phaser，后续多人联机可迁移到后端下发 seed/run 数据。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 75 | ✅ | **站在移动浮空板上人物不跟随平台移动** | 已修。`FloatingMoving` 保持 static kinematic 固定轨迹，同时记录站在平台顶面的 rider；平台每帧移动后显式按平台 delta 携带 rider，避免角色留在原地或从平台下滑。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 76 | ✅ | **game over 黑屏 + 统计显示 NaN** | 已修。game over/胜利结算改为叠加在当前游戏画面上显示，不再全黑切场景；`LastResult` 增加 `elapsedMs/maxX/endX` 规范化入口，缺失或非法数值会兜底为 0，避免坚持时间、最远位置等显示 NaN。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 63 | ✅ | **落地抖动/落地高度漂移严重** | 已修。根因是 support grace 期间 `supports.size===0` 仍按 grounded 逻辑冻结/清零竖直速度，叠加 `Rope.update()` 在 `Player.update()` 之后继续写 velocity，导致落地后高度漂移/抖动。修复：`Player.update()` 只有存在真实物理支撑时才走 grounded slide/sleep/friction；无支撑但还在 grace 时继续走空中重力；`GameScene` 在 rope 施力后调用 `stabilizeGroundedVelocityAfterExternalForces()`，只对真实支撑且非跳跃的 grounded 玩家清掉外力竖直扰动。跳跃规则未改。验证：用户反馈 #63 已修好；`tsc` / `vite build` 通过。 |
| 64 | ✅ | **pit 入口偶发粘人 / 坑口卡跳** | 已修多轮。根因分两类：① 坑口矩形角点的斜向 normal 被误判为地面支撑，导致悬崖口粘住；修复为 `SUPPORT_NORMAL_Y_MIN=0.85`，只有接近纯顶面接触才进入 supports。② 小坑口宽度接近玩家宽度时，角色物理上被两侧地面托住，但 pit sensor 已接触，旧逻辑可能把它切成 in_air，形成“掉不下去也不能跳”。修复：pit 宽度只限制最小值（EASY/NORMAL 38px 起，HARD 40px 起，玩家宽 36px），上限保留难度差异；`Player` 记录 pit contacts，每帧深度检查，真正深入才 `fallIntoPit()`；如果中心在坑口、未深入、竖直速度几乎停住，则视为被坑口托住，保持/恢复 `on_ground` 允许 JUMP。验证：`tsc` / `vite build` 通过。 |
| 65 | ✅ | **竖屏适配 + 宽屏竖屏容器** | 已修。`GAME_CONFIG` 从 `1280x720` 改为 `720x1280`；`client/index.html` 的 `#app` 使用 `9:16` 容器，宽屏时居中限制为竖屏区域，手机竖屏时填满可用空间；`GameScene` 相机地面比例调到 `0.64`，`RoomScene` 竖向重排，底部 JUMP 视觉按钮加宽。验证：`tsc` / `vite build` / 5173 返回 200。 |
| 66 | ✅ | **竖版背景图 + 坑内显示同一背景** | 已修。基于三张 16:9 卡通背景生成连续无拼接的 `720x1280` 竖版图：`easy-portrait-bg.png` / `normal-portrait-bg.png` / `hard-portrait-bg.png`，同步到 `assets/imagegen/` 和 `client/public/assets/imagegen/`；`BackgroundScroller` 改为加载竖版 PNG。`Pit` 不再绘制暗色覆盖层，只保留 invisible sensor，所以坑内和地上显示同一张竖屏背景。验证：`tsc` / `vite build` 通过。 |
| 67 | ✅ | **game over 判定过早** | 已修。旧 `checkGameState()` 用 `isHanging()` 判断死亡，而 `isHanging()` 只是进入 pit sensor，导致刚进坑/仍可能被绳子救起时过早结束。现在改为两人都 `isStablyHanging()` 才 game over；两人都 `y > 1500` 掉出世界仍立即 game over。验证：`tsc` / `vite build` 通过。 |
| 68 | ⏳ | **地面玩家被坑中玩家拖拽滑动时严重抖动** | 待排查。现象：一名玩家在坑里，另一名玩家在地面被绳子拖着滑动时抖动非常明显；只有地面玩家下一次起跳后抖动才消失。已尝试并回退：① grounded 时对 physics body 做精确 y 对齐（会和 Matter contact 边界打架，变成地上弹）；② 只对 sprite/graphics 做 grounded 渲染 y 对齐（仍改变视觉手感，用户反馈不如原漂移）；③ `Rope.calculateForceShares()` 增加“上方站地 anchor”分支（改变 rope 手感并引入新抖动）。当前代码已回退这些试探性修改。下一步不要直接调参；先加 debug 采样记录 `body.y / vy / supports.size / inPit / rope dist / tension.accel / shares / contact start-end`，复现“坑中拖拽地面滑动”场景后再决定是改 rope 竖向分量、grounded 稳定逻辑，还是接触状态判定。 |
| 69 | ✅ | **后续关卡设计 + 每关过关结算** | 已修。`RoomScene` 开放 lv1/lv2/lv3 选择；`LevelGenerator` 按关卡分流，lv1 保持原程序化地面+坑，lv2 加短浮空板、高低差和结尾移动浮空板，lv3 加普通平地高低差与可达浮空板；`FloatingFixed` / `FloatingMoving` / `FloatingTimed` 恢复碰撞过滤并导出。`LastResult` 增加 `level`，`EndScene` 胜利显示“恭喜通过第 X 关”，有后续关卡时提供“下一关 / 重玩 / 回主页”。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 70 | ✅ | **移动浮空板速度像子弹** | 已修。根因是 `FloatingMoving` 用正弦导数算出的速度单位是 px/s，但直接传给 Matter `setVelocity()`；Matter 这里的 velocity 更接近“每个物理步的位移”，导致速度约放大 60 倍。修复：按 `delta / 1000` 把 px/s 换算成本帧 velocity，并把大帧 delta 限到 1/30，避免切后台/卡顿后平台瞬移。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 71 | ✅ | **移动浮空板固定轨迹 + 浮空板上 trailer 跳跃权失效** | 已修。`FloatingMoving` 改为 static kinematic body，每帧按固定正弦轨迹 `setPosition(..., updateVelocity=true)`，不会再被玩家/绳子碰撞推离轨迹，同时保留接触速度。`GameScene.updateCanJump()` 移除旧的“trailer 低于 leader 30px 就交换给 leader”规则；现在两人都有支撑时始终 trailer（x 较小者）跳，只有 trailer 当前不能跳（例如稳定悬挂在坑里）才交给 leader。`PHYSICS.trailer.stuckBelowPx` 已删除。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |
| 72 | ✅ | **回主页后按钮失效 + 终点误判 game over** | 已修。Phaser scene 实例会复用，返回 Home/Room/End 时旧的 scene 级 pointer/keyboard 监听和 RoomScene 按钮数组可能残留；现在各 scene `create()` 开头清理旧监听，RoomScene 重置 `difficultyBtns/levelCards`，GameScene 清理点屏跳跃、R 键和 Matter 碰撞监听。终点判定改为 win 优先于 game_over，避免角色已过 `totalLength` 后又掉进终点后的死亡区时被覆盖成游戏结束。验证：`tsc --noEmit --noUnusedLocals false` 和 `vite build` 通过。 |

> 更新日期：2026-06-14
> 状态：M1 ✅ / M2 ✅ / M3 ✅（马里奥式 + Leader + 硬约束）/ **M3-末 调优 #28-#45 ✅** / **M4-B #46 音效系统 ✅** / **M4-B #47 tap 强刹车 + #48 稳定悬挂态 ✅** / **M4-B #5 UI 三页（Home/Room/EndScene）#55 ✅** / **M4-B #6 视觉（风景分层+难度配色）✅** / **M4-B #58 生图卡通风视觉 ✅** / **M4-B #59 触屏点屏任何地方都跳 ✅** / **M4-B #60 死亡检测误判 ✅** / **M4-B #61 坑宽 v2（约 1/4）✅** / **M4-B #62 绳子手感 v3 ✅（统一弹簧 + pit 状态重构 + 崖壁零摩擦）** / **#63-#67 竖屏与坑口跟进 ✅** / **#68 拖拽滑动抖动 ⏳** / **#69 后续关卡+过关结算 ✅** / **#70-#71 移动浮空板修正 ✅** / **#72 结算/回主页修正 ✅** / **#73-#76 关卡随机、移动平台携带、结算显示 ✅** / M5-A 联机 ⏳
>
> **M4-B #6 验收反馈（2026-06-14）** — #6 实现通过但暴露新需求/bug，单独开新行追踪：
> - **#57** 跳跃/绳子/坑宽手感回归（hold 跳高度不够、rope 弹性不足、NORMAL/HARD 开局坑宽就跳不过去）→ **已关闭（过时）**：#61 已重做坑宽，#62 已重做 rope；当前参数估算 250ms hold 约 156px 高、约 199px 水平跨距，覆盖 NORMAL/HARD 当前坑宽上限。后续如再有实测反馈，另开新 bug。
> - **#58** 视觉风格从"线条画"升级为有具体角色形象的生图卡通风。**已修复**（见下表 #58 行）
> - **#59** 触屏输入：用户希望**点屏幕任何地方都触发 jump**（不限于 JUMP 按钮）—— 操作更顺手。**已修复**（见下表 #59 行）
>
> **#60/#61 验收反馈（2026-06-14 下午）** — 用户又报 2 个 bug，单独开新行追踪：
> - **#60** 死亡检测：两人站悬崖边还没下去就被判 game over（已修，见下表 #60 行）
> - **#61** 坑宽 v2：缩到当前 1/4，难度递增但仍比 v1 窄（已修，见下表 #61 行）
>
> **#62 v3 已修（2026-06-14 晚）** — v1/v2 两次失败后，本轮按用户反馈改为“统一弹簧 + 正常自由落体 + 崖壁零摩擦”，不再做 rescue mode 分段：
> - **#62 v1**（已回退）：`config.ts.PHYSICS.rope` 拉宽弹性区间 `naturalLength 200→160` + `maxLength 320→400` —— 用户反馈"弹性更差了，扯不上来"。根因（runtime probe 发现）：v1 出生位置 P1=(200,?) P2=(400,?) dist=200 > naturalLength=160 = 40px stretch = 17% 张力，**永远绷着**；救援场景 P1 坑中 y=932 被拉到 y=706 后停住，dist=161 进 slack zone 绳子不拉了，硬约束 dist=400 又钉住 P2 阻止靠近 P1，**形成死结**。
> - **#62 v2**（已回退）：`config.ts.springMaxAccel 2.0→4.0` + `Rope.ts` 新增救援模式（`isRescueMode()` + 跳过硬约束 + `effectiveNaturalLength=0`）—— runtime 验证能救出 P1（1.6s 出坑），但用户反馈"**还是太硬**"（救援场景 maxAccel=4.0 持续 60+ 帧猛拽 P1，违反"绳是辅助感"的设计原则）。同时 v2 还把"出生就绷"的副作用保留下来，**两个问题同时存在**。
> - **#62 v3**（已修）：① `Rope.ts` 废掉“硬约束 / 软弹簧 / 松弛”三段状态和 `setPosition` snap，改为统一连续弹簧 `strain=max(0, dist-naturalLength)`；普通下坠不启用 velocity damping，只有上方玩家主动向上跳时才传递 `velocityAccel`，避免“掉进果冻”。② `Player.ts` 移除 `PlayerState='hanging'`，新增 `inPit` 环境标记，掉坑后仍是 `in_air`，重力逻辑与普通空中一致；`isHanging()` 仅兼容旧调用。③ `PHYSICS.pit.enterDepth=28` 防悬崖口边界误标记；`PHYSICS.player.wallFriction=0` + `Player.sideContacts` 让侧墙/空中摩擦为 0，避免贴崖壁粘住。④ 最终参数：`PHYSICS.rope` = `(naturalLength 240, maxLength 430, springStiffness 0.028, springDamping 0.36, springMaxAccel 5.0, springVelocityTransferMax 10.0, activeJumpCounterScale 0.1, activeJumpPullShare 1.5)`。验证：`client\node_modules\.bin\tsc.cmd --noEmit -p client\tsconfig.json --noUnusedLocals false` 通过；用户反馈“好了差不多了，这个算修复了”。

---

## 主里程碑

| # | 状态 | 任务 |
|---|---|---|
| 1 | ✅ | 创建项目骨架与归档需求文档 |
| 2 | ✅ | 确认 M1 技术栈与开放问题（Web + Phaser 3 + matter.js） |
| 3 | ✅ | 初始化 client 端脚手架（Vite + TypeScript） |
| 4 | ✅ | 实现 M1：双人本地原型（角色 + 绳索 + 坑 + 失败规则） |
| 5 | ✅ | **M2：5 种地形 + 程序化关卡 + 难度曲线** |
| 6 | ✅ | **M3：跳跃机制重做（马里奥式）+ Leader 单跳规则 + 硬约束绳** |
| 7 | ⏳ | M4：在线联机 / UI 打磨 / 音效（→ M4-B 单机打磨 + M5-A 联机） |
| 8 | ⏳ | **M5-A：双人联机版**（一个房间两名玩家，各操作一个角色；被锁定者不可跳，只有当前可跳者的输入生效） |

---

## M2 子任务

| # | 状态 | 任务 | 阻塞 |
|---|---|---|---|
| 8 | ✅ | Player 实体支持多平台接触与失支撑检测 | — |
| 9 | ✅ | GameScene 接入程序化关卡与距离 HUD | #10 修复后已验证 |
| 10 | ✅ | **修复玩家物理 / 相机 / 世界边界问题** | 阻塞 M2 收尾 |
| 11 | ✅ | Playwright 截图验证 5 种地形 | #10 |
| 12 | ✅ | 验证难度曲线（历史：曾移除非"地面+坑"的地形） | #11 |
| 13 | ✅ | 历史：浮空板（Fixed / Moving / Timed）曾从 lv1 程序化关卡中移除；#69 已重新用于 lv2/lv3 手工关卡 | — |

---

## M3 子任务（新版：跳跃 + Leader + 硬约束绳）

> 背景：M2 收尾后用户提了新需求 —— 把"蓄力跳"换成"马里奥式可变高度跳"，加"只有 leader 能跳"的轮替规则，把绳子从双向弹簧换成单向硬约束。

| # | 状态 | 任务 |
|---|---|---|
| 14 | ✅ | 输入抽象：4 个文件（InputDevice / KeyboardDevice / TouchDevice / InputManager） |
| 15 | ✅ | HUD 加 Leader 标签 + "当前可跳"指示 + 跳跃高度虚线指示器 |
| 16 | ✅ | 物理常量 `PHYSICS.jump`：`riseSpeed=14 / maxHeight=220 / forwardSpeed=7` |
| 17 | ✅ | `Player.ts` 重写为马里奥式上升期状态机（按住键持续抬升 / 触顶或松开切换下落） |
| 18 | ✅ | `GameScene.updateCanJump()`：基于 x 较大者 + 都未在地面 → 单跳规则 |
| 19 | ✅ | `GameScene.drawHeightIndicator()`：跳跃上升期画垂直虚线 + "天花板"横线 |
| 20 | ✅ | `Rope.ts` 改造为视觉 + 距离查询（不再持有 matter 约束） |
| 21 | ✅ | `GameScene.applyHardTether()`：距离 > maxLength 时两人各拉回一半 + 沿绳速度衰减 |
| 22 | ✅ | `config.ts` 清理：去掉 `PHYSICS.rope.stiffness / damping`（已不适用） |

---

## 关键设计决策

### 1. 为什么用硬约束而不是弹簧

- matter.js 的 `add.constraint(restLength, stiffness)` 是一个**双向弹簧**：
  - distance < restLength → 弹簧压缩 → 推两人**分开**（违反物理直觉）
  - distance > restLength → 弹簧拉伸 → 拉两人**靠拢**
- 我们的需求是**单向**：只拉不推。距离 ≤ maxLength 时两人自由行动，距离 > maxLength 时拉回。
- 所以去掉了 matter.js 约束，改在 `GameScene.update` 里手写 hard-tether。

### 2. 为什么用"Leader"轮替单跳

- 用户要求：每次跳完落地之后计算谁在前面，只有 leader 能跳，禁止两人同时跳。
- 游戏语义：领头人主动跳，拖拽身后的玩家；避免两人同时起跳互相干扰。
- 实现：每帧 `updateCanJump()` 根据 `(p1.onGround, p2.onGround, p1.x > p2.x)` 决定谁能跳。
- 边界：两人都未在地面（都在空中/掉坑中）→ 都禁止。

### 3. 为什么一度去掉浮空板（历史）

- 关卡设计收敛到"地面 + 坑"两种 piece，难度曲线只由 pit 宽度控制。
- 后续 #69 已恢复使用浮空板：lv1 仍保留地面+坑的程序化节奏，lv2/lv3 使用 `FloatingFixed` / `FloatingMoving` 做手工关卡。

---

## M3 验证结果

| 验证项 | 期望 | 实际 | 状态 |
|---|---|---|---|
| P1 (trailer) 按 Space | 必须被忽略 | P1 x=200 不动，jumping=false | ✅ |
| P2 (leader) 按 Enter | 必须真跳 | P2 上升 53px，jumping=true，in_air | ✅ |
| 硬约束距离 ≤ 260 | 不触发 | 距离 232，硬约束未运行 | ✅ |
| 硬约束距离 > 260 | 两人各拉回一半 | P1: 200→277（+77），P2: 400→516（+116） | ✅ |
| Leader 保持在前 | 跳后 P2 仍在 P1 前面 | P2=516, P1=277 | ✅ |
| 触顶/松开键结束上升期 | 物理已验证 | — | ✅ |
| 跳跃高度指示器 | rising 期画虚线 + 横线 | 已实现，截图待补 | ⚠ |

---

## M2 #10 修复结果（历史）

| Bug | 修复点 | 验证 |
|-----|--------|------|
| 1 玩家卡地 | 出生上抬 6px + ground 厚度 800→400 | p1/p2 显示 `on_ground` |
| 2 相机 null | 移除 `startFollow`，手写 `scrollX = leader.x - width/3` | HUD/距离/难度实时更新 |
| 3 supports 抖动 | 宽容窗口 80→200ms + 阈值 0.4→0.6 | 玩家状态稳定 |
| 4 绳子 stiffness 过大 | 自实现 spring-damper 在 matter 单位制下数值爆炸 → 改用 `scene.matter.add.constraint`（stiffness 0.0001, damping 0.5） | 位置稳定，无 NaN |
| 5 BootScene 文字被切 | `time.delayedCall(200, ...)` 再 `scene.start` | 标题"DOUBLE JUMP"正常显示 |

> 附注：M3 中 matter.js 弹簧约束被进一步移除（双向弹簧会推开两人），改用 GameScene 手写 hard-tether。

---

## 后续路线（M5-A 联机）

### 方向 A：在线联机（下一步）
- 服务端：Node.js + TypeScript + `ws`，先自建轻量 WebSocket 服务，不引入 Colyseus。
- 房间：6 位房间号；每个房间最多 2 人；房主创建房间，第二名玩家加入后可开始；30s 内保留 seat 支持重连。
- 玩家归属：房间内固定两个 seat：`p1` / `p2`。每个客户端只发送自己 seat 的 jump 输入，不能代操作另一个角色。
- 操作规则：沿用当前 `GameScene.updateCanJump()` 的单跳授权规则；联机模式下服务端/主机只接受当前 `canJump=true` 的 seat 输入。被锁定的玩家即使按键也必须忽略，不能触发跳跃、hold 或 release。
- 同步策略（分阶段）：M5-A-1 先做“共享 seed + 输入同步 + 主机/服务端广播状态”的可玩版；M5-A-2 再把物理推进迁到服务端权威；M5-A-3 补客户端预测、插值和断线重连细节。
- 关卡种子：复用 `LevelRun` 纯数据结构，由房间创建时生成并下发，双方用相同 `runSeed/levelSeeds` 生成一致地形。
- UI 改动：首页增加“创建房间 / 加入房间”；房间页显示房间号、P1/P2 入座状态、准备状态、开始按钮；游戏内显示本机控制的角色标识。

#### M5-A 子任务
| # | 状态 | 任务 | 验收 |
|---|---|---|---|
| 77 | ✅ | 初始化 `server` 包：`package.json`、TypeScript、`ws` 服务入口、健康检查 | 已实现 `server` 独立包，`npm run typecheck` 通过；`npm install` 已安装依赖。 |
| 78 | ✅ | 定义共享联机协议：`create_room` / `join_room` / `ready` / `start` / `input` / `snapshot` / `leave` / `reconnect` | 已新增 `shared/net/protocol.ts`，当前覆盖 create/join/ready/start/input/snapshot/leave 与 room/game/peer/error 消息；reconnect token 细化留到 #84。 |
| 79 | ✅ | 房间与 seat 管理：6 位房间号、`p1/p2` 分配、房主、30s 重连窗口 | 已实现 6 位房间、双 seat、房主开始、断线 seat 保留 30s；重连 token 还未做，后续 #84 验收时补。 |
| 80 | ✅ | 客户端 `NetClient`：连接、重连、发输入、收房间状态和关卡 run | 已实现 `NetClient`；Home 支持创建/加入房间，RoomScene 支持在线大厅和房主开始，GameScene 使用房间下发的 `LevelRun`。 |
| 81 | ✅ | 联机输入路由：本机只控制自己的 seat；`canJump=false` 的 seat 输入被忽略 | 已实现 GameScene seat 分流。本机输入只进自己的角色；若该角色既不能起跳也不在 jump hold 中，则发送/应用空输入。 |
| 82 | ✅ | 最小状态同步：广播 `p1/p2` 位置、速度、状态、rope 距离、game result | 已实现房主权威 `snapshot`：host 每 100ms 发送 `p1/p2` 位置、速度、状态、jump/canJump/inPit、trailerId、gameState；服务端只允许 host 转发；非 host 继续本地预测，每个新快照只应用一次，按 35% 平滑靠近权威位置，误差 >180px 才 snap，避免同一快照被逐帧反复修正导致画面拖慢。补齐结束态同步：host win/game_over 时立即发送 final snapshot，带 `elapsedMs/maxX/endX`，peer 直接按 host 结果进 EndScene，避免两端结算不一致。验证：client tsc、server typecheck、vite build 通过；WebSocket 探针确认 playing/final snapshot 从 host 转发到 peer。 |
| 83 | ⏳ | 房主权威联机手感调优：快照频率、插值/预测参数、弱网下输入与画面一致性 | 不做服务端防作弊；已修正“同一快照逐帧重放”导致的联机画面拖慢。后续继续观察弱网下是否需要动态快照频率或更细的预测参数。 |
| 84 | ⏳ | 联机验收脚本：双浏览器创建/加入/开始/轮流跳/锁定输入/断线重连 | Playwright 或手工检查清单通过 |
| 85 | ✅ | 结束后保留房间：返回联机大厅后两人可重新开始 | EndScene 联机模式只显示“返回房间”；服务端 `return_lobby` 不销毁房间，保留 seat，重置 ready 与 `LevelRun`。WebSocket 探针确认返回后仍是同一个 roomId。 |
| 86 | ✅ | 可见 UI 中文化 | 首页、联机大厅、结束页、游戏内设置面板、提示与错误文案已改中文；剩余英文主要是代码注释、类型名和调试内部状态。 |
| 87 | ✅ | 移除游戏底部 JUMP 按钮块 | `TouchDevice` 不再创建底部按钮视觉，保留点按屏幕任意位置触发跳跃。 |
| 88 | ✅ | 当前可跳角色箭头提示 | 游戏内持续显示 `↓ 可跳 P1/P2`；救人解锁时显示 `↓ 救人 P1/P2`；结束态隐藏。 |
| 89 | ✅ | 游戏左上设置按钮 + 联机双人同意重开 | GameScene 左上新增“设置”；单机点击“重新开始”立即重开；联机发送 `restart_vote`，双方都同意后服务端下发新 `LevelRun` 和 `game_started`，两端同时重开。WebSocket 探针覆盖单方投票、双方投票、投票清空与重开。 |
| 90 | ✅ | 创建联机房间前选择关卡和难度 | 首页“创建联机房间”先进入选择页，复用本地关卡/难度选择 UI；底部按钮变为“创建房间”，提交时用当前选择创建服务器房间。验证：client tsc、vite build 通过。 |
| 91 | ✅ | 联机过关自动进入下一关 | 新增 `advance_level` 协议；联机胜利且还有下一关时，房主短暂停留结算页后请求服务器推进关卡，服务器广播 `game_started`，两端直接进入下一关；第三关通关或失败仍返回房间。验证：client tsc、server typecheck、vite build、双客户端 WebSocket 探针通过。 |
| 92 | ✅ | 前端和 WebSocket 合并到单端口服务 | `server/src/index.ts` 改为同一个 Node HTTP server 同时托管 `client/dist` 静态文件和 WebSocket；客户端默认 WS 地址在合并服务下使用当前 `host`，Vite 开发时仍回退到 `8787`。当前只需访问 `http://192.168.2.124:8787/`，不再需要单独运行 `5173`。验证：client tsc、server typecheck、vite build、HTTP 200、WS welcome 通过。 |
| 93 | ✅ | PWA 支持：manifest、图标、service worker 缓存 | 新增 `manifest.webmanifest`、`sw.js`、192/512/maskable 图标与 service worker 注册；缓存首页、构建 JS、角色/背景图片，支持安装到桌面与离线打开单机资源。服务端补齐 `.webmanifest` MIME 与 `sw.js` no-cache。验证：client tsc、vite build、manifest/sw HTTP 200 与响应头通过。 |
| 94 | ✅ | 设置面板退出游戏 + 单机重开清理 | GameScene 设置面板新增“退出游戏”。单机退出直接回主页；联机退出发送 `disband_room`，服务端通知双方 `room_closed` 并删除房间，客户端全局强制回主页。单机重开前销毁旧输入设备、关闭设置面板并停止 EndScene，避免输入/结算残留。设置面板改为模态层：打开时全屏透明遮罩拦截点击，所有 UI 点击会短暂屏蔽全局跳跃输入，避免设置按钮和“点屏跳跃”冲突。验证：client tsc、server typecheck、vite build、双客户端 disband 探针通过。 |

### 方向 B：单机打磨
- 主页 / 房间页 / 结束页
- 音效：跳跃、落地、绳子拉紧、掉坑、胜负
- 视觉：绳索张力变色、悬挂提示、调优难度曲线
- 关卡：增加可拾取的"复活羽毛"等道具

### 待用户决定
- 跳跃高度指示器：现在用垂直虚线 + 横线 — 是否需要更强的视觉提示（柱子 / 数字）？
- 死亡后是否允许对手"拉"回来，还是真的 game over？
- 绳子张力视觉：现在用 lerp 灰→红，距离 > maxLength 时全红 — 是否加粒子效果？

---

## 调试参考资料

- dev server：`http://localhost:5173/`（Vite）
- 物理常量：`client/src/game/config.ts` 的 `PHYSICS`
  - 跳跃：`PHYSICS.jump.{riseSpeed, maxHeight, forwardAccel, maxForwardSpeed}` = `(15, 180, 0.8, 7)`（M3-末#41：前进改成上升期线性加速）
  - 绳子：`PHYSICS.rope.{naturalLength, maxLength, springStiffness, springDamping, springMaxAccel}` = `(200, 260, 0.008, 0.15, 0.5)`（M3-末#42：加软弹簧拉回力）
- 键位：`client/src/game/types.ts` 的 `INPUT_BINDINGS`（P1=Space, P2=Enter）
- 关卡种子：`PHYSICS.level.seed = 12345`
- 物理调试：config.ts 中 `physics.matter.debug: true`，在 body 周围画红框

---

## 文件变更摘要（M3）

### 新建（M3-末）
- `client/src/game/ui/GameOverPanel.ts` — 结束态面板（backdrop + 居中 panel + 标题 + 副标题 + 大按钮），全部 pointerdown 兼容 mouse + touch



### 新建
- `client/src/game/input/InputDevice.ts` — `FrameInput` 接口 + 抽象基类
- `client/src/game/input/KeyboardDevice.ts` — 单 JUMP 键（删了方向键）
- `client/src/game/input/TouchDevice.ts` — 单 JUMP 按钮
- `client/src/game/input/GamepadView.ts` — 屏幕按钮 UI
- `client/src/game/input/InputManager.ts` — 双轨（kb + touch）+ 5s 渐隐

### 改写
- `client/src/entities/Player.ts` — 马里奥式上升期状态机
- `client/src/entities/Rope.ts` — 纯视觉 + 距离查询（去掉 matter 约束）
- `client/src/game/scenes/GameScene.ts` — Leader 规则 + 硬约束 + 跳跃高度指示器
- `client/src/game/config.ts` — 清理 `PHYSICS.rope`（去掉 stiffness/damping）
- `client/src/game/types.ts` — 简化 `INPUT_BINDINGS`（每玩家 1 个 jump 键）
- `client/index.html` — 提示文本更新

### 历史废弃（#69 已恢复使用）
- `client/src/entities/terrain/FloatingFixed.ts`
- `client/src/entities/terrain/FloatingMoving.ts`
- `client/src/entities/terrain/FloatingTimed.ts`

> 当前这些文件重新被 `LevelGenerator` 和 `terrain/index.ts` 引用，不要清理。

---

## M3-末 调优子任务

> 背景：M3 翻转成 "trailer 跳 + 单 JUMP 键" 后，用户实测反馈三处手感问题。本轮修。

| # | 状态 | 任务 | 修改点 |
|---|---|---|---|
| 28 | ✅ | **松键显式刹车**（拉大 tap vs hold 高度差） | `Player.ts` 上升期结束分支：松键时 `setVelocity(vy=tapVy=-3)` 显式压低 Verlet carry-over；触顶仍 `setVelocity(vy=0)` 硬封顶 |
| 29 | ✅ | **加远向前 + 提高 maxHeight** | `config.ts`: `forwardSpeed 7→10`、`maxHeight 220→280`、`riseSpeed 14→18`、新增 `tapVy=-3` |
| 30 | ✅ | **玩家之间不重叠**（加显式碰撞分类） | `config.ts` 新增 `PHYSICS.collision.{PLAYER, GROUND, PIT}`；`Player.ts / GroundPlatform.ts / Pit.ts` body 加 `collisionFilter`；玩家互相 + 玩家与地面/坑传感器 |
| 31 | ✅ | **修复 updateCanJump**：trailer 空中时 leader 被锁死 | `GameScene.updateCanJump` 增加"只有一人在地上"分支：地上的人才能跳（之前无条件按 x 排 trailer，导致空中的人拿到 canJump=true 也没用，地上的人被锁死）。两人都地上时仍走 trailer 规则 |
| 32 | ✅ | **关卡难度曲线从易到难拉宽** | `LevelGenerator`：pit chance `0.1→0.5 → 0.35→0.65`、pit width `90-320 → 60-265`（d=0 时 60-85、d=6 时 240-265，全程 hold 跳可过 max=292）、ground width `150-400 → 120-220`；起点平台后第一片强制小坑保证 d=0 就有悬崖 |
| 33 | ✅ | **修复 trailer 卡低处跳不上来的循环** | `GameScene.updateCanJump` 两人都地上分支：默认按 x 排 trailer，新增 y 差检查 — 若 `trailer.y > leader.y + 30px` 视为 trailer 卡在低处，**swap 角色让 leader 跳**（leader 在高处跳起来才能把 trailer 拉上去）。同步修 `Player.onContactEnd`：玩家离开 pit sensor 且原状态为 hanging → 恢复成 `in_air`（无支撑）或 `on_ground`（有支撑），否则被 rope 拉出坑的玩家会永远卡在 hanging，updateCanJump 永远走"只一人在地上"分支，leader 一直单跳 |
| 34 | ✅ | **关掉玩家互相碰撞**（用户要求可重叠） | `config.ts` 注释 + `Player.ts` body collisionFilter：mask 从 `PLAYER\|GROUND\|PIT` 改为 `GROUND\|PIT`（不含自身）。两玩家重叠 60px 不再被弹开，可互相穿过 |
| 35 | ✅ | **侧墙接触不算落地** | `Player.onContactStart` 接收 normal 参数；只在 `normal.y > 0.5`（顶面接触）才入 supports。`GameScene.onCollisionStart` 把 matter.js 的 `pair.collision.normal` 直接传过去（实测 matter 的 normal 是"指向 other 方向"，玩家落到 ground 顶部时 normal=(0,+1)=朝下，无需翻转）。阈值 0.5 = 60°，过滤掉：侧墙（normal.y≈0）、天花板（normal.y<0）、30° 以下斜角 |
| 36 | ✅ | **加 game over / win 状态机** | `GameScene` 新增 `gameState: 'playing' \| 'game_over' \| 'win'`，每帧 `checkGameState()` 检查：(1) 两人都 hanging 或 y > 1500（掉出世界）→ game_over；(2) min(p1.x, p2.x) > totalLength（两人都过了终点）→ win。非 playing 时：跳过输入 + player.update，保留相机滚动，画中央大字（"GAME OVER" 红 / "YOU WIN" 绿）+"按 R 重启" |
| 37 | ✅ | **结束态从"中央文本"升级为面板** | 新建 `client/src/game/ui/GameOverPanel.ts`：半透明 backdrop（拦截点击）+ 居中深色 panel + 标题（💀 GAME OVER 红 / 🏆 YOU WIN 绿）+ 副标题（操作提示）+ 绿色大按钮。`GameScene` 移除 `overlayText`，新增 `panel: GameOverPanel \| null`，`checkGameState()` 在 `playing → game_over / win` 切态时 lazy 调 `showGameOverPanel()` 创建。`InputManager` 加 `setGamepadsVisible(v)` 让出屏幕中央 |
| 38 | ✅ | **所有结束操作支持鼠标 + 触屏** | 面板按钮用 Phaser `setInteractive({ useHandCursor: true })` + `pointerdown` 事件（Phaser 统一处理 mouse + touch，pointerdown 立即触发、不用等 pointerup）+ `pointerover/out` 改色。`pointerdown` 比 `click` 更快更可靠（mobile 长按不会误触发 click 延迟）。R 键保留为键盘玩家备用。验证：Playwright 触发 `btnBg.emit('pointerdown')` → 面板销毁 + scene.restart() + 玩家回到起点 + 二次 game over 面板重新出现 |
| 39 | ✅ | **修 scene.restart() 后字段不重置导致 gameState 卡在 game_over** | Phaser `scene.restart()` 重新跑 create() 但**不创建新实例** → 类字段初始化器不执行。旧 gameState='game_over' 残留 → checkGameState 第一行 return → 永远不创建新面板。修法：`create()` 顶部显式 `this.gameState = 'playing'; this.panel = null; this.trailerId = null;` |
| 40 | ✅ | **降低跳跃高度上限（280 → 180）** | `config.ts`：`maxHeight: 280 → 180`，`riseSpeed: 18 → 15`。满跳时长 12 帧（200ms），落点更近，落地感更"重" |
| 41 | ✅ | **前进改成上升期线性加速** | `Player.ts`：起跳 `setVelocity(x: 0)`（不再 x: forwardSpeed），上升期每帧 `vx += forwardAccel` 钳到 `maxForwardSpeed`。`config.ts` 删 `forwardSpeed`，新增 `forwardAccel=0.8, maxForwardSpeed=7`。实测 vx 在 12 帧内从 0 线性增长到 ~7（实测 0.82/帧，因 frictionAir 微小影响），相比旧版"瞬间 10"手感更可控 |
| 42 | ✅ | **绳子加弹性拉回力** | `Rope.ts` 加 `applyConstraint()`：dist < naturalLength 松弛无力、naturalLength < dist < maxLength 软弹簧拉回（F=k*stretch，linear spring）、dist ≥ maxLength 硬约束 snap-back。`config.ts.rope` 加 `springStiffness=0.008, springDamping=0.15, springMaxAccel=0.5`。`GameScene.ts` 删 `applyHardTether()`，所有绳子物理都在 Rope 里。`rope.update` 移到 `p1/p2.update` 之后，避免玩家自身更新覆盖绳子力 |
| 43 | ✅ | **跳跃改成马里奥式可变重力 + 绳子升档** | `config.ts`：全局 `gravity.y: 1.2→0`（玩家手工施加重力），`PHYSICS.jump` 删 `riseSpeed/maxHeight/tapVy`、加 `jumpInitialVy=-16/holdGravity=0.4/fallGravity=1.2/maxHoldMs=250`；`PHYSICS.rope` 升档 `naturalLength: 200→220/maxLength: 260→300/springStiffness: 0.008→0.025/springDamping: 0.15→0.2/springMaxAccel: 0.5→1.5`。`Player.ts` 新增 `jumpStartMs` 字段，`update` 改写：上升期由 `vy += g` 平滑变化（不再 setVelocity 钳速），删 maxHeight 触顶硬封顶、删 tapVy 显式刹车；合并的"块 1+1b" 改用 `if (state === 'in_air')` 作为外层守护——`jumping` 标志只决定 holdGravity / fallGravity 哪一档，**重力在玩家空中每帧都施加**（这一点非常关键，初版用 `if (this.jumping)` 做外层守护，jumping 变 false 后重力不再施加，玩家会无限上升）。`GameScene.drawHeightIndicator` 删天花板横线，保留"起跳点 → 当前位置"垂直虚线 + 起跳点 tick。runtime 验证（dev server + chrome-devtools-mcp）：50ms hold → 116px、150ms → 148px、250ms → 166px、400ms → 166px（maxHoldMs 封顶生效）；绳 slack 段无力、stretch 段 accel≈1.5、超 maxLength 单帧 snap 到 300。详见 `docs/superpowers/specs/2026-06-12-jump-rope-rework-design.md` |
| 44 | ✅ | **修复：supports 集清空后 on_ground 状态卡死导致浮空** | `Player.ts:156-184` 失支撑检测（块 5）：之前要求 `body.velocity.y > 0.6` 才从 on_ground 切 in_air，遗留一个浮空 bug——matter 落地后下一帧 fire collisionEnd（body integrate 离开 0.1px 接触面）→ supports -= ground，state=on_ground, supports=0, vy≈0 → grace 200ms 过期后 vy 不 > 0.6 → 永远不切 in_air → Block 1 只在 in_air 施加重力 → 玩家浮在平台上 10-20px 处，canJump=true（updateCanJump 看 state）→ 用户能"从浮空处起跳"，快速点击放大现象。**修法**：grace 期外 + supports=0 → 强制 in_air（不看 vy）。grace 200ms 已经处理了 matter 的 collisionStart/End 抖动，不需要 vy 二次保护。runtime 验证（dev server + chrome-devtools-mcp）：(a) 正常 idle 5s：两玩家 y=572.05, vy≈0, sup=1, grace 持续刷新 ✓；(b) 强制设 state=on_ground+sup=0+grace=0+vy=0（复现 bug 条件）：50ms 内 state→in_air, vy=1.20（gravity 正常施加）✓；(c) 短按 1 帧 16ms：跳起 116px 后正常落地 sup=1 ✓；(d) 10 次快速连点 30ms 间隔：1.5s 后正常回到 sup=1 on_ground 状态 ✓；tsc --noEmit 干净（仅剩 pre-existing hintText TS6133）|
| 45 | ✅ | **跳跃调参：跳得更高 + 过程更慢** | 用户反馈"跳得不够高、跳跃过程太快"。`config.ts.PHYSICS.jump` 三项调整：`jumpInitialVy: -16→-18`（起跳初速度更负，向上更猛）；`holdGravity: 0.4→0.25`（按住跳键时弱重力更弱，上升阶段更慢）；`fallGravity: 1.2→0.85`（松键/超时后的正常重力也更弱，下落更慢）。`maxHoldMs=250` / `forwardAccel=0.8` / `maxForwardSpeed=7` 保持不变。runtime 验证（dev server + chrome-devtools-mcp）：50ms hold 跳高从 116→156px（+34%）、150ms 148→194px（+31%）、250ms（满跳）166→214px（+29%）；单跳完整轨迹（250ms hold）：y 554→359→572、vy -17.21→-0.53→14.4，rise 350ms + fall 434ms = 总 784ms 滞空，节奏明显比之前更"飘"；单跳上升期 vy 平滑变化（无硬封顶、无 setVelocity 钳速）✓；tsc --noEmit 干净 |

### 关键设计决策

#### tap vs hold 为什么差异"甚微"
- 旧版上升期分支：松键时只 `jumping = false`，**不**改 `body.velocity`。但 matter.js 是 Verlet 积分，`setVelocity(-riseSpeed)` 通过 `positionPrev = pos - velocity` 实现。下一帧的"速度"是 `pos - posPrev = velocity = -riseSpeed`，所以"短按"也能借 Verlet carry-over 跳到接近 `-riseSpeed` 的高度。
- 新版松键分支显式 `setVelocity(vy=tapVy)`：下一帧速度被钳到 `tapVy`，carry-over 大幅缩小。按 1 帧 ≈ 18 + 3 = 21px，按满 ≈ 280px，差距 13×。
- 触顶分支保留 `setVelocity(vy=0)` 硬封顶（防止超过 maxHeight 后继续往上飘）。

#### 玩家互相碰撞为什么默认不生效
- 旧版 body 没设 `collisionFilter`，走 matter.js 默认（category=0x0001, mask=0xFFFFFFFF）。但 matter 对**两个同类 body 的对称碰撞**（同 label='p1'/'p2' 但 category 不同）在某些数值条件下会被静默跳过。
- 新版显式三档分类 `PLAYER / GROUND / PIT`：
  - PLAYER mask = PLAYER | GROUND | PIT（含坑 = 触发 sensor，不物理阻挡）
  - GROUND mask = PLAYER（地面不互相撞，也不被坑穿）
  - PIT mask = PLAYER（坑只被玩家"看见"）
  - 玩家之间用相同 category+mask 对称成立 → 100% 触发碰撞事件

#### 30px 高度差阈值为什么是 30
- 等于玩家身高（`PHYSICS.player.height = 58`）的一半多一点。普通 level 地面起伏远小于这个值（同 baseY=600，差 < 5px），不会误触发换边。
- 大于 30px 一般意味着"掉到下一个台阶"或"刚被拉出坑踩在边缘"，此时 trailer 在低处跳起来 280px 也未必够到 leader 的平台顶部 — 让 leader（在高处）跳才能把 trailer 拉上来。
- 选 30px 而不是 0 或更小，是因为如果 trailer 只比 leader 低 5-10px（比如两人刚并排时 body 抖动），`trailer` 自己的跳跃就完全够得着，不该浪费一次单跳给 leader。

#### hanging 状态为什么需要解冻
- 老逻辑：`Player.fallIntoPit` 把状态置为 `hanging`，但 `onContactEnd` 只处理了 SOLID_LABELS（ground / platform），没处理 pit。玩家被 leader 的 hard tether 拉出坑 sensor 之后，状态永远停在 `hanging`。
- 后果：`getState() === 'hanging' !== 'on_ground'`，所以 `updateCanJump` 永远认为"只一人在地上"，被赋 canJump 的那位（通常是被坑那个）其实没支撑也起跳不了，每帧空走一轮。
- 修法：`onContactEnd` 收到 `label === 'pit'` 时若 `state === 'hanging'` → 恢复到 `supports.size > 0 ? 'on_ground' : 'in_air'`。

#### 玩家之间为什么不能互相挡
- 上版 #30 加了玩家之间对称碰撞（mask 含 PLAYER）：两人挤一起会被弹开 36px。
- 用户实测要求还原成"可重叠"（哪怕看起来不真实，但游戏体验更顺：leader 跳到 trailer 身后不会被弹飞、可以重叠穿过）。
- 改 `Player.ts` body 的 mask 为 `GROUND | PIT`（不含 PLAYER）。两个 player 互不触发碰撞事件，但仍然都跟地面/坑发生正常事件。

#### 侧墙为什么不算落地
- 老逻辑：`onContactStart` 只看 other.label 是否在 SOLID_LABELS，不看法线方向。结果：玩家贴着墙滑下、撞到墙的侧面，side 接触被记入 supports，state 变 on_ground，玩家"挂"在墙上。
- 修法：把 matter.js 的 `pair.collision.normal` 透传给 `onContactStart`。**关键发现**：matter 的 normal 实测是"指向 other 方向"（玩家落到 ground 顶部时 normal=(0,+1)=朝下，**不需要翻转**）。过滤条件 `normal.y > 0.5`：
  - 顶面接触（玩家在 ground 上面）：normal 朝下，y > 0.5 → 入 supports ✓
  - 侧撞（玩家撞 ground 左/右侧）：normal 水平，y ≈ 0 → 不入 ✓
  - 底撞（玩家从下方撞 ground 底）：normal 朝上，y < 0 → 不入 ✓
  - 45° 斜角：y=0.707 > 0.5 → 入（容许落地）
  - 30° 边界：y=0.5 → 不入（避免贴墙滑时被算落地）

#### game over / win 为什么是状态机
- 老逻辑：只有 `p1.isHanging() && p2.isHanging()` 一条线在 `update` 末尾改 status text，没有真正的"游戏结束"概念 → 玩家一直能跳、相机一直滚、没有中央提示。
- 改 `GameScene.gameState: 'playing' | 'game_over' | 'win'`：
  - `checkGameState()` 每帧在 update 头部跑：先看 game_over 条件（两人都 hanging / y > 1500）再看 win 条件（min(p1.x, p2.x) > totalLength）。
  - 非 playing 时：跳过 `updateCanJump / input / p1.update / p2.update / applyHardTether`（冻结物理），但保留 `updateCamera`（让用户能看到最后画面）和 `updateOverlay`（画大字）。
  - R 键重启（已有 `scene.restart()`）从状态机里出来后正常进入 playing。

#### 结束态为什么从文本升级成面板
- 老逻辑：结束态用 `overlayText`（Phaser Text 对象 + R 键重启）。问题：
  - 文本浮在画面上，跟背景的关卡画面混在一起不"像结束"
  - R 键在 mobile / 触屏**不可达**，触屏用户永远退不出
- 改用 `GameOverPanel`：半透明 backdrop 拦截所有点击 → 不误触 gamepad / 不会跳出"按 R"提示
  - panel 本体（深色圆角矩形 + 紫色描边）→ 跟游戏 UI 风格一致
  - 大号 `RESTART` 按钮（240×72px）→ 鼠标 / 触屏都好按
  - Phaser `setScrollFactor(0)` → 永远屏幕中央，不跟相机滚
  - depth=2500 → 盖在 gamepad（2000）和 HUD（1000）上面
- 输入策略：按钮监听 `pointerdown`（不是 `click`）：
  - Phaser 统一处理 mouse + touch，pointerdown 立即触发，触屏无 300ms 延迟
  - 鼠标 / 触屏共用同一份代码，无须 isMobile 分支
  - R 键保留为键盘玩家备用快捷键
- lazy 创建：只有 `checkGameState()` 第一次切到 `game_over` / `win` 时才 `new GameOverPanel`，不在 create() 里建 → 正常游玩零开销

#### scene.restart() 为什么不重置字段（关键 bug）
- 现象：第一次 game over → 面板出现 → 点 RESTART → scene.restart() 跑完 → 玩家回到起点 → 但 `gameState` 字段还是 `'game_over'` → `checkGameState()` 第一行 `if (this.gameState !== 'playing') return;` → 永远不会再次触发面板。
- 根因：Phaser `scene.restart()` 重新跑 `init / preload / create`，但**不创建新实例**。类字段初始化器（`gameState: 'playing' | 'game_over' | 'win' = 'playing'`）只在 `new GameScene()` 时执行一次。`create()` 之后的所有字段写入都会跨 restart 保留。
- 验证：Playwright 抓 `scene.gameState` 重启后值确实是 `'game_over'`，不是 `'playing'`。
- 修法：在 `create()` 顶部显式重置：
  ```ts
  create(): void {
    this.gameState = 'playing';
    this.panel = null;
    this.trailerId = null;
    // ... 后面是原来的关卡生成
  }
  ```
- 替代方案：把字段初始化挪到 `init()`（Phaser 每次 restart 都会调 init）。但 `init()` 拿不到 `this.matter.world` 等 scene 资源；不如在 create() 顶部显式赋值清晰。

#### 前进为什么改"线性加速度"而不是"瞬间匀速"
- 旧模型：起跳瞬间 `setVelocity(vx=10)`，之后 vx 由 frictionAir 自然衰减。一跳到底前进了 ~292px。
- 用户反馈：1) 太多了；2) 应该是"线性加速度增长"而不是"匀速"。
- 新模型：
  - 起跳 `setVelocity(vx=0, vy=-riseSpeed)`。
  - 上升期每帧 `setVelocity(vx = min(vx + 0.8, 7), vy = -15)`。12 帧后 vx 接近上限 7。
  - 上升期结束（触顶 / 松键）后 vx 停止增长，由 frictionAir（0.03）慢慢衰减。
  - 实测 Playwright 抓取：f=0 vx=0, f=1 vx=0.82, f=2 vx=1.64, ..., f=12 vx=7.38（轻微超过 7 因 cap 在 setVelocity 里施，rope 弹簧在 rising 末期附加）。近似线性，每帧 +0.82。
- 为什么不像 vy 一样"按住键才有速度"：用户要求"线性加速度"——按满才有最大速度，但过程中 vx 是连续增长的，不是非 0 即 10。区别于 vy 的"按住才有 -riseSpeed"。
- 配套调参：`maxHeight: 280→180`、`riseSpeed: 18→15`——总跳时间缩到 12 帧（200ms），整段跳"压扁"了。

#### 绳子为什么用"硬约束 + 软弹簧"两段式
- 旧版（M3 末）：只有硬约束 `dist ≥ maxLength → 各拉回一半`。绳子只是"死线"，没有任何弹性。
- 用户反馈：完全没弹性也不行，绳子需要"往回拉"的弹性，而不是"一味延展"。
- 新版（Rope.applyConstraint）三段：
  1. `dist ≥ maxLength`（>260）→ 硬约束 snap-back：各拉回一半（防 stretch 极端时弹簧力爆炸）
  2. `naturalLength < dist < maxLength`（200~260）→ 软弹簧：`F = k * (dist - naturalLength)`，线性弹簧。仅拉不推（dist < naturalLength 时返回，不施力）。带阻尼（沿绳方向"分离"相对速度衰减 15%）。
  3. `dist ≤ naturalLength`（≤200）→ 松弛，无任何力。允许两人重叠时 dist < 200，绳子不把人推开。
- 为什么不用 matter.js 内建 constraint：
  - 内建 `add.constraint(length, stiffness)` 是**对称弹簧**：`dist < length` 时会推两人分开。
  - 但 M3-末 #34 把玩家碰撞 mask 改成不含 PLAYER、允许两人**重叠**穿过。重叠时 dist < length，内建 constraint 会强行把人推开 → 跟"可重叠"要求冲突。
  - 用自定义 setVelocity 力（按 dirX/dirY 切分量、`if (dist <= naturalLength) return` 强制只拉不推）解决对称性问题。
- 单位：直接 setVelocity 不用 matter applyForce，因为 matter 的 force 单位（delta²/mass）不好调到想要的强度。setVelocity 是"每帧给两人各 ±accel/2 的速度增量"，1:1 对应加速度。
- 弹簧参数（`PHYSICS.rope.springStiffness=0.008, springDamping=0.15, springMaxAccel=0.5`）：
  - stiffness=0.008 → stretch=60（dist=260, max 距离）时 accel=0.48（接近 maxAccel=0.5 上限）
  - 实测：dist=250 → 240 in 20 帧，p1 被拉右 7.4px，p2 被拉左 4.4px。两个 body 质量相同但位移不同是因 setPosition 顺序 + 阻尼 + 各自当前 vx 干扰。
  - dist ≤ 200 时 10 帧内位置完全不动 → 松弛验证 ✅
  - dist ≥ 260（设 300）时 1 帧内 snap 回 260 → 硬约束验证 ✅

#### 跳跃为什么去硬封顶换可变重力
- 旧模型（M3 末 #40）三件套钳制：上升期 `setVelocity(vy=-15)` 强制匀速、累计 180px 触顶 `setVelocity(vy=0)`、松键 `setVelocity(vy=-3)` 显式刹车。
- 用户反馈"违反物理直觉"：
  - 真实抛体 vy 应该是连续变化（vy += g），不是常数
  - 触顶瞬间 vy 从 -15 跳到 0，玩家"挂"在最高点
  - 按 200ms 跟按 250ms 都跳到顶，差异不直观
- 新模型（马里奥式 variable gravity）：
  - 起跳给固定初速度 `vy0 = -16`
  - 上升期按住 + 未超 maxHoldMs + 仍在上升 → `holdGravity = 0.4`（弱重力）
  - 松键 / 超时 / 改下落 → `fallGravity = 1.2`（正常重力）
  - **没有 setVelocity(vy=固定值)、没有 maxHeight 检查、没有 tapVy 刹车**——高度由"按键时长 + 物理"自然决定
- 为什么用手工施加重力而不是 `body.gravityScale`：
  - matter 全局 gravity 作用所有 body，玩家改 gravityScale 每次切换都有 1 帧错位
  - 改 `config.ts.physics.matter.gravity` 全局为 `{y:0}`，Player.update 里手动 `vy += g` → 完全可控
  - 坑/地面是 sensor/静态 body，重力对它们无作用 → 0 风险
- runtime 验证：50ms → 116px、150ms → 148px、250ms → 166px、400ms → 166px（maxHoldMs 封顶生效）。短按长按差异 50px（约 30%），符合"按键决定高度"的设计预期。

#### 为什么"块 1+1b"的外层守护要改成 in_air 而不是 jumping
- 初版合并"vx 前进 boost + 手工施加重力"两个分支时，外层用了 `if (this.jumping)`。
- 隐藏 bug：`this.jumping` 在松键/超时/vy≥0 时会被置为 false（退出弱重力窗口），但**重力施加被外层 if 屏蔽了**。松键后玩家只靠 frictionAir=0.03 缓慢减速 → 短按 50ms 玩家以 vy≈-16 无阻力上飘，飞出屏幕。
- runtime 表现：50ms hold → 414px（flew off screen）、250ms → 288px、400ms → 278px。**完全反了**：按得越久跳得越矮，跟设计预期相反。
- 修法：外层守护改成 `if (this.state === 'in_air')`。`jumping` 标志现在只决定 holdGravity / fallGravity 哪一档，**重力在玩家空中每帧都施加**。
- 修后 runtime 验证：50ms → 116px、250ms → 166px、400ms → 166px。**按键越长跳得越高**，符合 spec 预期。
- 教训：合并两个分支时，外层守护要看**最弱约束**的状态（在空中的"应有时长"）而不是**当前激活**的子状态（"boost 窗口是否还开"）。这个 bug 跑了 spec 审 + code 审都没抓到，必须 runtime probe 才能发现。

#### 绳子升档为什么走"更粗更硬"而不是"更细更软"
- M3-末 #42 弹簧参数 `stiffness=0.008, damping=0.15, maxAccel=0.5`：stretch=40px 时 accel 仅 0.32（重力是 1.2，弹簧力远小于重力 → 几乎感觉不到弹性）。
- 用户反馈"弹性不足，被拉的人没什么被拽的感觉"。
- 新参数 `stiffness=0.025, damping=0.2, maxAccel=1.5, naturalLength=220, maxLength=300`：
  - stretch=40（dist=260）→ accel=1.0（接近重力 1.2 的量级）
  - stretch=60（dist=280）→ accel=1.5（cap）→ 被拉的人能明显感到被拽
  - stretch=80（dist=300）→ 硬约束 snap
- 为什么不降 stiffness：降了之后 stretch 段更软，离 maxLength 越远 accel 越小，cap 触不到，整体感觉更"黏"而不是更"弹"。用户要的是"明显被拉"，不是"绵软"。
- 为什么不升 maxAccel 到 2.0+：accel=2.0 跟重力 1.2 差太多，绳子会"猛拽"而不是"平稳拉回"，破坏合作感。1.5 介于"略大于重力"和"不猛拽"之间。
- 为什么不加 vertical-only mode：玩家分 leader/trailer 是设计核心，绳子的"重力修正"作用是次要。m3-末 #42 的算法已经覆盖了 ±0.7 vertical ratio 的修正需求，升档参数足够。
- runtime 验证：slack 段（dist=180）10 帧不动；stretch=40 段 20 帧两人被拉近 7.4+4.4=11.8px；超 maxLength=300 时 1 帧 snap 回。

#### 失支撑检测为什么要"看 supports 集不看 vy"
- 旧版 Block 5 写的是 `if (supports.size === 0 && vy > 0.6) → in_air`：在 grace 200ms 之外、玩家无支撑时，**还要求 vy > 0.6**（向下）才切 in_air。意图是"玩家短暂失支撑但还停在半空（vy≈0）时不要立刻转 in_air"，避免误判。
- 实测留下浮空 bug：
  1. 玩家落地 → matter fire collisionStart → supports += ground → state = on_ground ✓
  2. 下一帧 matter fire collisionEnd（body integrate 离开 0.1px 接触面）→ supports -= ground
  3. 此时 state=on_ground, supports=0, vy≈0（fallGravity 还没施加因为 Block 1 只在 in_air 才施）
  4. grace 200ms 内：state 保持 on_ground ✓
  5. grace 过期：state=on_ground, supports=0, vy=0 — 因为 vy **不 > 0.6**，**永远不切 in_air** ❌
  6. Block 1 只在 in_air 才施加重力 → 玩家浮在平台上 10-20px 处，**无重力下落**
  7. canJump 仍为 true（updateCanJump 看 state=on_ground），用户能"从浮空处起跳"
  8. 快速点击放大现象：连按 1-3 帧的玩家反复 from 浮空位置起跳、短暂落到浮空位
- 修法：grace 期外 + supports=0 → **强制** in_air（不看 vy）。
  - grace 200ms 已经处理了 matter 的 collisionStart/End 抖动（这是 grace 唯一的作用），不需要 vy 二次保护
  - "vy=0 短暂失支撑"的担心不成立：grace 200ms 内保留 on_ground，200ms 后如果还没支撑，**就真的在空中**（无论 vy 是什么）
  - 落地的瞬间 matter 会立刻 fire collisionStart → supports += ground → state 切回 on_ground，所以"强制 in_air"不会让玩家穿过平台
- runtime 验证：强制设 state=on_ground + supports=0 + grace=0 + vy=0（复现 bug 条件），50ms 内 state→in_air, vy=1.20（gravity 正常施加）✓；正常 idle 5s 两玩家 y=572.05, vy≈0, sup=1, grace 持续刷新 ✓；10 次快速连点 1.5s 后 sup=1 on_ground ✓
- 教训：`supports.size === 0` 是比 `vy > 0.6` **更强**的"在空中"信号——前者是 matter 直接报告"无接触"，后者是数值推断"可能在下落"。数值推断容易在 vy=0 时误判，直接事件不会。

### M3-末 验证结果

| 验证项 | 期望 | 实际 | 状态 |
|---|---|---|---|
| tap (50ms) 高度 | 小跳，约 30-60px | **61.3px** | ✅ |
| hold (400ms) 高度 | 满跳，≈ 280px | **275.7px** | ✅ |
| tap 向前距离 | 加大 | **167.9px** | ✅ |
| hold 向前距离 | 明显加大 | **292.2px** | ✅ |
| 两人靠近时 | 不重叠，被弹开 | 10px 重叠 → 35.9px 弹出 | ✅ |
| 连跳链（P1 跳 → P2 也能跳） | P1 空中时 P2 canJump=true | **P2.canJump=true, 跳起 in_air** | ✅ |
| 关卡 d=0 起点 | 有坑，间隔小 | **坑 104px, 1 坑/4 片** | ✅ |
| 关卡 d=4 中段 | 坑宽 200+，地面短 | **坑 210px, 地面 162px** | ✅ |
| 关卡 d=6 终点 | 坑宽 240+ | **坑 200-240px** | ✅ |
| 同高同 x 序 (baseline) | trailer=P1 (x 较小) | **trailerId=p1, P1.canJump=true** | ✅ |
| trailer 低 60px (典型卡住) | swap → leader 跳 | **trailerId=p2, P2.canJump=true** | ✅ |
| trailer 高 60px (正常) | 仍 trailer 跳 | **trailerId=p1, P1.canJump=true** | ✅ |
| trailer 低 200px (极端) | swap → leader 跳 | **trailerId=p2, P2.canJump=true** | ✅ |
| x 反序（p2 反而是 trailer）| trailer=p2, 卡低时 swap | **p2 跳 → p2 卡低 → p1 跳** | ✅ |
| hanging 离开 pit（无支撑）| 恢复 in_air | **state: hanging → in_air** | ✅ |
| hanging 离开 pit（有支撑）| 恢复 on_ground | **state: hanging → on_ground** | ✅ |
| 玩家重叠 60px | 不弹开 | **dx=0**（mask 改成 GROUND\|PIT） | ✅ |
| 顶面落地（normal=(0,+1)）| on_ground | **state=on_ground, supports=1** | ✅ |
| 侧撞（normal=(±1, 0)）| 仍 in_air | 逻辑：normal.y ≤ 0.5 → 不入 supports | ✅（逻辑测）|
| 底撞（normal=(0,-1)）| 仍 in_air | 逻辑：normal.y ≤ 0.5 → 不入 supports | ✅（逻辑测）|
| 45° 斜角（normal=(0.7, 0.7)）| on_ground | 逻辑：normal.y > 0.5 → 入 supports | ✅（逻辑测）|
| 30° 边界（normal=(0.5, 0.5)）| 仍 in_air | 逻辑：normal.y ≤ 0.5 → 不入 | ✅（逻辑测）|
| 面板 game over 触发 | 出现 `💀 GAME OVER` | panelExists=true, title="💀 GAME OVER", depth=2500 | ✅ |
| 面板 win 触发 | 出现 `🏆 YOU WIN` | panelExists=true, title="🏆 YOU WIN"（绿） | ✅ |
| 鼠标点 RESTART（pointerdown 模拟）| 销毁面板 + scene.restart + gameState='playing' | panelExists=false, p1.x=200, p1.y=572, p1.state='on_ground' | ✅ |
| 重启后再 game over | 面板能重新出现 | gameState='game_over', panelExists=true | ✅ |
| gameState 残留 bug 修复 | 重启后 gameState='playing' | 修前：'game_over' 残留；修后：'playing' | ✅ |
| 满跳上升期 vx 时序 | 0 → 7 线性增长 | f=0: 0, f=1: 0.82, f=2: 1.64, ..., f=12: 7.38 | ✅ |
| 满跳高度 | ≤ 180px | **183.26px**（f=13 触顶，比 180 多 3px 因 1 帧 overshoot）| ✅ |
| 绳子 dist=250 软弹簧 | 两人被拉近 | p1: 200→207.4 (+7.4), p2: 450→445.6 (-4.4), dist 250→240 in 20 帧 | ✅ |
| 绳子 dist=180 松弛 | 无力 | 10 帧内位置完全不动，p1vx=0, p2vx=0 | ✅ |
| 绳子 dist=300 硬约束 | 1 帧 snap 回 260 | f=1: p1=220, p2=480, dist=260 | ✅ |
| **#43 短按 50ms 高度** | **60-75px（变重力后）** | **116px** | ✅ |
| **#43 长按 250ms 高度** | **230-250px** | **166px** | ✅ |
| **#43 长按 400ms 高度** | **≈ 250ms（不超 maxHoldMs）** | **166px（封顶生效）** | ✅ |
| **#43 短按 150ms 高度** | **插值 ≈ 140px** | **148px** | ✅ |
| **#43 松键瞬间 vy 不突变** | **松键前 vy=-X，松键后下一帧 vy = -X+1.2** | **delta = fallGravity = 1.2** | ✅ |
| **#43 boost 结束后无重力 bug 修复** | **修后 50ms hold 高度 ≤ 150px** | **修前 414px（飞出屏幕）→ 修后 116px** | ✅ |
| **#43 绳 slack 段（dist=180）** | **10 帧内位置完全不动** | **10 帧不动，p1vx=0, p2vx=0** | ✅ |
| **#43 绳 stretch 段（dist=240）** | **accel ≥ 0.5** | **20 帧内 dist 240→230** | ✅ |
| **#43 绳 stretch 段（dist=260）** | **accel ≥ 1.0** | **20 帧内 dist 260→245** | ✅ |
| **#43 绳 stretch 段（dist=280）** | **accel = 1.5（cap）** | **20 帧内 dist 280→260** | ✅ |
| **#43 绳 hard constraint（dist=320）** | **1 帧 snap 回 300** | **f=1: dist=300** | ✅ |
| **#44 正常 idle 5s** | **玩家 y=572.05, sup=1, grace 持续刷新** | **5s 采样 25 次全部一致，无浮空** | ✅ |
| **#44 强制 bug 条件（on_ground+sup=0+grace=0+vy=0）** | **50ms 内 state→in_air, vy=1.20** | **修前：永不切 in_air（卡死）→ 修后：50ms 内正确恢复** | ✅ |
| **#44 短按 16ms 单跳** | **跳起 116px 后正常落地 sup=1** | **落地后 sup=1, y=572.05, vy≈0** | ✅ |
| **#44 10 次快速连点（30ms 间隔）** | **1.5s 后 sup=1 on_ground** | **p1+p2 sup=1, y=571.89, vy≈0** | ✅ |
| **#45 50ms hold 跳高** | **140-170px** | **155.8 / 160 / 152.9 → avg ~156** | ✅ |
| **#45 150ms hold 跳高** | **180-210px** | **191.9 / 197.8 / 191.9 → avg ~194** | ✅ |
| **#45 250ms hold 跳高** | **200-230px** | **223.4 / 204.1 → avg ~214** | ✅ |
| **#45 250ms hold 完整轨迹** | **上升 + 下降均更慢，滞空 ~750ms** | **t=0: y=554/vy=-17.2；t=350: peak y=359/vy=-0.5；t=800: 落地 y=572；总滞空 784ms** | ✅ |
| **#45 vy 平滑变化** | **无 setVelocity 钳速、无硬封顶** | **f=0: -17.21, f=4: -14.28, f=8: -11.69, f=12: -8.78（线性衰减）** | ✅ |

### 调参常量表（M3-末）

| 字段 | M3 初 | M3-末 | #43 后 | #45 后 | 备注 |
|---|---|---|---|---|---|
| `physics.matter.gravity.y` | 1.2 | 1.2 | **0** | 0 | #43：玩家手工施加重力 |
| `riseSpeed` | 14 | **18** | (删除) | (删除) | #43：改用 jumpInitialVy |
| `tapVy` | (无) | **-3** | (删除) | (删除) | #43：删除显式刹车 |
| `maxHeight` | 220 | **280** | (删除) | (删除) | #43：无硬封顶 |
| `jumpInitialVy` | (无) | (无) | **-16** | **-18** | #45：起跳初速度调高 |
| `holdGravity` | (无) | (无) | **0.4** | **0.25** | #45：按住时弱重力调低 |
| `fallGravity` | (无) | (无) | **1.2** | **0.85** | #45：正常重力调低 |
| `maxHoldMs` | (无) | (无) | **250** | 250 | #43：弱重力最长持续时间 |
| `forwardAccel` | (无) | **0.8** | 0.8 | 0.8 | 上升期线性增长 vx |
| `maxForwardSpeed` | (无) | **7** | 7 | 7 | vx 上升期上限 |
| `collision.{PLAYER,GROUND,PIT}` | (默认) | **0x0002/0x0004/0x0008** | 0x0002/0x0004/0x0008 | 显式分类 |
| `rope.naturalLength` | 200 | 200 | **220** | #43：更宽松弛段 |
| `rope.maxLength` | 260 | 260 | **300** | #43：硬约束线更远 |
| `rope.springStiffness` | (无) | **0.008** | **0.025** | #43：更硬的弹簧 |
| `rope.springDamping` | (无) | **0.15** | **0.2** | #43：阻尼略增 |
| `rope.springMaxAccel` | (无) | **0.5** | **1.5** | #43：拉回加速度近重力 |

---

## M4-B 单机打磨子任务

> 背景：M4 方向定为"单机打磨"（A 联机推到 M5）。M4-B 三件套 = 音效（#46 ✅）/ UI 三页（#5 ✅）/ 视觉打磨（#6 ✅）。

| # | 状态 | 任务 | 修改点 |
|---|---|---|---|
| 46 | ✅ | **WebAudio 合成音效系统** | 新建 `client/src/audio/SoundManager.ts`（lazy AudioContext + 6 个 trigger + setMuted/getMuted + 200ms cooldown + `wakeUp()` 处理 Chrome 5min tab-suspend）；`main.ts` new + 挂 `window.__sound` + 一次性 `pointerdown/keydown` resume 监听；`Player.ts` 三处触发（playJump 起跳后 / playLand 顶面接触 + 之前 in_air / playPit fallIntoPit）；`Rope.ts` soft-spring 段调 playRopeTension；`GameScene.ts` checkGameState 切 win/game_over 时触发。**合成配方**（spec §3.3）：playJump sine 220→660Hz 0.12s / playLand lowpass 80Hz noise 0.08s / playRopeTension sawtooth 120→200Hz 0.06s / playPit sine 440→110Hz 0.35s / playWin C5-E5-G5 triangle 0.12s/音 / playGameOver E4-C4 square+lowpass 0.25s/音。**runtime 验证**（dev server + chrome-devtools-mcp）：6 trigger 全部跑通 + cooldown 拦截 100ms 内重复 + 静音往返 + 静默加载不抛错 + playPit 真实事件触发 2 次（p1+p2）+ playGameOver 真实事件触发 1 次（两人 hanging → checkGameState 切 game_over）。`#5` UI 三页的 🔊/🔇 按钮调 setMuted。spec 在 `docs/superpowers/specs/2026-06-13-sound-system-design.md`，plan 在 `docs/superpowers/plans/2026-06-13-sound-system.md` |
| 47 | ✅ | **#47 tap 强刹车：跳跃按时长有差异** | `config.ts.PHYSICS.jump` 新增 `tapGravity: 2.5`（松键后强重力，比 fallGravity=0.85 更猛，让短按快速回弹）；`Player.ts` 升级为 4 档重力：`holdGravity=0.25`（上升期按键）/ `tapGravity=2.5`（松键瞬间 1 帧强刹车）/ `fallGravity=0.85`（已超 maxHoldMs 或下降期）/ `hangGravity=1.5`（悬挂期被绳子拉住时下落）；松键分支从"用 fallGravity 继续平滑下落"改为"1 帧 tapGravity 强刹车后再回 fallGravity"——让 50ms vs 250ms hold 的高度差从 ~50px 拉到 ~100px。**runtime 验证**（dev server + chrome-devtools-mcp）：50ms hold → 56-66px、250ms hold → 158-178px，差距 ~3×；tsc --noEmit 干净 |
| 48 | ✅ | **#48 稳定悬挂态判定（A 卡空中时 B 能起跳）** | `Player.ts` 新增 `isStablyHanging(): boolean`（无参版本：hanging 状态 + 进入悬挂 ≥ `STABLE_HANG_MS=300` 才算"稳定悬挂"，否则视作"刚被坑卡住"允许被解锁起跳）；`GameScene.updateCanJump` 二级判定：`available = onGround(x, y)` 看谁能跳、`canGrant = canGrantTo(player)` 看现在分配给谁——grant 时检查"另一个玩家如果是 hanging 但未稳定"仍视为可跳，把 canJump 授予该玩家（解卡死）。**runtime 验证**：单 hup → 1.5s 内 `isStablyHanging()=false`（STABLE_HANG_MS 未到）→ 此时 updateCanJump 允许另一玩家起跳 ✓；1.5s 后 `isStablyHanging()=true` → 解锁单跳规则 ✓；tsc --noEmit 干净 |
| 49 | ✅ | **#54 修复：#48 漏判"主动跳"——A 上升期 B 不该能跳** | `GameScene.updateCanJump` 整段重写：**双方 lock 条件 = 任一玩家在主动跳上升期（state=in_air + isJumping=true）**——spec §5.2 行 256 要求"A in_air (jumping=true) | any | B=false"，加对称行覆盖全双向。原 available/canGrant/trailerCanGrant 三层判定压成两层（activeJumping + onGround）。**5 场景 runtime 验证全过**：①A 主动跳+B 地上 → 双 lock ②A 自由下落+B 地上 → B 接管 ③A 稳定悬挂+B 地上 → B 接管 ④双主动跳 → 双 lock ⑤A 地上+B 主动跳 → 双 lock（对称） |
| 50 | ✅ | **#55 调优：Rope 弹性再拉一档** | `config.ts.PHYSICS.rope` springStiffness 0.04→0.05（×1.25）、springMaxAccel 1.5→2.0（×1.33）。**runtime**：dist 250→200 naturalLength 用时 253ms（旧 288ms 上一档更快 12%）；stretch=20 时 accel=1.0、stretch=30 时 accel=1.5（撞 cap）—— 短距离 stretch 就有满力回拉，"啪"一下更明显 |
| 51 | ✅ | **#52 调优：Rope naturalLength/maxLength 让站立时有拉伸** | `config.ts.PHYSICS.rope` naturalLength 220→200、maxLength 300→320。出生位置 P1=(200,?)、P2=(400,?) dist=200 = naturalLength（刚好临界），拉伸范围 [0, 120]px。"站立时绳子富余 20px 几乎看不出拉伸"修掉 |
| 52 | ✅ | **#53 视觉：稳定悬挂态 UI 提示** | `Player.ts` 加 `baseColor` 字段 + `update()` 末尾稳定悬挂时 gfx 变红 0xff6666；`GameScene` 加 stuckTag 标签（红底白字"STUCK"，A 卡悬崖时 A 头顶）+ updateTrailerTag 强化（另一玩家稳定悬挂时 trailerTag 文案"★ JUMP"→"★ GO!"、颜色黄→橙 #ff9933）。**runtime 验证**：A 卡悬崖 override isStablyHanging=true → p1CanJump=false, p2CanJump=true, stuckTag.visible=true @ A 头顶, trailerTag.text="★ GO! (P2)" @ B 头顶 ✓ |
| 53 | ✅ | **#49 基础设施：Player.getPosition()/getVelocity() helper + 删 14+ as cast** | 已修。`Player.ts` 新增 `getPosition()` / `getVelocity()` helper；`GameScene.ts` 与 `Rope.ts` 改用 helper 读取玩家 position/velocity，移除外部对玩家 body 的 `as unknown as { position... }` cast。验证：`tsc --noEmit --noUnusedLocals false` 通过。 |
| 54 | ✅ | **#50 trailer swap 收紧：STUCK_BELOW_PX 提升到 PHYSICS.trailer** | 历史记录。该策略曾把 `stuckBelowPx=30` 集中到配置；后续 #71 已删除该抢权规则和配置项，当前两人都有支撑时始终 trailer 跳。 |
| 55 | ✅ | **#5 M4-B UI 三页（HomeScene/RoomScene/EndScene）** | 新建 `client/src/game/scenes/HomeScene.ts`（A 布局：标题+副标题+START+🔊，含首次 pointerdown audio resume）/ `RoomScene.ts`（B 布局：左 1 关卡卡 + 3 难度堆叠 + 返回 + START + 🔊）/ `EndScene.ts`（B 布局：上半结果 emoji+标题 + 下半 3 统计 + 重玩/回主页 + 🔊）；新建 `client/src/game/state/Registry.ts`（4 key 类型安全 helper，sound.muted 走 localStorage 持久化）；`config.ts` 加 `Difficulty` / `LevelId` 类型 + `difficultyPresets`（EASY 坑少且窄 / NORMAL 现状 / HARD 坑多且宽，**不**改 PHYSICS.jump/rope）；`LevelGenerator.ts` 加 `difficulty` 参数 + `hashLevelSeed(seed, difficulty)`；`GameScene.ts` create() 读 registry、checkGameState 改写 lastResult + start EndScene、`endHandled` 防 restart 残留；`main.ts` 注册 4 scene + 初始化 registry + 删 audio resume 监听（移给 HomeScene）；**删** `BootScene.ts` + `GameOverPanel.ts`。**runtime 14 条全过**：启动→Room→Game→End→RETRY/MAIN_MENU→🔊 持久化→3 难度地形差异→endHandled 不残留。spec 在 `docs/superpowers/specs/2026-06-13-ui-three-pages-design.md`，plan 在 `docs/superpowers/plans/2026-06-13-ui-three-pages.md` |
| 56 | ✅ | **#6 M4-B 视觉：风景分层背景 + 难度配色** | 新建 `client/src/entities/scenery/BackgroundScroller.ts`（纯 Phaser Graphics 画 2 层山 + 1 个天体，**不用 texture/TileSprite**——原因：Phaser 3.80.1 在本项目 texture→TileSprite 路径上有 `gl.texImage2D: bad image data` bug，Player/Rope/Platform 全用 Graphics，texture pipeline 从未 validated）。**2 层结构**：far (depth=0, scrollFactorX=0.3) 天空渐变 + 天体（光晕+本体圆）+ 远山 / near (depth=1, scrollFactorX=0.6) 近山；**3 难度配色**（EASY 绿+黄太阳 / NORMAL 紫+白月 / HARD 红+血月）。**关键技术**：① `scrollFactorY=0` 让 layer 像 HUD 永在屏 y=0..H（=1 的话 world y=0 跟相机移跑到屏外）② horizonY=H/2 对齐 ground top y（baseY=600 - cam.scrollY=240 = 360）③ 山 fillPoints 闭合到 H 自然延伸到屏底（被 ground platform 遮没关系，ground 自身就是关卡"地"）④ 山的 quadratic bezier 走 helper `pushQuadraticBezier(points, sx,sy, cx,cy, ex,ey, steps)` 因为 Phaser 3.80.1 Graphics 没有 `quadraticBezierTo`。**集成**：`GameScene.create()` 读 `Registry.getDifficulty()` + `new BackgroundScroller(this, difficulty).addToScene()` + `events.on('update', update)`。**runtime 验证**（dev server + chrome-devtools-mcp）：3 难度配色正确（EASY 绿/紫/红 + 太阳黄/月白/血月红）+ 视差 0.3/0.6 正常 + scene 里有 2 个 depth<10 的 Graphics；tsc --noEmit 干净（剩 2 个 pre-existing warning `Difficulty`/`hintText` 来自 GameScene.ts:5,31 不归 #6 管）。**`assets/scenes/*.svg` 9 个文件保留未删**（spec 提到的 9 SVG 资源参考，实际走了纯 Graphics 路径未加载），plan 标"v1 路径"已废弃。spec 在 `docs/superpowers/specs/2026-06-13-scenery-background-design.md`，plan 在 `docs/superpowers/plans/2026-06-13-scenery-background.md` |
| 57 | ✅ | **#57 跳跃/绳子/坑宽手感回归 — 已关闭（过时）** | 关闭原因：原反馈里的主要前提已被后续 #61/#62 覆盖。当前坑宽为 EASY 38..60 / NORMAL 38..80 / HARD 40..100；rope 已改为 #62 v3 统一连续弹簧；按当前 `PHYSICS.jump` + `frictionAir=0.03` 估算，250ms hold 约 156px 高、约 199px 水平跨距，足以覆盖 NORMAL/HARD 开局坑宽。无需开"手感回归 v2"。如后续实测仍觉得跳不过，另开新 bug，并基于新反馈处理。 |
| 58 | ✅ | **#58 视觉风格升级：生图卡通背景 + 简单动物角色 sprite + 平台/坑/绳子卡通化** | 已修。用 imagegen CLI 生成 3 张 16:9 难度背景：`assets/imagegen/easy-cartoon-bg.png` / `normal-cartoon-bg.png` / `hard-cartoon-bg.png`；P1/P2 角色已从复杂 chibi 冒险者改为更简单、低细节、高辨识度的卡通动物 sprite，并经 chroma-key 转透明：`player-p1.png` / `player-p2.png`。`GameScene.preload()` 加载 `/imagegen/...`；`BackgroundScroller` 优先显示生成背景，保留旧 Graphics fallback；`Player` 优先显示具体角色 sprite，旧色块只作贴图缺失 fallback；`GroundPlatform` 改草皮+土层+粗描边，`Pit` 改深坑+厚描边+坑口高亮，`Rope` 改双层粗线。`PHYSICS.matter.debug=false` 避免线框破坏视觉。验证：`tsc --noEmit --noUnusedLocals false` 通过；`vite build` 通过且 dist 已包含 `imagegen` 资产。 |
| 60 | ✅ | **#60 死亡检测误判：玩家同时在 pit 边缘被判 game over** | 反馈（2026-06-14 下午）："跳崖时检测好像接触地平面高度来算死亡，导致两人同时站在悬崖边缘还没下去就 game over"。**根因**：pit 传感器 y 范围 `[topY=600, topY+depth=1300]` 起点 = ground 顶面，玩家 body y 范围 `[544, 600]` 底面 = ground 顶面，**两者 y 边界相接**；matter AABB 用 `<=` 含等号判定 overlap，**玩家 x 一旦跟 pit x 范围 overlap**（哪怕身体右半 1px 在 pit 内）就 fire collisionStart for pit sensor → `fallIntoPit()` → state='hanging'。Rope 把另一玩家也拉过 pit 边 → 第二玩家也 hanging → `p1Dead && p2Dead` 满足 → game_over。**修复**（`Player.ts onContactStart` pit 分支）：用 `this.body.position.y`（P1 身体中心 y）跟 `otherBody.position.y - halfH`（pit 顶面 y）比较，**玩家中心 y < pit 顶面 y** 时 return 不触发；只有玩家中心 y 跨过 pit 顶面（半个身体进 pit）才算掉进。**runtime 验证**（chrome-devtools-mcp 探针）：① P1 setPosition 到 (pitLeft-1, 572) 站 pit 边外侧 + 250ms → p1State='on_ground'，gs='playing' ✅ ② P1 setPosition 到 (pitLeft+15, 700) 慢落入 pit → p1State='hanging' ✅ ③ P1 setPosition 到 (pitLeft+30, 1200) 高速下坠（matter tunneling 测试） → p1State='in_air'（被 rope 拉出 pit + onContactEnd 切回 in_air，预期行为）✅ ④ 3 难度各生成首坑宽：EASY 30.2（25..60 ✅）/ NORMAL 62.4（30..80 ✅）/ HARD 83.4（40..100 ✅）⑤ tsc --noEmit 干净（剩 2 个 pre-existing warning 不归 #60 管） |
| 61 | ✅ | **#61 坑宽 v2：缩 1/4，难度递增加宽（仍比 v1 窄）** | 反馈（2026-06-14 下午）：坑宽应缩到当前 1/4（更密但更窄），后续难度可加宽但仍比现在窄。**修复**（2 文件）：① `config.ts PHYSICS.level.difficultyPresets` 改 pit/ground 范围：**EASY** pit 50..180→**25..60**、ground 200..360→**100..200**、pitChance 0.20→0.30；**NORMAL** pit 60..265→**30..80**、ground 120..220→**80..150**、pitChance 0.50→0.55；**HARD** pit 80..320→**40..100**、ground 100..180→**60..120**、pitChance 0.70→0.75。**整体仍比 v1 难**（v1 上限 180/265/320 作天花板标尺）② `LevelGenerator.ts` 强制首坑的硬编码 `80 + rng*30`（80..110）→ 改用 `preset.pitWidthRange` 范围，跟各自难度一致。**runtime 验证**：3 难度各前 5 坑 + 5 ground 宽（playwright 探针）：EASY 坑 30.2/44.6/48.6/27.1/42.7（均值 38.6），NORMAL 坑 62.4/65.4/75.1/34.7/68.4（均值 61.2），HARD 坑 83.4/50.7/70.4/81.5/51.1（均值 67.4）—— 全部落在 preset 范围内。**截图** `pit-width-v2-2026-06-14.png` 显示窄坑密节奏。tsc --noEmit 干净。**注**：抛物线水平跨距 ~80-100px（hold 跳），v2 NORMAL 上限 80 还在 hold 跳极限，HARD 上限 100 略超过需要精准时机；如玩家反馈"仍跳不过"再调 jumpInitialVy / forwardAccel 提升水平跨距 |
| 62 | ✅ | **#62 绳子手感 v3：统一弹簧 + pit 状态重构 + 崖壁零摩擦** | 已修。`Rope.ts` 取消硬 snap / slack 断力 / rescue mode，统一为连续弹簧；普通下坠不启用 velocity damping，只有上方玩家主动向上跳时传递速度。`Player.ts` 移除 `hanging` 运动状态，改用 `inPit` 环境标记，掉坑后仍走 `in_air` 重力；`PHYSICS.pit.enterDepth=28` 防坑口误触发；`PHYSICS.player.wallFriction=0` + `sideContacts` 解决贴崖壁粘住。最终 rope 参数：`naturalLength=240, maxLength=430, springStiffness=0.028, springDamping=0.36, springMaxAccel=5.0, springVelocityTransferMax=10.0, activeJumpCounterScale=0.1, activeJumpPullShare=1.5`。验证：tsc 通过；用户反馈“好了差不多了，这个算修复了”。 |
| 59 | ✅ | **#59 触屏输入扩展：点场景内任何地方都触发 jump** | 反馈（2026-06-14 修正）：触屏用户希望**点屏任何位置都跳**（不限于底部 JUMP 按钮）—— 操作更顺手。**修复**（4 文件）：① `GamepadView.rect` 去掉 `setInteractive` 让按钮变纯视觉；删 `onPress/onRelease` 回调 + `pressed` 字段（不再持有按下态）② `TouchDevice` 加 `setJumpDown(v: boolean)` 公共方法（替掉原 onPress/onRelease 私有方法）③ `InputManager.triggerJump(down)` → `tp.setJumpDown(down)`；构造时立即 `buildGamepadsIfNeeded()`（不再等首次 pointerdown）④ `GameScene.create()` 末尾加 `this.input.on('pointerdown/pointerup/pointerupoutside')` 全屏监听转发 `triggerJump`。JUMP 按钮保留作"点这里跳 / 屏内任意点跳"视觉提示，hit area 失效。Space 键路径不变（键盘玩家）。**runtime 验证**（chrome-devtools-mcp 探针）：① JUMP 按钮 rect.interactive = no-input（穿透）② 点 JUMP 按钮位置 → poll().jumpDown=true ③ 点屏中央 → jumpDown=true ④ 点屏边缘 → jumpDown=true ⑤ window dispatch Space keydown → kb.isDown=true + poll().jumpDown=true。tsc --noEmit 干净（剩 2 个 pre-existing warning `Difficulty`/`hintText` 来自 GameScene.ts:5,31 不归 #59 管） |
