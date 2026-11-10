export interface Timeline {
  duration: number;
  /** Hook text is fully on screen until this time. Always 1s. */
  hookEnd: number;
  /** Countdown, when enabled, occupies (hookEnd, countEnd). */
  countEnd: number;
  /** Unsolved maze. The solution walk starts at this time. */
  holdEnd: number;
  /** Solution coloring finishes here. */
  walkEnd: number;
  /** Glow / burst finishes here. End card, if any, runs until duration. */
  burstEnd: number;
}

export const REEL_MIN_SEC = 20;
export const REEL_MAX_SEC = 30;
/** How long each of 3, 2, and 1 stays on screen. */
export const COUNT_BEAT_SEC = 1;
/**
 * Pause after the countdown, before any of the official path is drawn.
 * Long enough for a person to try the maze.
 */
export const PLAY_ALONG_SEC = 7;

/**
 * Hook, then a one-second-per-beat countdown, then a fixed play-along hold,
 * then the solution. The hold is never trimmed to make the reel shorter.
 */
export function buildTimeline(
  durationSec: number,
  countdown: boolean,
  endCard: boolean,
): Timeline {
  let duration = Math.min(REEL_MAX_SEC, Math.max(REEL_MIN_SEC, durationSec));
  const hookEnd = 1;
  const countSpan = countdown ? COUNT_BEAT_SEC * 3 : 0;
  const holdSpan = PLAY_ALONG_SEC;
  const burstSpan = 1.05;
  const minWalk = 4.2;
  let cardSpan = endCard ? Math.min(2.8, duration * 0.22) : 0;
  let walkSpan = duration - hookEnd - countSpan - holdSpan - burstSpan - cardSpan;
  if (walkSpan < minWalk) {
    const cardCut = Math.min(cardSpan, minWalk - walkSpan);
    cardSpan -= cardCut;
    walkSpan += cardCut;
  }
  if (walkSpan < minWalk) {
    duration += minWalk - walkSpan;
  }
  const countEnd = hookEnd + countSpan;
  const holdEnd = countEnd + holdSpan;
  const burstEnd = duration - cardSpan;
  const walkEnd = burstEnd - burstSpan;
  return { duration, hookEnd, countEnd, holdEnd, walkEnd, burstEnd };
}

/** Studio status for the frame at `t`. Not drawn into the video. */
export function reelPhase(t: number, timeline: Timeline, countdown: boolean): string {
  if (t < timeline.hookEnd) return 'Hook';
  if (countdown && t < timeline.countEnd) return 'Countdown';
  if (t < timeline.holdEnd) {
    const left = Math.max(1, Math.ceil(timeline.holdEnd - t - 1e-4));
    return `Play along · ${left}s`;
  }
  if (t < timeline.walkEnd) return 'Solution';
  if (t < timeline.burstEnd) return 'Finish';
  return 'End card';
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
