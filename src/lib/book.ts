import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { generateMaze, type Maze } from './maze';
import { renderToCanvas } from './render';
import { fetchMarkers, type Markers } from './markers';
import { fetchSilhouette, maskGrid, resetCatalogClaims } from './shape';
import { baseSubjectFor, displaySubjectFor, subjectFor } from './themes';

export type SolutionMode = 'after-each' | 'at-end';
export type PageSize = 'a4' | '5x8' | '6x9';

/** One puzzle: its own AI shape plus its own start/end cartoons. */
export interface BookMaze {
  maze: Maze;
  markers: Markers;
  subject: string;
  /** Where the silhouette came from — 'icon' = on-theme Iconify, 'procedural'
   *  = generic fallback. Surfaced in the UI/PDF so users can tell at a
   *  glance whether a particular shape is on-theme. */
  source: 'icon' | 'procedural';
  /** The picked catalog slug (e.g. 'mdi:polar-bear') if source==='icon'.
   *  Lets the banner detect when two mazes use the same shape even when
   *  their displayed subject names differ. */
  shapeKey?: string;
  /** Internal pool index — used to keep books free of subject repeats. */
  subjIdx: number;
}

/** A printable text page: instructions, intro, section title, or blank notes. */
export interface TextPage {
  id: string;
  /** Optional heading. Empty means the page has no title. */
  title: string;
  /** Multi-line body. Empty is a blank page. */
  body: string;
}

/** How an uploaded picture sits on the trim. Aspect ratio is kept either way,
 *  and the picture is never cropped.
 *  - `full`: scaled to the whole page. A cover drawn for this trim fills the
 *    sheet; other shapes get a cream letterbox.
 *  - `inset`: same contain-fit inside a margin of IMAGE_INSET_PERCENT of the
 *    page width, on the cream paper used for text pages.
 */
export type ImageFit = 'full' | 'inset';

/** Minimum margin for `inset` image pages, as a percent of page width. */
export const IMAGE_INSET_PERCENT = 7;

/** Cream paper shared by text pages and image letterboxing. */
const PAGE_PAPER = '#fbf7f0';
const PAGE_PAPER_RGB = { r: 251, g: 247, b: 240 } as const;

/** An uploaded picture used as its own book page (cover or interior). */
export interface ImagePage {
  id: string;
  /** File name without its extension, shown in the page list. */
  name: string;
  /** PNG or JPEG data URL. WebP and JPEG uploads are stored as JPEG. */
  dataUrl: string;
  width: number;
  height: number;
  /** `cover` is the book cover. When a cover is page 1, PDF export uses it
   *  as the first page and skips the generated title page. */
  role: 'cover' | 'image';
  fit: ImageFit;
}

/** One slot in the book, in reading order. Mazes, text, and images share this list. */
export type BookPage =
  | { kind: 'maze'; id: string; maze: BookMaze }
  | ({ kind: 'text' } & TextPage)
  | ({ kind: 'image' } & ImagePage);

interface BuildOpts {
  skipAI?: boolean;
  forceProcedural?: boolean;
  noMarkers?: boolean;
  salt?: number;
}

/** Build a single maze at a fixed subject index. Caller picks the index so
 *  the whole book stays free of subject repeats. `bookSlot` is the stable
 *  position in the final book (0..count-1) — used as the icon rotation
 *  so retries on different subjects still pick the slot's own catalog
 *  entry, preventing the wrap-around repeats that happened when
 *  retries pushed subjIdx past the catalog length. */
async function buildAt(
  keyword: string,
  baseSeed: number,
  subjIdx: number,
  bookSlot: number,
  cols: number,
  attempts: number,
  opts: BuildOpts = {},
): Promise<BookMaze | null> {
  const subject = subjectFor(keyword, subjIdx, baseSeed);
  const base = baseSubjectFor(keyword, subjIdx, baseSeed);
  const display = displaySubjectFor(keyword, subjIdx, baseSeed);
  const salt = opts.salt ?? 0;
  for (let a = 0; a < attempts; a++) {
    const seed = ((baseSeed + subjIdx * 131 + (a + salt) * 977) >>> 0) || 1;
    const markerSeed = ((seed * 2654435761) >>> 0) || 7;
    try {
      const [sil, markers] = await Promise.all([
        fetchSilhouette(subject, seed, {
          skipAI: opts.skipAI,
          forceProcedural: opts.forceProcedural,
          iconSearch: base,
          themeFallback: keyword,
          // Icon picked deterministically from the book slot, NOT the
          // (potentially retried) subjIdx. Slot 0 -> catalog[0], slot
          // 1 -> catalog[1], etc. — every slot in a 500-maze book picks
          // a different catalog entry regardless of subject retries.
          iconRotation: bookSlot,
        }),
        opts.noMarkers
          ? Promise.resolve({ start: null, end: null })
          : fetchMarkers(subject, markerSeed),
      ]);
      const maze = generateMaze(
        maskGrid(sil, cols, cols),
        cols,
        cols,
        seed,
      );
      // Prefer the slug-derived subject (always matches the rendered
       // icon). Fall back to the themes.ts display name only when the
       // silhouette came from the procedural fallback (no icon to name).
      return {
        maze,
        markers,
        subject: sil.subject ?? display,
        source: sil.source,
        shapeKey: sil.shapeKey,
        subjIdx,
      };
    } catch {
      /* same subject, new seed */
    }
  }
  return null;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const slugify = (s: string) =>
  s.trim().replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '') ||
  'maze';

const titleCase = (s: string) =>
  s.trim().replace(/\b\w/g, (m) => m.toUpperCase());

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Re-roll a single slot — lands on a fresh subject index past everything
 *  already in use, plus a salt offset so repeated clicks keep moving. */
export async function regenerateOne(
  keyword: string,
  baseSeed: number,
  cols: number,
  salt: number,
  used: Set<number>,
  bookSlot: number,
): Promise<BookMaze | null> {
  let maxUsed = -1;
  for (const u of used) if (u > maxUsed) maxUsed = u;
  let candidate = maxUsed + 1 + (salt % 13);
  while (used.has(candidate)) candidate++;
  for (let rot = 0; rot < 10; rot++) {
    const bm = await buildAt(keyword, baseSeed, candidate, bookSlot, cols, 3, { salt });
    if (bm) return bm;
    do {
      candidate++;
    } while (used.has(candidate));
  }
  return null;
}

/**
 * Every maze gets its own freshly-generated AI silhouette of the keyword
 * AND its own start/end cartoon characters (all from different seeds), so
 * no two puzzles share a shape or a pair of symbols. Fetches run through a
 * small concurrency pool to stay reasonably fast.
 */
export interface BatchResult {
  book: BookMaze[];
  warning?: string;
}

export async function generateBatch(
  keyword: string,
  baseSeed: number,
  cols: number,
  count: number,
  onProgress: (done: number, total: number) => void,
): Promise<BatchResult> {
  // Fresh per-batch claim state in shape.ts so this book's slot-icon
  // mapping isn't polluted by previous batches.
  resetCatalogClaims(keyword);
  // 2 concurrent fetches — running ANY harder against Iconify caused
  // the failed-set to grow and shrink the unique-icon pool. Slower
  // but every catalog entry gets a real chance to load cleanly.
  const CONCURRENCY = 2;
  const results: (BookMaze | null)[] = new Array(count).fill(null);
  let completed = 0;
  // Reserve the first `count` pool positions for the book; any rotations
  // pull from beyond so no two slots ever share a subject.
  const used = new Set<number>();
  for (let i = 0; i < count; i++) used.add(i);
  let nextFree = count;
  const slotIdx: number[] = Array.from({ length: count }, (_, i) => i);

  async function fillSlot(
    slot: number,
    attempts: number,
    slotCols: number,
    opts: BuildOpts,
  ) {
    for (let rot = 0; rot < 4; rot++) {
      const bm = await buildAt(
        keyword,
        baseSeed,
        slotIdx[slot],
        slot,           // stable book slot — drives the catalog pick
        slotCols,
        attempts,
        opts,
      );
      if (bm) {
        results[slot] = bm;
        completed++;
        onProgress(completed, count);
        return;
      }
      // current subject couldn't render — rotate to a fresh unused index
      const fresh = nextFree++;
      used.add(fresh);
      slotIdx[slot] = fresh;
    }
    // GUARANTEE: every slot fills. After all icon-based attempts failed,
    // request a procedural silhouette so the book has exactly `count` mazes.
    const fallback = await buildAt(
      keyword,
      baseSeed,
      slotIdx[slot],
      slot,
      slotCols,
      2,
      { ...opts, forceProcedural: true },
    );
    if (fallback) {
      results[slot] = fallback;
      completed++;
      onProgress(completed, count);
    }
  }

  async function runPool(
    slots: number[],
    attempts: number,
    slotCols: number,
    pool: number,
    opts: BuildOpts = {},
  ) {
    let cursor = 0;
    async function worker() {
      for (;;) {
        const k = cursor++;
        if (k >= slots.length) return;
        await fillSlot(slots[k], attempts, slotCols, opts);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(pool, slots.length) }, worker),
    );
  }

  const missingSlots = () => {
    const m: number[] = [];
    for (let i = 0; i < count; i++) if (!results[i]) m.push(i);
    return m;
  };

  // Round 1: requested density, AI on. Two attempts per subject — failures
  // are caught by the refill rounds below, so we don't want to spend extra
  // time hammering the same unreliable subject up front.
  await runPool(
    Array.from({ length: count }, (_, i) => i),
    2,
    cols,
    CONCURRENCY,
  );

  // Refills: gradually ease density and let the rate limiter recover.
  // Last round drops the AI shape entirely so the slot is guaranteed to fill.
  // Single quick refill round for the rare case a maze fails generation
  // (e.g. an undersized shape after sampling). With the procedural
  // fallback in shape.ts, image fetch failures never get this far.
  const refills: Array<{
    cols: number;
    attempts: number;
    pool: number;
    waitMs: number;
    opts: BuildOpts;
  }> = [
    { cols: Math.floor(cols * 0.7), attempts: 3, pool: 4, waitMs: 500, opts: { skipAI: true } },
  ];

  for (const r of refills) {
    if (completed >= count) break;
    const missing = missingSlots();
    if (!missing.length) break;
    if (r.waitMs) await new Promise<void>((res) => setTimeout(res, r.waitMs));
    await runPool(missing, r.attempts, Math.max(22, r.cols), r.pool, r.opts);
  }

  const book = results.filter((m): m is BookMaze => m !== null);
  if (book.length === 0) {
    throw new Error(
      `Couldn't build any "${keyword}" shapes. Try another keyword or a lower difficulty.`,
    );
  }
  if (book.length < count) {
    return {
      book,
      warning: `Built ${book.length} of ${count} mazes — the image service rate-limited a few. Open or re-export anytime; the ${book.length} mazes are ready to use.`,
    };
  }
  return { book };
}

function placeImage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  title: string,
) {
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = Math.max(28, pw * 0.07);
  const titleSize = Math.min(20, Math.max(12, pw * 0.045));

  // Fixed header near the top — same spot on every page.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(titleSize);
  pdf.text(title, pw / 2, margin + titleSize, { align: 'center' });

  // Body = the area below the header; the maze is centred within it.
  const bodyTop = margin + titleSize + 18;
  const bodyBottom = ph - margin;
  const availW = pw - margin * 2;
  const availH = bodyBottom - bodyTop;
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const x = (pw - w) / 2;
  const y = bodyTop + (availH - h) / 2;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST');
}

const PAGE_FORMATS: Record<PageSize, 'a4' | [number, number]> = {
  a4: 'a4',
  '5x8': [5 * 72, 8 * 72],
  '6x9': [6 * 72, 9 * 72],
};

/** Trim size in inches. A4 uses the exact 210×297 mm sheet. */
const PAGE_INCHES: Record<PageSize, { w: number; h: number }> = {
  a4: { w: 210 / 25.4, h: 297 / 25.4 },
  '5x8': { w: 5, h: 8 },
  '6x9': { w: 6, h: 9 },
};

export function pageAspectRatio(size: PageSize): string {
  const { w, h } = PAGE_INCHES[size];
  return `${w} / ${h}`;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTextPage(title = '', body = ''): BookPage {
  return { kind: 'text', id: createId('text'), title, body };
}

const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_IMAGE_EDGE = 3200;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

function isAcceptedImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (IMAGE_MIME.has(type)) return true;
  if (type && type !== 'application/octet-stream') return false;
  return IMAGE_EXT.test(file.name);
}

function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read that image.'));
    };
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

function rasterize(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  mime: 'image/png' | 'image/jpeg',
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = PAGE_PAPER;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const dataUrl =
    mime === 'image/jpeg' ? canvas.toDataURL(mime, 0.92) : canvas.toDataURL(mime);
  return { dataUrl, width, height };
}

async function decodeOriented(file: File): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to an <img> decode */
    }
  }
  return loadImage(await readFileAsDataURL(file));
}

function closeSource(source: CanvasImageSource) {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    source.close();
  }
}

function fileStem(name: string, fallback: string): string {
  const stem = name.replace(/\.[^.]+$/, '').trim();
  return stem || fallback;
}

function isPngFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/png') return true;
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/webp') return false;
  return /\.png$/i.test(file.name);
}

/** Read a PNG, JPEG, or WebP file into an image page. Large pictures are
 *  scaled down so a cover stays sharp on A4 without a huge PDF. */
export async function createImagePage(
  file: File,
  role: 'cover' | 'image',
): Promise<BookPage> {
  const label = file.name || 'That file';
  if (!isAcceptedImageFile(file)) {
    throw new Error(`“${label}” isn’t a PNG, JPEG, or WebP image.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`“${label}” is larger than 40 MB. Use a smaller image.`);
  }
  const name = fileStem(file.name, role === 'cover' ? 'Cover' : 'Image');
  let dataUrl: string;
  let width: number;
  let height: number;

  if (isPngFile(file)) {
    dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);
    width = img.naturalWidth;
    height = img.naturalHeight;
    if (!width || !height) throw new Error(`“${label}” could not be read.`);
    if (Math.max(width, height) > MAX_IMAGE_EDGE) {
      const raster = rasterize(img, width, height, 'image/png');
      dataUrl = raster.dataUrl;
      width = raster.width;
      height = raster.height;
    }
  } else {
    const source = await decodeOriented(file);
    try {
      const size = sourceSize(source);
      width = size.width;
      height = size.height;
      if (!width || !height) throw new Error(`“${label}” could not be read.`);
      const raster = rasterize(source, width, height, 'image/jpeg');
      dataUrl = raster.dataUrl;
      width = raster.width;
      height = raster.height;
    } finally {
      closeSource(source);
    }
  }

  return {
    kind: 'image',
    id: createId(role === 'cover' ? 'cover' : 'image'),
    name,
    dataUrl,
    width,
    height,
    role,
    fit: role === 'cover' ? 'full' : 'inset',
  };
}

function mazeToPage(maze: BookMaze): BookPage {
  return { kind: 'maze', id: createId('maze'), maze };
}

/**
 * Replace maze slots with a new batch. Text and image pages stay where
 * they are. Extra mazes are inserted after the last maze so a trailing
 * text or image page stays at the end. A book that is only text and
 * image pages gets the new mazes appended after them.
 */
export function replaceMazeBatch(pages: BookPage[], mazes: BookMaze[]): BookPage[] {
  const fresh = mazes.map(mazeToPage);
  let mi = 0;
  const out: BookPage[] = [];
  for (const p of pages) {
    if (p.kind !== 'maze') out.push(p);
    else if (mi < fresh.length) out.push(fresh[mi++]);
  }
  if (mi < fresh.length) {
    const rest = fresh.slice(mi);
    let insertAt = out.length;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].kind === 'maze') {
        insertAt = i + 1;
        break;
      }
    }
    out.splice(insertAt, 0, ...rest);
  }
  return out;
}

function asLines(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function wrapCanvasLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  const breakLong = (word: string): string => {
    let chunk = '';
    for (const ch of word) {
      const trial = chunk + ch;
      if (chunk && ctx.measureText(trial).width > maxW) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = trial;
      }
    }
    return chunk;
  };
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(trial).width <= maxW) {
      cur = trial;
      continue;
    }
    if (cur) lines.push(cur);
    cur = ctx.measureText(word).width > maxW ? breakLong(word) : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** White page at the trim size, for ZIP / single-page PNG export. */
export function renderTextPageCanvas(
  title: string,
  body: string,
  pageSize: PageSize,
  dpi = 140,
): HTMLCanvasElement {
  const spec = PAGE_INCHES[pageSize];
  const w = Math.max(1, Math.round(spec.w * dpi));
  const h = Math.max(1, Math.round(spec.h * dpi));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAGE_PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#141820';

  const margin = Math.max(28, w * 0.1);
  const maxW = w - margin * 2;
  const bottom = h - margin;
  let y = margin;

  const heading = title.trim();
  if (heading) {
    const titleSize = Math.min(48, Math.max(22, w * 0.048));
    ctx.font = `bold ${titleSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lineH = titleSize * 1.25;
    for (const line of wrapCanvasLine(ctx, heading, maxW)) {
      if (y + lineH > bottom) return canvas;
      ctx.fillText(line, w / 2, y);
      y += lineH;
    }
    y += titleSize * 0.45;
  }

  const bodySize = Math.min(28, Math.max(15, w * 0.03));
  ctx.font = `${bodySize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lineH = bodySize * 1.45;
  const paragraphs = body.replace(/\r\n/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += lineH * 0.65;
      continue;
    }
    for (const line of wrapCanvasLine(ctx, para, maxW)) {
      if (y + lineH > bottom) return canvas;
      ctx.fillText(line, margin, y);
      y += lineH;
    }
  }
  return canvas;
}

/** Where a picture lands on a page of `pageW`×`pageH`, in those same units.
 *  Image pixel size is only used for aspect ratio. */
export function imagePlacement(
  pageW: number,
  pageH: number,
  imgW: number,
  imgH: number,
  fit: ImageFit,
): { x: number; y: number; w: number; h: number } {
  if (!(imgW > 0) || !(imgH > 0) || !(pageW > 0) || !(pageH > 0)) {
    return { x: 0, y: 0, w: pageW, h: pageH };
  }
  const margin = fit === 'full' ? 0 : (pageW * IMAGE_INSET_PERCENT) / 100;
  const availW = Math.max(1, pageW - margin * 2);
  const availH = Math.max(1, pageH - margin * 2);
  const scale = Math.min(availW / imgW, availH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** CSS insets, as percents of the page box, matching `inset` placement.
 *  Horizontal percent is of the width; vertical percent is of the height,
 *  so both edges are the same distance. */
export function imageInsetPercents(size: PageSize): { x: number; y: number } {
  const { w, h } = PAGE_INCHES[size];
  return { x: IMAGE_INSET_PERCENT, y: (IMAGE_INSET_PERCENT * w) / h };
}

/** Cream page at the trim size with the picture contained on it. */
export async function renderImagePageCanvas(
  src: string,
  imgW: number,
  imgH: number,
  pageSize: PageSize,
  fit: ImageFit,
  dpi = 140,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const spec = PAGE_INCHES[pageSize];
  const w = Math.max(1, Math.round(spec.w * dpi));
  const h = Math.max(1, Math.round(spec.h * dpi));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw that image page.');
  ctx.fillStyle = PAGE_PAPER;
  ctx.fillRect(0, 0, w, h);
  const natW = imgW > 0 ? imgW : img.naturalWidth;
  const natH = imgH > 0 ? imgH : img.naturalHeight;
  const place = imagePlacement(w, h, natW, natH, fit);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, place.x, place.y, place.w, place.h);
  return canvas;
}

/** Vector text on the current PDF page. One book item is one page; overflow is clipped. */
function placeTextPage(pdf: jsPDF, title: string, body: string) {
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = Math.max(36, pw * 0.1);
  const maxW = pw - margin * 2;
  const maxY = ph - margin;
  const titleSize = Math.min(22, Math.max(16, pw * 0.048));
  const bodySize = Math.min(13, Math.max(11, pw * 0.03));

  pdf.setTextColor(20, 24, 32);
  let y = margin;

  const heading = title.trim();
  if (heading) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(titleSize);
    const lineH = titleSize * 1.25;
    y += titleSize * 0.85;
    for (const line of asLines(pdf.splitTextToSize(heading, maxW))) {
      if (y > maxY) return;
      pdf.text(line, pw / 2, y, { align: 'center' });
      y += lineH;
    }
    y += titleSize * 0.35;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(bodySize);
  const lineH = bodySize * 1.45;
  if (!heading) y += bodySize;
  const paragraphs = body.replace(/\r\n/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += lineH * 0.65;
      continue;
    }
    for (const line of asLines(pdf.splitTextToSize(para, maxW))) {
      if (y > maxY) return;
      pdf.text(line, margin, y);
      y += lineH;
    }
  }
}

function dataUrlFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.slice(0, 40).toLowerCase().includes('image/png') ? 'PNG' : 'JPEG';
}

/** Picture contained on the current PDF page. Same geometry as the PNG export. */
function placeUploadedImage(pdf: jsPDF, page: ImagePage) {
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(PAGE_PAPER_RGB.r, PAGE_PAPER_RGB.g, PAGE_PAPER_RGB.b);
  pdf.rect(0, 0, pw, ph, 'F');
  const place = imagePlacement(pw, ph, page.width, page.height, page.fit);
  pdf.addImage(
    page.dataUrl,
    dataUrlFormat(page.dataUrl),
    place.x,
    place.y,
    place.w,
    place.h,
    undefined,
    'MEDIUM',
  );
}

function isLeadCover(pages: BookPage[]): boolean {
  const first = pages[0];
  return !!first && first.kind === 'image' && first.role === 'cover';
}

export async function exportBookPdf(
  pages: BookPage[],
  keyword: string,
  mode: SolutionMode,
  pageSize: PageSize,
  onProgress: (done: number, total: number) => void,
) {
  if (!pages.length) return;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: PAGE_FORMATS[pageSize],
  });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const name = titleCase(keyword);
  const CELL = 18;
  const mazeCount = pages.filter((p) => p.kind === 'maze').length;
  const textCount = pages.filter((p) => p.kind === 'text').length;
  const imageCount = pages.filter((p) => p.kind === 'image').length;
  // A cover image left on page 1 replaces the generated title page.
  const leadCover = isLeadCover(pages);

  // Cover (jsPDF starts with one page already).
  if (!leadCover) {
    const coverTitle = Math.min(48, pw * 0.1);
    const coverSub = Math.min(16, pw * 0.038);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(coverTitle);
    pdf.text(`${name} Mazes`, pw / 2, ph * 0.42, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(coverSub);
    const coverBits: string[] = [];
    if (mazeCount) coverBits.push(`${mazeCount} puzzle${mazeCount === 1 ? '' : 's'}`);
    if (textCount) coverBits.push(`${textCount} text page${textCount === 1 ? '' : 's'}`);
    if (imageCount) coverBits.push(`${imageCount} image page${imageCount === 1 ? '' : 's'}`);
    if (mazeCount) {
      coverBits.push(
        `solutions ${mode === 'after-each' ? 'after each maze' : 'at the back'}`,
      );
    }
    const subtitle = coverBits.join('  ·  ') || 'Maze book';
    pdf.text(
      asLines(pdf.splitTextToSize(subtitle, pw * 0.8)),
      pw / 2,
      ph * 0.42 + coverTitle * 0.9,
      { align: 'center' },
    );
  }

  // after-each counts one step per maze (the solution is part of that step).
  // at-end counts maze pages and solution pages separately. Text and image pages count once.
  const total =
    (mode === 'after-each' ? mazeCount : mazeCount * 2) + textCount + imageCount;
  let done = 0;
  let step = 0;

  const fmt = PAGE_FORMATS[pageSize];
  const mazes: BookMaze[] = [];
  let usedFirstPage = !leadCover;
  const ensurePage = () => {
    if (!usedFirstPage) {
      usedFirstPage = true;
      return;
    }
    pdf.addPage(fmt, 'portrait');
  };

  for (const item of pages) {
    if (item.kind === 'text') {
      ensurePage();
      placeTextPage(pdf, item.title, item.body);
      done++;
      onProgress(done, total);
    } else if (item.kind === 'image') {
      ensurePage();
      placeUploadedImage(pdf, item);
      done++;
      onProgress(done, total);
    } else {
      mazes.push(item.maze);
      const tag = `Maze ${mazes.length}`;
      const { maze, markers } = item.maze;
      ensurePage();
      placeImage(pdf, renderToCanvas(maze, CELL, false, markers), tag);
      if (mode === 'after-each') {
        pdf.addPage(fmt, 'portrait');
        placeImage(
          pdf,
          renderToCanvas(maze, CELL, true, markers),
          `${tag} — Solution`,
        );
      }
      done++;
      onProgress(done, total);
    }
    step++;
    if (step % 4 === 0) await tick();
  }

  if (mode === 'at-end') {
    for (let i = 0; i < mazes.length; i++) {
      const { maze, markers } = mazes[i];
      pdf.addPage(fmt, 'portrait');
      placeImage(
        pdf,
        renderToCanvas(maze, CELL, true, markers),
        `Solution ${i + 1}`,
      );
      done++;
      onProgress(done, total);
      if (i % 4 === 0) await tick();
    }
  }

  pdf.save(`${slugify(keyword)}-maze-book-${pageSize}.pdf`);
}

export async function exportBookZip(
  pages: BookPage[],
  keyword: string,
  pageSize: PageSize,
  onProgress: (done: number, total: number) => void,
) {
  const zip = new JSZip();
  const mazeDir = zip.folder('mazes')!;
  const solDir = zip.folder('solutions')!;
  const textDir = zip.folder('text-pages')!;
  const imageDir = zip.folder('image-pages')!;
  const pad = (n: number) => String(n).padStart(3, '0');
  const CELL = 22;
  const total = Math.max(1, pages.length);
  let mazeNo = 0;
  let textNo = 0;
  let coverNo = 0;
  let imageNo = 0;

  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    if (item.kind === 'text') {
      textNo++;
      const png = renderTextPageCanvas(item.title, item.body, pageSize)
        .toDataURL('image/png')
        .split(',')[1];
      textDir.file(`text-${pad(textNo)}.png`, png, { base64: true });
    } else if (item.kind === 'image') {
      const png = (
        await renderImagePageCanvas(
          item.dataUrl,
          item.width,
          item.height,
          pageSize,
          item.fit,
        )
      )
        .toDataURL('image/png')
        .split(',')[1];
      if (item.role === 'cover') {
        coverNo++;
        imageDir.file(`cover-${pad(coverNo)}.png`, png, { base64: true });
      } else {
        imageNo++;
        imageDir.file(`image-${pad(imageNo)}.png`, png, { base64: true });
      }
    } else {
      mazeNo++;
      const { maze, markers } = item.maze;
      const tag = `Maze ${mazeNo}`;
      const q = renderToCanvas(maze, CELL, false, markers, tag)
        .toDataURL('image/png')
        .split(',')[1];
      const a = renderToCanvas(maze, CELL, true, markers, `${tag} — Solution`)
        .toDataURL('image/png')
        .split(',')[1];
      mazeDir.file(`maze-${pad(mazeNo)}.png`, q, { base64: true });
      solDir.file(`solution-${pad(mazeNo)}.png`, a, { base64: true });
    }
    onProgress(i + 1, total);
    if (i % 3 === 0) await tick();
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });
  saveBlob(blob, `${slugify(keyword)}-maze-book.zip`);
}
