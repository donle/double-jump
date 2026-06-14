import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { PHYSICS } from '../../game/config';

export class Pit extends TerrainPiece {
  private readonly leftX: number;
  private readonly rightX: number;
  private readonly width: number;

  constructor(scene: Phaser.Scene, leftX: number, rightX: number, topY: number, depth = 600) {
    super(scene, 10);
    this.leftX = leftX;
    this.rightX = rightX;
    this.width = rightX - leftX;

    this.body = scene.matter.add.rectangle(
      leftX + this.width / 2,
      topY + depth / 2,
      this.width,
      depth,
      {
        isStatic: true,
        isSensor: true,
        label: 'pit',
        collisionFilter: {
          category: PHYSICS.collision.PIT,
          mask: PHYSICS.collision.PLAYER,
        },
      },
    );
    (this.body as unknown as { render: { visible: boolean } }).render.visible = false;

    this.draw();
  }

  private draw(): void {
    this.gfx.clear();
  }

  getLabel(): string {
    return 'pit';
  }

  getLeftX(): number {
    return this.leftX;
  }

  getRightX(): number {
    return this.rightX;
  }
}
