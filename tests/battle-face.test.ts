import { describe, expect, it } from 'vitest';
import { battleFace, expressionAt, faceCues, frameOf } from '../src/client/battle-face.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
const hp = (id: string) => (id.startsWith('a') ? UNIT_DEFS.warrior.hp : UNIT_DEFS.soldier.hp);
const exprs = (events: BattleEvent[]) => faceCues(events, hp).flat();

describe('battleFace: the sheet each unit shows in battle', () => {
  it('follows the battle mapping: the Warrior with the barbarian, the rest by the model on the map', () => {
    const sheet = (def: string) => battleFace(def)?.sheet;
    expect(sheet('warrior')).toBe('px/barbarian.webp');
    expect(sheet('warrior½')).toBe('px/barbarian.webp'); // the half-tile token
    expect(sheet('archer')).toBe('px/ranger.webp');
    expect(sheet('rogue')).toBe('px/rogue_hooded.webp');
    expect(sheet('mage')).toBe('px/mage.webp');
    expect(sheet('dark_mage')).toBe('px/skeleton_mage.webp');
    expect(sheet('lancer')).toBe('px/lancer.webp');
    expect(sheet('veil_knight')).toBe('px/knight.webp');
  });
  it('has nothing for the Beacon, which keeps its portrait', () => {
    expect(battleFace('beacon')).toBeUndefined();
  });
  it('keeps the small skeletons still: every expression is their neutral frame', () => {
    for (const def of ['minion', 'soldier', 'skeleton_archer']) {
      const f = battleFace(def)!;
      expect(f, def).toBeDefined();
      for (const e of ['hurt', 'shout', 'smile', 'angry', 'wounded'] as const) expect(frameOf(f, e)).toBe(0);
    }
  });
  it('picks the painted frame of each expression', () => {
    const f = battleFace('mage')!;
    expect(['neutral', 'shout', 'hurt', 'wounded', 'smile', 'angry'].map((e) => frameOf(f, e as never))).toEqual([
      0, 3, 4, 5, 6, 7,
    ]);
  });
});

describe('faceCues: what each event does to the faces', () => {
  it('shouts on an attack or a charge, hurts the target for 900 ms, smiles 2200 ms for whoever downs a unit', () => {
    const events: BattleEvent[] = [
      { k: 'charge', unit: 'a1', ability: 'fire', target: at(5) },
      { k: 'attack', unit: 'a1', ability: 'strike', target: at(1) },
      { k: 'hit', unit: 'e1', dmg: 1, chance: 90 },
      { k: 'die', unit: 'e1' },
    ];
    expect(faceCues(events, hp)).toEqual([
      [['a1', { expr: 'shout', from: 0, until: 700 }]],
      [['a1', { expr: 'shout', from: 0, until: 700 }]],
      [['e1', { expr: 'hurt', from: 0, until: 900 }]],
      [['a1', { expr: 'smile', from: 0, until: 2200 }]],
    ]);
  });
  it('a big hit (25% of life) hurts, then leaves the target angry; bump, fall and spikes hurt too', () => {
    const big = Math.ceil(UNIT_DEFS.soldier.hp / 4);
    expect(exprs([{ k: 'hit', unit: 'e1', dmg: big, chance: 90 }])).toEqual([
      ['e1', { expr: 'hurt', from: 0, until: 900 }],
      ['e1', { expr: 'angry', from: 900, until: 3100 }],
    ]);
    for (const e of [
      { k: 'bump', unit: 'e1', dmg: 1 },
      { k: 'fall', unit: 'e1', levels: 1, dmg: 1 },
      { k: 'spike', unit: 'e1', dmg: 1 },
    ] as BattleEvent[])
      expect(exprs([e]).map(([, m]) => m.expr)).toEqual(['hurt']);
  });
  it('nobody smiles for a death without a striker (spikes at the end of the turn)', () => {
    expect(exprs([{ k: 'die', unit: 'e1' }])).toEqual([]);
  });
  // the real shape from Battle.move: the counter-attack's attack and hit come before the mover's walk
  it('a counter-attack makes the unit striking back angry, not shouting', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 },
    ]);
    s.turn = { actor: 'a', moved: false, usedAbility: null };
    s.rng = HIT_SEED;
    const b = new Battle(flat(6, 3), s);
    const strike = b.act('strike', at(2, 1));
    const walk = b.move(at(3, 2));
    expect(walk.at(-1)?.k).toBe('move');
    const cues = exprs([...strike, ...walk]).filter(([, m]) => m.expr === 'shout' || m.expr === 'angry');
    expect(cues.map(([id, m]) => [id, m.expr])).toContainEqual(['a', 'shout']);
    expect(cues.map(([id, m]) => [id, m.expr])).toContainEqual(['b', 'angry']);
    expect(cues.some(([id, m]) => id === 'b' && m.expr === 'shout')).toBe(false);
  });
});

describe('expressionAt: the face shown now', () => {
  const moods = [
    { expr: 'hurt' as const, from: 100, until: 1000 },
    { expr: 'angry' as const, from: 1000, until: 3200 },
  ];
  it('shows the running mood, then goes back to neutral', () => {
    expect([0, 100, 999, 1000, 3199, 3200].map((t) => expressionAt(moods, t, 30, 30))).toEqual([
      'neutral',
      'hurt',
      'hurt',
      'angry',
      'angry',
      'neutral',
    ]);
  });
  it('stays wounded under 30% of life between reactions', () => {
    expect(expressionAt([], 0, 8, 30)).toBe('wounded');
    expect(expressionAt([], 0, 9, 30)).toBe('neutral');
    expect(expressionAt(moods, 500, 8, 30)).toBe('hurt');
  });
  it('smiles on a victory, the surviving heroes', () => {
    expect(expressionAt([], 0, 5, 30, true)).toBe('smile');
  });
});
