import Phaser from 'phaser';
import { HomeScene } from './game/scenes/HomeScene';
import { RoomScene } from './game/scenes/RoomScene';
import { GameScene } from './game/scenes/GameScene';
import { EndScene } from './game/scenes/EndScene';
import { GAME_CONFIG } from './game/config';
import { SoundManager } from './audio/SoundManager';
import { createLevelRun } from './game/level/LevelRun';
import { registerPwaServiceWorker } from './pwa';
import { netClient } from './net/NetClient';

/**
 * Phaser 启动入口。
 * 顺序：HomeScene（标题屏）→ RoomScene（选关/难度）→ GameScene（实际游戏）→ EndScene（结束页）。
 * Audio resume 监听从 main.ts 移到 HomeScene.create()（main.ts 在 Phaser.Game 构造前
 * 没法访问 scene.input；HomeScene 接管"用户进游戏后首次点击"语义更清晰）。
 */

// 实例化 SoundManager（懒建 AudioContext；user gesture 后再 resume —— HomeScene 处理）
const sound = new SoundManager();

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [HomeScene],
});

// 在 game 初始化后注册其余 3 个 scene
game.scene.add('RoomScene', RoomScene);
game.scene.add('GameScene', GameScene);
game.scene.add('EndScene', EndScene);

// 暴露到 window 方便调试
declare global {
  interface Window {
    __game?: Phaser.Game;
    __sound?: SoundManager;
  }
}
window.__game = game;
window.__sound = sound;

// 初始化 registry 默认值
function initRegistry(): void {
  // sound.muted：从 localStorage 读，失败 fallback false
  let muted = false;
  try {
    muted = localStorage.getItem('dj.sound.muted') === '1';
  } catch {
    // 隐私模式：fallback false
  }
  game.registry.set('sound.muted', muted);
  game.registry.set('level.current', 'lv1');
  game.registry.set('difficulty.current', 'NORMAL');
  game.registry.set('level.run', createLevelRun());
}
initRegistry();
registerPwaServiceWorker();

// 预连接 WebSocket：用户在 HomeScene 看到"创建房间"按钮时，连接已经建立。
// connect() 是幂等的（已连过会直接返回），失败也不会阻塞启动。
netClient.connect().catch((err) => {
  // 静默 — 网络差时用户走离线模式即可，不打扰首屏体验。
  console.warn('[net] pre-connect failed:', err);
});

netClient.onRoomClosed(() => {
  game.scene.stop('GameScene');
  game.scene.stop('EndScene');
  game.scene.stop('RoomScene');
  game.scene.start('HomeScene');
});
