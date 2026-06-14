import Phaser from 'phaser';
import type { Player } from './Player';
import { PHYSICS } from '../game/config';
import { getSound } from '../audio/SoundManager';

export interface RopeOptions {
  naturalLength: number;
  maxLength: number;
}

/**
 * 绳子（视觉 + 物理 + 约束）。
 *
 * #62 v3：绳子不再按"硬约束 / 软弹簧 / 松弛"分段切换。分段会在阈值上产生
 * 行为突变：超过 maxLength 瞬移 snap、进入 naturalLength 后突然断力，救援场景
 * 很容易变成"太硬"或"完全拉不上来"。
 *
 * 现在每帧只跑一条连续张力公式：
 *   strain = max(0, dist - naturalLength)
 *   springAccel = smoothLimit(strain * stiffness, maxAccel)
 *   velocityAccel = activeJump ? clamp(separatingSpeed * damping, 0, springVelocityTransferMax) * stretchRatio : 0
 *   accel = springAccel + velocityAccel，再按 upper anchor / vertical gap 连续分配给两人
 *
 * 只有真实绳长超过 naturalLength 才有张力；掉坑初期是自由落体，不提前用竖向落差
 * 制造"果冻托住"的感觉。没有 rescue mode，也没有硬 snap。
 */
export class Rope {
  private readonly scene: Phaser.Scene;
  private readonly p1: Player;
  private readonly p2: Player;
  private readonly naturalLength: number;
  private readonly maxLength: number;
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, p1: Player, p2: Player, opts: RopeOptions) {
    this.scene = scene;
    this.p1 = p1;
    this.p2 = p2;
    this.naturalLength = opts.naturalLength;
    this.maxLength = opts.maxLength;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(50);
  }

  update(_delta: number): void {
    this.applyConstraint();
    this.draw();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  /** 当前距离。 */
  getDistance(): number {
    const a = this.p1.getPosition();
    const b = this.p2.getPosition();
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  getMaxLength(): number {
    return this.maxLength;
  }

  /**
   * 绳子的物理力（每帧调一次，必须在 p1.update / p2.update 之后调用，否则
   * 玩家自身更新又会改 velocity，把我们刚施加的弹簧力覆盖掉）。
   *
   * 实现策略：直接 setVelocity（不走 matter applyForce）— 单位的 matter 单位
   * 不好调，setVelocity 可以 1:1 对应"每帧给两人各 ±accel/2 的速度增量"。
   * frictionAir 仍由 matter 引擎每帧自动应用。
   */
  private applyConstraint(): void {
    const p1Position = this.p1.getPosition();
    const p2Position = this.p2.getPosition();
    const p1Velocity = this.p1.getVelocity();
    const p2Velocity = this.p2.getVelocity();
    const dx = p2Position.x - p1Position.x;
    const dy = p2Position.y - p1Position.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return; // 重合时方向未定，跳过

    const dirX = dx / dist;
    const dirY = dy / dist;

    const relVx = p2Velocity.x - p1Velocity.x;
    const relVy = p2Velocity.y - p1Velocity.y;
    const relAlong = relVx * dirX + relVy * dirY;
    const shares = this.calculateForceShares(
      { position: p1Position, velocity: p1Velocity },
      { position: p2Position, velocity: p2Velocity },
    );
    const tension = this.calculateTension(dist, relAlong, shares.transferVelocity);
    if (tension.accel <= 0) return;
    if (tension.ratio > 0.35) getSound()?.playRopeTension();

    // 一次性合成两人的新速度（读旧的 velocity 一次，避免 setVelocity 之间的互相覆盖）
    const newV1x = p1Velocity.x + dirX * tension.accel * shares.p1;
    const newV1y = p1Velocity.y + dirY * tension.accel * shares.p1;
    const newV2x = p2Velocity.x - dirX * tension.accel * shares.p2;
    const newV2y = p2Velocity.y - dirY * tension.accel * shares.p2;

    this.scene.matter.body.setVelocity(this.p1.getBody(), {
      x: newV1x,
      y: newV1y,
    });
    this.scene.matter.body.setVelocity(this.p2.getBody(), {
      x: newV2x,
      y: newV2y,
    });
  }

  private calculateForceShares(
    b1: { position: { y: number }; velocity: { y: number } },
    b2: { position: { y: number }; velocity: { y: number } },
  ): { p1: number; p2: number; transferVelocity: boolean } {
    const defaultShare = 0.5;
    const counterShare = PHYSICS.rope.activeJumpCounterScale;
    const pullShare = PHYSICS.rope.activeJumpPullShare;

    const p1ActivelyJumpingAbove =
      b1.position.y < b2.position.y &&
      this.p1.getState() === 'in_air' &&
      this.p1.isJumping() &&
      b1.velocity.y < 0;
    if (p1ActivelyJumpingAbove) {
      const t = this.clamp01((b2.position.y - b1.position.y) / this.maxLength);
      return {
        p1: this.lerp(defaultShare, counterShare, t),
        p2: this.lerp(defaultShare, pullShare, t),
        transferVelocity: true,
      };
    }

    const p2ActivelyJumpingAbove =
      b2.position.y < b1.position.y &&
      this.p2.getState() === 'in_air' &&
      this.p2.isJumping() &&
      b2.velocity.y < 0;
    if (p2ActivelyJumpingAbove) {
      const t = this.clamp01((b1.position.y - b2.position.y) / this.maxLength);
      return {
        p1: this.lerp(defaultShare, pullShare, t),
        p2: this.lerp(defaultShare, counterShare, t),
        transferVelocity: true,
      };
    }

    return { p1: defaultShare, p2: defaultShare, transferVelocity: false };
  }

  private calculateTension(
    dist: number,
    separatingSpeed: number,
    transferVelocity: boolean,
  ): { accel: number; ratio: number } {
    const strain = Math.max(0, dist - this.naturalLength);
    if (strain <= 0) {
      return { accel: 0, ratio: 0 };
    }

    const maxAccel = PHYSICS.rope.springMaxAccel;
    const stretchRange = Math.max(1, this.maxLength - this.naturalLength);
    const stretchRatio = this.clamp01(strain / stretchRange);
    const springAccel = this.smoothLimit(strain * PHYSICS.rope.springStiffness, maxAccel);
    const velocityAccel = transferVelocity
      ? Math.min(
          Math.max(0, separatingSpeed * PHYSICS.rope.springDamping),
          PHYSICS.rope.springVelocityTransferMax,
        ) * stretchRatio
      : 0;
    const accel = springAccel + velocityAccel;
    const visualMax = maxAccel + PHYSICS.rope.springVelocityTransferMax;
    return {
      accel,
      ratio: visualMax > 0 ? Math.min(1, accel / visualMax) : 0,
    };
  }

  private smoothLimit(value: number, limit: number): number {
    if (limit <= 0 || value <= 0) return 0;
    return limit * (1 - Math.exp(-value / limit));
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private draw(): void {
    const aPosition = this.p1.getPosition();
    const bPosition = this.p2.getPosition();
    const aVelocity = this.p1.getVelocity();
    const bVelocity = this.p2.getVelocity();
    const dx = bPosition.x - aPosition.x;
    const dy = bPosition.y - aPosition.y;
    const dist = Math.hypot(bPosition.x - aPosition.x, bPosition.y - aPosition.y);
    let tension = 0;
    if (dist > 0) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      const relVx = bVelocity.x - aVelocity.x;
      const relVy = bVelocity.y - aVelocity.y;
      tension = this.calculateTension(dist, relVx * dirX + relVy * dirY, false).ratio;
    }

    this.graphics.clear();

    // 绳子线段
    const color = this.lerpColor(0xf8f1d2, 0xff4d4d, tension);
    this.graphics.lineStyle(8, 0x1b1b28, 0.85);
    this.graphics.beginPath();
    this.graphics.moveTo(aPosition.x, aPosition.y);

    // 中点下垂（绳子弯曲）
    const midX = (aPosition.x + bPosition.x) / 2;
    const midY = (aPosition.y + bPosition.y) / 2 + 8;
    this.graphics.lineTo(midX, midY);
    this.graphics.lineTo(bPosition.x, bPosition.y);
    this.graphics.strokePath();

    this.graphics.lineStyle(4, color, 0.95);
    this.graphics.beginPath();
    this.graphics.moveTo(aPosition.x, aPosition.y);
    this.graphics.lineTo(midX, midY);
    this.graphics.lineTo(bPosition.x, bPosition.y);
    this.graphics.strokePath();

    // 端点圆点
    this.graphics.fillStyle(0x1b1b28, 1);
    this.graphics.fillCircle(aPosition.x, aPosition.y, 6);
    this.graphics.fillCircle(bPosition.x, bPosition.y, 6);
    this.graphics.fillStyle(color, 1);
    this.graphics.fillCircle(aPosition.x, aPosition.y, 4);
    this.graphics.fillCircle(bPosition.x, bPosition.y, 4);
  }

  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff,
      g1 = (c1 >> 8) & 0xff,
      b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff,
      g2 = (c2 >> 8) & 0xff,
      b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t) & 0xff;
    const g = Math.round(g1 + (g2 - g1) * t) & 0xff;
    const b = Math.round(b1 + (b2 - b1) * t) & 0xff;
    return (r << 16) | (g << 8) | b;
  }
}
