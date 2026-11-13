import { describe, expect, it } from 'vitest';
import { forecast, forecastText, hpAfterText } from '../src/client/hud.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

// Prévia do golpe ao mirar (13/11, pedido do Fernando, como no FFT e no Tactics Ogre): a mesma conta do "Executar?"
const fc = (b: Battle, ability: string, target: Pos) => forecast(b, ability, b.preview(ability, target));

describe('prévia do golpe', () => {
  it('golpe: acerto, dano e a vida depois em faixa', () => {
    const b = new Battle(flat(4, 1), stateOf([{ id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 }]));
    const [f] = fc(b, 'strike', { x: 1, y: 0 });
    expect(f).toMatchObject({ chance: 90, dmg: [6, 9], heal: null, push: 0, after: [36, 39], ally: false });
    expect(forecastText(f)).toBe('acerto 90% · dano 6–9');
    expect(hpAfterText(f)).toBe('vida 45 → 36–39');
  });

  it('empurrão contra a borda: a batida entra no dano e na vida depois', () => {
    const b = new Battle(flat(3, 1), stateOf([{ id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 }]));
    const [f] = fc(b, 'shield_bash', { x: 1, y: 0 });
    expect(f.push).toBe(3);
    expect(f.after).toEqual([39, 40]); // 45 − (2 a 3) − 3 da batida
    expect(forecastText(f)).toBe('acerto 95% · dano 2–3 · empurrão +3');
  });

  it('a vida depois bate com a regra de verdade num acerto com empurrão', () => {
    const b = new Battle(flat(3, 1), stateOf([{ id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 }], HIT_SEED));
    const [f] = fc(b, 'shield_bash', { x: 1, y: 0 });
    b.act('shield_bash', { x: 1, y: 0 });
    const hp = b.state.units.find((u) => u.id === 's')!.hp;
    expect(hp).toBeGreaterThanOrEqual(f.after[0]);
    expect(hp).toBeLessThanOrEqual(f.after[1]);
  });

  it('cura: o que entra, sem passar da vida cheia', () => {
    const b = new Battle(flat(4, 1), stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 }, { id: 'a', def: 'archer', team: 'hero', x: 2, y: 0, hp: 10 }, { id: 'r', def: 'rogue', team: 'hero', x: 3, y: 0, hp: 25 },
    ]));
    const [hurt] = fc(b, 'heal', { x: 2, y: 0 });
    expect(hurt).toMatchObject({ heal: [7, 10], dmg: null, after: [17, 20], ally: false });
    expect(forecastText(hurt)).toBe('cura 7–10');
    expect(fc(b, 'heal', { x: 3, y: 0 })[0].after).toEqual([26, 26]); // Ladino tem 26 de vida
  });

  it('área: um por alvo, e o aliado dentro dela vem marcado', () => {
    const b = new Battle(flat(6, 2), stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 }, { id: 'e1', def: 'soldier', team: 'enemy', x: 3, y: 0 },
      { id: 'e2', def: 'rogue', team: 'enemy', x: 4, y: 0 }, { id: 'h', def: 'warrior', team: 'hero', x: 3, y: 1 },
    ]));
    const fs = fc(b, 'blast', { x: 3, y: 0 });
    expect(fs.map((f) => f.unit.id).sort()).toEqual(['e1', 'e2', 'h']);
    expect(fs.find((f) => f.unit.id === 'h')!.ally).toBe(true);
    expect(fs.find((f) => f.unit.id === 'e1')!.ally).toBe(false);
  });
});
