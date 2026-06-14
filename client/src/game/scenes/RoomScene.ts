import Phaser from 'phaser';
import { Registry } from '../state/Registry';
import { getSound } from '../../audio/SoundManager';
import type { Difficulty, LevelId } from '../types';
import { netClient } from '../../net/NetClient';

interface RoomSceneData {
  mode?: 'single' | 'onlineCreate';
}

/**
 * 房间页（B 布局）：左右分栏。
 *   左侧：大关卡卡片（220x200 紫边）
 *     - Lv1 / Lv2 / Lv3：可选关卡卡片
 *   右侧：3 难度按钮纵向堆叠（简单 / 普通 / 困难，默认"普通"高亮）
 *   左上：← 返回按钮
 *   底部中央：▶ 开始大按钮
 *   右上：🔊/🔇 按钮
 *
 * 输入：点难度按钮切高亮 + 写 registry。点 START → scene.start('GameScene')。
 */
export class RoomScene extends Phaser.Scene {
  private difficultyBtns: { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; value: Difficulty }[] = [];
  private levelCards: { rect: Phaser.GameObjects.Rectangle; texts: Phaser.GameObjects.Text[]; value: LevelId }[] = [];
  private startBtn!: Phaser.GameObjects.Rectangle;
  private soundBtn!: Phaser.GameObjects.Text;
  private onlineStatusText: Phaser.GameObjects.Text | null = null;
  private onlineReadyText: Phaser.GameObjects.Text | null = null;
  private onlineStartBtn: Phaser.GameObjects.Rectangle | null = null;
  private onlineStartText: Phaser.GameObjects.Text | null = null;
  private unsubscribeNetState: (() => void) | null = null;
  private unsubscribeNetStart: (() => void) | null = null;
  private singleMode = false;
  private onlineCreateMode = false;
  private creatingOnlineRoom = false;

  constructor() {
    super('RoomScene');
  }

  init(data?: RoomSceneData): void {
    this.singleMode = data?.mode === 'single';
    this.onlineCreateMode = data?.mode === 'onlineCreate';
  }

  create(): void {
    this.input.removeAllListeners('pointerdown');
    this.unsubscribeNetState?.();
    this.unsubscribeNetStart?.();
    this.unsubscribeNetState = null;
    this.unsubscribeNetStart = null;
    this.difficultyBtns = [];
    this.levelCards = [];
    this.creatingOnlineRoom = false;

    if (this.singleMode && netClient.isOnline()) {
      netClient.leaveRoom();
    }

    if (!this.singleMode && netClient.isOnline()) {
      this.buildOnlineRoom();
      return;
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    // 1. ← 返回 按钮
    this.add
      .text(40, 30, '← 返回', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#888888',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('HomeScene'));

    this.add
      .text(cx, H * 0.16, this.onlineCreateMode ? '创建联机房间' : '单机模式', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '38px',
        color: '#f72585',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2401);

    // 2. 关卡卡片（左侧）
    this.buildLevelCards(cx, H * 0.36);

    // 3. 难度按钮（右侧）
    this.buildDifficultyButtons(cx, H * 0.58);

    // 4. ▶ 开始 大按钮
    this.startBtn = this.add
      .rectangle(cx, H - 120, 260, 76, 0x06d6a0, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, H - 120, this.onlineCreateMode ? '创建房间' : '▶ 开始', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: '#000000',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2501);
    this.startBtn.on('pointerdown', () => {
      if (this.onlineCreateMode) {
        void this.createOnlineRoom();
      } else {
        this.scene.start('GameScene');
      }
    });
    this.startBtn.on('pointerover', () => this.startBtn.setFillStyle(0x04b585));
    this.startBtn.on('pointerout', () => this.startBtn.setFillStyle(0x06d6a0));

    // 5. 右上角 🔊/🔇
    this.soundBtn = this.add
      .text(W - 40, 30, this.soundIcon(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#cccccc',
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => {
      Registry.toggleSound();
      this.soundBtn.setText(this.soundIcon());
    });

    // 6. 首次 pointerdown 时 resume audio
    this.input.once('pointerdown', () => getSound()?.resume());
  }

  private async createOnlineRoom(): Promise<void> {
    if (this.creatingOnlineRoom) return;
    this.creatingOnlineRoom = true;
    this.startBtn.disableInteractive();
    this.startBtn.setAlpha(0.55);
    try {
      await netClient.createRoom(Registry.getLevel(), Registry.getDifficulty());
      this.scene.restart();
    } catch (error) {
      this.creatingOnlineRoom = false;
      this.startBtn.setInteractive({ useHandCursor: true });
      this.startBtn.setAlpha(1);
      window.alert(error instanceof Error ? error.message : '创建联机房间失败');
    }
  }

  private buildOnlineRoom(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    this.add
      .text(40, 30, '返回', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#888888',
      })
      .setOrigin(0, 0.5)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        netClient.leaveRoom();
        this.scene.start('HomeScene');
      });

    this.add
      .text(cx, H * 0.18, '联机房间', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '46px',
        color: '#f72585',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.onlineStatusText = this.add
      .text(cx, H * 0.38, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    const readyBtn = this.add
      .rectangle(cx, H * 0.66, 260, 64, 0x06d6a0, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    this.onlineReadyText = this.add
      .text(cx, H * 0.66, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#000000',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    readyBtn.on('pointerdown', () => {
      const player = netClient.getRoomState()?.players.find((p) => p.seat === netClient.getSeat());
      netClient.setReady(!(player?.ready ?? false));
    });

    this.onlineStartBtn = this.add
      .rectangle(cx, H * 0.75, 260, 64, 0x0f1020, 1)
      .setStrokeStyle(2, 0xf72585, 0.9)
      .setInteractive({ useHandCursor: true });
    this.onlineStartText = this.add
      .text(cx, H * 0.75, '开始', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.onlineStartBtn.on('pointerdown', () => {
      const state = netClient.getRoomState();
      const seat = netClient.getSeat();
      const isHost = state?.players.some((p) => p.seat === seat && p.isHost) ?? false;
      if (isHost) netClient.startGame();
    });

    this.unsubscribeNetState = netClient.onState(() => this.updateOnlineRoom());
    this.unsubscribeNetStart = netClient.onStart(() => this.startOnlineGame());
    this.updateOnlineRoom();
  }

  private updateOnlineRoom(): void {
    const state = netClient.getRoomState();
    const seat = netClient.getSeat();
    if (!state || !seat || !this.onlineStatusText || !this.onlineReadyText) return;

    const lines = [
      `房间号 ${state.roomId}`,
      `你是 ${seat.toUpperCase()}`,
      `${this.levelNameShort(state.level)} / ${this.difficultyName(state.difficulty)}`,
      '',
      ...(['p1', 'p2'] as const).map((s) => {
        const player = state.players.find((p) => p.seat === s);
        if (!player) return `${s.toUpperCase()}：等待加入`;
        const host = player.isHost ? ' 房主' : '';
        const ready = player.ready ? ' 已准备' : ' 未准备';
        const connected = player.connected ? '' : ' 已断线';
        return `${s.toUpperCase()}:${host}${ready}${connected}`;
      }),
    ];
    this.onlineStatusText.setText(lines.join('\n'));

    const self = state.players.find((p) => p.seat === seat);
    this.onlineReadyText.setText(self?.ready ? '已准备' : '准备');

    const isHost = self?.isHost ?? false;
    const canStart = isHost && state.players.length === 2;
    this.onlineStartBtn?.setVisible(isHost);
    this.onlineStartText?.setVisible(isHost);
    this.onlineStartBtn?.setAlpha(canStart ? 1 : 0.45);
    this.onlineStartText?.setAlpha(canStart ? 1 : 0.45);
  }

  private startOnlineGame(): void {
    const state = netClient.getRoomState();
    if (!state) return;
    Registry.setLevel(state.level);
    Registry.setDifficulty(state.difficulty);
    Registry.setLevelRun(state.levelRun);
    this.scene.start('GameScene');
  }

  private levelNameShort(level: LevelId): string {
    switch (level) {
      case 'lv1':
        return '第一关';
      case 'lv2':
        return '第二关';
      case 'lv3':
        return '第三关';
    }
  }

  private difficultyName(difficulty: Difficulty): string {
    switch (difficulty) {
      case 'EASY':
        return '简单';
      case 'NORMAL':
        return '普通';
      case 'HARD':
        return '困难';
    }
  }

  private buildLevelCards(cx: number, cy: number): void {
    const cards: { id: LevelId; title: string; sub: string }[] = [
      { id: 'lv1', title: '第一关', sub: '起 步' },
      { id: 'lv2', title: '第二关', sub: '浮空跳板' },
      { id: 'lv3', title: '第三关', sub: '高低平台' },
    ];
    const current = Registry.getLevel();

    cards.forEach((card, i) => {
      const xOffset = (i - 1) * 130;
      const cardX = cx + xOffset;
      const cardW = 110;
      const cardH = 160;
      const cardCx = cardX;
      const cardCy = cy;

      const bg = this.add
        .rectangle(cardCx, cardCy, cardW, cardH, 0x0f1020, 1)
        .setStrokeStyle(2, card.id === current ? 0xf72585 : 0x6b21d1)
        .setDepth(2400)
        .setInteractive({ useHandCursor: true });
      const numberText = this.add
        .text(cardCx, cardCy - 30, String(i + 1), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '40px',
          color: card.id === current ? '#f72585' : '#888888',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(2401);
      const titleText = this.add
        .text(cardCx, cardCy + 20, card.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: card.id === current ? '#ffffff' : '#aaaaaa',
        })
        .setOrigin(0.5)
        .setDepth(2401);
      const subText = this.add
        .text(cardCx, cardCy + 45, card.sub, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          color: card.id === current ? '#cccccc' : '#666666',
        })
        .setOrigin(0.5)
        .setDepth(2401);
      bg.on('pointerdown', () => {
        Registry.setLevel(card.id);
        this.redrawLevelCards(card.id);
      });
      this.levelCards.push({ rect: bg, texts: [numberText, titleText, subText], value: card.id });
    });
  }

  private redrawLevelCards(selected: LevelId): void {
    for (const card of this.levelCards) {
      const isSelected = card.value === selected;
      card.rect.setStrokeStyle(isSelected ? 3 : 2, isSelected ? 0xf72585 : 0x6b21d1);
      card.texts[0].setColor(isSelected ? '#f72585' : '#888888');
      card.texts[1].setColor(isSelected ? '#ffffff' : '#aaaaaa');
      card.texts[2].setColor(isSelected ? '#cccccc' : '#666666');
    }
  }

  private buildDifficultyButtons(cx: number, topY: number): void {
    const options: { value: Difficulty; label: string }[] = [
      { value: 'EASY', label: '简单' },
      { value: 'NORMAL', label: '普通' },
      { value: 'HARD', label: '困难' },
    ];
    const current = Registry.getDifficulty();
    options.forEach((opt, i) => {
      const y = topY + i * 60;
      const rect = this.add
        .rectangle(cx, y, 260, 54, opt.value === current ? 0x6b21d1 : 0x0f1020, 1)
        .setStrokeStyle(2, opt.value === current ? 0xf72585 : 0x444444)
        .setDepth(2400)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(cx, y, opt.label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          color: opt.value === current ? '#ffffff' : '#888888',
          fontStyle: opt.value === current ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(2401);
      rect.on('pointerdown', () => {
        Registry.setDifficulty(opt.value);
        this.redrawDifficultyBtns(opt.value);
      });
      this.difficultyBtns.push({ rect, text, value: opt.value });
    });
  }

  private redrawDifficultyBtns(selected: Difficulty): void {
    for (const b of this.difficultyBtns) {
      const isSelected = b.value === selected;
      b.rect.setFillStyle(isSelected ? 0x6b21d1 : 0x0f1020);
      b.rect.setStrokeStyle(2, isSelected ? 0xf72585 : 0x444444);
      b.text.setColor(isSelected ? '#ffffff' : '#888888');
      b.text.setFontStyle(isSelected ? 'bold' : 'normal');
    }
  }

  private soundIcon(): string {
    return Registry.getSoundMuted() ? '🔇' : '🔊';
  }
}
