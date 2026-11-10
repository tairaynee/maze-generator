import { hasWall, type Maze } from '../lib/maze';
import type { Palette } from './palettes';
import { MARKER_COLORS } from './palettes';
import {
  buildColoredTrack,
  REEL_MARGIN,
  type RouteSpan,
  type TrackPoint,
} from './route';
import {
  buildTimeline,
  clamp01,
  easeMarker,
  easeOutBack,
  easeOutCubic,
  type Timeline,
} from './timeline';

export const REEL_W = 1080;
export const REEL_H = 1920;

export interface ReelScene {
  maze: Maze;
  route: number[];
  palette: Palette;
  subject: string;
  seed: number;
  cache: { key: string; floor: HTMLCanvasElement; walls: HTMLCanvasElement } | null;
}

export interface ReelLook {
  countdown: boolean;
  endCard: boolean;
  duration: number;
  cta: string;
  handle: string;
  cover: HTMLImageElement | null;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

export function drawSplash(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#2c0a3d');
  g.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#1a0a24';
  ctx.fillStyle = '#ffe14a';
  ctx.font = `900 78px ${FONT}`;
  ctx.strokeText('Maze Reels', width / 2, height * 0.44);
  ctx.fillText('Maze Reels', width / 2, height * 0.44);
  ctx.font = `600 36px ${FONT}`;
  ctx.lineWidth = 8;
  ctx.fillStyle = '#ffffff';
  ctx.strokeText('Studio', width / 2, height * 0.5);
  ctx.fillText('Studio', width / 2, height * 0.5);
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: ReelScene,
  look: ReelLook,
  time: number,
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const t = Math.max(0, time);
  const timeline = buildTimeline(look.duration, look.countdown, look.endCard);
  const palette = scene.palette;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawBackground(ctx, palette, width, height, t);

  const layout = mazeLayout(scene.maze, width, height, look.countdown);
  const track = buildColoredTrack(scene.maze, scene.route, layout.cell, MARKER_COLORS);
  const points = track.points.map((p) => ({ x: p.x + layout.mx, y: p.y + layout.my }));
  const placed = placeTrack(points, track.spans);

  const pop = t < 0.45 ? 0.9 + 0.1 * easeOutBack(clamp01(t / 0.4)) : 1;
  ctx.save();
  if (pop !== 1) {
    const cx = layout.mx + layout.mw / 2;
    const cy = layout.my + layout.mh / 2;
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);
  }

  const layers = layerCache(scene, look, layout, width, height);
  ctx.drawImage(layers.floor, 0, 0);

  const walkT = walkProgress(t, timeline);
  const dist = walkT * placed.total;
  strokeTrack(ctx, placed, dist, Math.max(8, layout.cell * 0.62), 'rgba(0,0,0,0.72)', 1.28);
  strokeTrack(ctx, placed, dist, Math.max(7, layout.cell * 0.56), null, 1);

  ctx.drawImage(layers.walls, 0, 0);
  drawGates(ctx, scene, layout, t);
  ctx.restore();

  if (t >= timeline.walkEnd) {
    const burst = clamp01((t - timeline.walkEnd) / (timeline.burstEnd - timeline.walkEnd));
    drawBurst(ctx, placed, layout.cell, burst, scene.seed);
  }

  const head =
    walkT > 0 || t >= timeline.countEnd ? pointAlong(placed, dist) : placed.points[0];
  ctx.save();
  if (pop !== 1) {
    const cx = layout.mx + layout.mw / 2;
    const cy = layout.my + layout.mh / 2;
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);
  }
  drawMascot(ctx, head.x, head.y, layout.cell, t, walkT > 0 && walkT < 1);
  ctx.restore();
  drawGateLabels(ctx, scene, layout);

  if (t < timeline.hookEnd + 0.3) {
    const fade = t <= timeline.hookEnd ? 1 : 1 - (t - timeline.hookEnd) / 0.3;
    const scale = 0.96 + 0.04 * easeOutCubic(clamp01(t / 0.28));
    drawHook(ctx, width / 2, 148, fade, scale, palette);
  }

  if (look.countdown && t >= timeline.hookEnd && t < timeline.countEnd) {
    drawCountdown(ctx, t, timeline, width, palette);
  }

  if (look.endCard && t >= timeline.burstEnd) {
    const p = clamp01((t - timeline.burstEnd) / 0.4);
    drawEndCard(ctx, look, palette, width, height, p);
  }

  ctx.restore();
}

interface Layout {
  cell: number;
  mx: number;
  my: number;
  mw: number;
  mh: number;
}

function mazeLayout(maze: Maze, width: number, height: number, countdown: boolean): Layout {
  const top = countdown ? 470 : 300;
  const bottom = height - 210;
  const side = 48;
  const spanC = maze.bbox.maxC - maze.bbox.minC + 1 + REEL_MARGIN * 2;
  const spanR = maze.bbox.maxR - maze.bbox.minR + 1 + REEL_MARGIN * 2;
  const cell = Math.min((width - side * 2) / spanC, (bottom - top) / spanR);
  const mw = spanC * cell;
  const mh = spanR * cell;
  return {
    cell,
    mx: (width - mw) / 2,
    my: top + Math.max(0, (bottom - top - mh) / 2),
    mw,
    mh,
  };
}

interface Placed {
  points: TrackPoint[];
  spans: RouteSpan[];
  cum: number[];
  total: number;
}

function placeTrack(points: TrackPoint[], spans: RouteSpan[]): Placed {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { points, spans, cum, total: cum[cum.length - 1] || 0 };
}

function walkProgress(t: number, timeline: Timeline): number {
  if (t <= timeline.countEnd) return 0;
  if (t >= timeline.walkEnd) return 1;
  const span = timeline.walkEnd - timeline.countEnd;
  return easeMarker((t - timeline.countEnd) / span);
}

function layerCache(
  scene: ReelScene,
  look: ReelLook,
  layout: Layout,
  width: number,
  height: number,
): { floor: HTMLCanvasElement; walls: HTMLCanvasElement } {
  const light = isLight(scene.palette);
  const key = `${scene.palette.name}|${look.countdown ? 1 : 0}|${layout.cell.toFixed(2)}`;
  if (scene.cache?.key === key) return scene.cache;
  const floor = document.createElement('canvas');
  floor.width = width;
  floor.height = height;
  const walls = document.createElement('canvas');
  walls.width = width;
  walls.height = height;
  paintFloor(floor.getContext('2d')!, scene.maze, layout, light);
  paintWalls(walls.getContext('2d')!, scene.maze, layout, scene.palette.wall);
  scene.cache = { key, floor, walls };
  return scene.cache;
}

function paintFloor(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  layout: Layout,
  light: boolean,
): void {
  const { cell, mx, my } = layout;
  ctx.fillStyle = light ? 'rgba(255,252,245,0.88)' : 'rgba(255,255,255,0.06)';
  for (let i = 0; i < maze.cells.length; i++) {
    if (!maze.cells[i]) continue;
    const r = Math.floor(i / maze.cols);
    const c = i % maze.cols;
    const x = mx + (c - maze.bbox.minC + REEL_MARGIN) * cell;
    const y = my + (r - maze.bbox.minR + REEL_MARGIN) * cell;
    ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
  }
}

function paintWalls(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  layout: Layout,
  color: string,
): void {
  const { cell, mx, my } = layout;
  ctx.translate(mx, my);
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, cell * 0.22);
  for (let i = 0; i < maze.cells.length; i++) {
    if (!maze.cells[i]) continue;
    const r = Math.floor(i / maze.cols);
    const c = i % maze.cols;
    const x = (c - maze.bbox.minC + REEL_MARGIN) * cell;
    const y = (r - maze.bbox.minR + REEL_MARGIN) * cell;
    if (hasWall(maze, i, 0)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell, y);
    }
    if (hasWall(maze, i, 3)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cell);
    }
    if (hasWall(maze, i, 1)) {
      ctx.moveTo(x + cell, y);
      ctx.lineTo(x + cell, y + cell);
    }
    if (hasWall(maze, i, 2)) {
      ctx.moveTo(x, y + cell);
      ctx.lineTo(x + cell, y + cell);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.translate(0, Math.max(2, cell * 0.06));
  ctx.stroke();
  ctx.translate(0, -Math.max(2, cell * 0.06));
  ctx.strokeStyle = color;
  ctx.stroke();
}

function strokeTrack(
  ctx: CanvasRenderingContext2D,
  placed: Placed,
  dist: number,
  width: number,
  color: string | null,
  widthScale: number,
): void {
  for (const span of placed.spans) {
    const start = placed.cum[span.from] ?? 0;
    const end = placed.cum[span.to] ?? start;
    if (dist <= start) break;
    strokeSub(
      ctx,
      placed.points,
      span.from,
      span.to,
      Math.min(dist, end) - start,
      color ?? span.color,
      width * widthScale,
    );
  }
}

function strokeSub(
  ctx: CanvasRenderingContext2D,
  points: TrackPoint[],
  from: number,
  to: number,
  localDist: number,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let left = localDist;
  let x = points[from].x;
  let y = points[from].y;
  ctx.moveTo(x, y);
  for (let i = from + 1; i <= to; i++) {
    const nx = points[i].x;
    const ny = points[i].y;
    const seg = Math.hypot(nx - x, ny - y);
    if (seg < 1e-4) {
      x = nx;
      y = ny;
      continue;
    }
    if (left >= seg - 1e-3) {
      ctx.lineTo(nx, ny);
      left -= seg;
      x = nx;
      y = ny;
      if (left <= 1e-3) break;
    } else {
      const u = left / seg;
      ctx.lineTo(x + (nx - x) * u, y + (ny - y) * u);
      break;
    }
  }
  ctx.stroke();
}

function pointAlong(placed: Placed, dist: number): TrackPoint {
  const d = Math.max(0, Math.min(dist, placed.total));
  let i = 1;
  while (i < placed.cum.length && placed.cum[i] < d) i++;
  if (i >= placed.points.length) return placed.points[placed.points.length - 1];
  const span = placed.cum[i] - placed.cum[i - 1];
  const u = span < 1e-4 ? 0 : (d - placed.cum[i - 1]) / span;
  const a = placed.points[i - 1];
  const b = placed.points[i];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

const ODX = [0, 1, 0, -1];
const ODY = [-1, 0, 1, 0];

function drawGates(
  ctx: CanvasRenderingContext2D,
  scene: ReelScene,
  layout: Layout,
  t: number,
): void {
  const { maze } = scene;
  const { cell, mx, my } = layout;
  const start = gateScreen(maze, maze.start, maze.startOpen, cell, mx, my);
  const goal = gateScreen(maze, maze.end, maze.endOpen, cell, mx, my);
  drawDot(ctx, start.x, start.y, cell * 0.28, '#22e06a', '#102018');
  const throb = 1 + Math.sin(t * 4) * 0.08;
  drawStar(ctx, goal.x, goal.y, cell * 0.62 * throb, '#ffd24a', '#2a1600');
}

function drawGateLabels(
  ctx: CanvasRenderingContext2D,
  scene: ReelScene,
  layout: Layout,
): void {
  const { maze } = scene;
  const { cell, mx, my } = layout;
  const start = gateScreen(maze, maze.start, maze.startOpen, cell, mx, my);
  const goal = gateScreen(maze, maze.end, maze.endOpen, cell, mx, my);
  drawPill(
    ctx,
    'START',
    nudge(start, maze.startOpen, cell * 1.7),
    '#22e06a',
    '#062014',
    ctx.canvas,
  );
  drawPill(
    ctx,
    'GOAL',
    nudge(goal, maze.endOpen, cell * 2.05),
    '#ffd24a',
    '#2a1600',
    ctx.canvas,
  );
}

function gateScreen(
  maze: Maze,
  idx: number,
  openDir: number,
  cell: number,
  mx: number,
  my: number,
): TrackPoint {
  const r = Math.floor(idx / maze.cols);
  const c = idx % maze.cols;
  let x = mx + (c - maze.bbox.minC + REEL_MARGIN + 0.5) * cell;
  let y = my + (r - maze.bbox.minR + REEL_MARGIN + 0.5) * cell;
  if (openDir >= 0) {
    x += ODX[openDir] * cell * 0.95;
    y += ODY[openDir] * cell * 0.95;
  }
  return { x, y };
}

function nudge(p: TrackPoint, openDir: number, dist: number): TrackPoint {
  if (openDir < 0) return { x: p.x, y: p.y - dist };
  return { x: p.x + ODX[openDir] * dist, y: p.y + ODY[openDir] * dist };
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
): void {
  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(3, r * 0.28);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: TrackPoint,
  fill: string,
  ink: string,
  canvas: HTMLCanvasElement,
): void {
  ctx.font = `800 34px ${FONT}`;
  const w = ctx.measureText(text).width + 36;
  const h = 50;
  const x = Math.min(canvas.width - w / 2 - 16, Math.max(w / 2 + 16, at.x));
  const y = Math.min(canvas.height - h / 2 - 16, Math.max(h / 2 + 16, at.y));
  ctx.fillStyle = fill;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
): void {
  const halo = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.8);
  halo.addColorStop(0, 'rgba(255,210,80,0.55)');
  halo.addColorStop(1, 'rgba(255,210,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.46;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.fill();
  ctx.stroke();
}

function drawMascot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  t: number,
  walking: boolean,
): void {
  const r = cell * 0.62;
  const bob = Math.sin(t * (walking ? 16 : 3)) * cell * (walking ? 0.07 : 0.025);
  const sway = walking ? Math.sin(t * 16) * 0.12 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(sway);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.85, r * 0.7, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  const step = walking ? Math.sin(t * 16) : 0;
  ctx.fillStyle = '#2a1600';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, r * 0.78, r * 0.22, r * 0.12, step * 0.4, 0, Math.PI * 2);
  ctx.ellipse(r * 0.38, r * 0.78, r * 0.22, r * 0.12, -step * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe14a';
  ctx.strokeStyle = '#2a1600';
  ctx.lineWidth = Math.max(3, r * 0.16);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6d4';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.28, r * 0.48, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1600';
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.12, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.28, -r * 0.12, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8a9a';
  ctx.beginPath();
  ctx.ellipse(-r * 0.48, r * 0.12, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.48, r * 0.12, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a1600';
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.34, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
}

function drawBurst(
  ctx: CanvasRenderingContext2D,
  placed: Placed,
  cell: number,
  p: number,
  seed: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(p * Math.PI);
  ctx.shadowColor = '#fff6c8';
  ctx.shadowBlur = cell * (0.7 + p);
  strokeTrack(ctx, placed, placed.total, Math.max(8, cell * 0.7), '#fff4c4', 1);
  ctx.restore();
  const goal = placed.points[placed.points.length - 1];
  const colors = MARKER_COLORS;
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const n = (seed * 13 + i * 97) % 1000;
    const ang = (i / 28) * Math.PI * 2 + (n % 50) / 80;
    const speed = 180 + (n % 160);
    const u = easeOutCubic(p);
    const px = goal.x + Math.cos(ang) * speed * u;
    const py = goal.y + Math.sin(ang) * speed * u * 0.72 + 280 * p * p;
    ctx.globalAlpha = Math.max(0, 1 - p * 1.05);
    ctx.fillStyle = colors[i % colors.length];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang + p * 4);
    const s = 10 + (n % 12);
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-s / 2, -s * 0.18, s, s * 0.36);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawHook(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  scale: number,
  palette: Palette,
): void {
  const text = 'Can you solve this?';
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
  ctx.font = `900 78px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const { stroke, shadow } = contrast(palette.text);
  ctx.lineWidth = 16;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = palette.text;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCountdown(
  ctx: CanvasRenderingContext2D,
  t: number,
  timeline: Timeline,
  width: number,
  palette: Palette,
): void {
  const elapsed = t - timeline.hookEnd;
  const span = timeline.countEnd - timeline.hookEnd;
  const each = span / 3;
  const index = Math.min(2, Math.floor(elapsed / each));
  const digit = 3 - index;
  const sub = (elapsed - index * each) / each;
  let alpha = 1;
  let scale = 1;
  if (sub < 0.22) {
    const k = sub / 0.22;
    scale = easeOutBack(k);
    alpha = k;
  } else if (sub > 0.72) {
    const k = (sub - 0.72) / 0.28;
    alpha = 1 - k;
    scale = 1 + k * 0.25;
  }
  const cx = width / 2;
  const cy = 330;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.font = `900 168px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 18;
  ctx.strokeStyle = palette.ctaText;
  ctx.fillStyle = palette.ctaBg;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24;
  ctx.strokeText(String(digit), cx, cy);
  ctx.fillText(String(digit), cx, cy);
  ctx.restore();
}

function drawEndCard(
  ctx: CanvasRenderingContext2D,
  look: ReelLook,
  palette: Palette,
  width: number,
  height: number,
  p: number,
): void {
  const scale = 0.92 + 0.08 * easeOutBack(p);
  const cta = look.cta.trim() || 'Follow for a new maze every day';
  const cardW = 920;
  ctx.font = `800 52px ${FONT}`;
  const lines = wrapLines(ctx, cta, cardW - 120);
  const cover = look.cover && look.cover.complete && look.cover.naturalWidth > 0 ? look.cover : null;
  const imgH = cover ? 460 : 0;
  const textH = lines.length * 66;
  const handleH = look.handle.trim() ? 64 : 0;
  const cardH = 72 + imgH + (cover ? 28 : 0) + textH + handleH;
  const x = (width - cardW) / 2;
  const y = Math.max(520, height - cardH - 150);
  const rise = (1 - p) * 48;

  ctx.save();
  const scrim = ctx.createLinearGradient(0, y - 140, 0, height);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(0.45, `rgba(0,0,0,${0.35 * p})`);
  scrim.addColorStop(1, `rgba(0,0,0,${0.62 * p})`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, y - 140, width, height - (y - 140));
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = p;
  ctx.translate(width / 2, y + cardH / 2 + rise);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -(y + cardH / 2));
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = contrast(palette.ctaBg).stroke;
  ctx.lineWidth = 8;
  roundRect(ctx, x, y, cardW, cardH, 40);
  ctx.fill();
  ctx.stroke();

  let cursor = y + 40;
  if (cover) {
    const boxX = x + 40;
    const boxW = cardW - 80;
    const boxH = imgH;
    ctx.save();
    roundRect(ctx, boxX, cursor, boxW, boxH, 28);
    ctx.clip();
    const scaleFit = Math.min(boxW / cover.naturalWidth, boxH / cover.naturalHeight);
    const dw = cover.naturalWidth * scaleFit;
    const dh = cover.naturalHeight * scaleFit;
    ctx.drawImage(cover, boxX + (boxW - dw) / 2, cursor + (boxH - dh) / 2, dw, dh);
    ctx.restore();
    cursor += boxH + 36;
  }

  ctx.fillStyle = palette.ctaText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 52px ${FONT}`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, cursor + 33 + i * 66);
  }
  cursor += textH;
  const handle = look.handle.trim();
  if (handle) {
    ctx.font = `700 36px ${FONT}`;
    ctx.globalAlpha = p * 0.9;
    ctx.fillText(handle, width / 2, cursor + 36);
  }
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  width: number,
  height: number,
  t: number,
): void {
  const drift = Math.sin(t * 0.5) * 0.04;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, palette.bg);
  g.addColorStop(0.55, mix(palette.bg, palette.bgEnd, 0.5 + drift));
  g.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const vg = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.3,
    width / 2,
    height / 2,
    height * 0.72,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function isLight(palette: Palette): boolean {
  return (lum(palette.bg) + lum(palette.bgEnd)) / 2 > 0.62;
}

function lum(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function contrast(fill: string): { stroke: string; shadow: string } {
  return lum(fill) > 0.55
    ? { stroke: '#141018', shadow: 'rgba(0,0,0,0.55)' }
    : { stroke: '#ffffff', shadow: 'rgba(255,255,255,0.4)' };
}

function mix(a: string, b: string, t: number): string {
  const pa = rgb(a);
  const pb = rgb(b);
  const u = Math.max(0, Math.min(1, t));
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * u);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}
