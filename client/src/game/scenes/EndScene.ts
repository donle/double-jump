import Phaser from 'phaser';
import { getSound } from '../../audio/SoundManager';
import { Registry, type LastResult } from '../state/Registry';
import type { LevelId } from '../types';
import { netClient } from '../../net/NetClient';

export class EndScene extends Phaser.Scene {
  private lastResult!: LastResult;
  private soundBtn!: Phaser.GameObjects.Text;
  private unsubscribeNetState: (() => void) | null = null;
  private unsubscribeNetStart: (() => void) | null = null;

  constructor() {
    super('EndScene');
  }

  init(data?: Partial<LastResult>): void {
    const hasData = data && Object.keys(data).length > 0;
    this.lastResult = Registry.normalizeLastResult(hasData ? data : Registry.getLastResult());
  }

  create(): void {
    this.input.removeAllListeners('pointerdown');
    this.unsubscribeNetState?.();
    this.unsubscribeNetStart?.();
    this.unsubscribeNetState = null;
    this.unsubscribeNetStart = null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeNetState?.();
      this.unsubscribeNetStart?.();
      this.unsubscribeNetState = null;
      this.unsubscribeNetStart = null;
    });

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const isWin = this.lastResult.result === 'win';
    const nextLevel = this.nextLevel(this.lastResult.level);
    const title = isWin ? `恭喜通过${this.levelName(this.lastResult.level)}` : '游戏结束';

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.add
      .rectangle(cx, H / 2, W, H, 0x000000, 0.48)
      .setScrollFactor(0)
      .setDepth(2400);

    this.add
      .text(cx, H * 0.25, isWin ? '🏆' : '💀', { fontSize: '100px' })
      .setOrigin(0.5)
      .setDepth(2501);

    this.add
      .text(cx, H * 0.4, title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '54px',
        color: isWin ? '#06d6a0' : '#f72585',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2501);

    this.addStats(cx, H * 0.62, isWin);

    const btnY = H * 0.82;
    if (netClient.isOnline()) {
      if (isWin && nextLevel) {
        this.add
          .text(cx, btnY, `正在进入${this.levelName(nextLevel)}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '24px',
            color: '#06d6a0',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(2501);
        if (netClient.isHost()) {
          this.time.delayedCall(900, () => netClient.advanceLevel());
        }
      } else {
        this.createButton(cx, btnY, 220, 60, 0x06d6a0, '返回房间', '#000000', () => {
          this.returnOnlineRoom();
        });
      }
      this.unsubscribeNetState = netClient.onState(() => {
        if (netClient.getRoomState()?.phase === 'lobby') {
          this.scene.stop('GameScene');
          this.scene.start('RoomScene');
        }
      });
      this.unsubscribeNetStart = netClient.onStart(() => {
        const state = netClient.getRoomState();
        if (!state) return;
        Registry.setLevel(state.level);
        Registry.setDifficulty(state.difficulty);
        Registry.setLevelRun(state.levelRun);
        // 关 → 开：必须显式把 GameScene 拉起来。
        // 不能只依赖 RoomScene/旧 GameScene 的 onStart 链路：
        // Set 迭代时旧 GameScene 的 listener 在 scene.start('GameScene') 之后
        // 触发的 isActive 判定可能因场景刚被 shutdown/START 而为 false，
        // 链路一断 EndScene 又 stop 完自己，就只剩 HomeScene 在屏上卡住。
        this.scene.stop('EndScene');
        this.scene.start('GameScene');
      });
    } else if (isWin && nextLevel) {
      this.createButton(cx - 170, btnY, 150, 58, 0x06d6a0, '下一关', '#000000', () => {
        Registry.setLevel(nextLevel);
        this.startGameScene();
      });
      this.createButton(cx, btnY, 140, 58, 0x0f1020, '重玩', '#ffffff', () => {
        this.retryCurrentLevel();
      });
      this.createButton(cx + 170, btnY, 150, 58, 0x0f1020, '回主页', '#ffffff', () => {
        this.goHome();
      });
    } else {
      this.createButton(cx - 100, btnY, 160, 60, 0x06d6a0, isWin ? '再玩一次' : '重玩', '#000000', () => {
        this.retryCurrentLevel();
      });
      this.createButton(cx + 100, btnY, 160, 60, 0x0f1020, '回主页', '#ffffff', () => {
        this.goHome();
      });
    }

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
      .setDepth(2600)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => {
      Registry.toggleSound();
      this.soundBtn.setText(this.soundIcon());
    });

    this.input.once('pointerdown', () => getSound()?.resume());
  }

  private addStats(cx: number, statsY: number, isWin: boolean): void {
    const elapsed = (this.lastResult.elapsedMs / 1000).toFixed(1);
    const maxX = Math.round(this.lastResult.maxX);
    const endX = Math.round(this.lastResult.endX);

    this.addStat(cx - 120, statsY, '坚持时间', `${elapsed}s`);
    this.addStat(cx, statsY, '最远位置', `${maxX}`);
    this.addStat(cx + 120, statsY, isWin ? '通过时' : '死亡时', `x=${endX}`);
  }

  private addStat(x: number, y: number, label: string, value: string): void {
    const stat = this.add.container(x, y).setDepth(2501);
    stat.add(
      this.add
        .text(0, 0, label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          color: '#888',
        })
        .setOrigin(0.5),
    );
    stat.add(
      this.add
        .text(0, 30, value, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '28px',
          color: '#06d6a0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
  }

  private createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    label: string,
    textColor: string,
    onClick: () => void,
  ): void {
    const rect = this.add
      .rectangle(x, y, w, h, color, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: textColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2501);
    rect.on('pointerdown', onClick);
    rect.on('pointerover', () => rect.setFillStyle(color === 0x06d6a0 ? 0x04b585 : 0x1f2040));
    rect.on('pointerout', () => rect.setFillStyle(color));
  }

  private retryCurrentLevel(): void {
    Registry.regenerateLevelRun();
    this.startGameScene();
  }

  private startGameScene(): void {
    this.scene.stop('GameScene');
    this.scene.start('GameScene');
  }

  private goHome(): void {
    this.scene.stop('GameScene');
    this.scene.start('HomeScene');
  }

  private returnOnlineRoom(): void {
    netClient.returnLobby();
    this.scene.stop('GameScene');
    this.scene.start('RoomScene');
  }

  private levelName(level: LevelId): string {
    switch (level) {
      case 'lv1':
        return '第一关';
      case 'lv2':
        return '第二关';
      case 'lv3':
        return '第三关';
    }
  }

  private nextLevel(level: LevelId): LevelId | null {
    switch (level) {
      case 'lv1':
        return 'lv2';
      case 'lv2':
        return 'lv3';
      case 'lv3':
        return null;
    }
  }

  private soundIcon(): string {
    return Registry.getSoundMuted() ? '🔇' : '🔊';
  }
}
