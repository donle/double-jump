import type { Types as PhaserTypes } from 'phaser';

export type PhaserConfig = PhaserTypes.Core.GameConfig;

/** 关卡难度（M4-B #5 新增）。物理参数跨难度不变，只改地形生成参数。 */
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

/** 关卡 ID。lv1/lv2/lv3 都可从 RoomScene 选择。 */
export type LevelId = 'lv1' | 'lv2' | 'lv3';

/** 两名玩家的标识与配色（M1 用色块）。 */
export const PLAYER_COLORS = {
  p1: 0x4cc9f0, // 青蓝
  p2: 0xf72585, // 品红
} as const;

export type PlayerId = 'p1' | 'p2';

/**
 * M3 末重构：单机模式 = 一个 JUMP 按键控制两个角色（trailer 跳）。
 * 不再做"两人两按键"。双人联机（M4 之后）也按"只有 trailer 能跳"，
 * 但那时每个玩家各持一个 JUMP 键 / 按钮。
 */
export const JUMP_KEY = Phaser.Input.Keyboard.KeyCodes.SPACE;
