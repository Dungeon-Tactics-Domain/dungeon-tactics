// Protagonist created by the player (night of Nov 12, Fernando's request: "there could be character creation"). Pure and
// tested; the screen lives in create-ui.ts. The protagonist takes the place of the companion of the same class in the campaign
// battles (group.ts, heroesFor) (the companion stays in the conversations, like FFT's guests): the maps have 4 hero starting tiles.
export const HERO_CLASSES = ['warrior', 'archer', 'mage', 'rogue'] as const;
export type HeroClass = (typeof HERO_CLASSES)[number];
export interface Hero {
  name: string;
  cls: HeroClass;
}
export const HERO_KEY = 'dt:hero';
export const NAME_MAX = 16;

// trust boundary: the saved hero comes from the browser; only a name of 1 to 16 letters and one of the 4 classes pass
export function parseHero(raw: unknown): Hero | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || name.length > NAME_MAX || !HERO_CLASSES.includes(r.cls as HeroClass)) return null;
  return { name, cls: r.cls as HeroClass };
}
