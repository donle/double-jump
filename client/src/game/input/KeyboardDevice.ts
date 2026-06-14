import Phaser from 'phaser';
import { InputDevice, type FrameInput, NEUTRAL_INPUT } from './InputDevice';

/**
 * 键盘输入设备：把 Phaser 的 1 个 Key（JUMP）转换为 FrameInput。
 * 通过 'down' / 'up' 事件捕获边沿，自动刷新 lastInputAt。
 *
 * M3 末重构：单机模式只用一个 JUMP 键（控制两个角色，按"trailer 跳"规则），
 * 不再有"每个玩家一个键"的绑定。
 */
export class KeyboardDevice extends InputDevice {
  private readonly scene: Phaser.Scene;
  private readonly jumpKey: Phaser.Input.Keyboard.Key;
  private jumpWasDown = false;
  private lastInputAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Phaser.Scene, keyCode: number) {
    super();
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.jumpKey = kb.addKey(keyCode);
  }

  attach(): void {
    const stamp = () => {
      this.lastInputAt = this.scene.time.now;
    };
    this.jumpKey.on('down', stamp);
    this.jumpKey.on('up', stamp);
  }

  detach(): void {
    this.jumpKey.removeAllListeners();
  }

  poll(nowMs: number): FrameInput {
    const jumpDown = this.jumpKey.isDown;
    const justPressed = jumpDown && !this.jumpWasDown;
    const justReleased = !jumpDown && this.jumpWasDown;
    this.jumpWasDown = jumpDown;

    return {
      left: false,
      right: false,
      jumpDown,
      jumpJustPressed: justPressed,
      jumpJustReleased: justReleased,
      chargeMs: 0,
      idleMs: nowMs - this.lastInputAt,
    };
  }

  isActive(nowMs: number): boolean {
    return nowMs - this.lastInputAt < 5000;
  }

  /** 调试用：当前按键状态。 */
  debug(): { jumpDown: boolean; lastInputAt: number } {
    return { jumpDown: this.jumpKey.isDown, lastInputAt: this.lastInputAt };
  }
}

/** 在 NEUTRAL_INPUT 上不会崩的占位。 */
export function makeStubKeyboardDevice(): InputDevice {
  return {
    attach: () => undefined,
    detach: () => undefined,
    poll: () => NEUTRAL_INPUT,
    isActive: () => false,
  };
}
