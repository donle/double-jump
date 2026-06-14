import Phaser from 'phaser';
import { Player } from '../../entities/Player';
import { Rope } from '../../entities/Rope';
import { BackgroundScroller } from '../../entities/scenery';
import { PLAYER_COLORS, type PlayerId } from '../types';
import { DEBUG, PHYSICS } from '../config';
import { LevelGenerator, type TerrainPiece } from '../../entities/terrain';
import { InputManager } from '../input/InputManager';
import { NEUTRAL_INPUT, type FrameInput } from '../input/InputDevice';
import { getSound } from '../../audio/SoundManager';
import { Registry, type LastResult } from '../state/Registry';
import { netClient } from '../../net/NetClient';
import type { NetGameSnapshot } from '../../../../shared/net/protocol';

const CAMERA_LEADER_X_RATIO = 0.45;
const CAMERA_GROUND_Y_RATIO = 0.64;
const NETWORK_SNAPSHOT_INTERVAL_MS = 100;
const NETWORK_SNAPSHOT_CORRECTION_ALPHA = 0.35;

/**
 * 主游戏场景（M3）：双人本地协作 + 跳跃高度指示 + 单跳规则。
 *
 * 单跳规则（由 GameScene.updateCanJump 每帧维护）：
 *   - 任一玩家处于主动跳上升期时，双方都不能再次起跳
 *   - 只有一人 on_ground 时，该人可以跳
 *   - 稳定悬挂玩家不获得 canJump，但会解锁另一名在地玩家
 *   - 两人都 on_ground 时 trailer（x 较小者）跳；只有 trailer 不能跳时才让 leader 接管
 */
export class GameScene extends Phaser.Scene {
  private p1!: Player;
  private p2!: Player;
  private rope!: Rope;
  private pieces: TerrainPiece[] = [];
  private pieceByBody: WeakMap<MatterJS.BodyType, TerrainPiece> = new WeakMap();
  private statusText!: Phaser.GameObjects.Text;
  private distanceText!: Phaser.GameObjects.Text;
  private chargeGfx!: Phaser.GameObjects.Graphics;
  private heightGfx!: Phaser.GameObjects.Graphics;
  private trailerTag!: Phaser.GameObjects.Text;
  /** #53 稳定悬挂玩家头顶"STUCK"标签（A 卡悬崖时显示，让玩家知道 B 解锁了）。 */
  private stuckTag!: Phaser.GameObjects.Text;
  private inputManager!: InputManager;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private startX = 0;
  /** 当前 trailer 的 id（"p1" / "p2" / null = 无人可跳）。 */
  private trailerId: PlayerId | null = null;
  /** 游戏状态机：playing / game_over / win。非 playing 时跳过物理 + 输入，只画面板。 */
  private gameState: 'playing' | 'game_over' | 'win' = 'playing';
  /** 结束态是否已处理（写 lastResult + start EndScene）。防 scene.restart 后字段残留。 */
  private endHandled = false;
  /** M4-B #6：3 层 SVG 风景背景。scene.restart 时 destroy 旧实例重建。 */
  private backgroundScroller: BackgroundScroller | null = null;
  private snapshotSeq = 0;
  private lastSnapshotSentAt = 0;
  private lastAppliedSnapshotSeq = -1;
  private lastHostResult: LastResult | null = null;
  private settingsButton: Phaser.GameObjects.Text | null = null;
  private settingsPanel: Phaser.GameObjects.Container | null = null;
  private settingsOverlay: Phaser.GameObjects.Rectangle | null = null;
  private settingsStatusText: Phaser.GameObjects.Text | null = null;
  private gamePointerBlockedUntil = 0;
  private unsubscribeNetState: (() => void) | null = null;
  private unsubscribeNetStart: (() => void) | null = null;
  private readonly debugMode = DEBUG.enabled;

  preload(): void {
    this.load.image('bg-easy-portrait', '/imagegen/easy-portrait-bg.png');
    this.load.image('bg-normal-portrait', '/imagegen/normal-portrait-bg.png');
    this.load.image('bg-hard-portrait', '/imagegen/hard-portrait-bg.png');
    this.load.image('player-p1', '/imagegen/player-p1.png');
    this.load.image('player-p2', '/imagegen/player-p2.png');

    // M4-B #6：3 层风景背景的 SVG 资源原本计划用 load.image(dataURL) 加载。
    // 实战发现 Phaser 3.80.1 的 `load.image(key, dataURL)` 走 `addImage(HTMLImageElement)`
    // 路径时，WebGL `gl.texImage2D` 调用会触发 `INVALID_VALUE: bad image data`，
    // 整条 texture pipeline 在本项目从未被验证过（Player/Rope/Platform 全是
    // Graphics 画的），所以 SVG → texture → TileSprite 这条链是死的。
    //
    // 现在改用纯 Graphics 画（详见 BackgroundScroller）：性能可接受（30 个
    // Graphics 已经在每帧重画），不依赖 texture pipeline。
  }

  create(): void {
    this.input.removeAllListeners('pointerdown');
    this.input.removeAllListeners('pointerup');
    this.input.removeAllListeners('pointerupoutside');
    this.input.keyboard?.removeAllListeners('keydown-R');
    this.restartKey?.removeAllListeners('down');
    this.matter.world.off('collisionstart');
    this.matter.world.off('collisionend');
    this.inputManager?.destroy();
    this.unsubscribeNetState?.();
    this.unsubscribeNetStart?.();
    this.unsubscribeNetState = null;
    this.unsubscribeNetStart = null;
    this.settingsPanel?.destroy(true);
    this.settingsPanel = null;
    this.settingsOverlay?.destroy();
    this.settingsOverlay = null;
    this.settingsStatusText = null;
    // Phaser scene.restart() 会重新跑 create()，但**不会**创建新实例 → 类字段
    // 初始化器不再执行。显式把游戏状态机 + endHandled 重置回初值，否则重启后会卡
    // 在 game_over 态、checkGameState 第一行就 return、EndScene 不再触发。
    this.gameState = 'playing';
    this.endHandled = false;
    this.trailerId = null;
    this.snapshotSeq = 0;
    this.lastSnapshotSentAt = 0;
    this.lastAppliedSnapshotSeq = -1;
    this.lastHostResult = null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputManager?.destroy();
      this.unsubscribeNetState?.();
      this.unsubscribeNetStart?.();
      this.unsubscribeNetState = null;
      this.unsubscribeNetStart = null;
      this.closeSettingsPanel();
      this.settingsStatusText = null;
    });

    // M4-B #6：先 destroy 旧 BackgroundScroller（scene.restart 场景），否则旧 3 个
    // Graphics 不会被释放、scene 里就会累积。
    if (this.backgroundScroller) {
      this.backgroundScroller.destroy();
      this.backgroundScroller = null;
    }

    const onlineState = netClient.isPlaying() ? netClient.getRoomState() : null;
    if (onlineState) {
      Registry.setLevel(onlineState.level);
      Registry.setDifficulty(onlineState.difficulty);
      Registry.setLevelRun(onlineState.levelRun);
    }

    // 读 difficulty（来自 RoomScene 选择）
    // level 占位供后续 per-level 配置使用（M4-B 之后引入）
    const difficulty = Registry.getDifficulty();
    const level = Registry.getLevel();
    const seed = Registry.getLevelSeed(level);

    // 世界边界：玩家不可能合理到达的区域用厚墙包围
    this.matter.world.setBounds(-2000, -1000, 10000, 3200, 200, true, true, false, true);

    // 关卡生成（M4-B #5：接受 difficulty 参数）
    const gen = new LevelGenerator({
      totalLength: PHYSICS.level.totalLength,
      baseY: PHYSICS.level.baseY,
      startPlatformWidth: PHYSICS.level.startPlatformWidth,
      seed,
    }, difficulty, level);
    const { pieces } = gen.generate(this);
    this.pieces = pieces;
    for (const p of pieces) {
      const b = p.getBody();
      if (b) this.pieceByBody.set(b, p);
    }

    // 玩家出生：上抬 6px 留缓冲
    const startY = PHYSICS.level.baseY - PHYSICS.player.height / 2 - 6;
    this.p1 = new Player(this, 200, startY, 'p1', PLAYER_COLORS.p1);
    this.p2 = new Player(this, 400, startY, 'p2', PLAYER_COLORS.p2);

    this.rope = new Rope(this, this.p1, this.p2, {
      naturalLength: PHYSICS.rope.naturalLength,
      maxLength: PHYSICS.rope.maxLength,
    });

    // 输入：键盘 + 鼠标/触屏双轨
    this.inputManager = new InputManager(this);
    // M4-B #59：全屏 pointerdown/up 转发到 inputManager.triggerJump。
    // GamepadView 不再持有 hit area（按钮变纯视觉），点屏任何位置都触发 jump。
    // pointerupoutside：用户拖出窗口外也正确收到"松开"，避免 jumpDown 卡 true。
    this.input.on('pointerdown', () => this.handleGamePointerDown());
    this.input.on('pointerup', () => this.handleGamePointerUp());
    this.input.on('pointerupoutside', () => this.handleGamePointerUp());

    this.startX = 200;

    // HUD
    this.statusText = this.add
      .text(16, 16, '', { fontSize: '16px', color: '#fff' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(this.debugMode);
    this.distanceText = this.add
      .text(16, 80, '', { fontSize: '20px', color: '#06d6a0', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(this.debugMode);
    this.add
      .text(16, this.scale.height - 170, '点按跳跃 · 后面的角色会跳 · 拖带前面的', {
        fontSize: '14px',
        color: '#cccccc',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(this.debugMode);
    this.chargeGfx = this.add.graphics();
    this.chargeGfx.setDepth(500);
    this.chargeGfx.setVisible(this.debugMode);
    this.heightGfx = this.add.graphics();
    this.heightGfx.setDepth(500);
    this.heightGfx.setVisible(this.debugMode);
    // Trailer 头顶标签：跟相机一起滚动（scrollFactor=1），用 trailer 自己的颜色
    this.trailerTag = this.add
      .text(0, 0, '↓ 可跳', {
        fontSize: '16px',
        color: '#ffe066',
        fontStyle: 'bold',
        backgroundColor: '#000000',
        padding: { x: 6, y: 3 },
      })
      .setDepth(1500)
      .setOrigin(0.5, 1)
      .setVisible(false);

    // #53 卡住标签：稳定悬挂玩家头顶显示，红底。让玩家知道 A 卡了、B 可以接管。
    this.stuckTag = this.add
      .text(0, 0, '卡住', {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#cc3333',
        padding: { x: 5, y: 2 },
      })
      .setDepth(1500)
      .setOrigin(0.5, 1)
      .setVisible(false);

    // R 键：键盘玩家的备用快捷键（鼠标 / 触屏用户用面板按钮）
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.restartKey.on('down', () => this.restartGame());

    this.settingsButton = this.add
      .text(22, 20, '设置', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(2600)
      .setInteractive({ useHandCursor: true });
    this.settingsButton.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
      this.toggleSettingsPanel();
    });

    this.unsubscribeNetState = netClient.onState(() => this.updateSettingsStatus());
    this.unsubscribeNetStart = netClient.onStart(() => {
      if (this.scene.isActive('GameScene')) {
        const state = netClient.getRoomState();
        if (state) {
          Registry.setLevel(state.level);
          Registry.setDifficulty(state.difficulty);
          Registry.setLevelRun(state.levelRun);
        }
        this.scene.restart();
      }
    });

    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = PHYSICS.level.baseY - this.scale.height * CAMERA_GROUND_Y_RATIO;
    // 按难度改相机背景色：草层底部 10px (y=170~180) 透明 + 远山云缝透出，3 难度
    // 各自补色避免透出默认 NORMAL 紫。
    const skyByDiff: Record<typeof difficulty, string> = {
      EASY: '#0f1f14',
      NORMAL: '#0f1020',
      HARD: '#1a0a08',
    };
    this.cameras.main.setBackgroundColor(skyByDiff[difficulty]);

    // M4-B #6：3 层风景背景用纯 Graphics 画（Phaser 3.80.1 texture 链是坏的，
    // 改用 Graphics 绕开）。
    this.backgroundScroller = new BackgroundScroller(this, difficulty);
    this.backgroundScroller.addToScene();
    // 每帧重画以实现 parallax 跟随相机
    this.events.on('update', () => this.backgroundScroller?.update());

    this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) =>
      this.onCollisionStart(event),
    );
    this.matter.world.on('collisionend', (event: Phaser.Physics.Matter.Events.CollisionEndEvent) =>
      this.onCollisionEnd(event),
    );
  }

  override update(_time: number, delta: number): void {
    const now = this.time.now;

    // 1. 状态检查：win / game_over → 冻结物理 + 输入，只画面板
    this.checkGameState();
    if (this.gameState !== 'playing') {
      this.syncOnlineSnapshot(now);
      // 相机仍要更新，否则停在原地看不到玩家
      this.updateCamera();
      // 玩家头顶的 "★ JUMP" 标签在结束态没意义
      this.trailerTag.setVisible(false);
      this.stuckTag.setVisible(false);
      return;
    }

    // 单跳规则：先决定谁能跳（基于主动跳锁、稳定悬挂、trailer 规则）
    this.updateCanJump();

    // 输入：单机模式只有一组 JUMP（player 内部自己检查 canJump）
    const input = this.inputManager.poll(0, now);
    this.inputManager.update(now);

    const [p1Input, p2Input] = this.resolvePlayerInputs(input);
    this.p1.update(delta, p1Input);
    this.p2.update(delta, p2Input);
    // 绳子必须在 p1/p2.update 之后调用：弹簧/硬约束会写 body.velocity，
    // 必须在玩家自己改完速度之后再施加，否则玩家的更新会覆盖绳子。
    this.rope.update(delta);
    this.p1.stabilizeGroundedVelocityAfterExternalForces();
    this.p2.stabilizeGroundedVelocityAfterExternalForces();

    // 地形更新（移动板/限时板需要每帧）— 当前只 ground+pit，本循环空跑
    for (const piece of this.pieces) {
      if (!piece.isDestroyed()) piece.update(delta, now);
    }

    this.syncOnlineSnapshot(now);

    // 相机跟随
    this.updateCamera();

    if (this.debugMode) {
      // HUD
      this.updateHud();
      this.heightGfx.clear();

      // 跳跃高度指示器：两个玩家"在跳跃上升期"时画一条从当前位置向上的虚线
      this.drawHeightIndicator(this.p1);
      this.drawHeightIndicator(this.p2);
    }

    this.updateTrailerTag();
    this.updateStuckTag();

    // Trailer 头顶 "★ JUMP" 标签 — 跟着 trailer 走，没人能跳时隐藏
    // #53 STUCK 标签：稳定悬挂玩家头顶显示
  }

  private resolvePlayerInputs(localInput: FrameInput): [FrameInput, FrameInput] {
    if (!netClient.isPlaying()) {
      return [localInput, localInput];
    }

    const seat = netClient.getSeat();
    if (!seat) {
      return [NEUTRAL_INPUT, NEUTRAL_INPUT];
    }

    const localPlayer = seat === 'p1' ? this.p1 : this.p2;
    const gatedLocalInput = this.gateInputForPlayer(localInput, localPlayer);
    netClient.sendInput(gatedLocalInput);

    if (seat === 'p1') {
      return [gatedLocalInput, netClient.consumePeerInput('p2')];
    }
    return [netClient.consumePeerInput('p1'), gatedLocalInput];
  }

  private gateInputForPlayer(input: FrameInput, player: Player): FrameInput {
    if (player.getCanJump() || player.isJumping()) {
      return input;
    }
    return NEUTRAL_INPUT;
  }

  private syncOnlineSnapshot(now: number): void {
    if (!netClient.isPlaying()) return;
    if (netClient.isHost()) {
      if (now - this.lastSnapshotSentAt < NETWORK_SNAPSHOT_INTERVAL_MS) return;
      this.lastSnapshotSentAt = now;
      netClient.sendSnapshot(this.buildNetworkSnapshot(now));
      return;
    }

    const snapshot = netClient.getLatestSnapshot();
    if (!snapshot) return;
    if (snapshot.gameState !== 'playing') {
      this.applyRemoteFinalSnapshot(snapshot);
      return;
    }
    if (snapshot.seq <= this.lastAppliedSnapshotSeq) return;
    this.lastAppliedSnapshotSeq = snapshot.seq;
    this.p1.applyNetworkSnapshot(snapshot.p1, NETWORK_SNAPSHOT_CORRECTION_ALPHA);
    this.p2.applyNetworkSnapshot(snapshot.p2, NETWORK_SNAPSHOT_CORRECTION_ALPHA);
    this.trailerId = snapshot.trailerId;
  }

  private buildNetworkSnapshot(now: number): NetGameSnapshot {
    const seq = this.snapshotSeq;
    this.snapshotSeq += 1;
    const result = this.lastHostResult
      ? {
          elapsedMs: this.lastHostResult.elapsedMs,
          maxX: this.lastHostResult.maxX,
          endX: this.lastHostResult.endX,
        }
      : undefined;
    return {
      seq,
      sentAt: now,
      p1: this.p1.getNetworkSnapshot('p1'),
      p2: this.p2.getNetworkSnapshot('p2'),
      trailerId: this.trailerId,
      gameState: this.gameState,
      result,
    };
  }

  private handleGamePointerDown(): void {
    if (this.isGamePointerInputBlocked()) {
      this.inputManager.triggerJump(false);
      return;
    }
    this.inputManager.triggerJump(true);
  }

  private handleGamePointerUp(): void {
    if (this.isGamePointerInputBlocked()) {
      this.inputManager.triggerJump(false);
      return;
    }
    this.inputManager.triggerJump(false);
  }

  private blockGamePointerInput(): void {
    this.gamePointerBlockedUntil = this.time.now + 160;
    this.inputManager?.triggerJump(false);
  }

  private isGamePointerInputBlocked(): boolean {
    return this.settingsPanel !== null || this.time.now <= this.gamePointerBlockedUntil;
  }

  private toggleSettingsPanel(): void {
    if (this.settingsPanel) {
      this.closeSettingsPanel();
      return;
    }
    this.showSettingsPanel();
  }

  private closeSettingsPanel(): void {
    this.blockGamePointerInput();
    this.settingsPanel?.destroy(true);
    this.settingsOverlay?.destroy();
    this.settingsPanel = null;
    this.settingsOverlay = null;
    this.settingsStatusText = null;
  }

  private showSettingsPanel(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = 190;
    this.blockGamePointerInput();
    this.settingsOverlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.001)
      .setScrollFactor(0)
      .setDepth(2990)
      .setInteractive();
    this.settingsOverlay.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
    });
    this.settingsOverlay.on('pointerup', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
    });
    const panel = this.add.container(cx, cy).setScrollFactor(0).setDepth(3000);
    panel.add(this.add.rectangle(0, 0, 360, 300, 0x0f1020, 0.96).setStrokeStyle(2, 0xffffff, 0.85));
    panel.add(this.add.text(0, -112, '设置', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    this.settingsStatusText = this.add.text(0, -64, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);
    panel.add(this.settingsStatusText);

    const restartBtn = this.add.rectangle(0, 12, 230, 54, 0x06d6a0, 1)
      .setStrokeStyle(2, 0xffffff, 0.85)
      .setInteractive({ useHandCursor: true });
    const restartText = this.add.text(0, 12, '重新开始', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#000000',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    restartBtn.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
      this.requestRestartFromSettings();
    });
    panel.add([restartBtn, restartText]);

    const exitBtn = this.add.rectangle(0, 78, 230, 54, 0xf72585, 1)
      .setStrokeStyle(2, 0xffffff, 0.85)
      .setInteractive({ useHandCursor: true });
    const exitText = this.add.text(0, 78, '退出游戏', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    exitBtn.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
      this.exitGameFromSettings();
    });
    panel.add([exitBtn, exitText]);

    const closeBtn = this.add.text(0, 128, '关闭', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation: () => void }) => {
      this.blockGamePointerInput();
      event?.stopPropagation();
      this.closeSettingsPanel();
    });
    panel.add(closeBtn);

    this.settingsPanel = panel;
    this.updateSettingsStatus();
  }

  private requestRestartFromSettings(): void {
    if (netClient.isPlaying()) {
      netClient.voteRestart(true);
      this.updateSettingsStatus();
      return;
    }
    this.restartGame();
  }

  private exitGameFromSettings(): void {
    this.inputManager?.destroy();
    if (netClient.isOnline()) {
      netClient.disbandRoom();
      return;
    }
    this.scene.stop('EndScene');
    this.scene.start('HomeScene');
  }

  private updateSettingsStatus(): void {
    if (!this.settingsStatusText) return;
    if (!netClient.isPlaying()) {
      this.settingsStatusText.setText('单机模式会立即重开');
      return;
    }
    const state = netClient.getRoomState();
    const seat = netClient.getSeat();
    if (!state || !seat) {
      this.settingsStatusText.setText('联机状态未连接');
      return;
    }
    const voted = state.restartVotes.includes(seat);
    const otherVoted = state.restartVotes.some((s) => s !== seat);
    if (voted && otherVoted) {
      this.settingsStatusText.setText('双方已同意，正在重开');
    } else if (voted) {
      this.settingsStatusText.setText('已申请重开，等待对方同意');
    } else if (otherVoted) {
      this.settingsStatusText.setText('对方请求重开，同意后立即重开');
    } else {
      this.settingsStatusText.setText('联机重开需要双方同意');
    }
  }

  private applyRemoteFinalSnapshot(snapshot: NetGameSnapshot): void {
    if (this.endHandled) return;
    this.p1.applyNetworkSnapshot(snapshot.p1, 1);
    this.p2.applyNetworkSnapshot(snapshot.p2, 1);
    this.trailerId = snapshot.trailerId;
    this.gameState = snapshot.gameState;
    const p1Pos = this.p1.getPosition();
    const p2Pos = this.p2.getPosition();
    const result: LastResult = {
      result: snapshot.gameState === 'win' ? 'win' : 'game_over',
      level: Registry.getLevel(),
      elapsedMs: snapshot.result?.elapsedMs ?? snapshot.sentAt,
      maxX: snapshot.result?.maxX ?? Math.max(p1Pos.x, p2Pos.x),
      endX: snapshot.result?.endX ?? Math.min(p1Pos.x, p2Pos.x),
    };
    this.finishGame(result, false);
  }

  /**
   * 游戏状态机：每帧把 playing / game_over / win 切到该切的状态。
   * 触发条件：
   *   - win: 两人都跨过终点（min(p1.x, p2.x) > totalLength）
   *   - game_over: 两人都稳定悬挂在 pit 里 或 两人都 y > 1500（掉出世界）
   * 注：单人 dead、另一个人还活着的状态**不**判输 —— leader 仍然可以拖着 trailer
   * 继续前进直到两人一起到终点（win）或两人一起死（game_over）。
   *
   * 切到结束态时（M4-B #5）：写 Registry.lastResult + scene.start('EndScene')。
   * 用 endHandled 防止 scene.restart 后字段残留导致不再触发。
   */
  private checkGameState(): void {
    if (this.gameState !== 'playing') return;

    const p1Pos = this.p1.getPosition();
    const p2Pos = this.p2.getPosition();
    const p1Dead = this.p1.isStablyHanging() || this.p1.getState() === 'dead';
    const p2Dead = this.p2.isStablyHanging() || this.p2.getState() === 'dead';
    const FAR_BELOW_Y = 1500; // 关卡 baseY=600 + 坑底 ≈ 800，1500 算"掉出世界"
    const bothOffWorld = p1Pos.y > FAR_BELOW_Y && p2Pos.y > FAR_BELOW_Y;

    if (Math.min(p1Pos.x, p2Pos.x) > PHYSICS.level.totalLength) {
      this.gameState = 'win';
      getSound()?.playWin();
    } else if ((p1Dead && p2Dead) || bothOffWorld) {
      // Win：两人的 x 都超过关卡总长（在终点平台上或在终点之后）
      this.gameState = 'game_over';
      getSound()?.playGameOver();
    }

    // 切到结束态：写 lastResult + 启动 EndScene（只触发一次，防 restart 后字段残留）
    if ((this.gameState === 'game_over' || this.gameState === 'win') && !this.endHandled) {
      const elapsedMs = this.time.now;
      const maxX = Math.max(p1Pos.x, p2Pos.x);
      const endX = Math.min(p1Pos.x, p2Pos.x);
      const result: LastResult = {
        result: this.gameState === 'win' ? 'win' : 'game_over',
        level: Registry.getLevel(),
        elapsedMs,
        maxX,
        endX,
      };
      this.finishGame(result, netClient.isPlaying() && netClient.isHost());
    }
  }

  private finishGame(result: LastResult, broadcastFinalSnapshot: boolean): void {
    if (this.endHandled) return;
    this.endHandled = true;
    this.lastHostResult = result;
    Registry.setLastResult(result);
    if (broadcastFinalSnapshot) {
      netClient.sendSnapshot(this.buildNetworkSnapshot(this.time.now));
    }
    this.scene.launch('EndScene', result);
    this.scene.bringToTop('EndScene');
  }

  /** 重启入口：scene.restart()。R 键和 EndScene 的"再来一局"按钮都走这里。 */
  private restartGame(): void {
    Registry.regenerateLevelRun();
    this.inputManager?.destroy();
    this.settingsPanel?.destroy(true);
    this.settingsOverlay?.destroy();
    this.settingsPanel = null;
    this.settingsOverlay = null;
    this.settingsStatusText = null;
    this.scene.stop('EndScene');
    this.scene.restart();
  }

  private updateCamera(): void {
    const p1x = this.p1.getPosition().x;
    const p2x = this.p2.getPosition().x;
    const leader = p1x > p2x ? this.p1 : this.p2;
    const leaderPos = leader.getPosition();
    this.cameras.main.scrollX = leaderPos.x - this.scale.width * CAMERA_LEADER_X_RATIO;
    this.cameras.main.scrollY = PHYSICS.level.baseY - this.scale.height * CAMERA_GROUND_Y_RATIO;
  }

  private updateHud(): void {
    const p1Pos = this.p1.getPosition();
    const p2Pos = this.p2.getPosition();
    const p1x = p1Pos.x;
    const p2x = p2Pos.x;
    const dist = Phaser.Math.Distance.Between(p1Pos.x, p1Pos.y, p2Pos.x, p2Pos.y);
    const traveled = Math.max(0, Math.max(p1x, p2x) - this.startX);
    const difficulty = (traveled / 1000).toFixed(2);
    const trailerLabel = this.trailerId ? this.trailerId.toUpperCase() : '-';
    const p1Tag = `${this.p1.isHanging() ? '+pit' : ''}${this.trailerId === 'p1' ? '  ◀ 可跳' : ''}`;
    const p2Tag = `${this.p2.isHanging() ? '+pit' : ''}${this.trailerId === 'p2' ? '  ◀ 可跳' : ''}`;

    this.statusText.setText(
      `P1: ${this.p1.getState()}${p1Tag}    P2: ${this.p2.getState()}${p2Tag}\n` +
        `绳距: ${dist.toFixed(0)}px    当前可跳: ${trailerLabel}    按 R 重启`,
    );
    this.distanceText.setText(`距离: ${traveled.toFixed(0)} m    难度: ${difficulty}`);

    if (this.trailerId) {
      this.statusText.setColor('#ffe066');
    } else {
      this.statusText.setColor('#ff8888');
    }
  }

  private updateTrailerTag(): void {
    if (this.trailerId) {
      const trailerPlayer = this.trailerId === 'p1' ? this.p1 : this.p2;
      const tp = trailerPlayer.getPosition();
      this.trailerTag.setPosition(tp.x, tp.y - PHYSICS.player.height / 2 - 6);
      // #53：另一玩家稳定悬挂（解锁态）时 trailerTag 文案从 "★ JUMP" 强化为 "★ GO!"。
      const otherIsStuck =
        (this.trailerId === 'p1' && this.p2.isStablyHanging()) ||
        (this.trailerId === 'p2' && this.p1.isStablyHanging());
      const num = this.trailerId === 'p1' ? '1' : '2';
      this.trailerTag.setText(otherIsStuck ? `↓ 救人 P${num}` : `↓ 可跳 P${num}`);
      this.trailerTag.setColor(otherIsStuck ? '#ff9933' : '#ffe066');
      this.trailerTag.setVisible(true);
    } else {
      this.trailerTag.setVisible(false);
    }
  }

  /** #53 STUCK 标签：稳定悬挂玩家（isStablyHanging=true）头顶显示。 */
  private updateStuckTag(): void {
    const p1Stuck = this.p1.isStablyHanging();
    const p2Stuck = this.p2.isStablyHanging();
    if (!p1Stuck && !p2Stuck) {
      this.stuckTag.setVisible(false);
      return;
    }
    // 同帧不可能两人同时 stably hanging（互相锁死，不会有 trailer）—— 简单选一个
    const stuckPlayer = p1Stuck ? this.p1 : this.p2;
    const sp = stuckPlayer.getPosition();
    this.stuckTag.setPosition(sp.x, sp.y - PHYSICS.player.height / 2 - 6);
    this.stuckTag.setVisible(true);
  }

  /**
   * 单跳规则：主动跳期间双锁；稳定悬挂只解锁另一名玩家；两人都可用时走 trailer 规则。
   */
  private updateCanJump(): void {
    const p1OnGround = this.p1.getState() === 'on_ground';
    const p2OnGround = this.p2.getState() === 'on_ground';
    const p1StablyHanging = this.p1.isStablyHanging();
    const p2StablyHanging = this.p2.isStablyHanging();
    const p1Available = p1OnGround || p1StablyHanging;
    const p2Available = p2OnGround || p2StablyHanging;
    const p1ActiveJumping = this.p1.getState() === 'in_air' && this.p1.isJumping();
    const p2ActiveJumping = this.p2.getState() === 'in_air' && this.p2.isJumping();

    if (p1ActiveJumping || p2ActiveJumping) {
      this.p1.setCanJump(false);
      this.p2.setCanJump(false);
      this.trailerId = null;
      return;
    }

    if (!p1Available && !p2Available) {
      this.p1.setCanJump(false);
      this.p2.setCanJump(false);
      this.trailerId = null;
      return;
    }

    if (p1Available && !p2Available) {
      const p1CanGrant = p1OnGround;
      this.trailerId = p1CanGrant ? 'p1' : null;
      this.p1.setCanJump(p1CanGrant);
      this.p2.setCanJump(false);
      return;
    }
    if (!p1Available && p2Available) {
      const p2CanGrant = p2OnGround;
      this.p1.setCanJump(false);
      this.p2.setCanJump(p2CanGrant);
      this.trailerId = p2CanGrant ? 'p2' : null;
      return;
    }

    const p1CanGrant = p1OnGround;
    const p2CanGrant = p2OnGround;
    const p1Pos = this.p1.getPosition();
    const p2Pos = this.p2.getPosition();
    const p1IsTrailer = p1Pos.x <= p2Pos.x;

    const grantP1 = () => {
      this.trailerId = p1CanGrant ? 'p1' : null;
      this.p1.setCanJump(p1CanGrant);
      this.p2.setCanJump(false);
    };
    const grantP2 = () => {
      this.trailerId = p2CanGrant ? 'p2' : null;
      this.p1.setCanJump(false);
      this.p2.setCanJump(p2CanGrant);
    };

    const trailerCanGrant = p1IsTrailer ? p1CanGrant : p2CanGrant;
    if (!trailerCanGrant) {
      if (p1IsTrailer) {
        grantP2();
      } else {
        grantP1();
      }
      return;
    }

    if (p1IsTrailer) {
      grantP1();
    } else {
      grantP2();
    }
  }

  /**
   * 绳子力模型集中在 Rope.applyConstraint()：
   * 当前是 #62 v3 的连续张力曲线。GameScene 不再维护独立 tether。
   */

  /**
   * 跳跃指示器：上升期画一条从起跳点到当前位置的垂直虚线（"已跳跃高度"）。
   * M3-末#43 移除了 maxHeight 硬封顶，所以也不再画"天花板"横线 —— 高度无上限。
   */
  private drawHeightIndicator(player: Player): void {
    if (!player.isJumping()) return;
    const pos = player.getPosition();
    const startY = player.getJumpStartY();
    const color = PLAYER_COLORS[player.id];

    // "已跳跃高度"虚线：从起跳点 y 画到当前 y
    this.heightGfx.lineStyle(1, color, 0.5);
    this.heightGfx.beginPath();
    this.heightGfx.moveTo(pos.x, startY);
    this.heightGfx.lineTo(pos.x, pos.y);
    this.heightGfx.strokePath();

    // 起跳点 tick（横向短线，标记起飞高度）
    this.heightGfx.lineStyle(2, color, 0.6);
    this.heightGfx.beginPath();
    this.heightGfx.moveTo(pos.x - 10, startY);
    this.heightGfx.lineTo(pos.x + 10, startY);
    this.heightGfx.strokePath();
  }

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const player = this.identifyPlayer(bodyA, bodyB);
      if (!player) continue;
      const other = player.getBody() === bodyA ? bodyB : bodyA;
      // 约定：normal.y > 0.5 = 顶面接触（other 在 player 下方），normal.y ≈ 0 = 侧撞。
      player.onContactStart(other, { x: pair.collision.normal.x, y: pair.collision.normal.y });
      const piece = this.pieceByBody.get(other);
      if (piece) piece.onPlayerTouch(player);
    }
  }

  private onCollisionEnd(event: Phaser.Physics.Matter.Events.CollisionEndEvent): void {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const player = this.identifyPlayer(bodyA, bodyB);
      if (!player) continue;
      const other = player.getBody() === bodyA ? bodyB : bodyA;
      player.onContactEnd(other);
      const piece = this.pieceByBody.get(other);
      if (piece) piece.onPlayerLeave(player);
    }
  }

  private identifyPlayer(a: MatterJS.BodyType, b: MatterJS.BodyType): Player | null {
    if (a === this.p1.getBody() || b === this.p1.getBody()) return this.p1;
    if (a === this.p2.getBody() || b === this.p2.getBody()) return this.p2;
    return null;
  }
}
