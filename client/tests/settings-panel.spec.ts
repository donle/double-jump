import { expect, test, type Page } from '@playwright/test';

interface PlayerSnapshot {
  x: number;
  y: number;
  state: string;
  jumping: boolean;
}

interface GameSnapshot {
  panel: boolean;
  overlay: boolean;
  runSeed: number;
  p1: PlayerSnapshot;
  p2: PlayerSnapshot;
}

async function clickGame(page: Page, x: number, y: number): Promise<void> {
  const point = await page.evaluate(({ x: gameX, y: gameY }) => {
    const canvas = document.querySelector('canvas');
    const game = (window as unknown as { __game?: { scale: { width: number; height: number } } }).__game;
    if (!canvas || !game) throw new Error('Game canvas is not ready.');
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (gameX / game.scale.width) * rect.width,
      y: rect.top + (gameY / game.scale.height) * rect.height,
    };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}

async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __game?: { scene: { getScenes(active: boolean): { scene: { key: string } }[] } };
    }).__game;
    return game?.scene.getScenes(true).map((scene) => scene.scene.key) ?? [];
  });
}

async function gameSnapshot(page: Page): Promise<GameSnapshot | null> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __game?: {
        registry: { get(key: string): { runSeed: number } | undefined };
        scene: { getScene(key: string): unknown };
      };
    }).__game;
    const scene = game?.scene.getScene('GameScene') as
      | {
          scene: { isActive(): boolean };
        }
      | undefined;
    if (!scene || !scene.scene.isActive()) return null;
    const gameScene = scene as unknown as {
      settingsPanel: unknown;
      settingsOverlay: unknown;
      p1: {
        getPosition(): { x: number; y: number };
        getState(): string;
        isJumping(): boolean;
      };
      p2: {
        getPosition(): { x: number; y: number };
        getState(): string;
        isJumping(): boolean;
      };
    };
    const p1 = gameScene.p1.getPosition();
    const p2 = gameScene.p2.getPosition();
    return {
      panel: Boolean(gameScene.settingsPanel),
      overlay: Boolean(gameScene.settingsOverlay),
      runSeed: game.registry.get('level.run')?.runSeed ?? 0,
      p1: { x: p1.x, y: p1.y, state: gameScene.p1.getState(), jumping: gameScene.p1.isJumping() },
      p2: { x: p2.x, y: p2.y, state: gameScene.p2.getState(), jumping: gameScene.p2.isJumping() },
    };
  });
}

test('设置面板按钮不会触发全局跳跃，并且重开/退出可用', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__game && document.querySelector('canvas')));

  await clickGame(page, 360, 720);
  await expect.poll(() => activeScenes(page)).toContain('RoomScene');

  await clickGame(page, 360, 1160);
  await expect.poll(() => activeScenes(page)).toContain('GameScene');
  await page.waitForTimeout(500);

  const before = await gameSnapshot(page);
  expect(before).not.toBeNull();
  expect(before?.p1.jumping).toBe(false);
  expect(before?.p2.jumping).toBe(false);

  await clickGame(page, 45, 32);
  await expect.poll(async () => (await gameSnapshot(page))?.panel).toBe(true);
  await page.waitForTimeout(250);

  const afterSettings = await gameSnapshot(page);
  expect(afterSettings?.overlay).toBe(true);
  expect(afterSettings?.p1.jumping).toBe(false);
  expect(afterSettings?.p2.jumping).toBe(false);
  expect(afterSettings?.p1.y).toBeGreaterThanOrEqual((before?.p1.y ?? 0) - 8);
  expect(afterSettings?.p2.y).toBeGreaterThanOrEqual((before?.p2.y ?? 0) - 8);

  await clickGame(page, 360, 202);
  await expect.poll(async () => {
    const snapshot = await gameSnapshot(page);
    return snapshot && !snapshot.panel && snapshot.runSeed !== before?.runSeed;
  }).toBeTruthy();
  const afterRestart = await gameSnapshot(page);
  expect(afterRestart?.p1.jumping).toBe(false);
  expect(afterRestart?.p2.jumping).toBe(false);

  await clickGame(page, 45, 32);
  await expect.poll(async () => (await gameSnapshot(page))?.panel).toBe(true);

  await clickGame(page, 360, 268);
  await expect.poll(async () => {
    const scenes = await activeScenes(page);
    return scenes.includes('HomeScene') && !scenes.includes('GameScene');
  }).toBe(true);
});
