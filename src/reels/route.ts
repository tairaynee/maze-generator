// The colored line and the mascot may only travel the real solution.
// solutionRoute() asks the maze solver for its breadth-first path, then
// rejects that path unless every step is an open passage, the walk never
// repeats a cell, and the length matches the shortest start-to-goal
// distance. A detour into a dead end fails those checks, so it is never
// drawn.

import { edgeKey, neighbor, solvePath, type Maze } from '../lib/maze';

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

export const REEL_MARGIN = 2;

export function passageDegree(maze: Maze, idx: number): number {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const nb = neighbor(idx, d, maze.cols, maze.rows);
    if (nb >= 0 && maze.passages.has(edgeKey(idx, nb))) n++;
  }
  return n;
}

function shortestDistance(maze: Maze): number {
  const { cols, rows, passages, start, end } = maze;
  const dist = new Int32Array(cols * rows).fill(-1);
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (cur === end) return dist[cur];
    for (let d = 0; d < 4; d++) {
      const nb = neighbor(cur, d, cols, rows);
      if (nb >= 0 && dist[nb] < 0 && passages.has(edgeKey(cur, nb))) {
        dist[nb] = dist[cur] + 1;
        q.push(nb);
      }
    }
  }
  return -1;
}

/** Throw unless `path` is the continuous shortest walk from start to goal. */
export function assertSolution(maze: Maze, path: number[]): void {
  if (path.length < 2) throw new Error('Solution is too short to animate.');
  if (path[0] !== maze.start) throw new Error('Solution does not start at the entrance.');
  if (path[path.length - 1] !== maze.end) {
    throw new Error('Solution does not end at the goal.');
  }
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (idx < 0 || idx >= maze.cells.length || !maze.cells[idx]) {
      throw new Error('Solution leaves the maze.');
    }
    if (seen.has(idx)) throw new Error('Solution revisits a cell.');
    seen.add(idx);
    if (i === 0) continue;
    const prev = path[i - 1];
    const pr = Math.floor(prev / maze.cols);
    const pc = prev % maze.cols;
    const r = Math.floor(idx / maze.cols);
    const c = idx % maze.cols;
    const dr = r - pr;
    const dc = c - pc;
    if (Math.abs(dr) + Math.abs(dc) !== 1) throw new Error('Solution jumps a cell.');
    let dir = -1;
    for (let d = 0; d < 4; d++) {
      if (DR[d] === dr && DC[d] === dc) dir = d;
    }
    if (dir < 0 || neighbor(prev, dir, maze.cols, maze.rows) !== idx) {
      throw new Error('Solution step is not a neighbor.');
    }
    if (!maze.passages.has(edgeKey(prev, idx))) {
      throw new Error('Solution crosses a wall.');
    }
  }
  const dist = shortestDistance(maze);
  if (dist < 0) throw new Error('The goal is not reachable.');
  if (path.length - 1 !== dist) {
    throw new Error('Solution is not the shortest start-to-goal route.');
  }
  for (let i = 1; i < path.length - 1; i++) {
    if (passageDegree(maze, path[i]) < 2) {
      throw new Error('Solution enters a dead end.');
    }
  }
}

export function solutionRoute(maze: Maze): number[] {
  const path = solvePath(maze);
  assertSolution(maze, path);
  return path;
}

export function routeStats(
  maze: Maze,
  route: number[],
): { steps: number; deadEnds: number } {
  const onRoute = new Set(route);
  let deadEnds = 0;
  for (let i = 0; i < maze.cells.length; i++) {
    if (!maze.cells[i] || onRoute.has(i)) continue;
    if (passageDegree(maze, i) === 1) deadEnds++;
  }
  return { steps: Math.max(0, route.length - 1), deadEnds };
}

export function stepDir(a: number, b: number, cols: number): number {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  for (let d = 0; d < 4; d++) {
    if (DR[d] === br - ar && DC[d] === bc - ac) return d;
  }
  return -1;
}

export interface RouteSpan {
  from: number;
  to: number;
  color: string;
}

/** Split the route at every turn and every `maxRun` cells along a straight. */
export function segmentRoute(
  route: number[],
  cols: number,
  colors: readonly string[],
): RouteSpan[] {
  if (route.length < 2 || colors.length === 0) return [];
  const maxRun = Math.max(3, Math.min(6, Math.round(route.length / 12)));
  const cuts = [0];
  let run = 0;
  let prev = stepDir(route[0], route[1], cols);
  for (let i = 1; i < route.length - 1; i++) {
    const d = stepDir(route[i], route[i + 1], cols);
    run += 1;
    if (d !== prev || run >= maxRun) {
      cuts.push(i);
      prev = d;
      run = 0;
    }
  }
  const spans: RouteSpan[] = [];
  for (let s = 0; s < cuts.length; s++) {
    spans.push({
      from: cuts[s],
      to: s + 1 < cuts.length ? cuts[s + 1] : route.length - 1,
      color: colors[s % colors.length],
    });
  }
  return spans;
}

export interface TrackPoint {
  x: number;
  y: number;
}

export function cellCenterLocal(maze: Maze, idx: number, cell: number): TrackPoint {
  const r = Math.floor(idx / maze.cols);
  const c = idx % maze.cols;
  return {
    x: (c - maze.bbox.minC + REEL_MARGIN + 0.5) * cell,
    y: (r - maze.bbox.minR + REEL_MARGIN + 0.5) * cell,
  };
}

const ODX = [0, 1, 0, -1];
const ODY = [-1, 0, 1, 0];

function gatePoint(maze: Maze, idx: number, openDir: number, cell: number): TrackPoint | null {
  if (openDir < 0) return null;
  const c = cellCenterLocal(maze, idx, cell);
  return {
    x: c.x + ODX[openDir] * cell * 0.95,
    y: c.y + ODY[openDir] * cell * 0.95,
  };
}

export interface ColoredTrack {
  points: TrackPoint[];
  spans: RouteSpan[];
}

/**
 * Polyline the animator is allowed to draw. Points are the entrance gate,
 * then each solution cell in order, then the exit gate. Nothing else.
 */
export function buildColoredTrack(
  maze: Maze,
  route: number[],
  cell: number,
  colors: readonly string[],
): ColoredTrack {
  const points: TrackPoint[] = [];
  const startGate = gatePoint(maze, maze.start, maze.startOpen, cell);
  if (startGate) points.push(startGate);
  for (const idx of route) points.push(cellCenterLocal(maze, idx, cell));
  const endGate = gatePoint(maze, maze.end, maze.endOpen, cell);
  if (endGate) points.push(endGate);

  const lead = startGate ? 1 : 0;
  const parts = segmentRoute(route, maze.cols, colors);
  const spans = parts.map((span, s) => ({
    from: s === 0 ? 0 : lead + span.from,
    to: s === parts.length - 1 ? points.length - 1 : lead + span.to,
    color: span.color,
  }));
  return { points, spans };
}
