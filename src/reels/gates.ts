import { neighbor, outerBoundaryCells, solvePath, type Maze } from '../lib/maze';

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

function mixSeed(seed: number): number {
  let s = Math.imul(seed >>> 0 || 1, 0x9e3779b1);
  s = Math.imul(s ^ (s >>> 16), 0x7feb352d);
  s = Math.imul(s ^ (s >>> 15), 0x846ca68b);
  return (s ^ (s >>> 16)) >>> 0 || 1;
}

function mulberry32(seed: number): () => number {
  let s = mixSeed(seed);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dist2(a: number, b: number, cols: number): number {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  const dr = ar - br;
  const dc = ac - bc;
  return dr * dr + dc * dc;
}

/** Convex hull of cell indexes, walking the silhouette's own corners. */
function convexHull(indexes: number[], cols: number): number[] {
  const pts = indexes.map((idx) => ({
    idx,
    r: Math.floor(idx / cols),
    c: idx % cols,
  }));
  pts.sort((a, b) => a.c - b.c || a.r - b.r);
  const cross = (
    o: (typeof pts)[number],
    a: (typeof pts)[number],
    b: (typeof pts)[number],
  ) => (a.c - o.c) * (b.r - o.r) - (a.r - o.r) * (b.c - o.c);
  const lower: typeof pts = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: typeof pts = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper).map((p) => p.idx);
}

function diameter(indexes: number[], cols: number): number {
  let best = 1;
  for (let i = 0; i < indexes.length; i++) {
    for (let j = i + 1; j < indexes.length; j++) {
      best = Math.max(best, dist2(indexes[i], indexes[j], cols));
    }
  }
  return Math.sqrt(best);
}

/** One cell per protruding part of the silhouette: a wing, a foot, an ear. */
function shapeTips(outer: number[], cols: number): number[] {
  const hull = convexHull(outer, cols);
  const source = hull.length >= 3 ? hull : outer;
  const span = diameter(source, cols);
  const join = Math.max(2.5, span * 0.2);
  const groups: number[][] = [];
  for (const idx of source) {
    const group = groups.find((items) => items.some((other) => dist2(other, idx, cols) <= join * join));
    if (group) group.push(idx);
    else groups.push([idx]);
  }
  let sr = 0;
  let sc = 0;
  for (const idx of outer) {
    sr += Math.floor(idx / cols);
    sc += idx % cols;
  }
  const cr = sr / outer.length;
  const cc = sc / outer.length;
  const tips = groups.map((group) => {
    let best = group[0];
    let bestD = -1;
    for (const idx of group) {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const d = (r - cr) * (r - cr) + (c - cc) * (c - cc);
      if (d > bestD) {
        best = idx;
        bestD = d;
      }
    }
    return best;
  });
  return tips.length >= 2 ? tips : source.slice(0, 2);
}

function outwardDir(maze: Maze, idx: number, centroidR: number, centroidC: number): number {
  const r = Math.floor(idx / maze.cols);
  const c = idx % maze.cols;
  let best = -1;
  let bestDot = -Infinity;
  for (let d = 0; d < 4; d++) {
    const nb = neighbor(idx, d, maze.cols, maze.rows);
    if (nb >= 0 && maze.cells[nb]) continue;
    const dot = (c - centroidC) * DC[d] + (r - centroidR) * DR[d];
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best;
}

function centroid(maze: Maze): { r: number; c: number } {
  let sr = 0;
  let sc = 0;
  let n = 0;
  for (let i = 0; i < maze.cells.length; i++) {
    if (!maze.cells[i]) continue;
    sr += Math.floor(i / maze.cols);
    sc += i % maze.cols;
    n += 1;
  }
  return { r: n ? sr / n : 0, c: n ? sc / n : 0 };
}

function reaches(maze: Maze, start: number, end: number): number {
  maze.start = start;
  maze.end = end;
  const path = solvePath(maze);
  if (path.length < 2 || path[0] !== start || path[path.length - 1] !== end) return 0;
  return path.length - 1;
}

/**
 * Put the entrance and exit on this silhouette's own outer tips.
 * A shape with several extremities does not keep reusing one pair of corners.
 * The carved passages stay as they are; the official route is whatever path
 * actually joins the chosen cells.
 */
export function assignShapeGates(maze: Maze, seed: number): void {
  const outer = outerBoundaryCells(maze.cells, maze.cols, maze.rows);
  if (outer.length < 2) return;
  const tips = shapeTips(outer, maze.cols);
  const span = diameter(tips, maze.cols);
  const minDist = Math.max(4, span * 0.5);
  const pairs: Array<{ a: number; b: number; d: number }> = [];
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      const d = Math.sqrt(dist2(tips[i], tips[j], maze.cols));
      if (d + 1e-6 >= minDist) pairs.push({ a: tips[i], b: tips[j], d });
    }
  }
  if (!pairs.length) {
    let farA = outer[0];
    let farB = outer[1];
    let farD = -1;
    for (let i = 0; i < outer.length; i++) {
      for (let j = i + 1; j < outer.length; j++) {
        const d = dist2(outer[i], outer[j], maze.cols);
        if (d > farD) {
          farD = d;
          farA = outer[i];
          farB = outer[j];
        }
      }
    }
    pairs.push({ a: farA, b: farB, d: Math.sqrt(Math.max(0, farD)) });
  }
  pairs.sort((p, q) => q.d - p.d);
  const center = centroid(maze);
  const rnd = mulberry32(seed);
  const startAt = Math.floor(rnd() * pairs.length);
  let chosen = pairs[startAt];
  let flip = rnd() < 0.5;
  for (let n = 0; n < pairs.length; n++) {
    const pair = pairs[(startAt + n) % pairs.length];
    const pairFlip = rnd() < 0.5;
    const start = pairFlip ? pair.b : pair.a;
    const end = pairFlip ? pair.a : pair.b;
    const steps = reaches(maze, start, end);
    if (steps >= 8) {
      chosen = pair;
      flip = pairFlip;
      break;
    }
  }
  const start = flip ? chosen.b : chosen.a;
  const end = flip ? chosen.a : chosen.b;
  maze.start = start;
  maze.end = end;
  maze.startOpen = outwardDir(maze, start, center.r, center.c);
  maze.endOpen = outwardDir(maze, end, center.r, center.c);
}
