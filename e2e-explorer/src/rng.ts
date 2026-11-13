import { createHash } from 'node:crypto';

/**
 * 種付きの乱数。同じ設定・同じ種なら同じ順で巡回するために使う。
 * Math.random は種を指定できないため使わない。
 */
export type Rng = () => number;

/** mulberry32: 32 bit の状態だけで十分に散らばる小さな擬似乱数。 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 種と文字列（状態のキーなど）から派生した乱数を作る。状態ごとに独立した順番にするため。 */
export function deriveRng(seed: number, salt: string): Rng {
  const digest = createHash('sha1').update(`${seed}:${salt}`).digest();
  return createRng(digest.readUInt32BE(0));
}

/** Fisher–Yates で並べ替えた新しい配列を返す。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
