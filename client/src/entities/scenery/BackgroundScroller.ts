import Phaser from 'phaser';
import type { Difficulty } from '../../game/types';

const backgroundKeys: Record<Difficulty, string> = {
  EASY: 'bg-easy-portrait',
  NORMAL: 'bg-normal-portrait',
  HARD: 'bg-hard-portrait',
};

export class BackgroundScroller {
  private readonly scene: Phaser.Scene;
  private readonly difficulty: Difficulty;
  private backgroundImage: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, difficulty: Difficulty) {
    this.scene = scene;
    this.difficulty = difficulty;
  }

  addToScene(): Phaser.GameObjects.Image[] {
    const key = backgroundKeys[this.difficulty];
    this.backgroundImage = this.scene.add.image(0, 0, key);
    this.backgroundImage
      .setOrigin(0, 0)
      .setScrollFactor(0, 0)
      .setDepth(0)
      .setDisplaySize(this.scene.scale.width, this.scene.scale.height);
    return [this.backgroundImage];
  }

  update(): void {
    // Static portrait bitmap. Kept for the existing GameScene update hook.
  }

  destroy(): void {
    this.backgroundImage?.destroy();
    this.backgroundImage = null;
  }
}
