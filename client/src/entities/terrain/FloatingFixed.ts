import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { PHYSICS } from '../../game/config';

/** 类型 ③：浮空固定板。 */
export class FloatingFixed extends TerrainPiece {
  private readonly x: number;
  private readonly y: number;
  private readonly width: number;
  private readonly height = 18;

  constructor(scene: Phaser.Scene, x: number, y: number, width = 100) {
    super(scene, 20);
    this.x = x;
    this.y = y;
    this.width = width;

    this.body = scene.matter.add.rectangle(x, y, width, this.height, {
      isStatic: true,
      label: 'platform',
      friction: 0.7,
      collisionFilter: {
        category: PHYSICS.collision.GROUND,
        mask: PHYSICS.collision.PLAYER,
      },
    });

    this.draw();
  }

  private draw(): void {
    const w = this.width;
    const h = this.height;
    this.gfx.fillStyle(0x6c4ab6, 1);
    this.gfx.fillRoundedRect(this.x - w / 2, this.y - h / 2, w, h, 4);
    this.gfx.lineStyle(2, 0xc5a3ff, 0.9);
    this.gfx.strokeRoundedRect(this.x - w / 2, this.y - h / 2, w, h, 4);
    // 中央发光点
    this.gfx.fillStyle(0xc5a3ff, 0.5);
    this.gfx.fillCircle(this.x, this.y, 3);
  }

  getLabel(): string {
    return 'platform';
  }

  getLeftX(): number {
    return this.x - this.width / 2;
  }

  getRightX(): number {
    return this.x + this.width / 2;
  }
}
