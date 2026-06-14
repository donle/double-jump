import type { Types as PhaserTypes } from 'phaser';
import type { Difficulty } from './types';

export type PhaserConfig = PhaserTypes.Core.GameConfig;

function readDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get('debug');
  if (queryValue !== null) {
    const normalized = queryValue.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  try {
    return window.localStorage.getItem('doubleJumpDebug') === '1';
  } catch {
    return false;
  }
}

export const DEBUG = {
  enabled: readDebugMode(),
} as const;

/** Phaser 全局配置 */
export const GAME_CONFIG: PhaserConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 720,
  height: 1280,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'matter',
    matter: {
      // 关闭全局重力：玩家由 Player.update 手工施加（可变重力：按住跳键 + 上升期 = holdGravity，
      // 否则 fallGravity）。地面 / 坑都是静态 body 或 sensor，重力对它们无作用 → 0 影响。
      gravity: { x: 0, y: 0 },
      debug: false,
      // 增加约束求解迭代次数：弹簧约束（高 stiffness）在默认 2 次迭代下
      // 会与重力耦合产生数值爆炸；提到 4 次让弹簧力被分摊，更稳定。
      constraintIterations: 4,
      positionIterations: 6,
      velocityIterations: 4,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { target: 60 },
  banner: false,
};

/** 物理与手感常量（M1 调参用） */
export const PHYSICS = {
  player: {
    width: 36,
    height: 56,
    friction: 0.6,            // 地面摩擦（高 → 滑停）
    wallFriction: 0,          // 空中/侧墙接触摩擦：0 = 贴崖壁下落时不被粘住
    maxFallSpeed: 18,         // 限速：避免高速下坠隧穿墙
    groundSlideDamp: 0.85,    // 落地后每帧 vx *= 该值，模拟"拖拽停止"
    body: {
      frictionAir: 0.03,     // 空气阻力（轻微，使跳跃不太飘）
      density: 0.002,
      restitution: 0,        // 0 = 落地无弹跳
    },
  },
  jump: {
    /** 起跳瞬间 vy（向上为负）。固定值，决定"最小跳跃手感"。#45 -16→-18，#47 →-14（搭配 tapGravity 强刹车，让短按/长按差距从 1.6x 拉到 2.7x）。 */
    jumpInitialVy: -14,
    /** 弱重力：按住跳键 + 上升期（vy<0）+ 未超 maxHoldMs 时，每帧 vy += 该值。
     *  #45 调低：0.4→0.25（让按住时的上升更慢、节奏更"飘"）。 */
    holdGravity: 0.25,
    /** 正常重力：松键 / 超时 / vy≥0 时使用。#45 调低：1.2→0.85（让下落/未按住时也慢一些）。 */
    fallGravity: 0.85,
    /** 弱重力最长持续时间（ms）。超过即使按住也切 fallGravity，自然形成跳跃高度上限。 */
    maxHoldMs: 250,
    /** #47 新增：短按松键后的强重力。松键瞬间（elapsed<maxHoldMs && 松键）→ g=tapGravity 直到 vy≥0 退出。
     *  2.5 ≈ 3× fallGravity：设计目标 tap 跳峰值 ≈ 49px（刚好能跳过矮障碍），hold 满跳 ≈ 134px（2.7x 差距）。
     *  调 fallGravity 时 tapGravity 应保持 ≈ 3× 比例同步。 */
    tapGravity: 2.5,
    // 前进：起跳瞬间 vx=0，**上升期内**每帧 vx += forwardAccel（线性加速）。
    // 与 vy 的"按住才有 boost"对称。上升期结束后 vx 不再增长，由 frictionAir 衰减。
    forwardAccel: 0.8,
    maxForwardSpeed: 7,
  },
  rope: {
    /** 舒适长度：出生距离约 200px，给少量富余 slack；掉崖初期先自由落体但不拖到屏外。 */
    naturalLength: 240,
    /** 张力参考长度：不触发 snap，只表达"大形变"尺度；拉到这里应仍是弹簧而不是硬限位。 */
    maxLength: 430,
    // #62 v3：统一连续张力曲线，废掉"硬约束 / 软弹簧 / 松弛"三段状态。
    // strain = max(0, dist - naturalLength)
    // springAccel = smoothLimit(strain * springStiffness, springMaxAccel)
    // velocityAccel = activeJump ? clamp(separatingSpeed * springDamping, 0, springVelocityTransferMax) * stretchRatio : 0
    // accel = springAccel + velocityAccel，再按 upper anchor / vertical gap 连续分配给两人。
    //
    // 重要：不再用竖向落差提前吃掉 slack。掉坑初期必须是自由落体，只有真实绳长
    // 超过 naturalLength 后才拉；否则会出现"掉进果冻"的手感。
    //
    // #62 v1 尝试（2026-06-14）：拉宽区间 naturalLength 200→160 + maxLength 320→400——
    //   用户反馈"弹性更差了，扯不上来"（v1 站位全在弹性段，救援场景 dist 缩到 161 进 slack
    //   不再拉，硬约束把 P2 钉在 dist=400 阻止靠近 P1）。已回退。
    // #62 v2 尝试（2026-06-14）：maxAccel 2.0→4.0 + 新增 Rope 救援模式（任一玩家 hanging
    //   时跳过硬约束 + naturalLength=0）——用户反馈"还是太硬"（救援力过猛，p1 被猛拽
    //   违反"绳是辅助感"）。已回退。详见 TODO.md #62 的最终 v3 记录。
    // #62 v3.3：保留弹簧形变，但普通重力不能把人拖到屏幕外。
    // naturalLength/maxLength 收短，静态刚度提高；救援力仍主要来自 activeJump 的速度传递。
    // #62 v3.2：弹簧要更软、形变量更大。降低小形变刚度，拉长参考长度；
    // 大形变时仍要能救人：上方玩家站地/起跳时下方玩家拿到接近全部拉力，
    // strain≈100 时 springAccel≈1.1 > fallGravity(0.85)，strain 更大时继续增强。
    springStiffness: 0.028,
    springDamping: 0.36,
    springMaxAccel: 5.0,
    springVelocityTransferMax: 10.0,
    /** 上方玩家站地/主动起跳救下方玩家时，上方玩家承受的反作用力比例。低于 0.5 才能避免跳高被吃掉。 */
    activeJumpCounterScale: 0.1,
    /** 上方玩家站地/主动起跳救下方玩家时，下方玩家获得的拉力比例。 */
    activeJumpPullShare: 1.5,
  },
  collision: {
    // matter.js 碰撞分类（位掩码）。两 body 碰撞当且仅当
    //   (A.category & B.mask) != 0 且 (B.category & A.mask) != 0
    // 玩家之间**不**互相碰撞（mask 不含 PLAYER）：让两人可以重叠、互相穿过。
    // 旧版让两人互相挡 → 一个人卡进另一个 body 后面无法前进；用户要求还原成
    // "可重叠"，所以 mask 改成只 GROUND | PIT。
    PLAYER: 0x0002,       // 玩家：地面 + 坑传感器（不含自身）
    GROUND: 0x0004,       // 地面/浮空板：只与玩家碰撞
    PIT:    0x0008,       // 坑（sensor）：只与玩家发生 sensor 事件，不物理阻挡
  },
  pit: {
    width: 120,
    height: 600,
    /** 玩家中心低于 pit 顶面这么多才算真正进入坑，避免悬崖口边界接触卡住。 */
    enterDepth: 28,
  },
  level: {
    totalLength: 6000,           // 关卡总长 px
    baseY: 600,                  // 主地面 y
    startPlatformWidth: 600,     // 起点安全区宽度
    seed: 12345,                 // 关卡种子（base seed；不同难度 × 不同子种子）

    /**
     * M4-B #5 新增 + #61 调优：3 个难度的地形生成参数。
     * 注意：跨难度**不**改 PHYSICS.jump / PHYSICS.rope——只改关卡生成参数。
     * EASY 坑少且窄 / 平台宽；HARD 坑多且宽 / 平台窄。
     *
     * #61（2026-06-14 用户反馈）：旧 pitWidthRange 60..265 / 80..320 太大（hold 跳满
     * ≈134px 高度，但抛物线水平跨距只够 ~80-100px），开局第一坑就跳不过去。
     * v2 把 pit 缩到约 1/4（30..80 / 40..100），ground 同步缩（80..150 / 60..120），
     * pitChance 微调（0.50→0.55 / 0.70→0.75）让节奏更密；整体**仍比 EASY 难**。
     * 后续难度可加宽，但**永不超过 v1 上限**（v1 死档作天花板标尺）。
     */
    difficultyPresets: {
      EASY: {
        pitChance: 0.30,
        pitWidthRange: [38, 60] as const,
        groundWidthRange: [100, 200] as const,
        forceFirstPit: false,
      },
      NORMAL: {
        pitChance: 0.55,  // #61 0.50→0.55（坑更多但更窄，节奏密）
        pitWidthRange: [38, 80] as const, // player width 36px + 2px minimum
        groundWidthRange: [80, 150] as const, // #61 120..220 → 80..150
        forceFirstPit: true,
      },
      HARD: {
        pitChance: 0.75,  // #61 0.70→0.75
        pitWidthRange: [40, 100] as const, // player width 36px + 4px minimum
        groundWidthRange: [60, 120] as const, // #61 100..180 → 60..120
        forceFirstPit: true,
      },
    } satisfies Record<Difficulty, {
      pitChance: number;
      pitWidthRange: readonly [number, number];
      groundWidthRange: readonly [number, number];
      forceFirstPit: boolean;
    }>,
  },
} as const;
