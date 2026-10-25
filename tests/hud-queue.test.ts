import { describe, expect, it } from 'vitest';
import { queueRows } from '../src/client/hud.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Lista de turnos com a carga em prévia no "Executar?" (13/11, pedido do Fernando, como a lista de CT do FFT)
const archerVsRogue = (rogueCt = 0) => {
  const s = stateOf([{ id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 }, { id: 'r', def: 'rogue', team: 'enemy', x: 4, y: 0 }]);
  s.units[1].ct = rogueCt;
  return new Battle(flat(8, 1), s);
};

describe('lista de turnos com a carga em prévia', () => {
  it('a magia lenta entra onde vai sair e o alvo fica marcado', () => {
    // Ladino com CT 80 e velocidade 12: chega a 100 em 2 tiques, antes do Tiro mirado (4 tiques)
    const { rows, targets, at } = queueRows(archerVsRogue(80), { ability: 'aimed_shot', target: { x: 4, y: 0 } }, 4);
    expect(at).toBeGreaterThan(0);
    expect(rows[at]).toEqual({ unit: 'a', charge: 'aimed_shot' });
    expect(targets).toEqual(new Set(['r']));
    // o Ladino joga antes do tiro sair: dá para ver que ele pode sair da casa
    expect(rows.slice(1, at).some((r) => r.unit === 'r' && !r.charge)).toBe(true);
    // com CT 0 o tiro sai antes de o Ladino jogar
    const slow = queueRows(archerVsRogue(0), { ability: 'aimed_shot', target: { x: 4, y: 0 } }, 4);
    expect(slow.rows.slice(1, slow.at).some((r) => r.unit === 'r')).toBe(false);
  });

  it('sem carga (ou fora do "Executar?") é a fila de sempre', () => {
    const b = archerVsRogue();
    expect(queueRows(b, { ability: 'shot', target: { x: 4, y: 0 } }, 4).at).toBe(-1);
    expect(queueRows(b, null, 4).targets.size).toBe(0);
  });
});
