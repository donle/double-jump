import type { LevelId } from '../types';

export type LevelSeeds = Record<LevelId, number>;

export interface LevelRun {
  runSeed: number;
  levelSeeds: LevelSeeds;
}

export type EntropySource = () => number;

export const LEVEL_IDS: readonly LevelId[] = ['lv1', 'lv2', 'lv3'];

export const DEFAULT_LEVEL_RUN: LevelRun = {
  runSeed: 12345,
  levelSeeds: {
    lv1: 12345,
    lv2: 23456,
    lv3: 34567,
  },
};

export function createLevelRun(entropy: EntropySource = defaultEntropy): LevelRun {
  const runSeed = normalizeSeed(entropy());
  const rng = mulberry32(runSeed);
  return {
    runSeed,
    levelSeeds: {
      lv1: normalizeSeed(rng() * 0xffffffff),
      lv2: normalizeSeed(rng() * 0xffffffff),
      lv3: normalizeSeed(rng() * 0xffffffff),
    },
  };
}

export function defaultEntropy(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

export function normalizeSeed(seed: number): number {
  const normalized = Math.floor(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
