// A short list borrowed from the maze-reels palettes, kept to the ones
// whose walls stay readable. The solution itself always uses MARKER_COLORS,
// not the single trail color those older reels used.

export interface Palette {
  name: string;
  bg: string;
  bgEnd: string;
  wall: string;
  text: string;
  ctaBg: string;
  ctaText: string;
}

export const MARKER_COLORS = [
  '#FF2D2D',
  '#FFE14A',
  '#22E06A',
  '#3D7BFF',
  '#FF3EC8',
  '#FF8A00',
] as const;

export const PALETTES: Palette[] = [
  {
    name: 'Cream Ink',
    bg: '#f3ead8',
    bgEnd: '#e8dcb5',
    wall: '#1d1d1d',
    text: '#1d1d1d',
    ctaBg: '#1d1d1d',
    ctaText: '#f3ead8',
  },
  {
    name: 'Neon Night',
    bg: '#0a0a0f',
    bgEnd: '#191930',
    wall: '#d7fff0',
    text: '#f5d3ff',
    ctaBg: '#f472b6',
    ctaText: '#0a0a0f',
  },
  {
    name: 'Sunset',
    bg: '#4a1d27',
    bgEnd: '#c25032',
    wall: '#fff4e0',
    text: '#fff4e0',
    ctaBg: '#ffce54',
    ctaText: '#3a1010',
  },
  {
    name: 'Magenta Pop',
    bg: '#2c0a3d',
    bgEnd: '#a32fc5',
    wall: '#ffffff',
    text: '#ffffff',
    ctaBg: '#ffd166',
    ctaText: '#3a0e4a',
  },
  {
    name: 'Ocean Pop',
    bg: '#03252e',
    bgEnd: '#0e6471',
    wall: '#e7fff6',
    text: '#e6fff7',
    ctaBg: '#facc15',
    ctaText: '#03252e',
  },
  {
    name: 'Hot Pink',
    bg: '#ff006e',
    bgEnd: '#ff5a8a',
    wall: '#ffffff',
    text: '#ffffff',
    ctaBg: '#ffe88a',
    ctaText: '#7a0033',
  },
  {
    name: 'Electric',
    bg: '#06043a',
    bgEnd: '#1e0e96',
    wall: '#d8ff4a',
    text: '#fffa00',
    ctaBg: '#39ff14',
    ctaText: '#06043a',
  },
  {
    name: 'Cloud White',
    bg: '#ffffff',
    bgEnd: '#f1f1f1',
    wall: '#1d1d1d',
    text: '#1d1d1d',
    ctaBg: '#ff3b6e',
    ctaText: '#ffffff',
  },
  {
    name: 'Royal Gold',
    bg: '#1a0a3d',
    bgEnd: '#3b1675',
    wall: '#ffe88a',
    text: '#ffd700',
    ctaBg: '#ffd700',
    ctaText: '#1a0a3d',
  },
  {
    name: 'Sky Cloud',
    bg: '#b3dffc',
    bgEnd: '#e2f2ff',
    wall: '#0b3a6b',
    text: '#0b3a6b',
    ctaBg: '#0b3a6b',
    ctaText: '#ffffff',
  },
];

export function paletteByName(name: string): Palette {
  return PALETTES.find((p) => p.name === name) ?? PALETTES[0];
}
