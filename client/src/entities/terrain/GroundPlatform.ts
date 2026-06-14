import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { PHYSICS } from '../../game/config';

export class GroundPlatform extends TerrainPiece {
  private readonly leftX: number;
  private readonly rightX: number;
  private readonly topY: number;
  private readonly width: number;
  private readonly height: number;
  private readonly collisionHeight: number;

  constructor(scene: Phaser.Scene, leftX: number, rightX: number, topY: number) {
    super(scene, 10);
    this.leftX = leftX;
    this.rightX = rightX;
    this.topY = topY;
    this.width = rightX - leftX;
    this.height = Math.max(400, scene.scale.height);
    this.collisionHeight = this.height;

    this.body = scene.matter.add.rectangle(
      leftX + this.width / 2,
      topY + this.collisionHeight / 2,
      this.width,
      this.collisionHeight,
      {
        isStatic: true,
        label: 'ground',
        friction: 0.9,
        collisionFilter: {
          category: PHYSICS.collision.GROUND,
          mask: PHYSICS.collision.PLAYER,
        },
      },
    );

    this.draw();
  }

  private draw(): void {
    this.gfx.fillStyle(0x122016, 1);
    this.gfx.fillRoundedRect(this.leftX - 3, this.topY, this.width + 6, this.height + 3, 8);

    this.gfx.fillStyle(0x6f4a2d, 1);
    this.gfx.fillRect(this.leftX, this.topY + 18, this.width, this.height - 18);
    this.gfx.fillStyle(0x8b5f37, 1);
    this.gfx.fillRect(this.leftX, this.topY + 18, this.width, 28);

    this.gfx.fillStyle(0x52b84b, 1);
    this.gfx.fillRoundedRect(this.leftX, this.topY, this.width, 24, 8);
    this.gfx.fillStyle(0x9be564, 1);
    this.gfx.fillRoundedRect(this.leftX + 3, this.topY + 1, Math.max(0, this.width - 6), 10, 6);
    this.gfx.lineStyle(3, 0x20351d, 0.9);
    this.gfx.strokeRoundedRect(this.leftX, this.topY + 1, this.width, 22, 8);

    for (let i = 0; i < this.width; i += 34) {
      const x = this.leftX + i + 10;
      this.gfx.fillStyle(0x5a3c27, 0.75);
      this.gfx.fillEllipse(x, this.topY + 58 + (i % 3) * 14, 10, 5);
      this.gfx.fillStyle(0xa8ec63, 0.9);
      this.gfx.fillTriangle(x, this.topY + 6, x + 4, this.topY + 1, x + 8, this.topY + 6);
    }
  }

  getLabel(): string {
    return 'ground';
  }

  getLeftX(): number {
    return this.leftX;
  }

  getRightX(): number {
    return this.rightX;
  }
}
