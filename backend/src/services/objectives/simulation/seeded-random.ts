/**
 * Generateur pseudo-aleatoire deterministe (mulberry32).
 * Une meme graine produit toujours la meme trajectoire: la projection reste stable
 * entre deux recalculs automatiques et les tests restent reproductibles.
 */
export interface SeededRandom {
  /** Tirage uniforme dans [0, 1). */
  next(): number;
  /** Tirage gaussien centre reduit (Box-Muller). */
  normal(): number;
}

const seedMask = 0xffffffff;
const seedOffset = 0x6d2b79f5;
const minUniform = Number.EPSILON;

export function createSeededRandom(seed: number): SeededRandom {
  let state = (Math.trunc(seed) >>> 0) || 1;
  const next = () => {
    state = (state + seedOffset) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / (seedMask + 1);
  };
  return {
    next,
    normal() {
      const uniform = Math.max(minUniform, next());
      const angle = 2 * Math.PI * next();
      return Math.sqrt(-2 * Math.log(uniform)) * Math.cos(angle);
    }
  };
}
