import { describe, expect, it } from 'vitest';
import {
  changeClass,
  DEPLOY_MAX,
  defaultGroup,
  dismiss,
  GROUP_MAX,
  heroesFor,
  parseGroup,
  RECRUIT_COST,
  recruit,
  toggleDeploy,
} from '../src/client/group.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Recruitment and class change (Nov 13, delivery 5 of the FFT-style group design)
describe('party', () => {
  it('the default group sends the 4 story members with the whole kit of their class and their equipment', () => {
    const heroes = heroesFor(defaultGroup(), { warrior: { weapon: 'w1' } });
    expect(heroes.map((u) => `${u.name}:${u.base}`)).toEqual(['Bran:warrior', 'Tess:archer', 'Odo:mage', 'Lia:rogue']);
    for (const u of heroes) expect(u.abilities).toEqual(UNIT_DEFS[u.base].abilities);
    expect(heroes.map((u) => u.items)).toEqual([{ weapon: 'w1' }, undefined, undefined, undefined]);
  });

  it('recruiting costs gold, joins the deployment if there is room and respects the cap', () => {
    expect(recruit(defaultGroup(), { gold: RECRUIT_COST - 1, items: [] }, 'archer')).toBeNull();
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'archer')!;
    expect(r.chest.gold).toBe(500 - RECRUIT_COST);
    expect(r.group.members.at(-1)).toMatchObject({ id: 'r1', cls: 'archer', recruit: true });
    expect(r.group.deployed).toHaveLength(DEPLOY_MAX); // the 4 story characters already fill the slots
    let g = r.group;
    while (g.members.length < GROUP_MAX) g = recruit(g, { gold: 9999, items: [] }, 'mage')!.group;
    expect(new Set(g.members.map((m) => m.name)).size).toBe(GROUP_MAX); // no repeated names
    expect(recruit(g, { gold: 9999, items: [] }, 'mage')).toBeNull();
  });

  it('changing class changes the numbers and abilities in battle', () => {
    const g = changeClass(defaultGroup(), 'warrior', 'mage');
    const bran = heroesFor(g)[0];
    expect(bran).toMatchObject({
      name: 'Bran',
      base: 'mage',
      hp: UNIT_DEFS.mage.hp,
      abilities: UNIT_DEFS.mage.abilities,
    });
  });

  it("deploying: at most 4 and never none; whoever stays in camp doesn't go to battle", () => {
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'rogue')!.group;
    expect(toggleDeploy(r, 'r1')).toBeNull(); // already 4
    const swapped = toggleDeploy(toggleDeploy(r, 'archer')!, 'r1')!;
    expect(heroesFor(swapped).map((u) => u.name)).toEqual(['Bran', 'Odo', 'Lia', 'Ivo']);
    let one = defaultGroup();
    for (const id of ['warrior', 'archer', 'mage']) one = toggleDeploy(one, id)!;
    expect(toggleDeploy(one, 'rogue')).toBeNull();
  });

  it('dismiss only recruits, and the equipment returns to the chest', () => {
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'rogue')!;
    expect(dismiss(r.group, {}, r.chest, 'warrior')).toBeNull();
    const out = dismiss(r.group, { r1: { weapon: 'w1' } }, r.chest, 'r1')!;
    expect(out.group.members.some((m) => m.id === 'r1')).toBe(false);
    expect(out.eq).toEqual({});
    expect(out.chest.items).toEqual(['w1']);
  });

  it('the saved group only accepts what it knows; the story characters always return', () => {
    expect(parseGroup(null)).toEqual(defaultGroup());
    const g = parseGroup({
      members: [
        { id: 'warrior', cls: 'rogue' },
        { id: 'r2', name: 'Ivo', cls: 'mage' },
        { id: 'x', name: 'Hack', cls: 'mage' },
        { id: 'r3', name: 'Zé', cls: 'brute' },
      ],
      deployed: ['r2', 'r2', 'nada', 'warrior'],
    });
    expect(g.members.map((m) => `${m.id}:${m.cls}`)).toEqual([
      'warrior:rogue',
      'archer:archer',
      'mage:mage',
      'rogue:rogue',
      'r2:mage',
    ]);
    expect(g.deployed).toEqual(['r2', 'warrior']);
  });

  it('Lancer (new class): joins by recruitment, jumps 3 and the spear reaches 2 tiles', () => {
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'lancer')!;
    const g = toggleDeploy(toggleDeploy(r.group, 'archer')!, 'r1')!;
    const lancer = heroesFor(g).at(-1)!;
    expect(lancer).toMatchObject({ base: 'lancer', jump: 3, abilities: ['lance', 'sweep', 'lance_jump'] });
    expect(parseGroup(JSON.parse(JSON.stringify(g))).members.at(-1)?.cls).toBe('lancer');
    const s = stateOf([
      { id: 'l', def: 'lancer', team: 'hero', x: 1, y: 1 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 3, y: 1 },
    ]);
    expect(previewAbility(flat(6, 6), s, 'l', 'lance', { x: 3, y: 1 }).ok).toBe(true);
  });
});
