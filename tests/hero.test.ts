import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterScenario, learned } from '../src/client/campaign.ts';
import { heroesFor, defaultGroup } from '../src/client/group.ts';
import { parseHero } from '../src/client/hero.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

describe('protagonista', () => {
  it('the saved hero only passes with a name of 1 to 16 letters and one of the 4 classes', () => {
    expect(parseHero({ name: '  Aria ', cls: 'mage' })).toEqual({ name: 'Aria', cls: 'mage' });
    for (const bad of [null, {}, { name: '', cls: 'mage' }, { name: 'x'.repeat(17), cls: 'mage' }, { name: 'Aria', cls: 'brute' }, { name: 3, cls: 'mage' }]) expect(parseHero(bad)).toBeNull();
  });

  it('takes the place of the same-class companion, with the stage\'s abilities', () => {
    const hero = { name: 'Aria', cls: 'mage' as const };
    const heroes = heroesFor(defaultGroup(), 0, hero);
    expect(heroes.map((u) => u.name)).toEqual(['Bran', 'Tess', 'Aria', 'Lia']);
    expect(heroes[2].abilities).toEqual(CHAPTERS[0].setup.heroes[2].abilities);
    const s = chapterScenario(0, hero);
    expect(s.spawns.some((sp) => UNIT_DEFS[sp.def].name === 'Aria')).toBe(true);
    expect(learned(0, hero).find((x) => x.abilities.includes('gust'))?.name).toBe('Aria');
  });
});
