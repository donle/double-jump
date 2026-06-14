import Phaser from 'phaser';
import { Registry } from '../state/Registry';
import { getSound } from '../../audio/SoundManager';
import { netClient } from '../../net/NetClient';

/**
 * 主页（A 布局）：居中纵向经典标题屏。
 *   - 大标题 "DOUBLE JUMP"（粉色 #f72585, 64px）
 *   - 副标题 "一根绳子 · 两个玩家 · 一颗脑子"（灰色, 16px）
 *   - "▶ 开始" 大按钮（绿色 #06d6a0, 28px）
 *   - 右上角 🔊/🔇 切换按钮
 *
 * 输入：Space / Click / Tap 都触发 START → scene.start('RoomScene')。
 * Audio resume：首次 pointerdown 时调 getSound()?.resume()（替代 main.ts 的一次性监听）。
 */
export class HomeScene extends Phaser.Scene {
  private soundBtn!: Phaser.GameObjects.Text;

  constructor() {
    super('HomeScene');
  }

  create(): void {
    this.input.removeAllListeners('pointerdown');
    this.input.keyboard?.removeAllListeners('keydown-SPACE');
    Registry.regenerateLevelRun();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    // 1. 大标题
    this.add
      .text(cx, cy - 80, '双人跳', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        color: '#f72585',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // 2. 副标题
    this.add
      .text(cx, cy - 10, '一根绳子 · 两个玩家 · 一颗脑子', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#888888',
      })
      .setOrigin(0.5);

    // 3. ▶ 开始 大按钮
    const startBtn = this.add
      .rectangle(cx, cy + 80, 240, 72, 0x06d6a0, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy + 80, '▶ 开始', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#000000',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    startBtn.on('pointerdown', () => this.goToRoom());
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x04b585));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x06d6a0));

    const createOnlineBtn = this.add
      .rectangle(cx, cy + 175, 240, 56, 0x0f1020, 1)
      .setStrokeStyle(2, 0x06d6a0, 0.9)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy + 175, '创建联机房间', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    createOnlineBtn.on('pointerdown', () => this.goToOnlineCreate());
    createOnlineBtn.on('pointerover', () => createOnlineBtn.setFillStyle(0x1f2040));
    createOnlineBtn.on('pointerout', () => createOnlineBtn.setFillStyle(0x0f1020));

    const joinOnlineBtn = this.add
      .rectangle(cx, cy + 245, 240, 56, 0x0f1020, 1)
      .setStrokeStyle(2, 0xf72585, 0.9)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy + 245, '加入联机房间', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    joinOnlineBtn.on('pointerdown', () => this.joinOnlineRoom());
    joinOnlineBtn.on('pointerover', () => joinOnlineBtn.setFillStyle(0x1f2040));
    joinOnlineBtn.on('pointerout', () => joinOnlineBtn.setFillStyle(0x0f1020));

    // 4. 右上角 🔊/🔇 按钮
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

    // 5. 键盘 Space = START
    this.input.keyboard?.on('keydown-SPACE', () => this.goToRoom());

    // 6. 首次 pointerdown 时 resume AudioContext（替代 main.ts 的一次性监听）
    this.input.once('pointerdown', () => getSound()?.resume());
  }

  private goToRoom(): void {
    if (netClient.isOnline()) netClient.leaveRoom();
    this.scene.start('RoomScene');
  }

  private goToOnlineCreate(): void {
    if (netClient.isOnline()) netClient.leaveRoom();
    this.scene.start('RoomScene', { mode: 'onlineCreate' });
  }

  private async joinOnlineRoom(): Promise<void> {
    const roomId = window.prompt('请输入房间号');
    if (!roomId) return;
    try {
      await netClient.joinRoom(roomId);
      this.scene.start('RoomScene');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '加入联机房间失败');
    }
  }

  private soundIcon(): string {
    return Registry.getSoundMuted() ? '🔇' : '🔊';
  }
}
