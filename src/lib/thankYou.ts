import pinkyUrl from '../assets/pinky-promise.png';
import nunitoUrl from '../assets/fonts/Nunito.ttf';
import type { BookPage } from './book';

// The pinky-promise drawing is cropped from the supplied reference.
// The reference bulb is only about 60px tall and its pale outline sits in
// the maze watermark, so the wordmark is set in type instead.
import {
  DEFAULT_THANK_YOU_COPY,
  layoutThankYou,
  migrateStoredCopy,
  sanitizeCopy,
  type Measure,
  type ThankYouCopy,
} from './thankYouLayout';

export const THANK_YOU_PAGE_ID = 'preset-thank-you';

const STORAGE_KEY = 'maze-book-thank-you-v1';
const FONT = 'Nunito, Inter, "Segoe UI", "Liberation Sans", sans-serif';

export interface EndPageSetting {
  included: boolean;
  copy: ThankYouCopy;
}

export function loadEndPageSetting(): EndPageSetting {
  const fallback: EndPageSetting = {
    included: true,
    copy: { ...DEFAULT_THANK_YOU_COPY },
  };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as { included?: unknown; copy?: Partial<ThankYouCopy> };
    const included = typeof data.included === 'boolean' ? data.included : true;
    const migrated = migrateStoredCopy(data.copy);
    if (migrated.changed) saveEndPageSetting({ included, copy: migrated.copy });
    return { included, copy: migrated.copy };
  } catch {
    return fallback;
  }
}

export function saveEndPageSetting(setting: EndPageSetting) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        included: setting.included,
        copy: sanitizeCopy(setting.copy),
      }),
    );
  } catch {
    /* private mode or a full disk — the in-memory book still updates */
  }
}

export function createThankYouPage(copy: ThankYouCopy = DEFAULT_THANK_YOU_COPY): BookPage {
  const clean = sanitizeCopy(copy);
  return {
    kind: 'thank-you',
    id: THANK_YOU_PAGE_ID,
    ...clean,
  };
}

let fontPromise: Promise<void> | null = null;
let pinkyPromise: Promise<HTMLImageElement> | null = null;

function ensureFont(): Promise<void> {
  if (!fontPromise) {
    fontPromise = (async () => {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      try {
        const face = new FontFace('Nunito', `url(${nunitoUrl})`, {
          weight: '400 800',
          style: 'normal',
        });
        document.fonts.add(await face.load());
      } catch {
        /* The canvas stack falls back to Inter / Liberation Sans. */
      }
    })();
  }
  return fontPromise;
}

function loadPinky(): Promise<HTMLImageElement> {
  if (!pinkyPromise) {
    pinkyPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error('Could not load the pinky-promise drawing.'));
      img.src = pinkyUrl;
    });
  }
  return pinkyPromise;
}

function fontCss(sizePx: number, bold: boolean): string {
  return `${bold ? 800 : 700} ${sizePx}px ${FONT}`;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pale maze watermark. Light enough that black type stays easy to read,
 *  dark enough to survive a print. */
function drawPaleMaze(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const inset = Math.min(w, h) * 0.04;
  const cols = 14;
  const availW = w - inset * 2;
  const availH = h - inset * 2;
  const rows = Math.max(10, Math.round((cols * availH) / availW));
  const cw = availW / cols;
  const ch = availH / rows;
  const rng = mulberry32(0x51a1e);
  const seen = new Uint8Array(cols * rows);
  const east = new Uint8Array(cols * rows);
  const south = new Uint8Array(cols * rows);
  const stack = [Math.floor(cols / 2)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const c = cur % cols;
    const r = (cur / cols) | 0;
    const nbrs: Array<{ i: number; dir: 'e' | 'w' | 's' | 'n' }> = [];
    if (c + 1 < cols && !seen[cur + 1]) nbrs.push({ i: cur + 1, dir: 'e' });
    if (c > 0 && !seen[cur - 1]) nbrs.push({ i: cur - 1, dir: 'w' });
    if (r + 1 < rows && !seen[cur + cols]) nbrs.push({ i: cur + cols, dir: 's' });
    if (r > 0 && !seen[cur - cols]) nbrs.push({ i: cur - cols, dir: 'n' });
    if (!nbrs.length) {
      stack.pop();
      continue;
    }
    const pick = nbrs[(rng() * nbrs.length) | 0];
    seen[pick.i] = 1;
    if (pick.dir === 'e') east[cur] = 1;
    else if (pick.dir === 'w') east[pick.i] = 1;
    else if (pick.dir === 's') south[cur] = 1;
    else south[pick.i] = 1;
    stack.push(pick.i);
  }

  ctx.save();
  ctx.translate(inset, inset);
  ctx.strokeStyle = '#f2f2f2';
  ctx.fillStyle = '#f2f2f2';
  ctx.lineWidth = Math.max(0.75, Math.min(cw, ch) * 0.06);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * cw;
      const y = r * ch;
      if (r === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cw, y);
      }
      if (c === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ch);
      }
      if (!east[i]) {
        ctx.moveTo(x + cw, y);
        ctx.lineTo(x + cw, y + ch);
      }
      if (!south[i]) {
        ctx.moveTo(x, y + ch);
        ctx.lineTo(x + cw, y + ch);
      }
    }
  }
  ctx.stroke();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const open =
        (east[i] ? 1 : 0) +
        (c > 0 && east[i - 1] ? 1 : 0) +
        (south[i] ? 1 : 0) +
        (r > 0 && south[i - cols] ? 1 : 0);
      if (open === 1 || (r * 3 + c) % 5 === 0) {
        ctx.beginPath();
        ctx.arc(c * cw + cw / 2, r * ch + ch / 2, Math.min(cw, ch) * 0.065, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Full trim page. The same canvas is shown in the preview, the PNG, and the PDF. */
export async function renderThankYouPage(
  copy: ThankYouCopy,
  inches: { w: number; h: number },
  dpi = 220,
): Promise<HTMLCanvasElement> {
  await ensureFont();
  const img = await loadPinky();
  const aspect =
    img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalWidth / img.naturalHeight
      : 583 / 261;
  const w = Math.max(1, Math.round(inches.w * dpi));
  const h = Math.max(1, Math.round(inches.h * dpi));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the thank-you page.');

  const measure: Measure = (text, size, bold) => {
    ctx.font = fontCss(size * dpi, bold);
    return ctx.measureText(text).width / dpi;
  };
  const layout = layoutThankYou({
    pageW: inches.w,
    pageH: inches.h,
    copy,
    artAspect: aspect,
    measure,
  });

  drawPaleMaze(ctx, w, h);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const line of layout.lines) {
    if (!line.text) continue;
    ctx.font = fontCss(line.size * dpi, line.bold);
    ctx.fillText(line.text, line.x * dpi, line.baseline * dpi);
  }
  if (layout.rule) {
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = Math.max(1, dpi * 0.014);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(layout.rule.x1 * dpi, layout.rule.y * dpi);
    ctx.lineTo(layout.rule.x2 * dpi, layout.rule.y * dpi);
    ctx.stroke();
  }
  if (layout.art) {
    const a = layout.art;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, a.x * dpi, a.y * dpi, a.w * dpi, a.h * dpi);
  }
  if (layout.underline) {
    const u = layout.underline;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, u.weight * dpi);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(u.x1 * dpi, u.y * dpi);
    ctx.lineTo(u.x2 * dpi, u.y * dpi);
    ctx.stroke();
  }
  return canvas;
}
