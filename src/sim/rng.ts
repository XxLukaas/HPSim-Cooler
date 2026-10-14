/**
 * Kleiner, reproduzierbarer Zufallszahlengenerator (mulberry32).
 * Der Zustand ist eine einzelne 32-Bit-Zahl und lässt sich daher
 * problemlos im Simulationszustand speichern (für „Schritt zurück“).
 */
export function nextRandom(state: number): [value: number, next: number] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  a = a >>> 0;
  return [value, a];
}

export function randomSeed(): number {
  try {
    const b = new Uint32Array(1);
    globalThis.crypto.getRandomValues(b);
    return b[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

/** Hilfsobjekt zum bequemen Ziehen mehrerer Zufallszahlen. */
export class Rng {
  constructor(public state: number) {}
  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }
  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n));
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  exponential(mean: number): number {
    if (mean <= 0) return 0;
    return -mean * Math.log(1 - this.next());
  }
  uniform(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + (hi - lo) * this.next();
  }
}
