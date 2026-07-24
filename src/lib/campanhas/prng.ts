// Gerador determinístico: mesma (chave) sempre produz a mesma sequência de números,
// então a série mock pode ser recalculada a cada request sem precisar persistir nada.

export function hashStringToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Número pseudo-aleatório estável em [min, max] para uma chave qualquer (ex: `${campanhaId}|${data}`).
export function seededRandom(key: string, min: number, max: number): number {
  const rand = mulberry32(hashStringToSeed(key))();
  return min + rand * (max - min);
}
