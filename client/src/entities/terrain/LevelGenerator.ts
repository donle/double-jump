import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { GroundPlatform } from './GroundPlatform';
import { Pit } from './Pit';
import { FloatingFixed } from './FloatingFixed';
import { FloatingMoving } from './FloatingMoving';
import type { Difficulty, LevelId } from '../../game/types';
import { PHYSICS } from '../../game/config';

type DifficultyPreset = {
  pitChance: number;
  pitWidthRange: readonly [number, number];
  groundWidthRange: readonly [number, number];
  forceFirstPit: boolean;
};

type PieceType = 'ground' | 'pit';

export interface LevelConfig {
  totalLength: number;
  baseY: number;
  startPlatformWidth: number;
  seed: number;
}

export interface LevelResult {
  pieces: TerrainPiece[];
  maxDifficulty: number;
}

export class LevelGenerator {
  private readonly rng: () => number;
  private readonly config: LevelConfig;
  private readonly preset: DifficultyPreset;
  private readonly level: LevelId;

  constructor(config: LevelConfig, difficulty: Difficulty = 'NORMAL', level: LevelId = 'lv1') {
    this.config = config;
    this.preset = PHYSICS.level.difficultyPresets[difficulty];
    this.level = level;
    this.rng = mulberry32(hashLevelSeed(config.seed, difficulty));
  }

  generate(scene: Phaser.Scene): LevelResult {
    switch (this.level) {
      case 'lv2':
        return this.generateLevelTwo(scene);
      case 'lv3':
        return this.generateLevelThree(scene);
      case 'lv1':
      default:
        return this.generateLevelOne(scene);
    }
  }

  private generateLevelOne(scene: Phaser.Scene): LevelResult {
    const pieces: TerrainPiece[] = [];
    let x = -200;
    let lastType: PieceType = 'ground';
    const { baseY, totalLength, startPlatformWidth } = this.config;

    pieces.push(new GroundPlatform(scene, -200, startPlatformWidth, baseY));
    x = startPlatformWidth;

    if (this.preset.forceFirstPit && x < 800) {
      const [pMin, pMax] = this.preset.pitWidthRange;
      const pitWidth = pMin + this.rng() * (pMax - pMin);
      pieces.push(new Pit(scene, x, x + pitWidth, baseY, 700));
      x += pitWidth;
      lastType = 'pit';
    }

    while (x < totalLength) {
      const type = this.chooseType(lastType);
      const next = this.buildPiece(scene, type, x, baseY);
      if (next) {
        pieces.push(next.piece);
        x = next.newX;
        lastType = type;
      } else {
        x += 100;
      }
    }

    pieces.push(new GroundPlatform(scene, totalLength, totalLength + 600, baseY));
    pieces.push(new Pit(scene, totalLength + 600, totalLength + 800, baseY, 200));

    return { pieces, maxDifficulty: totalLength / 1000 };
  }

  private generateLevelTwo(scene: Phaser.Scene): LevelResult {
    const pieces: TerrainPiece[] = [];
    const { baseY, totalLength, startPlatformWidth } = this.config;

    pieces.push(new GroundPlatform(scene, -200, startPlatformWidth, baseY));

    pieces.push(new Pit(scene, 600, 1170, baseY, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(715), this.jitterY(535), this.jitterWidth(88)));
    pieces.push(new FloatingFixed(scene, this.jitterX(850), this.jitterY(505), this.jitterWidth(82)));
    pieces.push(new FloatingFixed(scene, this.jitterX(985), this.jitterY(480), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1120), this.jitterY(510), this.jitterWidth(78)));
    pieces.push(new GroundPlatform(scene, 1215, 1475, baseY - 45));

    pieces.push(new Pit(scene, 1475, 2060, baseY - 45, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(1585), this.jitterY(500), this.jitterWidth(82)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1720), this.jitterY(465), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1855), this.jitterY(485), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1990), this.jitterY(525), this.jitterWidth(82)));
    pieces.push(new GroundPlatform(scene, 2135, 2415, baseY));

    pieces.push(new Pit(scene, 2415, 3060, baseY, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(2525), this.jitterY(530), this.jitterWidth(78)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2650), this.jitterY(500), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2775), this.jitterY(470), this.jitterWidth(70)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2900), this.jitterY(490), this.jitterWidth(72)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3025), this.jitterY(525), this.jitterWidth(78)));
    pieces.push(new GroundPlatform(scene, 3120, 3420, baseY - 60));

    // High-to-low descent: shorter horizontal gap, stepped down by four boards.
    pieces.push(new Pit(scene, 3420, 3860, baseY - 60, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(3525), this.jitterY(500), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3645), this.jitterY(525), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3765), this.jitterY(550), this.jitterWidth(82)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3850), this.jitterY(565), this.jitterWidth(78)));
    pieces.push(new GroundPlatform(scene, 3920, 4080, baseY));

    // Ending moving run: a longer chain, mixing fixed and moving boards.
    pieces.push(new Pit(scene, 4080, 5420, baseY, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(4205), this.jitterY(530), this.jitterWidth(80)));
    pieces.push(new FloatingFixed(scene, this.jitterX(4345), this.jitterY(505), this.jitterWidth(76)));
    pieces.push(new FloatingMoving(scene, this.jitterX(4485), this.jitterY(500), this.jitterWidth(76), {
      pattern: 'horizontal',
      amplitude: this.jitterAmount(36),
      period: 2.8,
      phase: 0.2,
    }));
    pieces.push(new FloatingFixed(scene, this.jitterX(4630), this.jitterY(485), this.jitterWidth(74)));
    pieces.push(new FloatingMoving(scene, this.jitterX(4775), this.jitterY(475), this.jitterWidth(72), {
      pattern: 'vertical',
      amplitude: this.jitterAmount(20, 4),
      period: 2.6,
      phase: Math.PI / 2,
    }));
    pieces.push(new FloatingFixed(scene, this.jitterX(4920), this.jitterY(490), this.jitterWidth(74)));
    pieces.push(new FloatingMoving(scene, this.jitterX(5065), this.jitterY(500), this.jitterWidth(72), {
      pattern: 'horizontal',
      amplitude: this.jitterAmount(42),
      period: 2.7,
      phase: Math.PI,
    }));
    pieces.push(new FloatingFixed(scene, this.jitterX(5210), this.jitterY(515), this.jitterWidth(76)));
    pieces.push(new FloatingMoving(scene, this.jitterX(5350), this.jitterY(525), this.jitterWidth(78), {
      pattern: 'horizontal',
      amplitude: this.jitterAmount(36),
      period: 3.0,
      phase: Math.PI / 3,
    }));
    pieces.push(new GroundPlatform(scene, 5480, totalLength + 600, baseY));
    pieces.push(new Pit(scene, totalLength + 600, totalLength + 800, baseY, 200));

    return { pieces, maxDifficulty: totalLength / 1000 };
  }

  private generateLevelThree(scene: Phaser.Scene): LevelResult {
    const pieces: TerrainPiece[] = [];
    const { baseY, totalLength, startPlatformWidth } = this.config;

    pieces.push(new GroundPlatform(scene, -200, startPlatformWidth, baseY));

    pieces.push(new Pit(scene, 600, 720, baseY, 700));
    pieces.push(new GroundPlatform(scene, 720, 1080, baseY - 40));
    pieces.push(new Pit(scene, 1080, 1210, baseY - 40, 700));
    pieces.push(new GroundPlatform(scene, 1210, 1560, baseY - 85));
    pieces.push(new FloatingFixed(scene, this.jitterX(1390), this.jitterY(470), this.jitterWidth(84)));

    pieces.push(new Pit(scene, 1560, 2015, baseY - 85, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(1655), this.jitterY(480), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1770), this.jitterY(505), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(1885), this.jitterY(530), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2000), this.jitterY(555), this.jitterWidth(82)));
    pieces.push(new GroundPlatform(scene, 2075, 2415, baseY - 20));

    pieces.push(new Pit(scene, 2415, 2970, baseY - 20, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(2525), this.jitterY(515), this.jitterWidth(82)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2660), this.jitterY(485), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2795), this.jitterY(470), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(2930), this.jitterY(500), this.jitterWidth(78)));
    pieces.push(new GroundPlatform(scene, 3030, 3360, baseY - 65));

    pieces.push(new Pit(scene, 3360, 4000, baseY - 65, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(3470), this.jitterY(485), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3590), this.jitterY(500), this.jitterWidth(72)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3710), this.jitterY(525), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3830), this.jitterY(550), this.jitterWidth(78)));
    pieces.push(new FloatingFixed(scene, this.jitterX(3960), this.jitterY(565), this.jitterWidth(78)));
    pieces.push(new GroundPlatform(scene, 4050, 4430, baseY));

    pieces.push(new Pit(scene, 4430, 5880, baseY, 700));
    pieces.push(new FloatingFixed(scene, this.jitterX(4540), this.jitterY(525), this.jitterWidth(78)));
    pieces.push(new FloatingFixed(scene, this.jitterX(4665), this.jitterY(500), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(4790), this.jitterY(475), this.jitterWidth(72)));
    pieces.push(new FloatingFixed(scene, this.jitterX(4915), this.jitterY(500), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5040), this.jitterY(525), this.jitterWidth(78)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5165), this.jitterY(510), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5290), this.jitterY(490), this.jitterWidth(74)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5415), this.jitterY(510), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5540), this.jitterY(530), this.jitterWidth(78)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5665), this.jitterY(545), this.jitterWidth(76)));
    pieces.push(new FloatingFixed(scene, this.jitterX(5790), this.jitterY(555), this.jitterWidth(82)));
    pieces.push(new GroundPlatform(scene, 5940, totalLength + 600, baseY));
    pieces.push(new Pit(scene, totalLength + 600, totalLength + 800, baseY, 200));

    return { pieces, maxDifficulty: totalLength / 1000 };
  }

  private buildPiece(
    scene: Phaser.Scene,
    type: PieceType,
    x: number,
    baseY: number,
  ): { piece: TerrainPiece; newX: number } | null {
    switch (type) {
      case 'ground': {
        const [gMin, gMax] = this.preset.groundWidthRange;
        const width = gMin + this.rng() * (gMax - gMin);
        return {
          piece: new GroundPlatform(scene, x, x + width, baseY),
          newX: x + width,
        };
      }
      case 'pit': {
        const [pMin, pMax] = this.preset.pitWidthRange;
        const width = pMin + this.rng() * (pMax - pMin);
        return {
          piece: new Pit(scene, x, x + width, baseY, 700),
          newX: x + width,
        };
      }
    }
  }

  private chooseType(last: PieceType): PieceType {
    const r = this.rng();
    if (last === 'pit') return 'ground';
    if (r < this.preset.pitChance) return 'pit';
    return 'ground';
  }

  private jitterX(value: number, amount = 14): number {
    return Math.round(value + this.randomBetween(-amount, amount));
  }

  private jitterY(value: number, amount = 9): number {
    return Math.round(value + this.randomBetween(-amount, amount));
  }

  private jitterWidth(value: number, amount = 6): number {
    return Math.round(value + this.randomBetween(-amount, amount));
  }

  private jitterAmount(value: number, amount = 6): number {
    return Math.round(value + this.randomBetween(-amount, amount));
  }

  private randomBetween(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }
}

export function hashLevelSeed(seed: number, difficulty: Difficulty): number {
  const codes = difficulty.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (seed * 31 + codes) >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
