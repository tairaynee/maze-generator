/** Pure layout for the thank-you end page. No DOM, so trim math can be checked
 *  without a browser. Drawing lives in thankYou.ts. */

export interface ThankYouCopy {
  heading: string;
  intro: string;
  /** Section heading above the review lines. Empty hides it. */
  reviewTitle: string;
  /** One sentence per line. */
  review: string;
  /** Section heading above the free-PDF lines. Empty hides it. */
  freebieTitle: string;
  /** One sentence per line. `{handle}` prints the Instagram handle. */
  freebie: string;
  instagram: string;
  closing: string;
  /** Printed under the drawing, above the copyright. */
  brand: string;
  /**
   * Small print at the foot. `{year}` prints the copyright year.
   * Stored with the token so Auto does not freeze a calendar year.
   */
  copyright: string;
  /** `'auto'` follows the calendar year. A number is a fixed year and is kept. */
  copyrightYear: 'auto' | number;
}

/** Wordmark used before the footer showed the Instagram handle. */
export const PREVIOUS_DEFAULT_BRAND = 'iq exploratorium';

export const DEFAULT_THANK_YOU_COPY: ThankYouCopy = {
  heading: 'Thank you for exploring!',
  intro: 'We hope you enjoyed these puzzles!',
  reviewTitle: 'Enjoyed the puzzles?',
  review:
    'Please leave an honest review on Amazon.\nYour feedback helps us make better books.',
  freebieTitle: 'Want more puzzles?',
  freebie: 'Get a free puzzle PDF.\nFollow and DM {handle} on Instagram.',
  instagram: '@iqexploratorium',
  closing: 'Happy puzzling!',
  brand: '@iqexploratorium',
  copyright:
    'Copyright © {year} IQ EXPLORATORIUM.\nAll rights reserved.\nNo reproduction or distribution\nwithout prior written permission.',
  copyrightYear: 'auto',
};

const LIMITS: Record<Exclude<keyof ThankYouCopy, 'copyrightYear'>, number> = {
  heading: 160,
  intro: 160,
  reviewTitle: 80,
  review: 700,
  freebieTitle: 80,
  freebie: 700,
  instagram: 40,
  closing: 120,
  brand: 80,
  copyright: 500,
};

/** Notice with a calendar year baked in, from before Auto stored `{year}`. */
function frozenDefaultCopyright(year: number): string {
  return DEFAULT_THANK_YOU_COPY.copyright.split('{year}').join(String(year));
}

/** Earlier default that included the YouTube address in parentheses. */
const PREVIOUS_URL_COPYRIGHT =
  'Copyright © {year} IQ EXPLORATORIUM (https://m.youtube.com/@iqexploratorium). All rights reserved. No part of this puzzle book may be reproduced or distributed without prior written permission.';

/** Single-sentence notice from before each line was set on purpose. */
const PREVIOUS_PLAIN_COPYRIGHT =
  'Copyright © {year} IQ EXPLORATORIUM. All rights reserved. No part of this puzzle book may be reproduced or distributed without prior written permission.';

const PREVIOUS_REVIEWS = new Set([
  'Enjoyed the puzzles? Please consider leaving an honest review on Amazon. Your feedback helps us create better puzzle books!',
]);

const PREVIOUS_FREEBIES = new Set([
  'Want more puzzles? DM {handle} on Instagram for a free puzzle PDF. No review required.',
  'Want more puzzles? DM {handle} on Instagram for a free puzzle PDF.',
  'Want more puzzles? DM @iqexploratorium on Instagram for a free puzzle PDF. No review required.',
  'Want more puzzles? DM @iqexploratorium on Instagram for a free puzzle PDF.',
  'Get a free puzzle PDF.\nDM {handle} on Instagram.',
  'Get a free puzzle PDF.\nDM @iqexploratorium on Instagram.',
]);

const FROZEN_DEFAULT_COPYRIGHTS = new Set([
  PREVIOUS_URL_COPYRIGHT,
  PREVIOUS_URL_COPYRIGHT.split('{year}').join('2025'),
  PREVIOUS_URL_COPYRIGHT.split('{year}').join('2026'),
  PREVIOUS_PLAIN_COPYRIGHT,
  PREVIOUS_PLAIN_COPYRIGHT.split('{year}').join('2025'),
  PREVIOUS_PLAIN_COPYRIGHT.split('{year}').join('2026'),
  frozenDefaultCopyright(2025),
  frozenDefaultCopyright(2026),
]);

export function copyrightYearSetting(value: unknown): 'auto' | number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= 9999) {
    return value;
  }
  if (typeof value === 'string' && /^\d{4}$/.test(value)) {
    const year = Number(value);
    if (year >= 1000 && year <= 9999) return year;
  }
  return 'auto';
}

export function printedYear(setting: 'auto' | number, now: Date = new Date()): number {
  return setting === 'auto' ? now.getFullYear() : setting;
}

export function sanitizeCopy(input: Partial<ThankYouCopy> | null | undefined): ThankYouCopy {
  const d = DEFAULT_THANK_YOU_COPY;
  const str = (key: Exclude<keyof ThankYouCopy, 'copyrightYear'>) => {
    const v = input?.[key];
    return typeof v === 'string' ? v.slice(0, LIMITS[key]) : d[key];
  };
  return {
    heading: str('heading'),
    intro: str('intro'),
    reviewTitle: str('reviewTitle'),
    review: str('review'),
    freebieTitle: str('freebieTitle'),
    freebie: str('freebie'),
    instagram: str('instagram'),
    closing: str('closing'),
    brand: str('brand'),
    copyright: str('copyright'),
    copyrightYear: copyrightYearSetting(input?.copyrightYear),
  };
}

/** Fill a saved end-page with the current footer when it still has the old
 *  wordmark or a baked default year. A fixed `copyrightYear` and any edited
 *  notice are left as stored. */
export function migrateStoredCopy(input: Partial<ThankYouCopy> | null | undefined): {
  copy: ThankYouCopy;
  changed: boolean;
} {
  const copy = sanitizeCopy(input);
  if (!input) return { copy, changed: false };
  let changed = false;

  const rawBrand = typeof input.brand === 'string' ? input.brand.trim().toLowerCase() : '';
  if (rawBrand === PREVIOUS_DEFAULT_BRAND) {
    copy.brand = DEFAULT_THANK_YOU_COPY.brand;
    changed = true;
  }

  const oldReview = typeof input.review === 'string' ? input.review.trim() : '';
  if (typeof input.review !== 'string') {
    copy.reviewTitle = DEFAULT_THANK_YOU_COPY.reviewTitle;
    copy.review = DEFAULT_THANK_YOU_COPY.review;
    changed = true;
  } else if (PREVIOUS_REVIEWS.has(oldReview)) {
    copy.reviewTitle = DEFAULT_THANK_YOU_COPY.reviewTitle;
    copy.review = DEFAULT_THANK_YOU_COPY.review;
    changed = true;
  } else if (typeof input.reviewTitle !== 'string') {
    copy.reviewTitle = '';
    changed = true;
  }

  const oldFreebie = typeof input.freebie === 'string' ? input.freebie.trim() : '';
  if (typeof input.freebie !== 'string') {
    copy.freebieTitle = DEFAULT_THANK_YOU_COPY.freebieTitle;
    copy.freebie = DEFAULT_THANK_YOU_COPY.freebie;
    changed = true;
  } else if (PREVIOUS_FREEBIES.has(oldFreebie)) {
    copy.freebieTitle = DEFAULT_THANK_YOU_COPY.freebieTitle;
    copy.freebie = DEFAULT_THANK_YOU_COPY.freebie;
    changed = true;
  } else if (typeof input.freebieTitle !== 'string') {
    copy.freebieTitle = '';
    changed = true;
  }

  if (input.copyrightYear == null) {
    copy.copyrightYear = 'auto';
    changed = true;
  } else {
    copy.copyrightYear = copyrightYearSetting(input.copyrightYear);
  }

  if (typeof input.copyright !== 'string') {
    copy.copyright = DEFAULT_THANK_YOU_COPY.copyright;
    copy.copyrightYear = 'auto';
    changed = true;
  } else if (FROZEN_DEFAULT_COPYRIGHTS.has(input.copyright.trim())) {
    copy.copyright = DEFAULT_THANK_YOU_COPY.copyright;
    changed = true;
  }

  return { copy, changed };
}

/** Printed handle only. Empty or unusable input falls back to the house handle
 *  so `{handle}` never becomes a blank or a link. */
export function printHandle(raw: string): string {
  const name = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/@/g, '')
    .replace(/[^a-zA-Z0-9._]/g, '')
    .slice(0, 30);
  return name ? `@${name}` : '@iqexploratorium';
}

export interface ResolvedThankYou {
  heading: string;
  intro: string;
  reviewTitle: string;
  review: string;
  freebieTitle: string;
  freebie: string;
  closing: string;
  brand: string;
  copyright: string;
}

export function resolveThankYouText(copy: ThankYouCopy, now: Date = new Date()): ResolvedThankYou {
  const handle = printHandle(copy.instagram);
  const year = String(printedYear(copyrightYearSetting(copy.copyrightYear), now));
  return {
    heading: copy.heading.trim(),
    intro: copy.intro.trim(),
    reviewTitle: copy.reviewTitle.trim(),
    review: copy.review.trim(),
    freebieTitle: copy.freebieTitle.trim(),
    freebie: copy.freebie.split('{handle}').join(handle).trim(),
    closing: copy.closing.trim(),
    brand: copy.brand.trim(),
    copyright: copy.copyright.trim().split('{year}').join(year),
  };
}

export type Measure = (text: string, size: number, bold: boolean) => number;

export interface LaidBox {
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ThankYouRole =
  | 'heading'
  | 'intro'
  | 'reviewTitle'
  | 'review'
  | 'freebieTitle'
  | 'freebie'
  | 'closing'
  | 'brand'
  | 'copyright';

export interface LaidLine {
  role: ThankYouRole;
  text: string;
  /** Center x, inches. */
  x: number;
  /** Alphabetic baseline, inches. */
  baseline: number;
  size: number;
  bold: boolean;
}

export interface ThankYouLayout {
  pageW: number;
  pageH: number;
  /** Safe inset from the trim, inches. Text, art, and the wordmark stay inside. */
  margin: number;
  lines: LaidLine[];
  rule: { x1: number; x2: number; y: number } | null;
  art: { x: number; y: number; w: number; h: number } | null;
  underline: { x1: number; x2: number; y: number; weight: number } | null;
  boxes: LaidBox[];
  clipped: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function wrapText(
  text: string,
  size: number,
  bold: boolean,
  maxW: number,
  measure: Measure,
): string[] {
  const lines: string[] = [];
  const paras = text.replace(/\r\n/g, '\n').split('\n');
  const breakLong = (word: string): string[] => {
    const parts: string[] = [];
    let chunk = '';
    for (const ch of word) {
      const trial = chunk + ch;
      if (chunk && measure(trial, size, bold) > maxW) {
        parts.push(chunk);
        chunk = ch;
      } else {
        chunk = trial;
      }
    }
    if (chunk) parts.push(chunk);
    return parts.length ? parts : [word.slice(0, 1)];
  };
  for (const para of paras) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word;
      if (measure(trial, size, bold) <= maxW) {
        cur = trial;
        continue;
      }
      if (cur) lines.push(cur);
      if (measure(word, size, bold) > maxW) {
        const bits = breakLong(word);
        lines.push(...bits.slice(0, -1));
        cur = bits[bits.length - 1] ?? '';
      } else {
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

interface ComposeOpts {
  pageW: number;
  pageH: number;
  text: ResolvedThankYou;
  artAspect: number;
  measure: Measure;
  scale: number;
  topFrac: number;
  clip: boolean;
}

function compose(opts: ComposeOpts): ThankYouLayout {
  const { pageW, pageH, text, artAspect, measure, scale, topFrac, clip } = opts;
  const margin = Math.max(0.48, pageW * 0.1);
  const maxW = Math.max(0.5, pageW - margin * 2);
  const heading = clamp(pageW * 0.048, 0.22, 0.34) * scale;
  const section = clamp(pageW * 0.034, 0.17, 0.21) * scale;
  const body = clamp(pageW * 0.03, 0.155, 0.175) * scale;
  const closingSize = clamp(pageW * 0.036, 0.18, 0.24) * scale;
  const brandSize = clamp(pageW * 0.032, 0.16, 0.22) * scale;
  const textTop = Math.max(margin, pageH * topFrac);

  const blocks: Array<{
    role: ThankYouRole;
    text: string;
    size: number;
    bold: boolean;
    gapAfter: number;
  }> = [];
  const push = (
    role: ThankYouRole,
    value: string,
    size: number,
    bold: boolean,
    gapAfter: number,
  ) => {
    if (value) blocks.push({ role, text: value, size, bold, gapAfter });
  };
  push('heading', text.heading, heading, true, heading * 0.42);
  push('intro', text.intro, body, false, body * 1.35);
  push('reviewTitle', text.reviewTitle, section, true, section * 0.2);
  push('review', text.review, body, false, body * 1.05);
  push('freebieTitle', text.freebieTitle, section, true, section * 0.2);
  push('freebie', text.freebie, body, false, body * 1.15);
  push('closing', text.closing, closingSize, true, 0);

  const showRule = Boolean(
    (text.reviewTitle || text.review) && (text.freebieTitle || text.freebie),
  );
  // Short legal lines stay near 9 pt. They do not shrink with the headings.
  const copyrightSize = clamp(pageW * 0.024, 0.12, 0.145);
  const copyrightLines = text.copyright
    ? wrapText(text.copyright, copyrightSize, false, maxW, measure).filter(Boolean)
    : [];
  const copyrightStep = copyrightSize * 1.38;
  const copyrightBlock =
    copyrightLines.length === 0
      ? 0
      : copyrightSize * 0.82 + (copyrightLines.length - 1) * copyrightStep + copyrightSize * 0.32;
  const copyrightTop = pageH - margin - copyrightBlock;
  const brandGap = text.brand && copyrightLines.length ? 0.38 : 0;
  const brandBaseline = text.brand
    ? (copyrightLines.length
        ? copyrightTop - brandGap - brandSize * 0.4
        : pageH - margin - brandSize * 0.42)
    : copyrightTop;
  const brandTop = text.brand ? brandBaseline - brandSize * 0.86 : copyrightTop;
  const minArt = artAspect > 0 ? 0.68 : 0;
  const gap = 0.16;
  const textLimit = clip ? brandTop - gap - minArt - gap : pageH;

  const lines: LaidLine[] = [];
  let cursor = textTop;
  let ruleY: number | null = null;
  let clipped = false;

  const fitsLine = (bottom: number) => !clip || bottom <= textLimit + 0.001;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const wrapped = wrapText(block.text, block.size, block.bold, maxW, measure);
    for (const ln of wrapped) {
      if (!ln) {
        const next = cursor + block.size * 0.55;
        if (!fitsLine(next)) {
          clipped = true;
          break;
        }
        cursor = next;
        continue;
      }
      const baseline = cursor + block.size * 0.82;
      const bottom = baseline + block.size * 0.3;
      if (!fitsLine(bottom)) {
        clipped = true;
        break;
      }
      lines.push({
        role: block.role,
        text: ln,
        x: pageW / 2,
        baseline,
        size: block.size,
        bold: block.bold,
      });
      cursor = bottom + block.size * 0.38;
    }
    if (clipped) break;
    const next = blocks[i + 1];
    const reviewEnds =
      block.role === 'review' || (block.role === 'reviewTitle' && next?.role !== 'review');
    const freebieStarts = next?.role === 'freebieTitle' || next?.role === 'freebie';
    if (showRule && reviewEnds && freebieStarts) {
      cursor += Math.max(0.18, block.size * 0.7);
      ruleY = cursor;
      cursor += Math.max(0.2, block.size * 0.85);
    } else {
      cursor += block.gapAfter;
    }
  }

  const textBottom = cursor;
  const space = brandTop - gap - textBottom - gap;
  let art: ThankYouLayout['art'] = null;
  if (artAspect > 0 && space >= (clip ? minArt * 0.85 : minArt)) {
    let artW = Math.min(maxW * 0.8, 4.25);
    let artH = artW / artAspect;
    const room = Math.max(0, space);
    if (artH > room) {
      artH = room;
      artW = artH * artAspect;
    }
    // Keep the drawing in the lower half of the free space so it sits
    // mid-page rather than stuck under the closing line.
    const leftover = Math.max(0, room - artH);
    const artY = textBottom + gap + leftover * 0.62;
    art = { x: (pageW - artW) / 2, y: artY, w: artW, h: artH };
  } else if (artAspect > 0 && space > 0.4) {
    const artH = space;
    const artW = Math.min(maxW * 0.8, artH * artAspect);
    const fittedH = artW / artAspect;
    art = {
      x: (pageW - artW) / 2,
      y: textBottom + gap,
      w: artW,
      h: fittedH,
    };
  }

  let underline: ThankYouLayout['underline'] = null;
  if (text.brand) {
    lines.push({
      role: 'brand',
      text: text.brand,
      x: pageW / 2,
      baseline: brandBaseline,
      size: brandSize,
      bold: true,
    });
    const w = Math.min(maxW, measure(text.brand, brandSize, true));
    underline = {
      x1: pageW / 2 - w / 2,
      x2: pageW / 2 + w / 2,
      y: brandBaseline + brandSize * 0.24,
      weight: Math.max(0.012, brandSize * 0.07),
    };
  }
  copyrightLines.forEach((ln, i) => {
    lines.push({
      role: 'copyright',
      text: ln,
      x: pageW / 2,
      baseline: copyrightTop + copyrightSize * 0.82 + i * copyrightStep,
      size: copyrightSize,
      bold: false,
    });
  });

  const boxes: LaidBox[] = [];
  for (const line of lines) {
    if (!line.text) continue;
    const w = Math.min(maxW, Math.max(0, measure(line.text, line.size, line.bold)));
    const top = line.baseline - line.size * 0.8;
    const bottom = line.baseline + (line.role === 'brand' ? line.size * 0.42 : line.size * 0.3);
    boxes.push({
      role: line.role,
      x: line.x - w / 2,
      y: top,
      w,
      h: Math.max(0, bottom - top),
    });
  }
  if (ruleY != null) {
    const rw = Math.min(1.45, maxW * 0.28);
    boxes.push({
      role: 'rule',
      x: pageW / 2 - rw / 2,
      y: ruleY - 0.01,
      w: rw,
      h: 0.02,
    });
  }
  if (art) boxes.push({ role: 'art', ...art });

  const rule =
    ruleY == null
      ? null
      : {
          x1: pageW / 2 - Math.min(1.45, maxW * 0.28) / 2,
          x2: pageW / 2 + Math.min(1.45, maxW * 0.28) / 2,
          y: ruleY,
        };

  return {
    pageW,
    pageH,
    margin,
    lines,
    rule,
    art,
    underline,
    boxes,
    clipped,
  };
}

function overlaps(a: LaidBox, b: LaidBox): boolean {
  const pad = 0.02;
  return (
    a.x + a.w > b.x + pad &&
    b.x + b.w > a.x + pad &&
    a.y + a.h > b.y + pad &&
    b.y + b.h > a.y + pad
  );
}

function acceptable(layout: ThankYouLayout): boolean {
  if (layout.clipped) return false;
  if (!layout.art) return false;
  const { margin, pageW, pageH, boxes } = layout;
  for (const box of boxes) {
    if (box.w <= 0 || box.h <= 0) continue;
    if (box.x < margin - 0.02) return false;
    if (box.x + box.w > pageW - margin + 0.02) return false;
    if (box.y < margin - 0.02) return false;
    if (box.y + box.h > pageH - margin + 0.02) return false;
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.role === 'brand' && b.role === 'brand') continue;
      if (overlaps(a, b)) return false;
    }
  }
  const closing = boxes.filter((b) => b.role === 'closing');
  const art = boxes.find((b) => b.role === 'art');
  if (art && closing.length) {
    const closingBottom = Math.max(...closing.map((b) => b.y + b.h));
    if (art.y < closingBottom + 0.08) return false;
  }
  const brandBoxes = boxes.filter((b) => b.role === 'brand');
  const copyrightBoxes = boxes.filter((b) => b.role === 'copyright');
  if (brandBoxes.length && copyrightBoxes.length) {
    const brandBottom = Math.max(...brandBoxes.map((b) => b.y + b.h));
    const copyTop = Math.min(...copyrightBoxes.map((b) => b.y));
    if (copyTop < brandBottom + 0.06) return false;
  }
  const review = boxes.filter((b) => b.role === 'review');
  const freebie = boxes.filter((b) => b.role === 'freebie');
  if (review.length && freebie.length && layout.rule) {
    const reviewBottom = Math.max(...review.map((b) => b.y + b.h));
    const freebieTop = Math.min(...freebie.map((b) => b.y));
    if (!(reviewBottom < layout.rule.y && layout.rule.y < freebieTop)) return false;
  }
  return true;
}

export function layoutThankYou(args: {
  pageW: number;
  pageH: number;
  copy: ThankYouCopy;
  artAspect: number;
  measure: Measure;
  now?: Date;
}): ThankYouLayout {
  const text = resolveThankYouText(args.copy, args.now ?? new Date());
  const attempts: Array<{ scale: number; top: number }> = [];
  for (const top of [0.115, 0.09, 0.07]) {
    for (const scale of [1, 0.94, 0.88, 0.82, 0.76, 0.7]) {
      attempts.push({ scale, top });
    }
  }
  for (const attempt of attempts) {
    const laid = compose({
      pageW: args.pageW,
      pageH: args.pageH,
      text,
      artAspect: args.artAspect,
      measure: args.measure,
      scale: attempt.scale,
      topFrac: attempt.top,
      clip: false,
    });
    if (acceptable(laid)) return laid;
  }
  return compose({
    pageW: args.pageW,
    pageH: args.pageH,
    text,
    artAspect: args.artAspect,
    measure: args.measure,
    scale: 0.7,
    topFrac: 0.07,
    clip: true,
  });
}

/** One thank-you page, always last. `create` runs only when the page is missing. */
export function applyEndPage<T extends { kind: string }>(
  pages: readonly T[],
  included: boolean,
  create: () => T,
): T[] {
  const existing = pages.find((p) => p.kind === 'thank-you');
  const rest = pages.filter((p) => p.kind !== 'thank-you');
  if (!included) return rest;
  return [...rest, existing ?? create()];
}

/** Progress steps for PDF export. A thank-you page counts once. Solutions
 *  grouped at the back count separately; solutions after each maze do not. */
export function countExportSteps(
  pages: readonly { kind: string }[],
  mode: 'after-each' | 'at-end',
): number {
  let mazes = 0;
  for (const page of pages) if (page.kind === 'maze') mazes += 1;
  return (mode === 'after-each' ? mazes : mazes * 2) + (pages.length - mazes);
}

/** Sheets in the PDF, including the generated title page when there is no
 *  lead cover. Empty input is an empty file. */
export function countPdfPages(
  pages: readonly { kind: string; role?: string }[],
  mode: 'after-each' | 'at-end',
): number {
  if (!pages.length) return 0;
  const leadCover = pages[0]?.kind === 'image' && pages[0].role === 'cover';
  let mazes = 0;
  for (const page of pages) if (page.kind === 'maze') mazes += 1;
  const others = pages.length - mazes;
  const mazeSheets = mazes * (mode === 'after-each' ? 2 : 1);
  const solutionSection = mode === 'at-end' ? mazes : 0;
  return (leadCover ? 0 : 1) + mazeSheets + solutionSection + others;
}
