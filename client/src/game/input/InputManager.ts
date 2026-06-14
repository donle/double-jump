import { KeyboardDevice } from './KeyboardDevice';
import { TouchDevice, type TouchLayout } from './TouchDevice';
import { type FrameInput } from './InputDevice';
import { JUMP_KEY } from '../types';

/**
 * 输入管理器：单机模式 = 单 JUMP 键 + 单触屏按钮。
 * - poll()：返回当前帧的 FrameInput（jumpDown / jumpJustPressed / jumpJustReleased）
 * - buildGamepadsIfNeeded()：构造时立即创建屏幕按钮（M4-B #59 之前是首次
 *   pointerdown 时才建；现改为构造时建，让 triggerJump 任何时候都能工作）
 * - update()：gamepads 创建后保持显示
 * - triggerJump(down)：M4-B #59 新增——GameScene 全屏 input.on('pointerdown/up')
 *   转发到 tp.jumpDown，让"点屏任何地方都跳"
 *
 * M3 末设计：不再做"P1 按键 / P2 按键"，而是"按 JUMP 时由 trailer 跳"。
 * 双人联机（M4 之后）会有两个 JUMP 输入，路由到不同角色，但 trailer 规则不变。
 */
export class InputManager {
  private readonly scene: Phaser.Scene;
  private readonly kb: KeyboardDevice;
  private tp: TouchDevice | null = null;
  private gamepadsBuilt = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.kb = new KeyboardDevice(scene, JUMP_KEY);
    this.kb.attach();
    // M4-B #59：构造时立即建按钮（不再等首次 pointerdown）。
    // GamepadView 是纯视觉（不 setInteractive），hit area 由 GameScene
    // 全屏 input.on('pointerdown') 接管。
    this.buildGamepadsIfNeeded();
  }

  /** 构造时立即调用。GamepadView 是纯视觉提示，hit area 失效。 */
  buildGamepadsIfNeeded(): void {
    if (this.gamepadsBuilt) return;
    this.gamepadsBuilt = true;
    const W = this.scene.scale.width;
    // 单个 JUMP 按钮：底部居中、宽度大一些（仅作视觉提示，不响应 hit area）。
    const layout: TouchLayout = {
      jump: { x: W / 2 - 120, y: 28, w: 240, h: 88 },
    };
    this.tp = new TouchDevice(this.scene, layout);
    this.tp.attach();
  }

  /** 当前帧 JUMP 输入。优先用最近活跃的设备（键盘 / 触屏）。 */
  poll(_unused: number, nowMs: number): FrameInput {
    if (this.tp && this.tp.isActive(nowMs)) return this.tp.poll(nowMs);
    return this.kb.poll(nowMs);
  }

  /** 每帧调用：维持 gamepad 显隐（创建后常显）。 */
  update(_nowMs: number): void {
    if (!this.gamepadsBuilt || !this.tp) return;
    this.tp.setVisible(true);
  }

  /** 显隐 gamepad（用于游戏结束时让出屏幕中央给 game over panel）。 */
  setGamepadsVisible(v: boolean): void {
    if (!this.tp) return;
    this.tp.setVisible(v);
  }

  /**
   * M4-B #59：全屏 pointerdown/up 转发到 tp.jumpDown。
   * - down=true：模拟"按下"（hold 跳会持续有效）
   * - down=false：模拟"松开"（下次 poll 返回 justReleased → 玩家进入下落）
   * 必须确保 tp 已建（构造时已建，OK）。
   */
  triggerJump(down: boolean): void {
    if (!this.tp) return;
    this.tp.setJumpDown(down);
  }

  /** 场景销毁时调用。 */
  destroy(): void {
    this.kb.detach();
    if (this.tp) this.tp.detach();
  }
}
