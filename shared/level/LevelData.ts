/**
 * 关卡数据的纯函数生成器。客户端和服务端共用同一份算法，
 * 保证两端用相同 seed + difficulty + level 时生成完全相同的地形。
 *
 * 算法复刻自 client/src/entities/terrain/LevelGenerator.ts 的客户端实现：
 *   - lv1: startPlatform + forceFirstPit(x<800 守卫) + 主循环 ground/pit 交替 + 收尾 ground+pit
 *   - lv2 / lv3: 手工布局 + jitterX/Y/Width/Amount 抖动
 *   - 所有 RNG: mulberry32(hashLevelSeed(seed, difficulty))
 *
 * 注意：
 *   - 不依赖 Phaser / Matter.js / Node，纯 JS。
 *   - 返回 PieceData[] 是世界坐标数据。GroundPlatform 碰撞高度固定 400
 *     （GroundPlatform 内部用 Math.max(400, scene.scale.height)）；
 *     服务器端用 400，与客户端的 400 部分一致。
 */

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
export type LevelId = 'lv1' | 'lv2' | 'lv3';

export type PieceData =
  | { kind: 'ground'; leftX: number; rightX: number; topY: number; depth: number }
  | { kind: 'pit'; leftX: number; rightX: number; topY: number; depth: number }
  | {
      kind: 'floating_fixed';
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: 'floating_moving';
      x: number;
      y: number;
      width: number;
      height: number;
      pattern: 'horizontal' | 'vertical' | 'circular';
      amplitude: number;
      period: number;
      phase: number;
    };

export interface DifficultyPreset {
  pitChance: number;
  pitWidthRange: readonly [number, number];
  groundWidthRange: readonly [number, number];
  forceFirstPit: boolean;
}

export const LEVEL_CONSTANTS = {
  totalLength: 6000,
  baseY: 600,
  startPlatformWidth: 600,
} as const;

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  EASY: {
    pitChance: 0.3,
    pitWidthRange: [38, 60],
    groundWidthRange: [100, 200],
    forceFirstPit: false,
  },
  NORMAL: {
    pitChance: 0.55,
    pitWidthRange: [38, 80],
    groundWidthRange: [80, 150],
    forceFirstPit: true,
  },
  HARD: {
    pitChance: 0.75,
    pitWidthRange: [40, 100],
    groundWidthRange: [60, 120],
    forceFirstPit: true,
  },
};

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashLevelSeed(seed: number, difficulty: Difficulty): number {
  const codes = difficulty.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (seed * 31 + codes) >>> 0;
}

/** 客户端算法的复刻：纯数据输出，不依赖 Phaser/Matter。 */
export function generateLevelData(
  seed: number,
  difficulty: Difficulty,
  level: LevelId,
): PieceData[] {
  switch (level) {
    case 'lv2':
      return generateLevelTwo(difficulty, seed);
    case 'lv3':
      return generateLevelThree(difficulty, seed);
    case 'lv1':
    default:
      return generateLevelOne(difficulty, seed);
  }
}

function generateLevelOne(difficulty: Difficulty, seed: number): PieceData[] {
  const pieces: PieceData[] = [];
  const preset = DIFFICULTY_PRESETS[difficulty];
  const rng = mulberry32(hashLevelSeed(seed, difficulty));
  const { totalLength, baseY, startPlatformWidth } = LEVEL_CONSTANTS;
  const GROUND_DEPTH = 400;
  const PIT_DEPTH = 700;
  const TAIL_PIT_DEPTH = 200;

  let x = -200;
  pieces.push({ kind: 'ground', leftX: -200, rightX: startPlatformWidth, topY: baseY, depth: GROUND_DEPTH });
  x = startPlatformWidth;

  if (preset.forceFirstPit && x < 800) {
    const [pMin, pMax] = preset.pitWidthRange;
    const pitWidth = pMin + rng() * (pMax - pMin);
    pieces.push({ kind: 'pit', leftX: x, rightX: x + pitWidth, topY: baseY, depth: PIT_DEPTH });
    x += pitWidth;
    let lastType: 'ground' | 'pit' = 'pit';

    while (x < totalLength) {
      const next = buildPiece(rng, preset, lastType, x, baseY, GROUND_DEPTH, PIT_DEPTH);
      if (next) {
        pieces.push(next.piece);
        x = next.newX;
        lastType = next.lastType;
      } else {
        x += 100;
      }
    }
  } else {
    let lastType: 'ground' | 'pit' = 'ground';
    while (x < totalLength) {
      const next = buildPiece(rng, preset, lastType, x, baseY, GROUND_DEPTH, PIT_DEPTH);
      if (next) {
        pieces.push(next.piece);
        x = next.newX;
        lastType = next.lastType;
      } else {
        x += 100;
      }
    }
  }

  pieces.push({ kind: 'ground', leftX: totalLength, rightX: totalLength + 600, topY: baseY, depth: GROUND_DEPTH });
  pieces.push({ kind: 'pit', leftX: totalLength + 600, rightX: totalLength + 800, topY: baseY, depth: TAIL_PIT_DEPTH });

  return pieces;
}

function buildPiece(
  rng: () => number,
  preset: DifficultyPreset,
  last: 'ground' | 'pit',
  x: number,
  baseY: number,
  groundDepth: number,
  pitDepth: number,
): { piece: PieceData; newX: number; lastType: 'ground' | 'pit' } | null {
  let type: 'ground' | 'pit';
  if (last === 'pit') {
    type = 'ground';
  } else {
    const r = rng();
    type = r < preset.pitChance ? 'pit' : 'ground';
  }
  if (type === 'ground') {
    const [gMin, gMax] = preset.groundWidthRange;
    const width = gMin + rng() * (gMax - gMin);
    return {
      piece: { kind: 'ground', leftX: x, rightX: x + width, topY: baseY, depth: groundDepth },
      newX: x + width,
      lastType: 'ground',
    };
  } else {
    const [pMin, pMax] = preset.pitWidthRange;
    const width = pMin + rng() * (pMax - pMin);
    return {
      piece: { kind: 'pit', leftX: x, rightX: x + width, topY: baseY, depth: pitDepth },
      newX: x + width,
      lastType: 'pit',
    };
  }
}

function jitterX(rng: () => number, value: number, amount = 14): number {
  return Math.round(value + (rng() * 2 - 1) * amount);
}
function jitterY(rng: () => number, value: number, amount = 9): number {
  return Math.round(value + (rng() * 2 - 1) * amount);
}
function jitterWidth(rng: () => number, value: number, amount = 6): number {
  return Math.round(value + (rng() * 2 - 1) * amount);
}
function jitterAmount(rng: () => number, value: number, amount = 6): number {
  return Math.round(value + (rng() * 2 - 1) * amount);
}

function generateLevelTwo(difficulty: Difficulty, seed: number): PieceData[] {
  const pieces: PieceData[] = [];
  const rng = mulberry32(hashLevelSeed(seed, difficulty));
  const { totalLength, baseY, startPlatformWidth } = LEVEL_CONSTANTS;
  const H = 18;
  const PIT_DEPTH = 700;
  const TAIL_PIT_DEPTH = 200;
  const GROUND_DEPTH = 400;

  pieces.push({ kind: 'ground', leftX: -200, rightX: startPlatformWidth, topY: baseY, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 600, rightX: 1170, topY: baseY, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 715), y: jitterY(rng, 535), width: jitterWidth(rng, 88), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 850), y: jitterY(rng, 505), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 985), y: jitterY(rng, 480), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1120), y: jitterY(rng, 510), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'ground', leftX: 1215, rightX: 1475, topY: baseY - 45, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 1475, rightX: 2060, topY: baseY - 45, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1585), y: jitterY(rng, 500), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1720), y: jitterY(rng, 465), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1855), y: jitterY(rng, 485), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1990), y: jitterY(rng, 525), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'ground', leftX: 2135, rightX: 2415, topY: baseY, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 2415, rightX: 3060, topY: baseY, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2525), y: jitterY(rng, 530), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2650), y: jitterY(rng, 500), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2775), y: jitterY(rng, 470), width: jitterWidth(rng, 70), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2900), y: jitterY(rng, 490), width: jitterWidth(rng, 72), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3025), y: jitterY(rng, 525), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'ground', leftX: 3120, rightX: 3420, topY: baseY - 60, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 3420, rightX: 3860, topY: baseY - 60, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3525), y: jitterY(rng, 500), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3645), y: jitterY(rng, 525), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3765), y: jitterY(rng, 550), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3850), y: jitterY(rng, 565), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'ground', leftX: 3920, rightX: 4080, topY: baseY, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 4080, rightX: 5420, topY: baseY, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4205), y: jitterY(rng, 530), width: jitterWidth(rng, 80), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4345), y: jitterY(rng, 505), width: jitterWidth(rng, 76), height: H });
  pieces.push({
    kind: 'floating_moving',
    x: jitterX(rng, 4485),
    y: jitterY(rng, 500),
    width: jitterWidth(rng, 76),
    height: H,
    pattern: 'horizontal',
    amplitude: jitterAmount(rng, 36),
    period: 2.8,
    phase: 0.2,
  });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4630), y: jitterY(rng, 485), width: jitterWidth(rng, 74), height: H });
  pieces.push({
    kind: 'floating_moving',
    x: jitterX(rng, 4775),
    y: jitterY(rng, 475),
    width: jitterWidth(rng, 72),
    height: H,
    pattern: 'vertical',
    amplitude: jitterAmount(rng, 20, 4),
    period: 2.6,
    phase: Math.PI / 2,
  });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4920), y: jitterY(rng, 490), width: jitterWidth(rng, 74), height: H });
  pieces.push({
    kind: 'floating_moving',
    x: jitterX(rng, 5065),
    y: jitterY(rng, 500),
    width: jitterWidth(rng, 72),
    height: H,
    pattern: 'horizontal',
    amplitude: jitterAmount(rng, 42),
    period: 2.7,
    phase: Math.PI,
  });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5210), y: jitterY(rng, 515), width: jitterWidth(rng, 76), height: H });
  pieces.push({
    kind: 'floating_moving',
    x: jitterX(rng, 5350),
    y: jitterY(rng, 525),
    width: jitterWidth(rng, 78),
    height: H,
    pattern: 'horizontal',
    amplitude: jitterAmount(rng, 36),
    period: 3.0,
    phase: Math.PI / 3,
  });
  pieces.push({ kind: 'ground', leftX: 5480, rightX: totalLength + 600, topY: baseY, depth: GROUND_DEPTH });
  pieces.push({ kind: 'pit', leftX: totalLength + 600, rightX: totalLength + 800, topY: baseY, depth: TAIL_PIT_DEPTH });

  return pieces;
}

function generateLevelThree(difficulty: Difficulty, seed: number): PieceData[] {
  const pieces: PieceData[] = [];
  const rng = mulberry32(hashLevelSeed(seed, difficulty));
  const { totalLength, baseY, startPlatformWidth } = LEVEL_CONSTANTS;
  const H = 18;
  const PIT_DEPTH = 700;
  const TAIL_PIT_DEPTH = 200;
  const GROUND_DEPTH = 400;

  pieces.push({ kind: 'ground', leftX: -200, rightX: startPlatformWidth, topY: baseY, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 600, rightX: 720, topY: baseY, depth: PIT_DEPTH });
  pieces.push({ kind: 'ground', leftX: 720, rightX: 1080, topY: baseY - 40, depth: GROUND_DEPTH });
  pieces.push({ kind: 'pit', leftX: 1080, rightX: 1210, topY: baseY - 40, depth: PIT_DEPTH });
  pieces.push({ kind: 'ground', leftX: 1210, rightX: 1560, topY: baseY - 85, depth: GROUND_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1390), y: jitterY(rng, 470), width: jitterWidth(rng, 84), height: H });

  pieces.push({ kind: 'pit', leftX: 1560, rightX: 2015, topY: baseY - 85, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1655), y: jitterY(rng, 480), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1770), y: jitterY(rng, 505), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 1885), y: jitterY(rng, 530), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2000), y: jitterY(rng, 555), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'ground', leftX: 2075, rightX: 2415, topY: baseY - 20, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 2415, rightX: 2970, topY: baseY - 20, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2525), y: jitterY(rng, 515), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2660), y: jitterY(rng, 485), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2795), y: jitterY(rng, 470), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 2930), y: jitterY(rng, 500), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'ground', leftX: 3030, rightX: 3360, topY: baseY - 65, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 3360, rightX: 4000, topY: baseY - 65, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3470), y: jitterY(rng, 485), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3590), y: jitterY(rng, 500), width: jitterWidth(rng, 72), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3710), y: jitterY(rng, 525), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3830), y: jitterY(rng, 550), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 3960), y: jitterY(rng, 565), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'ground', leftX: 4050, rightX: 4430, topY: baseY, depth: GROUND_DEPTH });

  pieces.push({ kind: 'pit', leftX: 4430, rightX: 5880, topY: baseY, depth: PIT_DEPTH });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4540), y: jitterY(rng, 525), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4665), y: jitterY(rng, 500), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4790), y: jitterY(rng, 475), width: jitterWidth(rng, 72), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 4915), y: jitterY(rng, 500), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5040), y: jitterY(rng, 525), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5165), y: jitterY(rng, 510), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5290), y: jitterY(rng, 490), width: jitterWidth(rng, 74), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5415), y: jitterY(rng, 510), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5540), y: jitterY(rng, 530), width: jitterWidth(rng, 78), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5665), y: jitterY(rng, 545), width: jitterWidth(rng, 76), height: H });
  pieces.push({ kind: 'floating_fixed', x: jitterX(rng, 5790), y: jitterY(rng, 555), width: jitterWidth(rng, 82), height: H });
  pieces.push({ kind: 'ground', leftX: 5940, rightX: totalLength + 600, topY: baseY, depth: GROUND_DEPTH });
  pieces.push({ kind: 'pit', leftX: totalLength + 600, rightX: totalLength + 800, topY: baseY, depth: TAIL_PIT_DEPTH });

  return pieces;
}