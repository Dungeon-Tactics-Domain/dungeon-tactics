import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSex, modelFile, parseBodies, sexOf } from '../src/client/bodies.ts';

// Fernando, Nov 25: Debug › Models picks 2 to 5 heads and, per character, a man's or a woman's body
describe('Debug › Models settings', () => {
  it('rebuilds the saved settings field by field, the default on any doubt', () => {
    expect(parseBodies({ heads: 4, sex: { 'h-mage': 'm', r1: 'f' } })).toEqual({
      heads: 4,
      sex: { 'h-mage': 'm', r1: 'f' },
    });
    for (const bad of [null, 'x', 3, [], { heads: 6 }, { heads: '4' }]) expect(parseBodies(bad).heads).toBe(2);
    expect(parseBodies({ sex: { 'a b': 'f', ok: 'x', fine: 'f' } }).sex).toEqual({ fine: 'f' });
    expect(parseBodies({ sex: ['f'] }).sex).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`u${i}`, 'f']));
    expect(Object.keys(parseBodies({ sex: many }).sex)).toHaveLength(64);
  });

  it('draws the 10 humanoids from their 3 to 5 heads file, every other model from its own', () => {
    expect(modelFile('knight', 2)).toBe('knight');
    expect(modelFile('skeleton_minion', 4)).toBe('skeleton_minion_4h');
    expect(modelFile('rat', 5)).toBe('rat');
    expect(modelFile('rogue', 3)).toBe('rogue'); // the corpse's plain Rogue has no taller file
    for (const m of ['knight', 'ranger', 'mage', 'rogue_hooded', 'lancer', 'barbarian'])
      for (const h of [3, 4, 5] as const) expect(existsSync(`public/models/${modelFile(m, h)}.glb`)).toBe(true);
    for (const m of ['skeleton_warrior', 'skeleton_rogue', 'skeleton_mage', 'skeleton_minion'])
      for (const h of [3, 4, 5] as const) expect(existsSync(`public/models/${modelFile(m, h)}.glb`)).toBe(true);
  });

  it('gives the Mage, the Rogue and the Archer a woman, the other living classes a man, the skeletons nothing', () => {
    for (const d of ['mage', 'rogue', 'archer']) expect(defaultSex(d)).toBe('f');
    for (const d of ['warrior', 'lancer', 'brute', 'acolyte', 'veil_knight']) expect(defaultSex(d)).toBe('m');
    const b = parseBodies({ sex: { w: 'f' } });
    expect(sexOf(b, 'w', 'warrior')).toBe('f'); // per character, not per class
    expect(sexOf(b, 'x', 'warrior')).toBe('m');
    expect(sexOf(b, 'w', 'soldier')).toBeNull();
    expect(sexOf(b, 'w', 'rat')).toBeNull();
  });
});
