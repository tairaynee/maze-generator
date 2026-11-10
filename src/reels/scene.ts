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

const FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

export function drawSplash(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#3E5EA8');
  g.addColorStop(0.55, '#734868');
  g.addColorStop(1, '#8A3850');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 24;
  track(ctx, '-0.045em');
  ctx.font = `620 92px ${FONT}`;
  ctx.fillText('Maze Reels', width / 2, height * 0.46);
  track(ctx, '0.18em');
  ctx.font = `560 28px ${FONT}`;
  ctx.fillText('STUDIO', width / 2, height * 0.53);
  track(ctx, '0px');
  ctx.shadowBlur = 0;
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

  const band = captionBand(look);
  const layout = mazeLayout(scene.maze, width, height, look.countdown, band);
  const track = buildColoredTrack(scene.maze, scene.route, layout.cell, MARKER_COLORS);
  const points = track.points.map((p) => ({ x: p.x + layout.mx, y: p.y + layout.my }));
  const placed = placeTrack(points, track.spans);

  const pop = t < 0.4 ? 0.97 + 0.03 * easeOutCubic(clamp01(t / 0.35)) : 1;
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
  strokeVivid(ctx, placed, dist, Math.max(8, layout.cell * 0.58));

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
  drawBead(ctx, head.x, head.y, layout.cell, colorAt(placed, dist), walkT > 0 && walkT < 1, t);
  ctx.restore();
  drawGateLabels(ctx, scene, layout, height - band - 16);

  if (t < timeline.hookEnd) {
    const fade =
      t < timeline.hookEnd - 0.22 ? 1 : 1 - (t - (timeline.hookEnd - 0.22)) / 0.22;
    const rise = (1 - easeOutCubic(clamp01(t / 0.35))) * 14;
    drawHook(ctx, width / 2, 188 + rise, fade, palette);
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

function captionBand(look: ReelLook): number {
  if (!look.endCard) return 180;
  return look.cover ? 800 : 500;
}

function mazeLayout(
  maze: Maze,
  width: number,
  height: number,
  countdown: boolean,
  band: number,
): Layout {
  const top = countdown ? 540 : 420;
  const bottom = height - band;
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
  const key = `${scene.palette.name}|${look.countdown ? 1 : 0}|${layout.cell.toFixed(2)}`;
  if (scene.cache?.key === key) return scene.cache;
  const floor = document.createElement('canvas');
  floor.width = width;
  floor.height = height;
  const walls = document.createElement('canvas');
  walls.width = width;
  walls.height = height;
  paintFloor(floor.getContext('2d')!, scene.maze, layout);
  paintWalls(walls.getContext('2d')!, scene.maze, layout, scene.palette.wall);
  scene.cache = { key, floor, walls };
  return scene.cache;
}

function paintFloor(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  layout: Layout,
): void {
  const { cell, mx, my } = layout;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
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
  ctx.strokeStyle = color;
  ctx.stroke();
}

function strokeVivid(
  ctx: CanvasRenderingContext2D,
  placed: Placed,
  dist: number,
  width: number,
): void {
  for (const span of placed.spans) {
    const start = placed.cum[span.from] ?? 0;
    const end = placed.cum[span.to] ?? start;
    if (dist <= start) break;
    const local = Math.min(dist, end) - start;
    ctx.save();
    ctx.shadowColor = span.color;
    ctx.shadowBlur = width * 0.7;
    ctx.globalAlpha = 0.95;
    strokeSub(ctx, placed.points, span.from, span.to, local, span.color, width);
    ctx.restore();
    strokeSub(ctx, placed.points, span.from, span.to, local, 'rgba(255,255,255,0.55)', width * 0.28);
  }
}

function colorAt(placed: Placed, dist: number): string {
  for (const span of placed.spans) {
    const end = placed.cum[span.to] ?? 0;
    if (dist <= end) return span.color;
  }
  return placed.spans[placed.spans.length - 1]?.color ?? MARKER_COLORS[0];
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
  const { maze, palette } = scene;
  const { cell, mx, my } = layout;
  const start = gateScreen(maze, maze.start, maze.startOpen, cell, mx, my);
  const goal = gateScreen(maze, maze.end, maze.endOpen, cell, mx, my);
  drawRing(ctx, start.x, start.y, cell * 0.34, palette.text, false, t);
  drawRing(ctx, goal.x, goal.y, cell * 0.46, palette.text, true, t);
}

function drawGateLabels(
  ctx: CanvasRenderingContext2D,
  scene: ReelScene,
  layout: Layout,
  maxY: number,
): void {
  const { maze, palette } = scene;
  const { cell, mx, my } = layout;
  const start = gateScreen(maze, maze.start, maze.startOpen, cell, mx, my);
  const goal = gateScreen(maze, maze.end, maze.endOpen, cell, mx, my);
  drawTag(ctx, 'Start', nudge(start, maze.startOpen, cell * 1.35), palette.text, ctx.canvas, maxY);
  drawTag(ctx, 'Goal', nudge(goal, maze.endOpen, cell * 1.55), palette.text, ctx.canvas, maxY);
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

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  glow: boolean,
  t: number,
): void {
  if (glow) {
    const pulse = 0.28 + 0.12 * Math.sin(t * 3);
    const halo = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
    halo.addColorStop(0, withAlpha(color, pulse));
    halo.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, r * 0.16);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, Math.max(2, r * 0.22), 0, Math.PI * 2);
  ctx.fill();
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: TrackPoint,
  color: string,
  canvas: HTMLCanvasElement,
  maxY: number,
): void {
  ctx.save();
  ctx.font = `600 26px ${FONT}`;
  track(ctx, '0.02em');
  const w = ctx.measureText(text).width;
  const x = Math.min(canvas.width - w / 2 - 28, Math.max(w / 2 + 28, at.x));
  const y = Math.min(maxY, Math.max(36, at.y));
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  color: string,
  walking: boolean,
  t: number,
): void {
  const r = cell * 0.36;
  const bob = Math.sin(t * (walking ? 9 : 2.4)) * cell * (walking ? 0.035 : 0.012);
  ctx.save();
  ctx.translate(x, y + bob);
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
  glow.addColorStop(0, withAlpha(color, 0.7));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  const sphere = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, 0, 0, r);
  sphere.addColorStop(0, '#ffffff');
  sphere.addColorStop(0.42, color);
  sphere.addColorStop(1, shade(color, 0.62));
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.globalAlpha = 0.22 * Math.sin(p * Math.PI);
  strokeVivid(ctx, placed, placed.total, Math.max(10, cell * 0.72));
  ctx.restore();
  const goal = placed.points[placed.points.length - 1];
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const n = (seed * 13 + i * 97) % 1000;
    const ang = (i / 18) * Math.PI * 2 + (n % 40) / 90;
    const speed = 140 + (n % 120);
    const u = easeOutCubic(p);
    const px = goal.x + Math.cos(ang) * speed * u;
    const py = goal.y + Math.sin(ang) * speed * u * 0.85;
    ctx.globalAlpha = Math.max(0, 0.9 - p);
    ctx.fillStyle = MARKER_COLORS[i % MARKER_COLORS.length];
    ctx.beginPath();
    ctx.arc(px, py, 5 + (n % 7) * (1 - p * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHook(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  palette: Palette,
): void {
  const lines = ['Can you', 'solve this?'];
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.text;
  ctx.shadowColor = isLight(palette) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 16;
  track(ctx, '-0.03em');
  ctx.font = `620 68px ${FONT}`;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * 92);
  });
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
  const cy = 390;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.font = `560 210px ${FONT}`;
  track(ctx, '-0.06em');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.text;
  ctx.shadowColor = isLight(palette) ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 20;
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
  const cta = look.cta.trim() || 'Follow for a new maze every day';
  const cover = look.cover && look.cover.complete && look.cover.naturalWidth > 0 ? look.cover : null;
  const band = captionBand(look);
  const bandTop = height - band;
  const side = 96;
  const maxW = width - side * 2;
  const handle = look.handle.trim();
  const imgH = cover ? 300 : 0;
  const bottomPad = 96;
  const topPad = cover ? 36 : 72;
  const textMax = band - topPad - bottomPad - imgH - (cover ? 28 : 0) - (handle ? 64 : 0);
  const fitted = fitCaption(ctx, cta, maxW, Math.max(80, textMax));
  const textH = fitted.lines.length * fitted.lineH;
  const blockH = imgH + (cover ? 28 : 0) + textH + (handle ? 64 : 0);
  const y = bandTop + Math.max(topPad, (band - bottomPad - blockH) / 2);
  const rise = (1 - easeOutCubic(p)) * 20;

  ctx.save();
  ctx.globalAlpha = p;
  ctx.translate(0, rise);
  let cursor = y;
  if (cover) {
    const boxW = Math.min(560, maxW);
    const boxX = (width - boxW) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, boxX, cursor, boxW, imgH, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    const scaleFit = Math.min(boxW / cover.naturalWidth, imgH / cover.naturalHeight);
    const dw = cover.naturalWidth * scaleFit;
    const dh = cover.naturalHeight * scaleFit;
    ctx.drawImage(cover, boxX + (boxW - dw) / 2, cursor + (imgH - dh) / 2, dw, dh);
    ctx.restore();
    cursor += imgH + 28;
  }

  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = isLight(palette) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 12;
  track(ctx, '-0.02em');
  ctx.font = `600 ${fitted.size}px ${FONT}`;
  for (let i = 0; i < fitted.lines.length; i++) {
    ctx.fillText(fitted.lines[i], width / 2, cursor + fitted.lineH * 0.5 + i * fitted.lineH);
  }
  if (handle) {
    track(ctx, '0.06em');
    ctx.font = `560 26px ${FONT}`;
    ctx.globalAlpha = p * 0.8;
    ctx.fillText(handle, width / 2, cursor + textH + 40);
  }
  ctx.restore();
}

function fitCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
): { size: number; lines: string[]; lineH: number } {
  let size = 54;
  let lines = [text];
  let lineH = Math.round(size * 1.42);
  for (; size >= 36; size -= 2) {
    ctx.font = `600 ${size}px ${FONT}`;
    track(ctx, '-0.02em');
    lines = wrapLines(ctx, text, maxWidth);
    lineH = Math.round(size * 1.42);
    if (lines.length * lineH <= maxHeight) break;
  }
  return { size, lines, lineH };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  width: number,
  height: number,
  t: number,
): void {
  const drift = Math.sin(t * 0.35) * 0.03;
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, palette.bg);
  g.addColorStop(0.48 + drift, palette.bgMid);
  g.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const orb = ctx.createRadialGradient(width * 0.15, height * 0.08, 0, width * 0.15, height * 0.08, width * 0.75);
  orb.addColorStop(0, 'rgba(255,255,255,0.22)');
  orb.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = orb;
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

function track(ctx: CanvasRenderingContext2D, spacing: string): void {
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * amount)));
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}
