import { describe, expect, it } from 'vitest';
import { queueRows } from '../src/client/hud.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Turn list with the charge in preview on the "Executar?" (Execute?) prompt (Nov 13, Fernando's request, like FFT's CT list)
const archerVsRogue = (rogueCt = 0) => {
  const s = stateOf([{ id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 }, { id: 'r', def: 'rogue', team: 'enemy', x: 4, y: 0 }]);
  s.units[1].ct = rogueCt;
  return new Battle(flat(8, 1), s);
};

describe('turn list with the charge in preview', () => {
  it('a magia lenta entra onde vai sair e o alvo fica marcado', () => {
    // Rogue with CT 80 and speed 12: reaches 100 in 2 ticks, before the Aimed Shot (4 ticks)
    const { rows, targets, at } = queueRows(archerVsRogue(80), { ability: 'aimed_shot', target: { x: 4, y: 0 } }, 4);
    expect(at).toBeGreaterThan(0);
    expect(rows[at]).toEqual({ unit: 'a', charge: 'aimed_shot' });
    expect(targets).toEqual(new Set(['r']));
    // the Rogue acts before the shot lands: you can see he can leave the tile
    expect(rows.slice(1, at).some((r) => r.unit === 'r' && !r.charge)).toBe(true);
    // with CT 0 the shot lands before the Rogue acts
    const slow = queueRows(archerVsRogue(0), { ability: 'aimed_shot', target: { x: 4, y: 0 } }, 4);
    expect(slow.rows.slice(1, slow.at).some((r) => r.unit === 'r')).toBe(false);
  });

  it('without a charge (or outside "Executar?") it\'s the usual queue', () => {
    const b = archerVsRogue();
    expect(queueRows(b, { ability: 'shot', target: { x: 4, y: 0 } }, 4).at).toBe(-1);
    expect(queueRows(b, null, 4).targets.size).toBe(0);
  });
});
