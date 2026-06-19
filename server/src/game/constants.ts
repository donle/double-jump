/**
 * 服务器端物理常量 — 与客户端 client/src/game/config.ts 完全一致。
 * 独立副本，避免服务端引入 Phaser 依赖。
 */

export const PHYSICS = {
  player: {
    width: 36,
    height: 56,
    friction: 0.6,
    wallFriction: 0,
    maxFallSpeed: 18,
    groundSlideDamp: 0.85,
    body: {
      frictionAir: 0.03,
      density: 0.002,
      restitution: 0,
    },
  },
  jump: {
    jumpInitialVy: -14,
    holdGravity: 0.25,
    fallGravity: 0.85,
    maxHoldMs: 250,
    tapGravity: 2.5,
    forwardAccel: 0.8,
    maxForwardSpeed: 7,
  },
  rope: {
    naturalLength: 240,
    maxLength: 430,
    springStiffness: 0.028,
    springDamping: 0.36,
    springMaxAccel: 5.0,
    springVelocityTransferMax: 10.0,
    activeJumpCounterScale: 0.1,
    activeJumpPullShare: 1.5,
  },
  collision: {
    PLAYER: 0x0002,
    GROUND: 0x0004,
    PIT: 0x0008,
  },
  pit: {
    width: 120,
    height: 600,
    enterDepth: 28,
  },
  level: {
    totalLength: 6000,
    baseY: 600,
    startPlatformWidth: 600,
    seed: 12345,
    difficultyPresets: {
      EASY: {
        pitChance: 0.30,
        pitWidthRange: [38, 60] as const,
        groundWidthRange: [100, 200] as const,
        forceFirstPit: false,
      },
      NORMAL: {
        pitChance: 0.55,
        pitWidthRange: [38, 80] as const,
        groundWidthRange: [80, 150] as const,
        forceFirstPit: true,
      },
      HARD: {
        pitChance: 0.75,
        pitWidthRange: [40, 100] as const,
        groundWidthRange: [60, 120] as const,
        forceFirstPit: true,
      },
    } as const,
  },
} as const;

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
export type LevelId = 'lv1' | 'lv2' | 'lv3';

export const SUPPORT_NORMAL_Y_MIN = 0.85;
export const GROUNDED_VERTICAL_SLEEP_SPEED = 1.25;
export const TICK_RATE = 60;
export const BROADCAST_EVERY_N_TICKS = 2; // 60fps physics → 30fps broadcast
