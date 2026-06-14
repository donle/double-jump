import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { PHYSICS } from '../../game/config';

/** 类型 ⑤：浮空限时板。玩家首次踩上开始倒计时，N 秒后消失。 */
export class FloatingTimed extends TerrainPiece {
  private readonly x: number;
  private readonly y: number;
  private readonly width: number;
  private readonly height = 18;
  private readonly duration: number;
  private elapsed = 0;
  private armed = false;
  private flashPhase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, duration: number) {
    super(scene, 20);
    this.x = x;
    this.y = y;
    this.width = width;
    this.duration = duration;

    this.body = scene.matter.add.rectangle(x, y, width, this.height, {
      isStatic: true,
      label: 'platform',
      friction: 0.7,
      collisionFilter: {
        category: PHYSICS.collision.GROUND,
        mask: PHYSICS.collision.PLAYER,
      },
    });

    this.draw(1);
  }

  override onPlayerTouch(_player: { getBody(): MatterJS.BodyType }): void {
    this.armed = true;
  }

  override update(delta: number, _time: number): void {
    if (this.destroyed) return;

    if (this.armed) {
      this.elapsed += delta / 1000;
      const remaining = Math.max(0, this.duration - this.elapsed);
      const ratio = remaining / this.duration;

      // 倒计时 < 30% 时闪烁
      this.flashPhase += delta / 1000;
      const flashing = ratio < 0.3 && Math.sin(this.flashPhase * 12) > 0;
      this.draw(flashing ? 0.4 : 1);

      if (this.elapsed >= this.duration) {
        this.destroy();
      }
    }
  }

  private draw(alpha: number): void {
    const w = this.width;
    const h = this.height;
    this.gfx.clear();
    this.gfx.fillStyle(0xd62828, alpha);
    this.gfx.fillRoundedRect(this.x - w / 2, this.y - h / 2, w, h, 4);
    this.gfx.lineStyle(2, 0xffadad, alpha);
    this.gfx.strokeRoundedRect(this.x - w / 2, this.y - h / 2, w, h, 4);

    if (this.armed) {
      const ratio = Math.max(0, this.duration - this.elapsed) / this.duration;
      // 倒计时条
      this.gfx.fillStyle(0x000000, 0.6);
      this.gfx.fillRect(this.x - w / 2, this.y - h / 2 - 10, w, 4);
      this.gfx.fillStyle(ratio > 0.3 ? 0x06d6a0 : 0xffadad, 1);
      this.gfx.fillRect(this.x - w / 2, this.y - h / 2 - 10, w * ratio, 4);
    }
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
