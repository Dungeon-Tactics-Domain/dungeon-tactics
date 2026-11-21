import { describe, expect, it } from 'vitest';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { dist } from '../src/shared/battle/grid.ts';
import { actionOptions } from '../src/shared/battle/options.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

const g = flat(14, 5);
const by = (o: ReturnType<typeof actionOptions>, id: string) => o.find((x) => x.ability === id)!;

describe('actionOptions (Agir primeiro, Nov 19)', () => {
  it('melee basic with nobody within a walk is off with "range"; the ranged one is on with its targets', () => {
    const s = stateOf([
      { id: 'r', def: 'rogue', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 7, y: 2 },
    ]);
    const o = actionOptions(g, s, 'r');
    expect(o.map((x) => x.ability)).toEqual(['stab', 'throwing_knife', 'trip', 'deathblow', 'gust']);
    expect(by(o, 'stab')).toMatchObject({ enabled: false, reason: 'range', targets: [] });
    const knife = by(o, 'throwing_knife');
    expect(knife.enabled).toBe(true);
    expect(knife.targets.map((t) => t.unit)).toEqual(['e']);
    expect(knife.targets[0].spots[0].preview.targets[0].unit).toBe('e'); // the preview comes with the spot
  });

  it('a ranger may stand at the maximum distance from the target', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 5, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 9, y: 2 },
    ]);
    const spots = by(actionOptions(g, s, 'a'), 'shot').targets[0].spots;
    expect(Math.max(...spots.map((p) => dist(p.pos, { x: 9, y: 2 })))).toBe(7);
    expect(spots[0].cost).toBe(0); // the current tile comes first
  });

  it('a spell short of mana says how much is missing', () => {
    const s = stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 1, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 3, y: 2 },
    ]);
    s.units[0].vars = { mana: 5 };
    expect(by(actionOptions(g, s, 'm'), 'heal')).toMatchObject({
      enabled: false,
      reason: 'spent',
      pool: 'mana',
      missing: 15,
    });
  });

  it('walk and act: a target only reachable by walking, and the spent budget shrinks it', () => {
    const s = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 2 },
    ]);
    const t = by(actionOptions(g, s, 'w'), 'strike').targets[0];
    // beside it, diagonals included (Nov 21)
    const beside = (p: { x: number; y: number }) => Math.max(Math.abs(p.x - t.pos.x), Math.abs(p.y - t.pos.y)) === 1;
    expect(t.spots.every((p) => p.cost >= 3 && beside(p.pos))).toBe(true);
    expect(t.spots.some((p) => dist(p.pos, t.pos) === 2)).toBe(true);
    s.turn.spent = 2;
    expect(by(actionOptions(g, s, 'w'), 'strike')).toMatchObject({ enabled: false, reason: 'range' });
  });

  it('the turn action already used turns everything off', () => {
    const s = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 1, y: 2 },
    ]);
    s.turn.main = 'strike';
    s.turn.bonus = 'shove'; // both slots: the Shove is a secondary (Nov 21)
    expect(actionOptions(g, s, 'w').every((x) => !x.enabled && x.reason === 'used')).toBe(true);
  });

  it('abilities with no unit aimed: centered on the user, and an area on the ground', () => {
    const s = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 3, y: 2 },
    ]);
    const spin = by(actionOptions(g, s, 'w'), 'spin');
    expect(spin.targets).toMatchObject([{ kind: 'self' }]);
    expect(spin.targets[0].spots.every((p) => p.preview.targets.length > 0)).toBe(true);
    s.units[1].pos = { x: 12, y: 2 };
    expect(by(actionOptions(g, s, 'w'), 'spin')).toMatchObject({ enabled: false, reason: 'no-target' });
    const m = stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 2 },
    ]);
    const kinds = by(actionOptions(g, m, 'm'), 'blast').targets.map((t) => t.kind);
    expect(kinds[0]).toBe('unit');
    expect(kinds).toContain('tile');
  });

  it('a wall on the way turns the shot off with "sight"; deep water all around, with "water"', () => {
    const walled = gridOf(['..#..']);
    const s = stateOf([
      { id: 'r', def: 'rogue', team: 'hero', x: 0, y: 0 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    ]);
    expect(by(actionOptions(walled, s, 'r'), 'throwing_knife')).toMatchObject({ enabled: false, reason: 'sight' });
    const pool = flat(4, 1);
    pool.tiles = pool.tiles.map((t) => ({ ...t, depth: 2 }));
    const w = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 1, y: 0 },
    ]);
    expect(actionOptions(pool, w, 'w').every((x) => !x.enabled && x.reason === 'water')).toBe(true);
    // a shore within a walk: the action is on from the dry tile only
    pool.tiles[2] = { ...pool.tiles[2], depth: 0 };
    w.units[1].pos = { x: 3, y: 0 };
    expect(by(actionOptions(pool, w, 'w'), 'strike').targets[0].spots.map((p) => p.pos)).toEqual([{ x: 2, y: 0 }]);
  });

  it('previewAbility from an origin reads as if the actor stood there', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 2 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 9, y: 2 },
    ]);
    const at = { x: 9, y: 2 };
    expect(previewAbility(g, s, 'a', 'shot', at).ok).toBe(false);
    const from = previewAbility(g, s, 'a', 'shot', at, false, { x: 4, y: 2 });
    expect(s.units[0].pos).toEqual({ x: 0, y: 2 }); // the state is not touched
    s.units[0].pos = { x: 4, y: 2 };
    expect(from).toEqual(previewAbility(g, s, 'a', 'shot', at));
    expect(from.ok).toBe(true);
  });

  it('enemies come before allies, near to far', () => {
    const s = stateOf([
      { id: 'w', def: 'warrior', team: 'hero', x: 5, y: 2 },
      { id: 'a', def: 'soldier', team: 'hero', x: 4, y: 2 },
      { id: 'far', def: 'soldier', team: 'enemy', x: 8, y: 3 },
      { id: 'near', def: 'soldier', team: 'enemy', x: 7, y: 2 },
    ]);
    expect(by(actionOptions(g, s, 'w'), 'strike').targets.map((t) => t.unit)).toEqual(['near', 'far', 'a']);
  });

  it('enumerates a hero turn on a big map in a few ms', () => {
    const big = flat(40, 40);
    const units = [{ id: 'm', def: 'mage', team: 'hero' as const, x: 20, y: 20 }];
    for (let i = 0; i < 6; i++) {
      units.push({ id: `e${i}`, def: 'soldier', team: 'enemy' as never, x: 14 + i * 2, y: 16 + (i % 3) * 4 });
      units.push({ id: `a${i}`, def: 'soldier', team: 'hero' as never, x: 18 + i, y: 24 });
    }
    const s = stateOf(units);
    actionOptions(big, s, 'm'); // warm up
    const t0 = performance.now();
    const o = actionOptions(big, s, 'm');
    const ms = performance.now() - t0;
    console.log(`actionOptions, mage on 40x40 with 12 units: ${ms.toFixed(1)} ms`);
    expect(o.some((x) => x.enabled)).toBe(true);
    expect(ms).toBeLessThan(250);
  });
});
