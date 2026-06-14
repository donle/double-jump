import Phaser from 'phaser';
import { InputDevice, type FrameInput } from './InputDevice';

export interface TouchLayout {
  jump: { x: number; y: number; w: number; h: number };
  /** 按钮颜色（默认 0xffe066 黄） */
  color?: number;
}

/**
 * 触屏输入设备：1 个 JUMP 按钮（单机模式下只一个，双人联机时再分两个）。
 * 鼠标点击同样通过 pointer 事件触发，所以这套按钮同时支持鼠标 + 触屏。
 *
 * M3 末重构：单机模式只有一个 JUMP 按钮（之前是两个玩家各一个）。trailer
 * 跳跃规则不变：按 JUMP → trailer 跳。
 *
 * M4-B #59 重构：GamepadView 不再持有 hit area（按钮变纯视觉），所有 pointer
 * 事件由 GameScene 在 `this.input.on('pointerdown', ...)` 全屏接收，再调
 * `InputManager.triggerJump(down)` → `TouchDevice.setJumpDown(down)` 来
 * 改 jumpDown 状态。
 */
export class TouchDevice extends InputDevice {
  private readonly scene: Phaser.Scene;
  private jumpDown = false;
  private jumpWasDown = false;
  private lastInputAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Phaser.Scene, _layout: TouchLayout) {
    super();
    this.scene = scene;
  }

  attach(): void {
    // Full-screen pointer handling lives in GameScene. No visible jump button.
  }

  detach(): void {
    this.jumpDown = false;
    this.jumpWasDown = false;
  }

  setVisible(_v: boolean): void {
    // No visible control in the current UI.
  }

  /**
   * M4-B #59：全屏 pointerdown/up 转发到 jumpDown。
   * 由 InputManager.triggerJump(down) 调用，GameScene 在 scene.input 层监听
   * `pointerdown` / `pointerup` / `pointerupoutside` 然后调本方法。
   */
  setJumpDown(down: boolean): void {
    this.lastInputAt = this.scene.time.now;
    this.jumpDown = down;
  }

  poll(nowMs: number): FrameInput {
    const justPressed = this.jumpDown && !this.jumpWasDown;
    const justReleased = !this.jumpDown && this.jumpWasDown;
    this.jumpWasDown = this.jumpDown;
    return {
      left: false,
      right: false,
      jumpDown: this.jumpDown,
      jumpJustPressed: justPressed,
      jumpJustReleased: justReleased,
      chargeMs: 0,
      idleMs: nowMs - this.lastInputAt,
    };
  }

  isActive(nowMs: number): boolean {
    return nowMs - this.lastInputAt < 5000;
  }
}
