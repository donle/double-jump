import Phaser from 'phaser';
import type { PlayerId } from '../game/types';
import { PHYSICS } from '../game/config';
import { NEUTRAL_INPUT, type FrameInput } from '../game/input/InputDevice';
import { getSound } from '../audio/SoundManager';
import type { NetPlayerSnapshot, PlayerSeat } from '../../../shared/net/protocol';

export type PlayerState = 'on_ground' | 'in_air' | 'dead';

const SOLID_LABELS = new Set(['ground', 'platform']);
const SPRITE_VISUAL_HEIGHT = 68;
const GROUNDED_VERTICAL_SLEEP_SPEED = 1.25;
const SUPPORT_NORMAL_Y_MIN = 0.85;
const NETWORK_SNAP_DISTANCE = 180;
const NETWORK_VELOCITY_BLEND = 0.35;

interface PitContact {
  leftX: number;
  rightX: number;
  topY: number;
}

interface BodyVector {
  x: number;
  y: number;
}

/** #48 稳定悬挂判定时长（ms）。3 条件全满足持续这么久后才算稳定。 */
const STABLE_HANG_MS = 300;

/**
 * 玩家：matter 矩形 body + 状态机。
 * 状态：on_ground / in_air / dead。pit 内状态用 inPit 标记，不改变运动状态。
 *
 * 跳跃模型（变重力 · 无 maxHeight、无 tapVy 刹车）：
 *   - 起跳 vy = jumpInitialVy（向上）
 *   - 上升期 + 按住跳键 + 未超 maxHoldMs + 仍在上升(vy<0) → holdGravity（弱重力，爬升慢）
 *   - 其它情况（松键 / 超时 / 改下落）→ fallGravity（正常重力，自然落体）
 *   - 高度由按键持续时长 + 重力自然决定，无硬上限
 *   - canJump 由 GameScene 的单跳规则统一决定
 *
 * 接触模型：维护当前支撑集合，碰撞 start/end 时增删。
 * 若支撑数为 0 且垂直速度向下，认为失支撑 → in_air。
 */
export class Player {
  readonly id: PlayerId;
  private readonly scene: Phaser.Scene;
  private readonly body: MatterJS.BodyType;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Image | null;
  /** 本玩家"原始"颜色（构造时传入）。稳定悬挂时变红，落地后恢复。#53 */
  private readonly baseColor: number;
  private state: PlayerState = 'in_air';
  /** 当前正在支撑玩家的 body 集合 */
  private readonly supports: Set<MatterJS.BodyType> = new Set();
  /** 当前主要支撑 body（最近一次 onContactStart 的 top 接触体）。用于落地吸附和移动平台跟随。 */
  private supportBody: MatterJS.BodyType | null = null;
  /** 当前正在侧面/底面接触的固体 body。侧墙摩擦必须为 0，避免贴崖壁卡住。 */
  private readonly sideContacts: Set<MatterJS.BodyType> = new Set();
  /** 最近一次可靠落地的地面 body，用顶面坐标容忍 collisionStart/End 的瞬时抖动。 */
  private supportGraceUntil = 0;
  /** 跳跃上升期：true 表示正在按键持续抬升。 */
  private jumping = false;
  /** 起跳时的 y（用于绘制跳跃高度指示器）。 */
  private jumpStartY = 0;
  /** 起跳时刻（ms）。用于按键时长上限判定（elapsed = nowMs - jumpStartMs）。 */
  private jumpStartMs = 0;
  /** 是否被允许起跳（由 GameScene 单跳规则决定）。 */
  private canJump = false;
  /** 环境标记：玩家身体中心已经进入 pit 区域。不会改变重力模型。 */
  private inPit = false;
  private readonly pitContacts: Map<MatterJS.BodyType, PitContact> = new Map();
  /** 稳定悬挂态起始时刻（ms）。inPit + in_air + !jumping + |vy|<0.5 + supports=0 全满足时设 nowMs，任意一条件不满足重置 0。
   *  持续 300ms 后由 isStablyHanging() 返回 true，用于 #48 让另一玩家可跳。 */
  private stablyHangingSinceMs = 0;
  /**
   * 局部坐标锁定（与服务端 ServerPlayer 镜像）。
   * 落地瞬间用解析抛物线预测精确 (x, y) 后 lockToPlatform；
   * 之后每帧 enforceLocalFrame 强制把玩家位置 = platform.pos + offset，
   * 消除 Matter 接触求解器的 1-2px 漂移（落点 / 浮空板打滑问题）。
   * 起跳 / 平台离开 / in_air 转移时 unlock。
   */
  private ridingPlatform: MatterJS.BodyType | null = null;
  /** 玩家中心相对平台中心的局部坐标（landX/Y - platform.pos）。 */
  private platformOffsetX = 0;
  private platformOffsetY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, id: PlayerId, color: number) {
    this.scene = scene;
    this.id = id;
    this.baseColor = color;

    const w = PHYSICS.player.width;
    const h = PHYSICS.player.height;
    this.body = scene.matter.add.rectangle(x, y, w, h, {
      label: id,
      frictionAir: PHYSICS.player.body.frictionAir,
      friction: PHYSICS.player.friction,
      density: PHYSICS.player.body.density,
      restitution: PHYSICS.player.body.restitution,
      // 显式碰撞分类：玩家**不**互相碰撞（mask 不含 PLAYER），可重叠穿过；
      // 只与地面（GROUND）+ 坑传感器（PIT）发生碰撞。旧版让两人互相挡
      // → 一个卡另一个 body 后面无法前进；用户要求还原成"可重叠"。
      collisionFilter: {
        category: PHYSICS.collision.PLAYER,
        mask: PHYSICS.collision.GROUND | PHYSICS.collision.PIT,
      },
    });

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(99);

    const spriteKey = id === 'p1' ? 'player-p1' : 'player-p2';
    if (scene.textures.exists(spriteKey)) {
      this.sprite = scene.add.image(x, y + h / 2, spriteKey);
      this.sprite.setDepth(101);
      this.sprite.setOrigin(0.5, 1);
      const source = scene.textures.get(spriteKey).getSourceImage() as { height?: number };
      const sourceHeight = source.height ?? 1024;
      this.sprite.setScale(SPRITE_VISUAL_HEIGHT / sourceHeight);
      this.drawSpriteShadow(w, h);
    } else {
      this.sprite = null;
      this.gfx.setDepth(100);
      this.drawBody(color, w, h);
    }
  }

  private drawSpriteShadow(w: number, h: number): void {
    this.gfx.clear();
    this.gfx.fillStyle(0x000000, 0.24);
    this.gfx.fillEllipse(0, h / 2 - 1, w * 1.15, 9);
  }

  private drawBody(color: number, w: number, h: number): void {
    this.gfx.clear();
    this.gfx.fillStyle(0x000000, 0.22);
    this.gfx.fillEllipse(0, h / 2 - 2, w * 0.9, 8);
    this.gfx.fillStyle(0x111827, 0.95);
    this.gfx.fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 12);
    this.gfx.fillStyle(color, 1);
    this.gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 11);
    this.gfx.fillStyle(0xffffff, 0.28);
    this.gfx.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w * 0.32, h - 14, 8);
    this.gfx.lineStyle(3, 0xffffff, 0.95);
    this.gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 11);
    this.gfx.fillStyle(0xffffff, 1);
    this.gfx.fillCircle(-5, -h / 5, 5);
    this.gfx.fillCircle(8, -h / 5, 5);
    this.gfx.fillStyle(0x111827, 1);
    this.gfx.fillCircle(-4, -h / 5, 2);
    this.gfx.fillCircle(9, -h / 5, 2);
    this.gfx.fillStyle(0x111827, 0.9);
    this.gfx.fillRoundedRect(-w / 2 + 3, h / 2 - 7, w - 6, 6, 3);
  }

  /**
   * 每帧由 GameScene 调用，传入当前帧的 FrameInput（来自 InputManager）。
   */
  update(_delta: number, input: FrameInput = NEUTRAL_INPUT): void {
    const body = this.body as unknown as {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      mass: number;
    };

    const nowMs = this.scene.time.now;
    this.updateContactFriction();
    this.updatePitStateFromContacts(body);
    this.stabilizePitMouthIfBlocked(body, nowMs);

    // 1+1b 合并：jumping 状态判定 + vx 前进 boost + 手工施加重力，单次 setVelocity。
    // 之前分两个 setVelocity 有 x 覆盖的隐患，合并后无该问题。
    // 关键修正：jumping 只控制"用 holdGravity 还是 fallGravity"，不控制"是否施加重力"。
    // 只要在 in_air 状态就要一直施加重力，否则松键后会靠 frictionAir 0.03 缓慢减速，
    // 短按 50ms 后玩家会以高初速度无阻力上飘 → 飞过屏幕。
    const hasSupport = this.hasPhysicalSupport();
    const shouldUseAirPhysics =
      this.state === 'in_air' || (this.state === 'on_ground' && !hasSupport);
    if (shouldUseAirPhysics) {
      const elapsed = nowMs - this.jumpStartMs;
      const stillInBoost =
        input.jumpDown && elapsed < PHYSICS.jump.maxHoldMs && body.velocity.y < 0;
      if (this.jumping && !stillInBoost) {
        // 退出弱重力窗口（松键 / 超时 / 已到峰顶向下落）。后续走 fallGravity。
        this.jumping = false;
      }
      // 前进 boost：仅在 boost 窗口内（jumping 仍为 true 时）累加
      let vx = body.velocity.x;
      if (this.jumping) {
        vx = Math.min(
          body.velocity.x + PHYSICS.jump.forwardAccel,
          PHYSICS.jump.maxForwardSpeed,
        );
      }
      // 4 档重力判定（#47 改）：
      //   1. tap 模式：松键 + elapsed<maxHoldMs + vy<0 → tapGravity=2.5
      //      （松键瞬间优先于 hold 判定，**关键**：用户期望"按得越久跳得越高"，
      //       松键立刻走强减速，差距才能拉开）
      //   2. hold 模式：jumping + 按键 + elapsed<maxHoldMs + vy<0 → holdGravity=0.25
      //   3. fall 模式：以上都不满足 → fallGravity=0.85
      const releasedEarly = !input.jumpDown && elapsed < PHYSICS.jump.maxHoldMs;
      const inHoldWindow =
        this.jumping &&
        input.jumpDown &&
        elapsed < PHYSICS.jump.maxHoldMs &&
        body.velocity.y < 0;
      let g: number;
      if (releasedEarly) {
        // tap 模式：松键后到 vy≥0 之前都用 tapGravity
        g = body.velocity.y < 0 ? PHYSICS.jump.tapGravity : PHYSICS.jump.fallGravity;
      } else if (inHoldWindow) {
        g = PHYSICS.jump.holdGravity;
      } else {
        g = PHYSICS.jump.fallGravity;
      }
      this.scene.matter.body.setVelocity(body as unknown as MatterJS.BodyType, {
        x: vx,
        y: body.velocity.y + g,
      });
    }

    // 2. 起跳：on_ground + canJump + jumpJustPressed → 跳！
    if (this.state === 'on_ground' && this.canJump && input.jumpJustPressed) {
      this.scene.matter.body.setVelocity(body as unknown as MatterJS.BodyType, {
        x: 0,
        y: PHYSICS.jump.jumpInitialVy,
      });
      this.jumping = true;
      this.jumpStartY = body.position.y;
      this.jumpStartMs = nowMs;
      this.supports.clear();
      this.supportBody = null;
      this.unlockFromPlatform();
      this.state = 'in_air';
      getSound()?.playJump();
    }

    // 3. 滑动停止：on_ground 且不在跳跃上升期，每帧 vx *= groundSlideDamp
    if (this.state === 'on_ground' && hasSupport && !this.jumping) {
      this.scene.matter.body.setVelocity(body as unknown as MatterJS.BodyType, {
        x: body.velocity.x * PHYSICS.player.groundSlideDamp,
        y: Math.abs(body.velocity.y) <= GROUNDED_VERTICAL_SLEEP_SPEED ? 0 : body.velocity.y,
      });
    }

    // 4. 限制最大下落速度（防高速下坠隧穿）。**不再钳上升速度**——跳跃上升期由重力
    //    自然加速，无硬速度上限（符合 G1 "无任何 setVelocity(vy=固定值)"）。
    const maxFall = PHYSICS.player.maxFallSpeed;
    if (body.velocity.y > maxFall) {
      this.scene.matter.body.setVelocity(body as unknown as MatterJS.BodyType, { x: body.velocity.x, y: maxFall });
    }

    // 5. 落地状态用确定的地面顶面坐标判断，不用 collisionEnd 的瞬时空窗直接切状态。
    if (this.state === 'on_ground') {
      if (!this.hasPhysicalSupport()) {
        if (nowMs < this.supportGraceUntil) {
          // 在宽容窗口内，暂不转换（容忍 matter 的 collisionStart/End 抖动）
        } else {
          this.state = 'in_air';
          this.updateContactFriction();
        }
      } else {
        this.supportGraceUntil = nowMs + 200;
      }
    }

    // 6. 稳定悬挂态计时器刷新（#48）。每帧由本方法统一调一次，isStablyHanging() 纯读不重置。
    this.refreshStableHangTimer(nowMs);

    this.syncVisualToBody();
  }

  private updatePitStateFromContacts(body: {
    position: { y: number };
  }): void {
    if (this.inPit || this.pitContacts.size === 0 || this.state === 'dead') {
      return;
    }
    for (const pit of this.pitContacts.values()) {
      if (body.position.y >= pit.topY + PHYSICS.pit.enterDepth) {
        this.fallIntoPit();
        return;
      }
    }
  }

  private stabilizePitMouthIfBlocked(body: {
    position: { x: number; y: number };
    velocity: { x: number; y: number };
  }, nowMs: number): void {
    if (this.jumping || this.inPit || this.pitContacts.size === 0 || this.state === 'dead') {
      return;
    }
    if (body.velocity.y < -0.25 || body.velocity.y > 0.75) {
      return;
    }
    const bottomY = body.position.y + PHYSICS.player.height / 2;
    for (const pit of this.pitContacts.values()) {
      const insideMouthX = body.position.x > pit.leftX && body.position.x < pit.rightX;
      const nearMouthY =
        bottomY >= pit.topY - 2 && body.position.y < pit.topY + PHYSICS.pit.enterDepth;
      if (!insideMouthX || !nearMouthY) {
        continue;
      }

      this.state = 'on_ground';
      this.jumping = false;
      this.supportGraceUntil = nowMs + 120;
      this.scene.matter.body.setVelocity(this.body, { x: body.velocity.x, y: 0 });
      this.updateContactFriction();
      return;
    }
  }

  private updateContactFriction(): void {
    const friction =
      this.state === 'on_ground' && this.hasPhysicalSupport() && this.sideContacts.size === 0
        ? PHYSICS.player.friction
        : PHYSICS.player.wallFriction;
    (this.body as unknown as { friction: number }).friction = friction;
  }

  private hasPhysicalSupport(): boolean {
    return this.supports.size > 0;
  }

  /**
   * 后物理地面约束（局部坐标系锁定）。在所有物理、绳索、地形更新完成后调用。
   *
   * 旧策略：仅在 platform 移动时（position≠positionPrev）吸附 y，偏差 > 12px 就放弃 —
   * 浮空板 / 浮空板 + 绳索拉扯场景下基本不生效，玩家在板上"打滑"；
   * 静态平台更不干预，1-2px 漂移靠 ground slide 缓解但视觉上仍有跳帧。
   *
   * 新策略（方案 B — 与服务端 ServerPlayer 镜像）：
   *   1. 落地瞬间 onContactStart 用解析抛物线预测精确 (x, y) → lockToPlatform
   *   2. 每帧把玩家位置硬 setPosition 到 platform.pos + offset
   *   3. 玩家的水平相对位移（rope 拉扯 / 自身水平移动）通过累加
   *      (player.vx - platform.vx) 自然吸收到 platformOffsetX
   *   4. vy 清零（平台顶面已确定，y 自由度数掉）
   *
   * 效果：玩家在浮空板上绝对不漂移；静态平台也 0 抖动；起跳后再次落到同一平台
   *       仍走解析预测，不依赖 Matter 接触求解精度。
   */
  applyGroundConstraint(): void {
    this.enforceLocalFrame();
  }

  enforceLocalFrame(): void {
    if (this.state !== 'on_ground' || !this.ridingPlatform || this.jumping) return;

    const platform = this.ridingPlatform as unknown as {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
    };
    const body = this.body as unknown as {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
    };

    // 玩家相对平台的速度 → 累加到 offsetX
    // 平台自身速度已经隐式包含在 platform.position 变化中，不重复累加
    const relativeVx = body.velocity.x - platform.velocity.x;
    this.platformOffsetX += relativeVx;

    const targetX = platform.position.x + this.platformOffsetX;
    const targetY = platform.position.y + this.platformOffsetY;
    // 用 setPosition 而非直写 body.position：直写会让 positionPrev 残留旧值，
    // 下一帧 Engine.update 用 (pos - posPrev)/dt 反算速度 → 虚假 vy → 玩家被弹起
    // 失去地面接触 → 落回 → onContactStart 的 else 分支用漂移后的位置重新 lockToPlatform
    // → offsetY 被刷新成错误值 → 玩家永久陷入地底（漂移会越来越大）。
    this.scene.matter.body.setPosition(body as unknown as MatterJS.BodyType, { x: targetX, y: targetY });
    // 永远 setVelocity（不只是 vy!=0 时），确保 positionPrev = position - velocity
    // 被刷新；vy=0 时跳过会让 positionPrev 继续指向 stale 旧值，下一帧又算出虚假速度。
    this.scene.matter.body.setVelocity(body as unknown as MatterJS.BodyType, { x: body.velocity.x, y: 0 });
  }

  /**
   * 解析预测落点：抛物线方程 y(t) = currentY + vy*t + 0.5*g*t²
   * 令 y(t) = targetY（平台顶面 - 半身高）→ 0.5*g*t² + vy*t - dy = 0
   * → t = (-vy + sqrt(vy² + 2*g*dy)) / g
   * g 是"每帧重力增量"（fallGravity=0.85 px/frame²），t 单位是 frame。
   *
   * **vy 必须由调用方传入**——predictLandingPoint 内部不能再读 body.velocity.y，
   * 否则 onContactStart 前面已经 setVelocity({y:0}) 把 vy 清零了，公式会拿到 0 → t 偏大 → predicted.x 越界。
   *
   * @param vy 入参速度 y 分量（**必须是接触瞬间未清零的原始 vy**）
   * @param gravity 每帧重力增量（px/frame²），默认用 fallGravity
   */
  private predictLandingPoint(
    platform: MatterJS.BodyType,
    vy: number,
    vx: number,
    gravity: number = PHYSICS.jump.fallGravity,
  ): { x: number; y: number; t: number } {
    const platformTopY = (platform as unknown as { bounds: { min: { y: number } } }).bounds.min.y;
    const targetY = platformTopY - PHYSICS.player.height / 2;
    const body = this.body as unknown as { position: { x: number; y: number } };
    const currentX = body.position.x;
    const currentY = body.position.y;
    const dy = targetY - currentY;

    let t: number;
    if (dy <= 0) {
      // 玩家已经到或穿过平台顶面（罕见；坑边缘可能发生）→ 立即落地
      t = 0;
    } else {
      const disc = vy * vy + 2 * gravity * dy;
      t = disc > 0 ? (-vy + Math.sqrt(disc)) / gravity : 0;
    }

    return { x: currentX + vx * t, y: targetY, t };
  }

  private lockToPlatform(platform: MatterJS.BodyType, landingX: number, landingY: number): void {
    this.ridingPlatform = platform;
    this.platformOffsetX = landingX - (platform as unknown as { position: { x: number; y: number } }).position.x;
    this.platformOffsetY = landingY - (platform as unknown as { position: { x: number; y: number } }).position.y;
  }

  private unlockFromPlatform(): void {
    this.ridingPlatform = null;
    this.platformOffsetX = 0;
    this.platformOffsetY = 0;
  }

  /**
   * Called after external velocity writers such as Rope have run.
   * If the player is physically supported, vertical rope impulses should not
   * re-open the ground contact on the next Matter step.
   */
  stabilizeGroundedVelocityAfterExternalForces(): void {
    if (this.state !== 'on_ground' || !this.hasPhysicalSupport() || this.jumping) {
      return;
    }
    const body = this.body as unknown as { velocity: { x: number; y: number } };
    if (body.velocity.y !== 0) {
      this.scene.matter.body.setVelocity(this.body, { x: body.velocity.x, y: 0 });
    }
  }

  getBody(): MatterJS.BodyType {
    return this.body;
  }

  getPosition(): BodyVector {
    return this.body.position;
  }

  getVelocity(): BodyVector {
    return this.body.velocity;
  }

  getNetworkSnapshot(seat: PlayerSeat): NetPlayerSnapshot {
    return {
      seat,
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      state: this.state,
      jumping: this.jumping,
      canJump: this.canJump,
      inPit: this.inPit,
    };
  }

  applyNetworkSnapshot(snapshot: NetPlayerSnapshot, alpha: number): void {
    const body = this.body as unknown as {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
    };
    const dx = snapshot.x - body.position.x;
    const dy = snapshot.y - body.position.y;
    const dist = Math.hypot(dx, dy);
    const nextX = dist > NETWORK_SNAP_DISTANCE ? snapshot.x : body.position.x + dx * alpha;
    const nextY = dist > NETWORK_SNAP_DISTANCE ? snapshot.y : body.position.y + dy * alpha;

    this.scene.matter.body.setPosition(this.body, { x: nextX, y: nextY });
    this.scene.matter.body.setVelocity(this.body, {
      x: body.velocity.x + (snapshot.vx - body.velocity.x) * NETWORK_VELOCITY_BLEND,
      y: body.velocity.y + (snapshot.vy - body.velocity.y) * NETWORK_VELOCITY_BLEND,
    });

    this.state = snapshot.state;
    this.jumping = snapshot.jumping;
    this.canJump = snapshot.canJump;
    this.inPit = snapshot.inPit;
    if (snapshot.state === 'on_ground') {
      this.supportGraceUntil = this.scene.time.now + 120;
    }
    this.syncVisualToBody();
  }

  getState(): PlayerState {
    return this.state;
  }

  setState(state: PlayerState): void {
    this.state = state;
  }

  /** 由 GameScene 设置：本帧是否被允许起跳。 */
  setCanJump(can: boolean): void {
    this.canJump = can;
  }

  getCanJump(): boolean {
    return this.canJump;
  }

  /** 当前是否在"上升期"（用于跳跃高度指示器）。 */
  isJumping(): boolean {
    return this.jumping;
  }

  /** 起跳时的 y（指示器用）。 */
  getJumpStartY(): number {
    return this.jumpStartY;
  }

  /** #48 稳定悬挂态计时器刷新。每帧由 Player.update() 末尾调用。
   *  5 条件（inPit/state/jumping/supports/|vy|）全满足时启动或维持 stablyHangingSinceMs；任一不满足重置为 0。 */
  private refreshStableHangTimer(nowMs: number): void {
    if (!this.inPit || this.state !== 'in_air' || this.supports.size > 0 || this.jumping) {
      this.stablyHangingSinceMs = 0;
      return;
    }
    const v = this.body.velocity.y;
    if (Math.abs(v) >= 0.5) {
      this.stablyHangingSinceMs = 0;
      return;
    }
    // 3 条件全满足：启动或维持计时
    if (this.stablyHangingSinceMs === 0) {
      this.stablyHangingSinceMs = nowMs;
    }
  }

  /** #48 稳定悬挂态判定（纯读）。返回是否已持续 STABLE_HANG_MS 满足 3 条件。
   *  配合 refreshStableHangTimer() 使用——后者每帧调，前者可多次调不重置计时器。 */
  isStablyHanging(): boolean {
    return this.stablyHangingSinceMs !== 0
      && this.scene.time.now - this.stablyHangingSinceMs >= STABLE_HANG_MS;
  }

  /** 玩家进入 pit：只标记环境状态，运动状态保持/切回 in_air 自由落体。 */
  fallIntoPit(): void {
    if (this.state === 'dead') return;
    if (this.inPit) return;
    this.inPit = true;
    if (this.state !== 'in_air') {
      this.state = 'in_air';
    }
    this.supports.clear();
    this.sideContacts.clear();
    this.supportBody = null;
    this.unlockFromPlatform();
    getSound()?.playPit();
  }

  private getPitContact(body: MatterJS.BodyType): PitContact {
    const pitBody = body as unknown as {
      bounds: { min: { x: number; y: number }; max: { x: number } };
    };
    return {
      leftX: pitBody.bounds.min.x,
      rightX: pitBody.bounds.max.x,
      topY: pitBody.bounds.min.y,
    };
  }

  /** 由 GameScene 在 collisionStart 时调用：碰到固体（ground / platform）。
   *  @param normal 可选：归一化接触法线（**指向 other 方向**：玩家落到 ground 顶部
   *                 时 normal.y > 0，撞侧墙时 normal.y ≈ 0）。normal.y > 0.5 才算顶面
   *                 接触 → 入 supports、变 on_ground；其它方向（侧墙、底面、斜角）
   *                 一律不入 supports，state 保持 in_air。
   */
  onContactStart(other: MatterJS.BodyType, normal?: { x: number; y: number }): void {
    const label = (other as unknown as { label?: string }).label;
    if (label && SOLID_LABELS.has(label)) {
      // 侧接触过滤：只把接近纯顶面的接触算作支撑。
      // 坑口矩形上角会产生斜向 normal；如果按旧阈值 0.5 算支撑，
      // 玩家会在悬崖口角点进入 on_ground，随后落地稳定把 vy 清零，形成粘黏。
      // 水平撞墙（normal.x ≈ 1, normal.y ≈ 0）、撞天花板（normal.y < 0）、
      // 坑口角点/斜角都不算支撑。否则"撞侧墙/角点 = 落地"会让玩家
      // 在竖直墙面旁"挂住"，state 变成 on_ground、可以原地起跳。
      if (normal && normal.y < SUPPORT_NORMAL_Y_MIN) {
        this.sideContacts.add(other);
        this.updateContactFriction();
        return; // 侧/底/斜接触 → 不入 supports，不切换到 on_ground
      }
      this.sideContacts.delete(other);
      this.supports.add(other);
      this.supportBody = other;
      const velocity = this.body.velocity;
      if (this.state === 'in_air') {
        // ── 解析预测精确落点 ──
        // **必须在清零 vy 之前**调用，并把原始 (vx, vy) 显式传进去；
        // 否则 predictLandingPoint 内部读 body.velocity.y 会拿到 0，
        // 公式 t = √(2·dy/g) 会比真实值偏大几帧，predicted.x 越出平台外。
        const predicted = this.predictLandingPoint(other, velocity.y, velocity.x);
        if (velocity.y > 0) {
          this.scene.matter.body.setVelocity(this.body, { x: velocity.x, y: 0 });
        }
        this.scene.matter.body.setPosition(this.body, { x: predicted.x, y: predicted.y });
        this.scene.matter.body.setVelocity(this.body, { x: velocity.x, y: 0 });

        this.state = 'on_ground';
        this.inPit = false;
        this.jumping = false; // 落地，强制结束上升期

        // 锁定局部坐标系：之后每帧 enforceLocalFrame 强制对齐 platform.pos + offset
        this.lockToPlatform(other, predicted.x, predicted.y);

        getSound()?.playLand();
      } else {
        // 已经在 on_ground（侧接触转顶接触，或同帧多个顶接触）：
        // 重新锚定到新平台（多见于骑在两块板交界处）
        const body = this.body as unknown as { position: { x: number; y: number } };
        this.lockToPlatform(other, body.position.x, body.position.y);
      }
    }
    if (label === 'pit') {
      const pit = this.getPitContact(other);
      this.pitContacts.set(other, pit);
      // #60 修复：站在 pit 边缘外侧（P1 身体底面 y ≈ pit 顶面 y）时，matter AABB 边界相接
      // （pit 传感器 y 范围 [topY=600, topY+depth=1300]、P1 身体 y 范围 [544, 600]），
      // matter 用 `<=` 含等号判定 overlap → fire collisionStart → fallIntoPit 误触发。
      // 真掉进 pit 时 P1 身体**中心**必须明显低于 pit 顶面（y 更大）。
      // 注意：不能用 myBottomY<=pitTopY，因为玩家落 0.5-1px 就满足 myBottomY>pitTopY。
      // 改成"玩家中心 y < pit 顶面 + enterDepth" 不算掉进：坑口边界接触/擦边时
      // 保持正常 in_air，不提前打 pit 标记，避免悬崖口像被卡住。
      // pit 矩形静态 body：position.y = 中心，bounds.max.y - bounds.min.y = depth。
      if (this.body.position.y < pit.topY + PHYSICS.pit.enterDepth) {
        return; // 玩家中心还没明显进入 pit，不算掉进
      }
      this.fallIntoPit();
    }
  }

  /** 由 GameScene 在 collisionEnd 时调用。 */
  onContactEnd(other: MatterJS.BodyType): void {
    const label = (other as unknown as { label?: string }).label;
    if (label && SOLID_LABELS.has(label)) {
      this.supports.delete(other);
      this.sideContacts.delete(other);
      this.updateContactFriction();
      // 主支撑体离开时，尝试切换到剩余支撑体
      if (other === this.supportBody) {
        const next = this.supports.size > 0
          ? (this.supports.values().next().value ?? null)
          : null;
        this.supportBody = next;
        // 主支撑体切换：ridingPlatform 跟着切，offset 用当前 player 位置重新算
        if (this.ridingPlatform === other) {
          this.ridingPlatform = next;
          if (next) {
            const body = this.body as unknown as { position: { x: number; y: number } };
            const np = next as unknown as { position: { x: number; y: number } };
            this.platformOffsetX = body.position.x - np.position.x;
            this.platformOffsetY = body.position.y - np.position.y;
          }
        }
      } else if (other === this.ridingPlatform) {
        // 罕见：ridingPlatform 不是主支撑体 → 回退到主支撑
        this.ridingPlatform = this.supportBody;
      }
    }
    if (label === 'pit') {
      this.pitContacts.delete(other);
      if (this.pitContacts.size === 0) {
        this.inPit = false;
      }
    }
  }

  isHanging(): boolean {
    return this.inPit;
  }

  private syncVisualToBody(): void {
    const body = this.body as unknown as {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
    };
    const w = PHYSICS.player.width;
    const h = PHYSICS.player.height;
    if (this.sprite) {
      this.drawSpriteShadow(w, h);
      this.sprite.setPosition(body.position.x, body.position.y + h / 2);
      this.sprite.setRotation(Phaser.Math.Clamp(body.velocity.x * 0.015, -0.12, 0.12));
      if (this.isStablyHanging()) {
        this.sprite.setTint(0xff9a9a);
      } else {
        this.sprite.clearTint();
      }
    } else {
      const STUCK_COLOR = 0xff6666;
      const targetColor = this.isStablyHanging() ? STUCK_COLOR : this.baseColor;
      this.drawBody(targetColor, w, h);
    }
    this.gfx.setPosition(body.position.x, body.position.y);
  }
}
