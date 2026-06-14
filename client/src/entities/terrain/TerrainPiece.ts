import Phaser from 'phaser';

export interface Player {
  getBody(): MatterJS.BodyType;
}

/**
 * 地形元素基类。封装：matter 物理 body + Phaser 图形 + 更新/销毁生命周期。
 * 子类通过实现 build() 设置具体的 body 形状和可视化。
 */
export abstract class TerrainPiece {
  protected readonly scene: Phaser.Scene;
  protected readonly gfx: Phaser.GameObjects.Graphics;
  protected body: MatterJS.BodyType | null = null;
  protected destroyed = false;

  constructor(scene: Phaser.Scene, depth = 10) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(depth);
  }

  /** 物理 body；非物理元素（如 Pit 传感器）可能为 null。 */
  getBody(): MatterJS.BodyType | null {
    return this.body;
  }

  /** 用于在 GameScene 中匹配碰撞事件。 */
  abstract getLabel(): string;

  /** 元素左边界 x，用于关卡生成器做空间布局。 */
  abstract getLeftX(): number;

  /** 元素右边界 x。 */
  abstract getRightX(): number;

  /** 每帧更新（移动平台需要、限时板需要计时）。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_delta: number, _time: number): void {
    // 默认空实现
  }

  /** 玩家接触（碰撞 start）。子类按需重写。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPlayerTouch(_player: Player): void {
    // 默认空实现
  }

  /** 玩家离开（碰撞 end）。子类按需重写。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPlayerLeave(_player: Player): void {
    // 默认空实现
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gfx.destroy();
    if (this.body) {
      this.scene.matter.world.remove(this.body);
      this.body = null;
    }
  }
}
