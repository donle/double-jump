import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { GroundPlatform } from './GroundPlatform';
import { Pit } from './Pit';
import { FloatingFixed } from './FloatingFixed';
import { FloatingMoving } from './FloatingMoving';
import type { Difficulty, LevelId } from '../../game/types';
import {
  generateLevelData,
  type PieceData,
} from '../../../../shared/level/LevelData';

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

/**
 * 关卡生成器现在只负责把 PieceData（来自 shared/level/LevelData）转换成
 * Phaser 的 TerrainPiece 实例。所有确定性算法（seed + difficulty + level → 关卡）
 * 都在 shared 里。服务端用同一份算法，确保两端地形一致。
 *
 * 兼容旧的单机关卡：构造时不传 piecesData 时，仍在本地用 generateLevelData 生成。
 */
export class LevelGenerator {
  constructor(
    private readonly config: LevelConfig,
    private readonly difficulty: Difficulty = 'NORMAL',
    private readonly level: LevelId = 'lv1',
    private readonly piecesData: PieceData[] | null = null,
  ) {}

  generate(scene: Phaser.Scene): LevelResult {
    const data =
      this.piecesData ?? generateLevelData(this.config.seed, this.difficulty, this.level);
    const pieces: TerrainPiece[] = [];
    for (const p of data) {
      switch (p.kind) {
        case 'ground':
          pieces.push(new GroundPlatform(scene, p.leftX, p.rightX, p.topY));
          break;
        case 'pit':
          pieces.push(new Pit(scene, p.leftX, p.rightX, p.topY, p.depth));
          break;
        case 'floating_fixed':
          pieces.push(new FloatingFixed(scene, p.x, p.y, p.width));
          break;
        case 'floating_moving':
          pieces.push(
            new FloatingMoving(scene, p.x, p.y, p.width, {
              pattern: p.pattern,
              amplitude: p.amplitude,
              period: p.period,
              phase: p.phase,
            }),
          );
          break;
      }
    }
    return { pieces, maxDifficulty: this.config.totalLength / 1000 };
  }
}