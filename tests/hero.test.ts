import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterScenario, learned } from '../src/client/campaign.ts';
import { heroesFor, defaultGroup } from '../src/client/group.ts';
import { parseHero } from '../src/client/hero.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

describe('protagonista', () => {
  it('o herói salvo só passa com nome de 1 a 16 letras e uma das 4 classes', () => {
    expect(parseHero({ name: '  Aria ', cls: 'mage' })).toEqual({ name: 'Aria', cls: 'mage' });
    for (const bad of [null, {}, { name: '', cls: 'mage' }, { name: 'x'.repeat(17), cls: 'mage' }, { name: 'Aria', cls: 'brute' }, { name: 3, cls: 'mage' }]) expect(parseHero(bad)).toBeNull();
  });

  it('entra no lugar do companheiro da mesma classe, com as habilidades da fase', () => {
    const hero = { name: 'Aria', cls: 'mage' as const };
    const heroes = heroesFor(defaultGroup(), 0, hero);
    expect(heroes.map((u) => u.name)).toEqual(['Bran', 'Tess', 'Aria', 'Lia']);
    expect(heroes[2].abilities).toEqual(CHAPTERS[0].setup.heroes[2].abilities);
    const s = chapterScenario(0, hero);
    expect(s.spawns.some((sp) => UNIT_DEFS[sp.def].name === 'Aria')).toBe(true);
    expect(learned(0, hero).find((x) => x.abilities.includes('gust'))?.name).toBe('Aria');
  });
});
