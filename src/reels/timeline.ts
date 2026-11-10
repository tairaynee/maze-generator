export interface Timeline {
  duration: number;
  /** Hook text is fully on screen until this time. Always 1s. */
  hookEnd: number;
  /** Countdown, when enabled, occupies (hookEnd, countEnd). */
  countEnd: number;
  /** Solution coloring finishes here. */
  walkEnd: number;
  /** Glow / burst finishes here. End card, if any, runs until duration. */
  burstEnd: number;
}

/** Fixed hook in the first second. The rest of the length is mostly the coloring. */
export function buildTimeline(
  durationSec: number,
  countdown: boolean,
  endCard: boolean,
): Timeline {
  const duration = Math.min(20, Math.max(10, durationSec));
  const hookEnd = 1;
  let countSpan = countdown ? 1.35 : 0;
  const burstSpan = 1.05;
  const minWalk = 4.2;
  let cardSpan = endCard ? Math.min(2.8, duration * 0.22) : 0;
  let walkSpan = duration - hookEnd - countSpan - burstSpan - cardSpan;
  if (walkSpan < minWalk) {
    const cardCut = Math.min(cardSpan, minWalk - walkSpan);
    cardSpan -= cardCut;
    walkSpan += cardCut;
  }
  if (walkSpan < minWalk && countSpan > 0.75) {
    const countCut = Math.min(countSpan - 0.75, minWalk - walkSpan);
    countSpan -= countCut;
    walkSpan += countCut;
  }
  const countEnd = hookEnd + countSpan;
  const burstEnd = duration - cardSpan;
  const walkEnd = burstEnd - burstSpan;
  return { duration, hookEnd, countEnd, walkEnd, burstEnd };
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Mostly steady marker speed, with a short ease at the start and the goal. */
export function easeMarker(t: number): number {
  const x = clamp01(t);
  const edge = 0.12;
  if (x < edge) {
    const u = x / edge;
    return edge * u * u * (3 - 2 * u) * 0.65;
  }
  if (x > 1 - edge) {
    const u = (x - (1 - edge)) / edge;
    const start = 1 - edge * 0.65;
    return start + (1 - start) * (u * u * (3 - 2 * u));
  }
  const start = edge * 0.65;
  const end = 1 - edge * 0.65;
  const u = (x - edge) / (1 - 2 * edge);
  return start + (end - start) * u;
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
