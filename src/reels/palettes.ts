// Soft multi-color gradients for an Instagram grid. Each field blends more
// than one hue and stays below fluorescent. Marker colors on the solution
// are separate and a step softer than neon.

export interface Palette {
  name: string;
  /** Canvas gradient direction, in degrees. */
  angle: number;
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
  { name: 'Dawn', angle: 160, bg: '#F3C7AE', bgMid: '#E09AAB', bgEnd: '#C5C0E4', wall: INK, text: INK },
  { name: 'Lagoon', angle: 18, bg: '#A9D4E6', bgMid: '#6EAEA4', bgEnd: '#E7C7A4', wall: INK, text: INK },
  { name: 'Dusk', angle: 128, bg: '#C9C6EA', bgMid: '#A56B90', bgEnd: '#D08468', wall: INK, text: INK },
  { name: 'Harbor', angle: 205, bg: '#8EBFDA', bgMid: '#3E5EA8', bgEnd: '#E7A898', wall: INK, text: '#FFFFFF' },
  { name: 'Orchard', angle: 72, bg: '#C5D2B4', bgMid: '#F0C09A', bgEnd: '#8E6A92', wall: INK, text: INK },
  { name: 'Bloom', angle: 175, bg: '#E4A8B6', bgMid: '#F3CDB4', bgEnd: '#5E9E98', wall: INK, text: INK },
  { name: 'Twilight', angle: 42, bg: '#3E5EA8', bgMid: '#8E5A82', bgEnd: '#E0C07A', wall: INK, text: '#FFFFFF' },
  { name: 'Mist', angle: 112, bg: '#D5DEF2', bgMid: '#A9D4E6', bgEnd: '#D98978', wall: INK, text: INK },
  { name: 'Ember', angle: 12, bg: '#D98978', bgMid: '#F3CDB4', bgEnd: '#7E98B0', wall: INK, text: INK },
  { name: 'Grove', angle: 148, bg: '#5E9E98', bgMid: '#E0C07A', bgEnd: '#E4A8B6', wall: INK, text: INK },
  { name: 'Velvet', angle: 88, bg: '#8E5A82', bgMid: '#F0C8C0', bgEnd: '#6E92A8', wall: INK, text: '#FFFFFF' },
  { name: 'Picnic', angle: 198, bg: '#F3CDB4', bgMid: '#B7B4DE', bgEnd: '#8A3850', wall: INK, text: '#FFFFFF' },
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
