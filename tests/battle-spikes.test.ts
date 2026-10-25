import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT } from '../src/shared/battle/combat.ts';
import { tileAt, type Grid } from '../src/shared/battle/grid.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Espinhos (noite de 12/11): empurrado para a casa ou terminar a vez nela fere; andar por cima não.
const spiky = (...at: [number, number][]): Grid => {
  const g = flat(8, 8);
  for (const [x, y] of at) tileAt(g, { x, y }).spikes = true;
  return g;
};
const units = (ax = 3, ay = 3) => stateOf([
  { id: 'a', def: 'warrior', team: 'hero', x: ax, y: ay },
  { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 3 },
  { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 7 },
], HIT_SEED);

describe('espinhos', () => {
  it('empurrado por cima dos espinhos leva o dano deles, somado ao golpe', () => {
    const b = new Battle(spiky([5, 3]), units());
    const hp = b.state.units[1].hp;
    const events = b.act('shield_bash', { x: 4, y: 3 });
    const spike = events.find((e) => e.k === 'spike');
    expect(spike).toMatchObject({ unit: 'b', dmg: COMBAT.SPIKE_DAMAGE });
    const hit = events.find((e) => e.k === 'hit');
    expect(b.state.units.find((u) => u.id === 'b')!.hp).toBe(hp - (hit && 'dmg' in hit ? hit.dmg : 0) - COMBAT.SPIKE_DAMAGE);
  });

  it('terminar a vez em cima fere; sem espinhos, nada muda', () => {
    const b = new Battle(spiky([3, 3]), units());
    const out = b.endTurn();
    expect(out[0]).toEqual({ k: 'spike', unit: 'a', dmg: COMBAT.SPIKE_DAMAGE });
    expect(b.state.units.find((u) => u.id === 'a')!.hp).toBe(42 - COMBAT.SPIKE_DAMAGE);
    expect(new Battle(spiky(), units()).endTurn().some((e) => e.k === 'spike')).toBe(false);
  });

  it('andar por cima e parar fora não fere', () => {
    const b = new Battle(spiky([3, 4]), units());
    b.move({ x: 3, y: 5 });
    expect(b.endTurn().some((e) => e.k === 'spike')).toBe(false);
  });
});
