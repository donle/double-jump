import Phaser from 'phaser';
import { TerrainPiece } from './TerrainPiece';
import { PHYSICS } from '../../game/config';

export type MovingPattern = 'horizontal' | 'vertical' | 'circular';

interface MovingOptions {
  pattern: MovingPattern;
  amplitude: number;
  period: number;
  phase?: number;
}

/** Moving floating platform with a fixed kinematic path. */
export class FloatingMoving extends TerrainPiece {
  private readonly cx: number;
  private readonly cy: number;
  private readonly width: number;
  private readonly height = 18;
  private readonly pattern: MovingPattern;
  private readonly amplitude: number;
  private readonly omega: number;
  private readonly phase: number;
  private readonly riders = new Set<MatterJS.BodyType>();
  private elapsed = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, opts: MovingOptions) {
    super(scene, 20);
    this.cx = x;
    this.cy = y;
    this.width = width;
    this.pattern = opts.pattern;
    this.amplitude = opts.amplitude;
    this.omega = (Math.PI * 2) / opts.period;
    this.phase = opts.phase ?? 0;

    this.body = scene.matter.add.rectangle(x, y, width, this.height, {
      isStatic: true,
      label: 'platform',
      friction: 0.95,
      collisionFilter: {
        category: PHYSICS.collision.GROUND,
        mask: PHYSICS.collision.PLAYER,
      },
    });

    this.draw(x, y);
  }

  override update(delta: number, _time: number): void {
    this.elapsed += Math.min(delta / 1000, 1 / 30);
    const t = this.elapsed * this.omega + this.phase;

    let x = this.cx;
    let y = this.cy;
    switch (this.pattern) {
      case 'horizontal':
        x = this.cx + this.amplitude * Math.sin(t);
        break;
      case 'vertical':
        y = this.cy + this.amplitude * Math.sin(t);
        break;
      case 'circular':
        x = this.cx + this.amplitude * Math.sin(t);
        y = this.cy + this.amplitude * Math.cos(t);
        break;
    }

    const prev = (this.body as unknown as { position: { x: number; y: number } }).position;
    const prevX = prev.x;
    const prevY = prev.y;

    // updateVelocity=true preserves platform contact velocity while keeping the path fixed.
    this.scene.matter.body.setPosition(this.body as MatterJS.BodyType, { x, y }, true);

    const pos = (this.body as unknown as { position: { x: number; y: number } }).position;
    this.carryRiders(prevX, prevY, pos.x - prevX, pos.y - prevY);
    this.gfx.setPosition(0, 0);
    this.draw(pos.x, pos.y);
  }

  override onPlayerTouch(player: { getBody(): MatterJS.BodyType }): void {
    this.riders.add(player.getBody());
  }

  override onPlayerLeave(player: { getBody(): MatterJS.BodyType }): void {
    this.riders.delete(player.getBody());
  }

  private carryRiders(prevX: number, prevY: number, dx: number, dy: number): void {
    if (this.riders.size === 0 || (dx === 0 && dy === 0)) return;

    const prevTop = prevY - this.height / 2;
    const left = prevX - this.width / 2 - PHYSICS.player.width / 2;
    const right = prevX + this.width / 2 + PHYSICS.player.width / 2;
    const topToleranceAbove = 8;
    const topToleranceBelow = 18;

    for (const rider of this.riders) {
      const pos = rider.position;
      const bottom = pos.y + PHYSICS.player.height / 2;
      const isOnTop =
        pos.x >= left &&
        pos.x <= right &&
        bottom >= prevTop - topToleranceAbove &&
        bottom <= prevTop + topToleranceBelow;
      if (!isOnTop) continue;

      this.scene.matter.body.setPosition(rider, { x: pos.x + dx, y: pos.y + dy }, false);
    }
  }

  private draw(x: number, y: number): void {
    const w = this.width;
    const h = this.height;
    this.gfx.clear();
    this.gfx.fillStyle(0xf77f00, 1);
    this.gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    this.gfx.lineStyle(2, 0xffd166, 1);
    this.gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    this.gfx.fillStyle(0xffd166, 0.8);
    this.gfx.fillCircle(x, y, 3);
  }

  getLabel(): string {
    return 'platform';
  }

  getLeftX(): number {
    return this.cx - this.amplitude - this.width / 2;
  }

  getRightX(): number {
    return this.cx + this.amplitude + this.width / 2;
  }
}
