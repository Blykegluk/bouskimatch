// Characters are plain data so new ones (and later, unlockable ones) are just
// entries in this list: no code change needed.

export interface Character {
  id: string;
  name: string;
  face: string;
  body: number;
  trim: number;
  /** Small personality tweaks, kept mild so no character is clearly the best. */
  speed: number;
  power: number;
}

export const CHARACTERS: Character[] = [
  { id: 'tigrou', name: 'Griffe', face: '🐯', body: 0xffa63d, trim: 0x8a4a00, speed: 1.04, power: 0.98 },
  { id: 'robot', name: 'Boulon', face: '🤖', body: 0x9fb4c7, trim: 0x3d4b5c, speed: 0.96, power: 1.06 },
  { id: 'monstre', name: 'Gloubi', face: '👾', body: 0x9b6bff, trim: 0x4a2a8a, speed: 1.0, power: 1.0 },
  { id: 'grenouille', name: 'Flap', face: '🐸', body: 0x5ed66b, trim: 0x1f6b2a, speed: 1.06, power: 0.94 },
  { id: 'poulpe', name: 'Tentak', face: '🐙', body: 0xff6b9d, trim: 0x8a2a4a, speed: 0.98, power: 1.04 },
  { id: 'dino', name: 'Croc', face: '🦖', body: 0x3fc7b4, trim: 0x166b60, speed: 1.0, power: 1.02 },
];

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
