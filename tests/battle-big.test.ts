import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulatePush } from '../src/shared/battle/combat.ts';
import { footprint, reachable, unitAt } from '../src/shared/battle/pathing.ts';
import { CHAPTERS, chapterScenario } from '../src/client/campaign.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Unidade grande (noite de 12/11): o Colosso ocupa 2x2 a partir da casa de cima à esquerda, não anda nem é empurrado
const grid = flat(8, 8);
const scene = () => new Battle(grid, stateOf([
  { id: 'a', def: 'warrior', team: 'hero', x: 3, y: 5 },
  { id: 'big', def: 'colossus', team: 'enemy', x: 3, y: 3 },
  { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 7 },
], HIT_SEED));

describe('unidade grande (2x2)', () => {
  it('as 4 casas são dela: quem está ali é o Colosso, e ninguém anda por elas', () => {
    const b = scene();
    const big = b.state.units[1];
    expect(footprint(big)).toEqual([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }]);
    for (const p of footprint(big)) expect(unitAt(b.state, p)?.id).toBe('big');
    const reach = [...reachable(grid, b.state, 'a').values()].map((s) => `${s.pos.x},${s.pos.y}`);
    expect(reach).not.toContain('3,4');
    expect(reach).not.toContain('4,4');
  });

  it('mirar qualquer casa dele acerta o Colosso uma vez só, mesmo com área', () => {
    const b = scene();
    expect(b.preview('strike', { x: 3, y: 4 }).targets.map((t) => t.unit)).toEqual(['big']);
    expect(b.preview('spin', { x: 3, y: 5 }).targets.map((t) => t.unit)).toEqual(['big']);
  });

  it('magia com carga no alcance máximo de uma casa dele sai no Colosso (antes media até a casa de canto e falhava)', () => {
    const g = flat(10, 10);
    const b = new Battle(g, stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 4, y: 9 },
      { id: 'big', def: 'colossus', team: 'enemy', x: 3, y: 3 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 9 },
    ], HIT_SEED));
    expect(b.act('blast', { x: 4, y: 4 }).map((e) => e.k)).toEqual(['charge']);
    const out: string[] = [];
    for (let i = 0; i < 12 && b.state.charges.length; i++) out.push(...b.endTurn().map((e) => e.k));
    expect(out).not.toContain('fizzle');
    expect(out).toContain('attack');
  });

  it('empurrão não move a unidade grande', () => {
    const b = scene();
    const big = b.state.units[1];
    expect(simulatePush(grid, b.state, big, { x: 3, y: 4 }, { x: 3, y: 5 }, 2)).toMatchObject({ to: big.pos, dmg: 0, events: [] });
  });

  it('na fase 7 o chefe é o Colosso, com as 4 casas livres no cume', () => {
    const n = CHAPTERS.length - 1;
    const s = chapterScenario(n);
    const boss = s.spawns.find((sp) => sp.id === 'e0')!;
    expect(UNIT_DEFS[boss.def].size).toBe(2);
    const st = Battle.start(s, 1).state;
    const big = st.units.find((u) => u.id === 'e0')!;
    for (const p of footprint(big)) expect(unitAt(st, p)?.id).toBe('e0');
  });
});
