/**
 * 输入设备抽象：一帧输入。
 * 键盘 / 触屏 / 鼠标 / 手柄 都实现该接口，由 InputManager 聚合。
 */
export interface FrameInput {
  left: boolean;
  right: boolean;
  /** 当前 jump 按下状态（连续）。 */
  jumpDown: boolean;
  /** 上一帧到本帧之间 jump 被按下（边沿）。 */
  jumpJustPressed: boolean;
  /** 上一帧到本帧之间 jump 被松开（边沿）。 */
  jumpJustReleased: boolean;
  /** 当前已蓄力时长（ms）。未蓄力时为 0。 */
  chargeMs: number;
  /** 自上次任意输入事件到现在（ms）。用于 InputManager 决定哪个设备"最近活跃"。 */
  idleMs: number;
}

export const NEUTRAL_INPUT: FrameInput = {
  left: false,
  right: false,
  jumpDown: false,
  jumpJustPressed: false,
  jumpJustReleased: false,
  chargeMs: 0,
  idleMs: Number.POSITIVE_INFINITY,
};

export abstract class InputDevice {
  abstract attach(): void;
  abstract detach(): void;
  /** 取一帧的输入状态。 */
  abstract poll(nowMs: number): FrameInput;
  /** 该设备是否在最近 N ms 内有活动。 */
  abstract isActive(nowMs: number): boolean;
}
