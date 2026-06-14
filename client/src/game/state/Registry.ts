import { createLevelRun, DEFAULT_LEVEL_RUN, type LevelRun } from '../level/LevelRun';
import type { Difficulty, LevelId } from '../types';

export interface LastResult {
  result: 'win' | 'game_over';
  level: LevelId;
  elapsedMs: number;
  maxX: number;
  endX: number;
}

const KEYS = {
  soundMuted: 'sound.muted',
  level: 'level.current',
  difficulty: 'difficulty.current',
  lastResult: 'game.lastResult',
  levelRun: 'level.run',
} as const;

const LS_SOUND_MUTED = 'dj.sound.muted';

const DEFAULT_LAST_RESULT: LastResult = {
  result: 'game_over',
  level: 'lv1',
  elapsedMs: 0,
  maxX: 0,
  endX: 0,
};

function getRegistry(): Phaser.Data.DataManager | undefined {
  return window.__game?.registry;
}

function safeGet<T>(key: string, fallback: T): T {
  const reg = getRegistry();
  if (!reg || !reg.has(key)) return fallback;
  return reg.get(key) as T;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isLevelId(value: unknown): value is LevelId {
  return value === 'lv1' || value === 'lv2' || value === 'lv3';
}

function normalizeLastResult(value: unknown, currentLevel: LevelId): LastResult {
  const raw = value && typeof value === 'object' ? value as Partial<LastResult> : {};
  return {
    result: raw.result === 'win' ? 'win' : 'game_over',
    level: isLevelId(raw.level) ? raw.level : currentLevel,
    elapsedMs: finiteNumber(raw.elapsedMs, 0),
    maxX: finiteNumber(raw.maxX, 0),
    endX: finiteNumber(raw.endX, 0),
  };
}

export const Registry = {
  getSoundMuted(): boolean {
    return safeGet<boolean>(KEYS.soundMuted, false);
  },
  setSoundMuted(v: boolean): void {
    const reg = getRegistry();
    if (reg) reg.set(KEYS.soundMuted, v);
    try {
      localStorage.setItem(LS_SOUND_MUTED, v ? '1' : '0');
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  },
  toggleSound(): boolean {
    const next = !this.getSoundMuted();
    this.setSoundMuted(next);
    return next;
  },

  getLevel(): LevelId {
    return safeGet<LevelId>(KEYS.level, 'lv1');
  },
  setLevel(v: LevelId): void {
    const reg = getRegistry();
    if (reg) reg.set(KEYS.level, v);
  },

  regenerateLevelRun(): LevelRun {
    const run = createLevelRun();
    const reg = getRegistry();
    if (reg) reg.set(KEYS.levelRun, run);
    return run;
  },
  setLevelRun(run: LevelRun): void {
    const reg = getRegistry();
    if (reg) reg.set(KEYS.levelRun, run);
  },
  getLevelRun(): LevelRun {
    return safeGet<LevelRun>(KEYS.levelRun, DEFAULT_LEVEL_RUN);
  },
  getLevelSeed(level: LevelId): number {
    return this.getLevelRun().levelSeeds[level] ?? DEFAULT_LEVEL_RUN.levelSeeds[level];
  },

  getDifficulty(): Difficulty {
    return safeGet<Difficulty>(KEYS.difficulty, 'NORMAL');
  },
  setDifficulty(v: Difficulty): void {
    const reg = getRegistry();
    if (reg) reg.set(KEYS.difficulty, v);
  },

  getLastResult(): LastResult {
    return normalizeLastResult(safeGet<unknown>(KEYS.lastResult, DEFAULT_LAST_RESULT), this.getLevel());
  },
  setLastResult(r: LastResult): void {
    const reg = getRegistry();
    if (reg) reg.set(KEYS.lastResult, normalizeLastResult(r, this.getLevel()));
  },
  normalizeLastResult(value: unknown): LastResult {
    return normalizeLastResult(value, this.getLevel());
  },
} as const;
