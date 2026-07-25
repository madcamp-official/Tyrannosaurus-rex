/**
 * Plan.md §6.1 "발굴 이벤트는 시드 기반으로 생성해 양 팀에 같은 기회가 주어지도록 한다"
 * §6.3 "양 팀은 동일한 이동 패턴 시드를 사용한다".
 * (seed, index) -> [0,1) 결정론적 값. 공유 mutable RNG 상태가 없어 두 팀이 동시에 호출해도
 * 순서에 영향을 받지 않는다.
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(a: number, b: number): number {
  let h = (a ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export function seededRandom01(seed: string, index: number): number {
  const h = mix(hashSeed(seed), index);
  return h / 4294967296;
}

/** Fisher-Yates, seed와 배열 길이만으로 결정론적으로 정해지는 순열. */
export function seededShuffle<T>(items: readonly T[], seed: string, salt: string): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const r = seededRandom01(`${seed}:${salt}`, i);
    const j = Math.floor(r * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
