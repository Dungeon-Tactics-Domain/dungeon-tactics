import { describe, expect, it } from 'vitest';
import { addEvents, emptyTally, endHeroes, mvp } from '../src/client/tally.ts';
import type { Team } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

const team: Record<string, Team> = { h1: 'hero', h2: 'hero', e1: 'enemy', e2: 'enemy' };
const at = { x: 0, y: 0 };

describe('battle tally', () => {
  it('adds up damage and knockdowns by the attacker, including push collision and fall', () => {
    const t = emptyTally();
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h1', ability: 'strike', target: at },
        { k: 'hit', unit: 'e1', dmg: 8, chance: 90 },
        { k: 'push', unit: 'e1', to: at },
        { k: 'bump', unit: 'e1', dmg: 3 },
        { k: 'die', unit: 'e1' },
      ],
      team,
    );
    expect(t.scores.h1).toEqual({ dmg: 11, kills: 1 });
  });

  it('does not count damage on its own side (heal, end-of-turn spike, area that hits an ally)', () => {
    const t = emptyTally();
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h1', ability: 'blast', target: at },
        { k: 'hit', unit: 'h2', dmg: 5, chance: 90 },
        { k: 'heal', unit: 'h2', amount: 4 },
        { k: 'spike', unit: 'h1', dmg: 6 },
      ],
      team,
    );
    expect(t.scores.h1).toBeUndefined();
  });

  it('spike damage to someone who ended their turn on it does not go to whoever attacked earlier; the push one does', () => {
    const t = emptyTally();
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h1', ability: 'strike', target: at },
        { k: 'hit', unit: 'e1', dmg: 4, chance: 90 },
      ],
      team,
    );
    addEvents(
      t,
      [
        { k: 'spike', unit: 'e2', dmg: 6 },
        { k: 'die', unit: 'e2' },
      ],
      team,
    ); // e2 turn: stopped on the spikes
    expect(t.scores.h1).toEqual({ dmg: 4, kills: 0 });
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h1', ability: 'shield_bash', target: at },
        { k: 'push', unit: 'e1', to: at },
        { k: 'spike', unit: 'e1', dmg: 6 },
      ],
      team,
    );
    expect(t.scores.h1).toEqual({ dmg: 10, kills: 0 });
  });

  it('the side highlight is who knocked down the most; ties broken by damage', () => {
    const t = emptyTally();
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h1', ability: 'strike', target: at },
        { k: 'hit', unit: 'e1', dmg: 20, chance: 90 },
        { k: 'attack', unit: 'h2', ability: 'shot', target: at },
        { k: 'hit', unit: 'e2', dmg: 5, chance: 90 },
        { k: 'die', unit: 'e2' },
        { k: 'attack', unit: 'e1', ability: 'strike', target: at },
        { k: 'hit', unit: 'h1', dmg: 9, chance: 90 },
      ],
      team,
    );
    expect(mvp(t, team, 'hero')).toEqual(['h2', { dmg: 5, kills: 1 }]);
    expect(mvp(t, team, 'enemy')?.[0]).toBe('e1');
    expect(mvp(emptyTally(), team, 'hero')).toBeNull();
  });

  it('the end cards list every hero who started but the Beacon, the fallen at 0 life, with the highlight marked', () => {
    const t = emptyTally();
    const roster = {
      h1: { team: 'hero' as const, def: 'warrior' },
      h2: { team: 'hero' as const, def: 'archer' },
      b: { team: 'hero' as const, def: 'beacon' },
      e1: { team: 'enemy' as const, def: 'soldier' },
    };
    addEvents(
      t,
      [
        { k: 'attack', unit: 'h2', ability: 'shot', target: at },
        { k: 'hit', unit: 'e1', dmg: 12, chance: 90 },
      ],
      { h1: 'hero', h2: 'hero', b: 'hero', e1: 'enemy' },
    );
    expect(endHeroes(t, roster, [{ id: 'h2', hp: 7 }])).toEqual([
      { id: 'h1', def: 'warrior', hp: 0, max: UNIT_DEFS.warrior.hp, dmg: 0, kills: 0, mvp: false },
      { id: 'h2', def: 'archer', hp: 7, max: UNIT_DEFS.archer.hp, dmg: 12, kills: 0, mvp: true },
    ]);
  });
});
