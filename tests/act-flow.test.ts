import { describe, expect, it } from 'vitest';
import { actActions, actTargets, bestSpot, runSpot, targetAt, targetIndex } from '../src/client/act-flow.ts';
import { cancelStep, commandIndex } from '../src/client/command.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

const g = flat(14, 5);
// a mage with an ally and two enemies, one near and one far; a potion in the bag
const scene = () => {
  const s = stateOf([
    { id: 'm', def: 'mage', team: 'hero', x: 1, y: 2 },
    { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 3, hp: 40 },
    { id: 'near', def: 'soldier', team: 'enemy', x: 5, y: 2 },
    { id: 'far', def: 'soldier', team: 'enemy', x: 8, y: 2 },
  ]);
  s.bag = { life_potion: 1 };
  s.scenario = 'ash_wood'; // a map without a Beacon: a test state counts as one with it, and walking lost the battle
  return new Battle(g, s);
};

describe('Agir primeiro flow (act-flow.ts, Nov 19)', () => {
  it('lists enemies first near to far, then allies, then the user, then direct actions', () => {
    const rows = actTargets(scene());
    const units = rows.flatMap((r) => (r.k === 'unit' ? [r.unit] : []));
    expect(units).toEqual(['near', 'far', 'w', 'm']);
    const direct = rows.filter((r) => r.k === 'direct');
    expect(rows.slice(-direct.length)).toEqual(direct); // after every unit
  });

  it('the actions on a target: abilities in order, the ones that cannot hit it say why, then the items', () => {
    const b = scene();
    const acts = actActions(b, { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } });
    expect(acts.filter((a) => a.k === 'ability').map((a) => a.id)).toEqual(['firebolt', 'blast', 'gust', 'heal']);
    expect(acts.find((a) => a.id === 'firebolt')!.enabled).toBe(true);
    const potion = acts.find((a) => a.k === 'item')!;
    expect(potion).toMatchObject({ id: 'life_potion', enabled: false, reason: 'no-target', count: 1 });
    const onAlly = actActions(b, { k: 'unit', unit: 'w', pos: { x: 2, y: 3 } }).find((a) => a.k === 'item')!;
    expect(onAlly.enabled).toBe(true);
    expect(onAlly.spots[0]).toMatchObject({ cost: 0, heal: 100 });
  });

  it('the best spot is staying put when it works, else the best result with the shortest walk', () => {
    const b = scene();
    const bolt = actActions(b, { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }).find((a) => a.id === 'firebolt')!;
    expect(bolt.spots[bestSpot(bolt, b)].cost).toBe(0);
    expect(bestSpot({ k: 'ability', id: 'x', enabled: false, spots: [] }, b)).toBe(-1);
  });

  it('an area centred on the user is on for a foe it would hit, with only the tiles that reach it (Nov 19)', () => {
    const s = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 1, y: 2 },
      { id: 'near', def: 'soldier', team: 'enemy', x: 3, y: 2 },
    ]);
    s.scenario = 'ash_wood';
    const b = new Battle(g, s);
    const spin = actActions(b, { k: 'unit', unit: 'near', pos: { x: 3, y: 2 } }).find((a) => a.id === 'spin')!;
    expect(spin.enabled).toBe(true);
    expect(spin.spots.every((sp) => sp.preview?.targets.some((t) => t.unit === 'near'))).toBe(true);
  });

  it('the best spot of an area keeps an ally out of it when another aim still hits the target (Nov 19)', () => {
    const s = stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 1, y: 2 },
      { id: 'w', def: 'warrior', team: 'hero', x: 4, y: 2 },
      { id: 'near', def: 'soldier', team: 'enemy', x: 5, y: 2 },
    ]);
    s.scenario = 'ash_wood';
    const b = new Battle(g, s);
    const blast = actActions(b, { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }).find((a) => a.id === 'blast')!;
    expect(blast.spots.some((sp) => sp.preview?.targets.some((t) => t.unit === 'w'))).toBe(true); // the ally can be hit
    const hit = blast.spots[bestSpot(blast, b)].preview!.targets.map((t) => t.unit);
    expect(hit).toContain('near');
    expect(hit).not.toContain('w');
  });

  it('a tap on a unit picks its row; Cancel walks back one screen at a time', () => {
    const b = scene();
    const rows = actTargets(b);
    expect(targetAt(rows, b, { x: 8, y: 2 })).toBe(1);
    expect(targetAt(rows, b, { x: 0, y: 0 })).toBe(-1);
    const far = rows[1];
    expect(targetIndex(rows, far)).toBe(1);
    expect(cancelStep(b, { k: 'spot', target: far, action: 2, index: 0 })).toEqual({
      k: 'actions',
      target: far,
      index: 2,
    });
    expect(cancelStep(b, { k: 'actions', target: far, index: 0 })).toEqual({ k: 'targets', index: 1 });
    expect(cancelStep(b, { k: 'targets', index: 0 })).toEqual({ k: 'menu', index: commandIndex('act') });
  });

  it('runSpot walks to the spot and then acts, spending the action', () => {
    const b = scene();
    const blast = actActions(b, { k: 'unit', unit: 'far', pos: { x: 8, y: 2 } }).find((a) => a.id === 'blast')!;
    const spot = blast.spots.find((s) => s.cost > 0)!; // the far one is only in reach after a walk
    const { walk, act } = runSpot(b, blast, spot);
    expect(walk.some((e) => e.k === 'move')).toBe(true);
    expect(act?.[0]).toMatchObject({ k: 'charge', ability: 'blast' }); // Blast charges
    expect(b.state.turn.usedAbility).toBe('blast');
    expect(b.actor.pos).toEqual(spot.pos);
  });
});
