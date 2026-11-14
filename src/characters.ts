// Characters are plain data so new ones (and later, unlockable ones) are just
// entries in this list: no code change needed. Everything is drawn from these
// numbers, so a whole roster costs no download at all.

export type EarStyle = 'cat' | 'antenna' | 'horns' | 'frog' | 'tentacles' | 'fin';
export type EyeStyle = 'two' | 'three' | 'visor' | 'big';
export type Pattern = 'stripes' | 'bolts' | 'spots' | 'none';
/** Body shape, so the six are told apart by their silhouette alone. */
export type Build = 'slim' | 'normal' | 'big';

export interface Character {
  id: string;
  name: string;
  /** Used in the menu, the scoreboard and the goal message. */
  face: string;
  body: number;
  trim: number;
  accent: number;
  ears: EarStyle;
  eyes: EyeStyle;
  pattern: Pattern;
  build: Build;
  /** A boxy head instead of a round one. */
  square?: boolean;
  /** Small personality tweaks, kept mild so no character is clearly the best. */
  speed: number;
  power: number;
}

export const CHARACTERS: Character[] = [
  {
    id: 'tigrou', name: 'Griffe', face: '🐯',
    body: 0xffa63d, trim: 0x8a4a00, accent: 0xfff0d6,
    ears: 'cat', eyes: 'two', pattern: 'stripes', build: 'normal', speed: 1.04, power: 0.98,
  },
  {
    id: 'robot', name: 'Boulon', face: '🤖',
    body: 0xa8bdd0, trim: 0x3d4b5c, accent: 0x6ef0ff,
    ears: 'antenna', eyes: 'visor', pattern: 'bolts', build: 'big', square: true, speed: 0.96, power: 1.06,
  },
  {
    id: 'monstre', name: 'Gloubi', face: '👾',
    body: 0x9b6bff, trim: 0x4a2a8a, accent: 0xd9c6ff,
    ears: 'horns', eyes: 'three', pattern: 'spots', build: 'big', speed: 1.0, power: 1.0,
  },
  {
    id: 'grenouille', name: 'Flap', face: '🐸',
    body: 0x5ed66b, trim: 0x1f6b2a, accent: 0xd8ffd0,
    ears: 'frog', eyes: 'big', pattern: 'spots', build: 'slim', speed: 1.06, power: 0.94,
  },
  {
    id: 'poulpe', name: 'Tentak', face: '🐙',
    body: 0xff6b9d, trim: 0x8a2a4a, accent: 0xffd9e6,
    ears: 'tentacles', eyes: 'big', pattern: 'none', build: 'slim', speed: 0.98, power: 1.04,
  },
  {
    id: 'dino', name: 'Croc', face: '🦖',
    body: 0x3fc7b4, trim: 0x166b60, accent: 0xfff6c9,
    ears: 'fin', eyes: 'two', pattern: 'stripes', build: 'normal', speed: 1.0, power: 1.02,
  },
];

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
