import Phaser from 'phaser';

export type GamepadButtonId = 'left' | 'right' | 'jump';

export interface GamepadButtonConfig {
  id: GamepadButtonId;
  label: string;
  /** 距离屏幕左边的 x (px) */
  x: number;
  /** 距离屏幕底部的 y (px) */
  y: number;
  w: number;
  h: number;
  color: number;
}

/**
 * 屏幕上的一个按钮：圆角矩形 + 标签。**纯视觉**——无 hit area。
 * - 固定在屏幕坐标（不随相机滚动）
 * - M4-B #59 起不调用 setInteractive()，点击穿透到 scene.input 层，
 *   触发全屏 jump。按钮保留作"点这里跳 / 屏内任意点跳"的视觉提示。
 * - 视觉态（按下变暗等）由 GameScene 在拿到 FrameInput.jumpDown 后通过
 *   单独 setAlpha/调色 表达，本类不持有 pressed 状态。
 */
export class GamepadView {
  readonly rect: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, cfg: GamepadButtonConfig) {
    const yTop = scene.scale.height - cfg.y - cfg.h;
    this.rect = scene.add
      .rectangle(cfg.x + cfg.w / 2, yTop + cfg.h / 2, cfg.w, cfg.h, cfg.color, 0.45)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setScrollFactor(0)
      .setDepth(2000);
    // M4-B #59：按钮是纯视觉提示，hit area 由 GameScene 全屏 input.on('pointerdown') 接管。
    // 不 setInteractive → 点击穿透到 scene.input 层，触发全屏 jump。
    this.text = scene.add
      .text(this.rect.x, this.rect.y, cfg.label, {
        fontSize: '20px',
        color: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);
  }

  setVisible(v: boolean): void {
    this.rect.setVisible(v);
    this.text.setVisible(v);
  }

  destroy(): void {
    this.rect.destroy();
    this.text.destroy();
  }
}
