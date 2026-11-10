// Distinct fields for an Instagram grid. Hues stay saturated, but they
// sit below fluorescent: coral, rose, apricot, teal, and so on.
// Marker colors on the solution are separate and a step softer than neon.

export interface Palette {
  name: string;
  bg: string;
  bgMid: string;
  bgEnd: string;
  wall: string;
  text: string;
}

export const AUTO_BACKGROUND = 'auto';

export const MARKER_COLORS = [
  '#E23B3B',
  '#E6B423',
  '#2EAA62',
  '#3A6ED4',
  '#D45398',
  '#E07A28',
] as const;

const INK = '#241C18';

export const PALETTES: Palette[] = [
  { name: 'Coral', bg: '#E7A090', bgMid: '#D98978', bgEnd: '#C46E68', wall: INK, text: INK },
  { name: 'Rose', bg: '#C98B98', bgMid: '#B87384', bgEnd: '#96586A', wall: INK, text: '#FFFFFF' },
  { name: 'Apricot', bg: '#F0C4A4', bgMid: '#E4AA80', bgEnd: '#D08A5C', wall: INK, text: INK },
  { name: 'Teal', bg: '#3E8F8A', bgMid: '#2C736F', bgEnd: '#1C5552', wall: INK, text: '#FFFFFF' },
  { name: 'Periwinkle', bg: '#B7C0E4', bgMid: '#9AA6D4', bgEnd: '#7C8AB8', wall: INK, text: INK },
  { name: 'Sage', bg: '#B4C2A6', bgMid: '#96A888', bgEnd: '#738468', wall: INK, text: INK },
  { name: 'Cobalt', bg: '#3E5EA8', bgMid: '#2E4C90', bgEnd: '#1E366C', wall: INK, text: '#FFFFFF' },
  { name: 'Plum', bg: '#8E5A82', bgMid: '#734868', bgEnd: '#54344C', wall: INK, text: '#FFFFFF' },
  { name: 'Mustard', bg: '#D4B15C', bgMid: '#C09A44', bgEnd: '#A07C30', wall: INK, text: INK },
  { name: 'Terracotta', bg: '#C46A4C', bgMid: '#A8563C', bgEnd: '#8A4030', wall: INK, text: '#FFFFFF' },
  { name: 'Sky', bg: '#9FCBE0', bgMid: '#7EB4D0', bgEnd: '#5A96B4', wall: INK, text: INK },
  { name: 'Merlot', bg: '#8A3850', bgMid: '#6C283C', bgEnd: '#4C1828', wall: INK, text: '#FFFFFF' },
];

export function paletteByName(name: string): Palette {
  return PALETTES.find((p) => p.name === name) ?? PALETTES[0];
}

export interface PaletteQueue {
  items: Palette[];
  last: string | null;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shufflePalettes(seed: number): Palette[] {
  const out = [...PALETTES];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Hands out backgrounds for one or more reels.
 * A batch is always internally unique. Auto draws (pin === null) also
 * avoid repeating the previous reel until every palette has been used.
 * A locked single reel (pin set, count 1) keeps that choice.
 */
export function takeBackgrounds(
  queue: PaletteQueue,
  count: number,
  pin: Palette | null,
  seed: number,
): { backgrounds: Palette[]; queue: PaletteQueue } {
  const n = Math.max(1, count);
  const items = queue.items.slice();
  if (pin && n === 1) {
    return { backgrounds: [pin], queue: { items, last: pin.name } };
  }

  const backgrounds: Palette[] = [];
  const seen = new Set<string>();
  if (pin) {
    backgrounds.push(pin);
    seen.add(pin.name);
  }

  const refill = () => {
    const more = shufflePalettes(seed + items.length * 17 + backgrounds.length * 131);
    const fresh = more.filter((p) => !seen.has(p.name));
    const used = more.filter((p) => seen.has(p.name));
    items.push(...fresh, ...used);
    const last = backgrounds[backgrounds.length - 1]?.name ?? queue.last;
    if (last && items[0]?.name === last && items.length > 1) {
      const swapAt = items.findIndex((p, i) => i > 0 && !seen.has(p.name));
      if (swapAt > 0) {
        const [picked] = items.splice(swapAt, 1);
        items.unshift(picked);
      }
    }
  };

  while (backgrounds.length < n) {
    if (!items.length) refill();
    const next = items.shift();
    if (!next) break;
    if (seen.has(next.name)) continue;
    seen.add(next.name);
    backgrounds.push(next);
  }

  while (backgrounds.length < n) {
    const extra = PALETTES.find((p) => !seen.has(p.name));
    if (!extra) break;
    seen.add(extra.name);
    backgrounds.push(extra);
  }

  const last = backgrounds[backgrounds.length - 1]?.name ?? queue.last;
  return { backgrounds, queue: { items, last } };
}
