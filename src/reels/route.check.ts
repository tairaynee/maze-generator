// Run with: npx esbuild src/reels/route.check.ts --bundle --platform=node --format=esm --outfile=/tmp/route-check.mjs && node /tmp/route-check.mjs

import { generateMaze, edgeKey, type Maze } from '../lib/maze';
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
import { buildTimeline, easeMarker } from './timeline';

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
  const combos: Array<[number, boolean, boolean]> = [];
  for (const d of [10, 14, 20]) {
    for (const c of [false, true]) {
      for (const e of [false, true]) combos.push([d, c, e]);
    }
  }
  for (const [d, c, e] of combos) {
    const t = buildTimeline(d, c, e);
    approx(t.duration, d, 'duration');
    approx(t.hookEnd, 1, 'hook');
    check(t.countEnd >= t.hookEnd, 'countdown order');
    check(t.walkEnd > t.countEnd + 4, 'coloring time');
    check(t.burstEnd > t.walkEnd, 'burst');
    check(t.burstEnd <= t.duration + 1e-6, 'burst inside the reel');
    if (!e) approx(t.burstEnd, t.duration, 'no end card');
    if (!c) approx(t.countEnd, t.hookEnd, 'no countdown');
    if (c) check(t.countEnd - t.hookEnd >= 0.75, 'countdown too short');
  }
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

runBackgrounds();
runHandMaze();
runGenerated();
runSegments();
runTimeline();
runEase();
console.log('route checks ok');
