// The pitches, as data. Adding one is an entry here plus, if it needs new
// scenery, a branch in drawDecor() — nothing to download either way.

export type Decor = 'crowd' | 'castle' | 'rainbow' | 'beach';

export interface Pitch {
  id: string;
  name: string;
  icon: string;
  /** The two mown stripes. */
  grassA: number;
  grassB: number;
  /** Everything outside the pitch. */
  surround: number;
  /** The deeper area behind each goal. */
  stand: number;
  /** Pitch markings. */
  line: number;
  lineAlpha: number;
  /** Optional: a colour per mown stripe instead of the two above. */
  stripes?: number[];
  decor: Decor;
}

export const PITCHES: Pitch[] = [
  {
    id: 'stade', name: 'Stade', icon: '🏟️',
    grassA: 0x3fae52, grassB: 0x37a04a, surround: 0x15351f, stand: 0x24402c,
    line: 0xffffff, lineAlpha: 0.92, decor: 'crowd',
  },
  {
    id: 'chateau', name: 'Château', icon: '🏰',
    grassA: 0x3c9a52, grassB: 0x338a47, surround: 0x2b2b38, stand: 0x4a4a5c,
    line: 0xfff3c4, lineAlpha: 0.9, decor: 'castle',
  },
  {
    id: 'arcenciel', name: 'Arc-en-ciel', icon: '🌈',
    grassA: 0x7fe08a, grassB: 0x6fd47c, surround: 0x6ec8ff, stand: 0x8fd6ff,
    line: 0xffffff, lineAlpha: 0.95, decor: 'rainbow',
    stripes: [
      0xff9d9d, 0xffbf8a, 0xffe79a, 0xc9f0a0, 0x9ae8b4, 0x9adcf0, 0xa9b6f5, 0xd7a6f0, 0xf7a6d8, 0xffb3a7,
    ],
  },
  {
    id: 'plage', name: 'Plage', icon: '🏖️',
    grassA: 0x8fcf6e, grassB: 0x83c463, surround: 0xf2d9a0, stand: 0x3fb8d6,
    line: 0xffffff, lineAlpha: 0.95, decor: 'beach',
  },
];

export function pitchById(id: string | undefined): Pitch {
  return PITCHES.find((p) => p.id === id) ?? PITCHES[0];
}
