// Saturated fields for an Instagram grid. Each name is a different hue,
// not a tint of the same beige. The marker colors on the solution stay
// separate from these backgrounds.

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
  '#FF2D2D',
  '#FFE14A',
  '#22E06A',
  '#3D7BFF',
  '#FF3EC8',
  '#FF8A00',
] as const;

export const PALETTES: Palette[] = [
  { name: 'Blue', bg: '#1d4bff', bgMid: '#3d6bff', bgEnd: '#6d28d9', wall: '#14151c', text: '#ffffff' },
  { name: 'Magenta', bg: '#ff2f92', bgMid: '#ff4db0', bgEnd: '#c026d3', wall: '#14151c', text: '#ffffff' },
  { name: 'Lime', bg: '#d6ff3c', bgMid: '#b6f562', bgEnd: '#3ddc6a', wall: '#14151c', text: '#14151c' },
  { name: 'Orange', bg: '#ff5a1f', bgMid: '#ff7a33', bgEnd: '#ffb000', wall: '#14151c', text: '#14151c' },
  { name: 'Violet', bg: '#6d28ff', bgMid: '#8b5cf6', bgEnd: '#e879f9', wall: '#14151c', text: '#ffffff' },
  { name: 'Teal', bg: '#00c2b8', bgMid: '#14b8a6', bgEnd: '#0e7490', wall: '#14151c', text: '#ffffff' },
  { name: 'Red', bg: '#ff2a2a', bgMid: '#ff4d4d', bgEnd: '#ff6b3d', wall: '#14151c', text: '#ffffff' },
  { name: 'Yellow', bg: '#ffe500', bgMid: '#ffd000', bgEnd: '#ff9f1c', wall: '#14151c', text: '#14151c' },
  { name: 'Cyan', bg: '#00c2ff', bgMid: '#38bdf8', bgEnd: '#2563eb', wall: '#14151c', text: '#ffffff' },
  { name: 'Pink', bg: '#ff4d8d', bgMid: '#fb7185', bgEnd: '#e11d48', wall: '#14151c', text: '#ffffff' },
  { name: 'Green', bg: '#14d46a', bgMid: '#22c55e', bgEnd: '#047857', wall: '#14151c', text: '#ffffff' },
  { name: 'Indigo', bg: '#312e81', bgMid: '#4338ca', bgEnd: '#7c3aed', wall: '#14151c', text: '#ffffff' },
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
