// Run with: npx esbuild src/reels/route.check.ts --bundle --platform=node --format=esm --outfile=/tmp/route-check.mjs && node /tmp/route-check.mjs

import { generateMaze, edgeKey, outerBoundaryCells, type Maze } from '../lib/maze';
import { assignShapeGates } from './gates';
import { CTAS, HOOKS, emptyCopyQueue, takeCopy } from './copy';
import { MARKER_COLORS, PALETTES, takeBackgrounds, type PaletteQueue } from './palettes';
import {
  assertSolution,
  buildColoredTrack,
  cellCenterLocal,
  passageDegree,
  routeStats,
  segmentRoute,
  solutionRoute,
} from './route';
import {
  buildTimeline,
  clampPlayAlong,
  easeMarker,
  PLAY_ALONG_DEFAULT,
  PLAY_ALONG_MAX,
  PLAY_ALONG_MIN,
} from './timeline';

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, msg: string): void {
  if (Math.abs(a - b) > 1e-6) throw new Error(`${msg}: ${a} vs ${b}`);
}

function handMaze(): Maze {
  const cols = 6;
  const rows = 6;
  const cells = new Array<boolean>(cols * rows).fill(false);
  // Short corridor along row 1, a dead-end north of its middle,
  // and a longer way around the bottom.
  const on = [7, 8, 9, 10, 11, 3, 13, 19, 20, 21, 22, 23, 17];
  for (const i of on) cells[i] = true;
  const link = (a: number, b: number) => edgeKey(a, b);
  const passages = new Set<number>([
    link(7, 8),
    link(8, 9),
    link(9, 10),
    link(10, 11),
    link(9, 3),
    link(7, 13),
    link(13, 19),
    link(19, 20),
    link(20, 21),
    link(21, 22),
    link(22, 23),
    link(23, 17),
    link(17, 11),
  ]);
  return {
    cols,
    rows,
    cells,
    passages,
    start: 7,
    end: 11,
    startOpen: -1,
    endOpen: -1,
    bbox: { minR: 0, maxR: 5, minC: 0, maxC: 5 },
  };
}

function disk(cols: number, radius: number): boolean[] {
  const inside = new Array<boolean>(cols * cols).fill(false);
  const c0 = (cols - 1) / 2;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const dr = r - c0;
      const dc = c - c0;
      if (dr * dr + dc * dc <= radius * radius) inside[r * cols + c] = true;
    }
  }
  return inside;
}

function runHandMaze(): void {
  const maze = handMaze();
  const route = solutionRoute(maze);
  check(route[0] === 7 && route[route.length - 1] === 11, 'hand route endpoints');
  check(!route.includes(3), 'hand route entered the dead end');
  check(route.length === 5, `hand route should be the short corridor, got ${route.join('-')}`);
  const long = [7, 13, 19, 20, 21, 22, 23, 17, 11];
  let rejected = false;
  try {
    assertSolution(maze, long);
  } catch {
    rejected = true;
  }
  check(rejected, 'longer alternate was accepted');
  let jumped = false;
  try {
    assertSolution(maze, [7, 9, 10, 11]);
  } catch {
    jumped = true;
  }
  check(jumped, 'a jump was accepted');
  let walled = false;
  try {
    assertSolution(maze, [7, 8, 9, 10, 11, 17]);
  } catch {
    walled = true;
  }
  check(walled, 'a step off the goal was accepted');
}

function runGenerated(): void {
  const cols = 24;
  for (let seed = 1; seed <= 12; seed++) {
    const maze = generateMaze(disk(cols, 7.4), cols, cols, seed);
    const route = solutionRoute(maze);
    const on = new Set(route);
    for (let i = 0; i < maze.cells.length; i++) {
      if (!maze.cells[i] || i === maze.start || i === maze.end) continue;
      if (passageDegree(maze, i) === 1) {
        check(!on.has(i), `seed ${seed} colored dead-end cell ${i}`);
      }
    }
    const track = buildColoredTrack(maze, route, 10, MARKER_COLORS);
    const centers = route.map((idx) => cellCenterLocal(maze, idx, 10));
    let k = 0;
    for (const p of track.points) {
      const c = centers[k];
      if (
        c &&
        Math.abs(p.x - c.x) < 1e-6 &&
        Math.abs(p.y - c.y) < 1e-6
      ) {
        k++;
      }
    }
    check(k === centers.length, `seed ${seed} polyline dropped a solution cell`);
    check(
      track.points.length - route.length <= 2,
      `seed ${seed} polyline has extra points`,
    );
    for (let i = 0; i < maze.cells.length; i++) {
      if (!maze.cells[i] || i === maze.start || i === maze.end) continue;
      if (passageDegree(maze, i) !== 1) continue;
      const c = cellCenterLocal(maze, i, 10);
      for (const p of track.points) {
        check(
          Math.abs(p.x - c.x) > 0.1 || Math.abs(p.y - c.y) > 0.1,
          `seed ${seed} track visits dead end ${i}`,
        );
      }
    }
    check(track.spans[0]?.from === 0, 'span does not start at the entrance');
    check(
      track.spans[track.spans.length - 1]?.to === track.points.length - 1,
      'span does not finish at the goal',
    );
    for (let s = 0; s < track.spans.length - 1; s++) {
      check(
        track.spans[s].to === track.spans[s + 1].from,
        'colored segments leave a gap',
      );
    }
    const stats = routeStats(maze, route);
    check(stats.steps === route.length - 1, 'step count');
    check(stats.deadEnds >= 0, 'dead end count');
  }
}

function runSegments(): void {
  const cols = 10;
  const straight: number[] = [];
  for (let i = 0; i < 16; i++) straight.push(20 + i);
  const spans = segmentRoute(straight, cols, MARKER_COLORS);
  check(spans.length > 1, 'a long straight was not split');
  check(spans[0].from === 0 && spans[spans.length - 1].to === 15, 'straight coverage');
  for (let i = 0; i < spans.length - 1; i++) {
    check(spans[i].to === spans[i + 1].from, 'straight gap');
    check(spans[i].color !== spans[i + 1].color, 'adjacent segments share a color');
  }
  const turn = [20, 21, 22, 23, 24, 34, 44, 54, 64];
  const turned = segmentRoute(turn, cols, ['#f00', '#0f0', '#00f']);
  check(
    turned.some((s) => s.to === 4) && turned.some((s) => s.from === 4),
    'turn was not a color change',
  );
}

function runTimeline(): void {
  check(PLAY_ALONG_DEFAULT < 7, 'default wait should be shorter than 7s');
  check(PLAY_ALONG_DEFAULT >= PLAY_ALONG_MIN && PLAY_ALONG_DEFAULT <= PLAY_ALONG_MAX, 'default wait in range');
  const combos: Array<[number, boolean, boolean, number]> = [];
  for (const d of [20, 24, 30]) {
    for (const c of [false, true]) {
      for (const e of [false, true]) {
        for (const hold of [PLAY_ALONG_MIN, PLAY_ALONG_DEFAULT, 7, PLAY_ALONG_MAX]) {
          combos.push([d, c, e, hold]);
        }
      }
    }
  }
  for (const [d, c, e, hold] of combos) {
    const t = buildTimeline(d, c, e, hold);
    approx(t.duration, d, 'duration');
    approx(t.hookEnd, 1, 'hook');
    check(t.countEnd >= t.hookEnd, 'countdown order');
    check(t.holdEnd >= t.countEnd, 'hold order');
    approx(t.holdEnd - t.countEnd, hold, 'play-along hold');
    check(t.walkEnd > t.holdEnd + 4, 'coloring starts after the hold');
    check(t.burstEnd > t.walkEnd, 'burst');
    check(t.burstEnd <= t.duration + 1e-6, 'burst inside the reel');
    if (!e) approx(t.burstEnd, t.duration, 'no end card');
    if (!c) approx(t.countEnd, t.hookEnd, 'no countdown');
    if (c) approx(t.countEnd - t.hookEnd, 3, 'countdown is one second per beat');
  }
  const fallback = buildTimeline(24, true, true);
  approx(fallback.holdEnd - fallback.countEnd, PLAY_ALONG_DEFAULT, 'default hold');
  const short = buildTimeline(10, true, true, PLAY_ALONG_MAX);
  approx(short.duration, 20, 'short request clamps up');
  approx(short.holdEnd - short.countEnd, PLAY_ALONG_MAX, 'short reel kept the hold');
  approx(short.countEnd - short.hookEnd, 3, 'short reel kept the countdown');
  check(short.walkEnd > short.holdEnd, 'short reel still walks the solution');
  approx(clampPlayAlong(1), PLAY_ALONG_MIN, 'wait clamps up');
  approx(clampPlayAlong(40), PLAY_ALONG_MAX, 'wait clamps down');
}

function runEase(): void {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const v = easeMarker(i / 100);
    check(v + 1e-9 >= prev, `ease went backwards at ${i}`);
    check(v >= -1e-6 && v <= 1 + 1e-6, 'ease out of range');
    prev = v;
  }
  approx(easeMarker(0), 0, 'ease start');
  approx(easeMarker(1), 1, 'ease end');
  const mid = easeMarker(0.5);
  check(mid > 0.42 && mid < 0.58, `ease should stay near the middle, got ${mid}`);
}

function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hueOf(hex: string): number {
  const [r0, g0, b0] = hexChannels(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.06) return -1;
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return (hue * 60 + 360) % 360;
}

function hueGap(a: number, b: number): number {
  if (a < 0 || b < 0) return 0;
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexChannels(a);
  const [br, bg, bb] = hexChannels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function hsvOf(hex: string): { s: number; v: number } {
  const [r0, g0, b0] = hexChannels(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

function runGradients(): void {
  const names = new Set<string>();
  for (const palette of PALETTES) {
    check(!names.has(palette.name), `duplicate palette ${palette.name}`);
    names.add(palette.name);
    const stops = [palette.bg, palette.bgMid, palette.bgEnd];
    check(new Set(stops).size === 3, `${palette.name} repeats a stop`);
    const hues = stops.map(hueOf);
    let gap = 0;
    let far = 0;
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        gap = Math.max(gap, hueGap(hues[i], hues[j]));
        far = Math.max(far, rgbDistance(stops[i], stops[j]));
      }
      const { s, v } = hsvOf(stops[i]);
      check(!(s > 0.85 && v > 0.9), `${palette.name} stop looks neon`);
    }
    check(gap >= 40, `${palette.name} gradient is a single hue (${gap.toFixed(0)}°)`);
    check(far >= 70, `${palette.name} gradient is nearly flat`);
  }
}

function runCopy(): void {
  check(HOOKS.length >= 8 && CTAS.length >= 8, 'line pools are too small for a batch');
  check(new Set(HOOKS.map((lines) => lines.join('\n'))).size === HOOKS.length, 'duplicate hooks');
  check(new Set(CTAS).size === CTAS.length, 'duplicate closing lines');
  for (const lines of HOOKS) {
    check(lines.length >= 1 && lines.length <= 2, 'hook should be one or two lines');
    for (const line of lines) check(line.trim().length > 0 && line.length <= 22, `hook line is awkward: ${line}`);
  }
  for (const line of CTAS) check(line.trim().length >= 12 && line.length <= 48, `closing line is awkward: ${line}`);

  const first = takeCopy(emptyCopyQueue(), 8, 42);
  check(first.copies.length === 8, 'copy batch length');
  check(new Set(first.copies.map((c) => c.hook.join('\n'))).size === 8, 'hooks repeat inside a batch');
  check(new Set(first.copies.map((c) => c.cta)).size === 8, 'closing lines repeat inside a batch');
  const second = takeCopy(first.queue, 1, 99);
  check(second.copies[0].hook.join('\n') !== first.copies[7].hook.join('\n'), 'next reel repeated the last hook');
  check(second.copies[0].cta !== first.copies[7].cta, 'next reel repeated the last closing line');

  let queue = emptyCopyQueue();
  let prevHook = '';
  let prevCta = '';
  for (let i = 0; i < HOOKS.length * 2; i++) {
    const next = takeCopy(queue, 1, 1000 + i);
    queue = next.queue;
    const hook = next.copies[0].hook.join('\n');
    const cta = next.copies[0].cta;
    if (i > 0) {
      check(hook !== prevHook, 'adjacent reels shared a hook');
      check(cta !== prevCta, 'adjacent reels shared a closing line');
    }
    prevHook = hook;
    prevCta = cta;
  }
}

function plusMask(cols: number): boolean[] {
  const inside = new Array<boolean>(cols * cols).fill(false);
  const mid = Math.floor(cols / 2);
  const arm = Math.floor(cols * 0.36);
  const thick = 2;
  for (let r = mid - arm; r <= mid + arm; r++) {
    for (let c = mid - arm; c <= mid + arm; c++) {
      if (r < 0 || c < 0 || r >= cols || c >= cols) continue;
      if (Math.abs(r - mid) <= thick || Math.abs(c - mid) <= thick) inside[r * cols + c] = true;
    }
  }
  return inside;
}

function armKind(idx: number, cols: number): 'h' | 'v' | 'c' {
  const mid = Math.floor(cols / 2);
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  if (Math.abs(r - mid) <= 2 && Math.abs(c - mid) > 2) return 'h';
  if (Math.abs(c - mid) <= 2 && Math.abs(r - mid) > 2) return 'v';
  return 'c';
}

function runGates(): void {
  const cols = 24;
  const outerOf = (maze: Maze) => new Set(outerBoundaryCells(maze.cells, maze.cols, maze.rows));
  const pairs = new Set<string>();
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 16; seed++) {
    const maze = generateMaze(plusMask(cols), cols, cols, seed);
    assignShapeGates(maze, seed);
    const outer = outerOf(maze);
    check(outer.has(maze.start) && outer.has(maze.end), `plus gates left the outline at seed ${seed}`);
    check(maze.start !== maze.end, 'plus gates collapsed');
    const route = solutionRoute(maze);
    const on = new Set(route);
    for (let i = 0; i < maze.cells.length; i++) {
      if (!maze.cells[i] || i === maze.start || i === maze.end) continue;
      if (passageDegree(maze, i) === 1) check(!on.has(i), `plus dead end ${i} was drawn`);
    }
    const key = [maze.start, maze.end].sort((a, b) => a - b).join(':');
    pairs.add(key);
    kinds.add(armKind(maze.start, cols));
    kinds.add(armKind(maze.end, cols));
    check(armKind(maze.start, cols) !== 'c' && armKind(maze.end, cols) !== 'c', 'plus gate sat in the cross');
  }
  check(pairs.size >= 2, 'plus silhouettes reused one gate pair');
  check(kinds.has('h') && kinds.has('v'), 'plus gates stayed on one axis');

  const diskPairs = new Set<string>();
  const angles: number[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const maze = generateMaze(disk(cols, 8.2), cols, cols, seed + 40);
    assignShapeGates(maze, seed + 40);
    const route = solutionRoute(maze);
    check(route[0] === maze.start && route[route.length - 1] === maze.end, 'disk route endpoints');
    diskPairs.add([maze.start, maze.end].sort((a, b) => a - b).join(':'));
    const sr = Math.floor(maze.start / cols);
    const sc = maze.start % cols;
    const er = Math.floor(maze.end / cols);
    const ec = maze.end % cols;
    angles.push(Math.atan2(er - sr, ec - sc));
  }
  check(diskPairs.size >= 2, 'disk gates ignored the seed');
  let angleSpread = 0;
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      let d = Math.abs(angles[i] - angles[j]);
      d = Math.min(d, Math.PI - d);
      angleSpread = Math.max(angleSpread, d);
    }
  }
  check(angleSpread > 0.35, 'disk gates stayed on one diagonal');
}

function runBackgrounds(): void {
  const empty: PaletteQueue = { items: [], last: null };
  const first = takeBackgrounds(empty, 8, null, 42);
  check(first.backgrounds.length === 8, 'batch length');
  check(new Set(first.backgrounds.map((p) => p.name)).size === 8, 'batch backgrounds repeat');
  const second = takeBackgrounds(first.queue, 8, null, 99);
  check(second.backgrounds.length === 8, 'second batch length');
  check(new Set(second.backgrounds.map((p) => p.name)).size === 8, 'second batch repeats');
  check(
    second.backgrounds[0].name !== first.backgrounds[first.backgrounds.length - 1].name,
    'next reel repeated the previous background',
  );
  const pinned = takeBackgrounds(empty, 8, PALETTES[3], 7);
  check(pinned.backgrounds[0].name === PALETTES[3].name, 'batch did not start from the picked color');
  check(new Set(pinned.backgrounds.map((p) => p.name)).size === 8, 'pinned batch repeats');
  const locked = takeBackgrounds(empty, 1, PALETTES[1], 3);
  check(locked.backgrounds.length === 1 && locked.backgrounds[0].name === PALETTES[1].name, 'locked single');
  const names = new Set(PALETTES.map((p) => p.name));
  check(names.size === PALETTES.length, 'palette names are not unique');
  check(PALETTES.length >= 8, 'not enough backgrounds for a batch of 8');
}

runGradients();
runCopy();
runGates();
runBackgrounds();
runHandMaze();
runGenerated();
runSegments();
runTimeline();
runEase();
console.log('route checks ok');
