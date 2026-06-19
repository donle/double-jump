/**
 * 服务端无头游戏房间：运行 Matter.js 物理引擎，处理输入，广播权威状态。
 * 不依赖 Phaser —— 直接使用 Matter.js API。
 */
import Matter from 'matter-js';
import type {
  LevelRun,
  NetFrameInput,
  NetGameSnapshot,
  NetPlayerSnapshot,
  PlayerSeat,
} from '../../../shared/net/protocol.js';
import {
  generateLevelData,
  type Difficulty as Diff,
  type LevelId as Lvl,
  type PieceData,
} from '../../../shared/level/LevelData.js';
import {
  PHYSICS,
  SUPPORT_NORMAL_Y_MIN,
  GROUNDED_VERTICAL_SLEEP_SPEED,
  TICK_RATE,
  BROADCAST_EVERY_N_TICKS,
} from './constants.js';

// ─── 输入缓冲 ──────────────────────────────────────────────
interface BufferedInput {
  jumpDown: boolean;
  jumpJustPressed: boolean;
  jumpJustReleased: boolean;
}

function neutralInput(): BufferedInput {
  return { jumpDown: false, jumpJustPressed: false, jumpJustReleased: false };
}

// ─── 移动平台数据 ──────────────────────────────────────────
interface MovingPlatformData {
  body: Matter.Body;
  cx: number;
  cy: number;
  width: number;
  height: number;
  pattern: 'horizontal' | 'vertical' | 'circular';
  amplitude: number;
  omega: number;
  phase: number;
  elapsed: number;
}

// ─── 服务端玩家 ────────────────────────────────────────────
class ServerPlayer {
  readonly seat: PlayerSeat;
  readonly body: Matter.Body;
  state: 'on_ground' | 'in_air' | 'dead' = 'in_air';
  jumping = false;
  jumpStartMs = 0;
  canJump = false;
  inPit = false;
  private readonly supports = new Set<Matter.Body>();
  private readonly sideContacts = new Set<Matter.Body>();
  private supportBody: Matter.Body | null = null;
  private supportGraceUntil = 0;
  private stablyHangingSinceMs = 0;
  private readonly pitContacts = new Map<Matter.Body, { leftX: number; rightX: number; topY: number }>();

  constructor(engine: Matter.Engine, x: number, y: number, seat: PlayerSeat) {
    this.seat = seat;
    const w = PHYSICS.player.width;
    const h = PHYSICS.player.height;
    this.body = Matter.Bodies.rectangle(x, y, w, h, {
      label: seat,
      frictionAir: PHYSICS.player.body.frictionAir,
      friction: PHYSICS.player.friction,
      density: PHYSICS.player.body.density,
      restitution: PHYSICS.player.body.restitution,
      collisionFilter: {
        category: PHYSICS.collision.PLAYER,
        mask: PHYSICS.collision.GROUND | PHYSICS.collision.PIT,
      },
    });
    Matter.Composite.add(engine.world, this.body);
  }

  update(nowMs: number, input: BufferedInput): void {
    const b = this.body;
    const vx = b.velocity.x;
    let vy = b.velocity.y;

    // ── 空中物理（重力 + 跳跃 boost） ──
    const hasSupport = this.supports.size > 0;
    const shouldUseAirPhysics = this.state === 'in_air' || (this.state === 'on_ground' && !hasSupport);
    if (shouldUseAirPhysics) {
      const elapsed = nowMs - this.jumpStartMs;
      const stillInBoost = input.jumpDown && elapsed < PHYSICS.jump.maxHoldMs && vy < 0;
      if (this.jumping && !stillInBoost) this.jumping = false;

      let newVx = vx;
      if (this.jumping) {
        newVx = Math.min(vx + PHYSICS.jump.forwardAccel, PHYSICS.jump.maxForwardSpeed);
      }

      const releasedEarly = !input.jumpDown && elapsed < PHYSICS.jump.maxHoldMs;
      const inHoldWindow = this.jumping && input.jumpDown && elapsed < PHYSICS.jump.maxHoldMs && vy < 0;
      let g: number;
      if (releasedEarly) {
        g = vy < 0 ? PHYSICS.jump.tapGravity : PHYSICS.jump.fallGravity;
      } else if (inHoldWindow) {
        g = PHYSICS.jump.holdGravity;
      } else {
        g = PHYSICS.jump.fallGravity;
      }
      Matter.Body.setVelocity(b, { x: newVx, y: vy + g });
    }

    // ── 起跳 ──
    if (this.state === 'on_ground' && this.canJump && input.jumpJustPressed) {
      Matter.Body.setVelocity(b, { x: 0, y: PHYSICS.jump.jumpInitialVy });
      this.jumping = true;
      this.jumpStartMs = nowMs;
      this.supports.clear();
      this.supportBody = null;
      this.state = 'in_air';
    }

    // ── 地面滑行阻尼 ──
    if (this.state === 'on_ground' && hasSupport && !this.jumping) {
      const sleepVy = Math.abs(b.velocity.y) <= GROUNDED_VERTICAL_SLEEP_SPEED ? 0 : b.velocity.y;
      Matter.Body.setVelocity(b, { x: b.velocity.x * PHYSICS.player.groundSlideDamp, y: sleepVy });
    }

    // ── 最大下落速度 ──
    if (b.velocity.y > PHYSICS.player.maxFallSpeed) {
      Matter.Body.setVelocity(b, { x: b.velocity.x, y: PHYSICS.player.maxFallSpeed });
    }

    // ── 支撑 grace ──
    if (this.state === 'on_ground') {
      if (this.supports.size === 0) {
        if (nowMs >= this.supportGraceUntil) {
          this.state = 'in_air';
        }
      } else {
        this.supportGraceUntil = nowMs + 200;
      }
    }

    // ── 稳定悬挂 ──
    this.refreshStableHangTimer(nowMs);
  }

  stabilizeAfterExternalForces(): void {
    if (this.state !== 'on_ground' || this.supports.size === 0 || this.jumping) return;
    if (this.body.velocity.y !== 0) {
      Matter.Body.setVelocity(this.body, { x: this.body.velocity.x, y: 0 });
    }
  }

  applyGroundConstraint(): void {
    if (this.state !== 'on_ground' || !this.supportBody || this.jumping) return;
    const sp = this.supportBody as unknown as { position: { x: number; y: number }; positionPrev: { x: number; y: number } };
    const moved = Math.abs(sp.position.x - sp.positionPrev.x) > 0.01 || Math.abs(sp.position.y - sp.positionPrev.y) > 0.01;
    if (!moved) return;

    const bounds = this.supportBody.bounds;
    const targetY = bounds.min.y - PHYSICS.player.height / 2;
    const deviation = Math.abs(this.body.position.y - targetY);
    if (deviation > 12) return;
    if (deviation > 0.5) {
      Matter.Body.setPosition(this.body, { x: this.body.position.x, y: targetY });
    }
    if (this.body.velocity.y !== 0) {
      Matter.Body.setVelocity(this.body, { x: this.body.velocity.x, y: 0 });
    }
  }

  onContactStart(other: Matter.Body, normal?: { x: number; y: number }): void {
    const label = other.label;
    if (label === 'ground' || label === 'platform') {
      if (normal && normal.y < SUPPORT_NORMAL_Y_MIN) {
        this.sideContacts.add(other);
        return;
      }
      this.sideContacts.delete(other);
      this.supports.add(other);
      this.supportBody = other;
      if (this.body.velocity.y > 0) {
        Matter.Body.setVelocity(this.body, { x: this.body.velocity.x, y: 0 });
      }
      if (this.state === 'in_air') {
        this.state = 'on_ground';
        this.inPit = false;
        this.jumping = false;
        // 落地吸附
        const targetY = other.bounds.min.y - PHYSICS.player.height / 2;
        if (Math.abs(this.body.position.y - targetY) <= 4) {
          Matter.Body.setPosition(this.body, { x: this.body.position.x, y: targetY });
        }
      }
    }
    if (label === 'pit') {
      const pit = { leftX: other.bounds.min.x, rightX: other.bounds.max.x, topY: other.bounds.min.y };
      this.pitContacts.set(other, pit);
      if (this.body.position.y >= pit.topY + PHYSICS.pit.enterDepth) {
        this.fallIntoPit();
      }
    }
  }

  onContactEnd(other: Matter.Body): void {
    const label = other.label;
    if (label === 'ground' || label === 'platform') {
      this.supports.delete(other);
      this.sideContacts.delete(other);
      if (other === this.supportBody) {
        this.supportBody = this.supports.size > 0 ? this.supports.values().next().value ?? null : null;
      }
    }
    if (label === 'pit') {
      this.pitContacts.delete(other);
      if (this.pitContacts.size === 0) this.inPit = false;
    }
  }

  fallIntoPit(): void {
    if (this.state === 'dead' || this.inPit) return;
    this.inPit = true;
    if (this.state !== 'in_air') this.state = 'in_air';
    this.supports.clear();
    this.sideContacts.clear();
    this.supportBody = null;
  }

  isStablyHanging(): boolean {
    return this.stablyHangingSinceMs !== 0 && Date.now() - this.stablyHangingSinceMs >= 300;
  }

  isJumping(): boolean { return this.jumping; }

  private refreshStableHangTimer(nowMs: number): void {
    if (!this.inPit || this.state !== 'in_air' || this.supports.size > 0 || this.jumping) {
      this.stablyHangingSinceMs = 0;
      return;
    }
    if (Math.abs(this.body.velocity.y) >= 0.5) {
      this.stablyHangingSinceMs = 0;
      return;
    }
    if (this.stablyHangingSinceMs === 0) this.stablyHangingSinceMs = nowMs;
  }

  toSnapshot(): NetPlayerSnapshot {
    return {
      seat: this.seat,
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
}

// ─── 服务端绳索 ────────────────────────────────────────────
class ServerRope {
  private readonly p1: ServerPlayer;
  private readonly p2: ServerPlayer;

  constructor(p1: ServerPlayer, p2: ServerPlayer) {
    this.p1 = p1;
    this.p2 = p2;
  }

  update(): void {
    const b1 = this.p1.body;
    const b2 = this.p2.body;
    const dx = b2.position.x - b1.position.x;
    const dy = b2.position.y - b1.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const relVx = b2.velocity.x - b1.velocity.x;
    const relVy = b2.velocity.y - b1.velocity.y;
    const relAlong = relVx * dirX + relVy * dirY;

    const shares = this.calculateForceShares(b1, b2);
    const tension = this.calculateTension(dist, relAlong, shares.transferVelocity);
    if (tension.accel <= 0) return;

    const nv1x = b1.velocity.x + dirX * tension.accel * shares.p1;
    const nv1y = b1.velocity.y + dirY * tension.accel * shares.p1;
    const nv2x = b2.velocity.x - dirX * tension.accel * shares.p2;
    const nv2y = b2.velocity.y - dirY * tension.accel * shares.p2;

    Matter.Body.setVelocity(b1, { x: nv1x, y: nv1y });
    Matter.Body.setVelocity(b2, { x: nv2x, y: nv2y });
  }

  private calculateForceShares(b1: Matter.Body, b2: Matter.Body) {
    const def = 0.5;
    const counter = PHYSICS.rope.activeJumpCounterScale;
    const pull = PHYSICS.rope.activeJumpPullShare;
    const ml = PHYSICS.rope.maxLength;

    const p1Above = b1.position.y < b2.position.y && this.p1.state === 'in_air' && this.p1.isJumping() && b1.velocity.y < 0;
    if (p1Above) {
      const t = clamp01((b2.position.y - b1.position.y) / ml);
      return { p1: lerp(def, counter, t), p2: lerp(def, pull, t), transferVelocity: true };
    }
    const p2Above = b2.position.y < b1.position.y && this.p2.state === 'in_air' && this.p2.isJumping() && b2.velocity.y < 0;
    if (p2Above) {
      const t = clamp01((b1.position.y - b2.position.y) / ml);
      return { p1: lerp(def, pull, t), p2: lerp(def, counter, t), transferVelocity: true };
    }
    return { p1: def, p2: def, transferVelocity: false };
  }

  private calculateTension(dist: number, separatingSpeed: number, transferVelocity: boolean) {
    const strain = Math.max(0, dist - PHYSICS.rope.naturalLength);
    if (strain <= 0) return { accel: 0, ratio: 0 };
    const maxAccel = PHYSICS.rope.springMaxAccel;
    const stretchRange = Math.max(1, PHYSICS.rope.maxLength - PHYSICS.rope.naturalLength);
    const stretchRatio = clamp01(strain / stretchRange);
    const springAccel = smoothLimit(strain * PHYSICS.rope.springStiffness, maxAccel);
    const velocityAccel = transferVelocity
      ? Math.min(Math.max(0, separatingSpeed * PHYSICS.rope.springDamping), PHYSICS.rope.springVelocityTransferMax) * stretchRatio
      : 0;
    const accel = springAccel + velocityAccel;
    const visualMax = maxAccel + PHYSICS.rope.springVelocityTransferMax;
    return { accel, ratio: visualMax > 0 ? Math.min(1, accel / visualMax) : 0 };
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smoothLimit(v: number, limit: number): number {
  if (limit <= 0 || v <= 0) return 0;
  return limit * (1 - Math.exp(-v / limit));
}

// ─── 关卡生成 ──────────────────────────────────────────────
function generateTerrain(engine: Matter.Engine, difficulty: Diff, level: Lvl, levelRun: LevelRun): { bodies: Matter.Body[]; movingPlatforms: MovingPlatformData[]; piecesData: PieceData[] } {
  const seed = levelRun.levelSeeds[level];
  const piecesData = generateLevelData(seed, difficulty, level);
  const movingPlatforms: MovingPlatformData[] = [];
  const bodies: Matter.Body[] = [];

  for (const p of piecesData) {
    if (p.kind === 'ground') {
      const w = p.rightX - p.leftX;
      const body = Matter.Bodies.rectangle(p.leftX + w / 2, p.topY + p.depth / 2, w, p.depth, {
        isStatic: true, label: 'ground', friction: 0.9,
        collisionFilter: { category: PHYSICS.collision.GROUND, mask: PHYSICS.collision.PLAYER },
      });
      Matter.Composite.add(engine.world, body);
      bodies.push(body);
    } else if (p.kind === 'pit') {
      const w = p.rightX - p.leftX;
      const body = Matter.Bodies.rectangle(p.leftX + w / 2, p.topY + p.depth / 2, w, p.depth, {
        isStatic: true, isSensor: true, label: 'pit',
        collisionFilter: { category: PHYSICS.collision.PIT, mask: PHYSICS.collision.PLAYER },
      });
      Matter.Composite.add(engine.world, body);
      bodies.push(body);
    } else if (p.kind === 'floating_fixed') {
      const body = Matter.Bodies.rectangle(p.x, p.y, p.width, p.height, {
        isStatic: true, label: 'platform', friction: 0.7,
        collisionFilter: { category: PHYSICS.collision.GROUND, mask: PHYSICS.collision.PLAYER },
      });
      Matter.Composite.add(engine.world, body);
      bodies.push(body);
    } else {
      // floating_moving
      const body = Matter.Bodies.rectangle(p.x, p.y, p.width, p.height, {
        isStatic: true, label: 'platform', friction: 0.95,
        collisionFilter: { category: PHYSICS.collision.GROUND, mask: PHYSICS.collision.PLAYER },
      });
      Matter.Composite.add(engine.world, body);
      bodies.push(body);
      movingPlatforms.push({
        body,
        cx: p.x, cy: p.y, width: p.width, height: p.height,
        pattern: p.pattern, amplitude: p.amplitude,
        omega: (Math.PI * 2) / p.period, phase: p.phase, elapsed: 0,
      });
    }
  }

  return { bodies, movingPlatforms, piecesData };
}

// ─── 游戏房间 ──────────────────────────────────────────────
export type TickCallback = (snapshot: NetGameSnapshot) => void;

export class ServerGameRoom {
  private readonly engine: Matter.Engine;
  private readonly p1: ServerPlayer;
  private readonly p2: ServerPlayer;
  private readonly rope: ServerRope;
  private readonly movingPlatforms: MovingPlatformData[];
  private readonly inputs: Record<PlayerSeat, BufferedInput> = { p1: neutralInput(), p2: neutralInput() };
  private readonly startTime: number;
  private tickCount = 0;
  private snapshotSeq = 0;
  private gameState: 'playing' | 'game_over' | 'win' = 'playing';
  private trailerId: PlayerSeat | null = null;
  private onTick: TickCallback | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private readonly piecesData: PieceData[];
  private cachedInitialSnapshot: NetGameSnapshot | null = null;

  constructor(difficulty: Diff, level: Lvl, levelRun: LevelRun, onTick: TickCallback) {
    this.onTick = onTick;
    this.startTime = Date.now();

    // 创建引擎（无全局重力，与客户端一致）
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    (this.engine as any).constraintIterations = 4;
    (this.engine as any).positionIterations = 6;
    (this.engine as any).velocityIterations = 4;

    // 生成地形
    const { movingPlatforms, piecesData } = generateTerrain(this.engine, difficulty, level, levelRun);
    this.movingPlatforms = movingPlatforms;
    this.piecesData = piecesData;

    // 创建玩家
    const startY = PHYSICS.level.baseY - PHYSICS.player.height / 2 - 6;
    this.p1 = new ServerPlayer(this.engine, 200, startY, 'p1');
    this.p2 = new ServerPlayer(this.engine, 400, startY, 'p2');

    // 创建绳索
    this.rope = new ServerRope(this.p1, this.p2);

    // 碰撞事件
    Matter.Events.on(this.engine, 'collisionStart', (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of e.pairs) {
        this.handleCollisionStart(pair.bodyA, pair.bodyB, pair.collision.normal);
      }
    });
    Matter.Events.on(this.engine, 'collisionEnd', (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of e.pairs) {
        this.handleCollisionEnd(pair.bodyA, pair.bodyB);
      }
    });

    // 启动游戏循环（self-rescheduling setTimeout — 比 setInterval 更精准，避免漂移叠加）
    this.scheduleNextTick();

    // 立即跑一次 tick 拿到初始 snapshot，附在 game_started 里发给客户端，
    // 避免客户端前 1–2 帧 getLatestTick() 为 null 出现"看不见"的真空。
    this.preWarmInitialSnapshot();
  }

  private scheduleNextTick(): void {
    if (this.destroyed) return;
    this.intervalHandle = setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, 1000 / TICK_RATE);
  }

  private preWarmInitialSnapshot(): void {
    // 单次 tick 把 canJump、velocity 等初始状态落实，拿到第一份 snapshot。
    // 复用 tick() 的逻辑但跳过 broadcast（broadcast 由 BROADCAST_EVERY_N_TICKS 控制）。
    const delta = 1000 / TICK_RATE;
    const nowMs = 0;

    this.updateCanJump();
    this.p1.update(nowMs, neutralInput());
    this.p2.update(nowMs, neutralInput());
    this.rope.update();
    this.p1.stabilizeAfterExternalForces();
    this.p2.stabilizeAfterExternalForces();
    // 移动平台第一帧不动（elapsed=0 跳过 setPosition，避免抖动）
    this.p1.applyGroundConstraint();
    this.p2.applyGroundConstraint();
    Matter.Engine.update(this.engine, delta);
    this.cachedInitialSnapshot = this.buildSnapshot();
  }

  getTerrainPieces(): PieceData[] {
    return this.piecesData;
  }

  getInitialSnapshot(): NetGameSnapshot | null {
    return this.cachedInitialSnapshot;
  }

  applyInput(seat: PlayerSeat, input: NetFrameInput): void {
    const buf = this.inputs[seat];
    buf.jumpDown = input.jumpDown;
    if (input.jumpJustPressed) buf.jumpJustPressed = true;
    if (input.jumpJustReleased) buf.jumpJustReleased = true;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.onTick = null;
    Matter.Engine.clear(this.engine);
  }

  // ─── 游戏循环 ─────────────────────────────────────────
  private tick(): void {
    if (this.destroyed || this.gameState !== 'playing') return;

    const delta = 1000 / TICK_RATE;
    const nowMs = Date.now() - this.startTime;

    // 1. 消费输入
    const p1Input = this.consumeInput('p1');
    const p2Input = this.consumeInput('p2');

    // 2. 更新 canJump
    this.updateCanJump();

    // 3. 玩家物理
    this.p1.update(nowMs, p1Input);
    this.p2.update(nowMs, p2Input);

    // 4. 绳索
    this.rope.update();

    // 5. 稳定化
    this.p1.stabilizeAfterExternalForces();
    this.p2.stabilizeAfterExternalForces();

    // 6. 移动平台
    const dt = delta / 1000;
    for (const mp of this.movingPlatforms) {
      mp.elapsed += Math.min(dt, 1 / 30);
      const t = mp.elapsed * mp.omega + mp.phase;
      let nx = mp.cx;
      let ny = mp.cy;
      if (mp.pattern === 'horizontal') nx = mp.cx + mp.amplitude * Math.sin(t);
      else if (mp.pattern === 'vertical') ny = mp.cy + mp.amplitude * Math.sin(t);
      else { nx = mp.cx + mp.amplitude * Math.sin(t); ny = mp.cy + mp.amplitude * Math.cos(t); }
      // setPosition with updateVelocity=true: 让 Matter 记录平台速度
      const prev = mp.body.position;
      Matter.Body.setPosition(mp.body, { x: nx, y: ny });
      Matter.Body.setVelocity(mp.body, { x: nx - prev.x, y: ny - prev.y });
    }

    // 7. 地面约束
    this.p1.applyGroundConstraint();
    this.p2.applyGroundConstraint();

    // 8. Matter 物理步
    Matter.Engine.update(this.engine, delta);

    // 9. 检查游戏状态
    this.checkGameState();

    // 10. 广播
    this.tickCount++;
    if (this.tickCount % BROADCAST_EVERY_N_TICKS === 0 && this.onTick) {
      this.onTick(this.buildSnapshot());
    }
  }

  private consumeInput(seat: PlayerSeat): BufferedInput {
    const buf = this.inputs[seat];
    const frame: BufferedInput = { ...buf };
    buf.jumpJustPressed = false;
    buf.jumpJustReleased = false;
    return frame;
  }

  private updateCanJump(): void {
    const p1On = this.p1.state === 'on_ground';
    const p2On = this.p2.state === 'on_ground';
    const p1Hanging = this.p1.isStablyHanging();
    const p2Hanging = this.p2.isStablyHanging();
    const p1Avail = p1On || p1Hanging;
    const p2Avail = p2On || p2Hanging;
    const p1Active = this.p1.state === 'in_air' && this.p1.isJumping();
    const p2Active = this.p2.state === 'in_air' && this.p2.isJumping();

    if (p1Active || p2Active) {
      this.p1.canJump = false;
      this.p2.canJump = false;
      this.trailerId = null;
      return;
    }
    if (!p1Avail && !p2Avail) {
      this.p1.canJump = false;
      this.p2.canJump = false;
      this.trailerId = null;
      return;
    }

    const grant = (who: PlayerSeat) => {
      const p = who === 'p1' ? this.p1 : this.p2;
      const o = who === 'p1' ? this.p2 : this.p1;
      this.trailerId = p.state === 'on_ground' ? who : null;
      p.canJump = p.state === 'on_ground';
      o.canJump = false;
    };

    if (p1Avail && !p2Avail) { grant('p1'); return; }
    if (!p1Avail && p2Avail) { grant('p2'); return; }

    const trailer = this.p1.body.position.x <= this.p2.body.position.x ? 'p1' : 'p2';
    grant(trailer);
    if (!this.trailerId) grant(trailer === 'p1' ? 'p2' : 'p1');
  }

  private checkGameState(): void {
    const p1 = this.p1.body.position;
    const p2 = this.p2.body.position;
    const p1Dead = this.p1.isStablyHanging() || this.p1.state === 'dead';
    const p2Dead = this.p2.isStablyHanging() || this.p2.state === 'dead';

    if (Math.min(p1.x, p2.x) > PHYSICS.level.totalLength) {
      this.gameState = 'win';
    } else if ((p1Dead && p2Dead) || (p1.y > 1500 && p2.y > 1500)) {
      this.gameState = 'game_over';
    }
  }

  private buildSnapshot(): NetGameSnapshot {
    return {
      seq: this.snapshotSeq++,
      sentAt: Date.now(),
      p1: this.p1.toSnapshot(),
      p2: this.p2.toSnapshot(),
      trailerId: this.trailerId,
      gameState: this.gameState,
      result: this.gameState !== 'playing' ? {
        elapsedMs: Date.now() - this.startTime,
        maxX: Math.max(this.p1.body.position.x, this.p2.body.position.x),
        endX: Math.min(this.p1.body.position.x, this.p2.body.position.x),
      } : undefined,
    };
  }

  // ─── 碰撞路由 ─────────────────────────────────────────
  private identifyPlayer(a: Matter.Body, b: Matter.Body): ServerPlayer | null {
    if (a === this.p1.body || b === this.p1.body) return this.p1;
    if (a === this.p2.body || b === this.p2.body) return this.p2;
    return null;
  }

  private handleCollisionStart(a: Matter.Body, b: Matter.Body, normal: Matter.Vector): void {
    const player = this.identifyPlayer(a, b);
    if (!player) return;
    const other = player.body === a ? b : a;
    player.onContactStart(other, normal);
  }

  private handleCollisionEnd(a: Matter.Body, b: Matter.Body): void {
    const player = this.identifyPlayer(a, b);
    if (!player) return;
    const other = player.body === a ? b : a;
    player.onContactEnd(other);
  }
}
