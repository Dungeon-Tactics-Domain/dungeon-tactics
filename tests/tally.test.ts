import { describe, expect, it } from 'vitest';
import { addEvents, emptyTally, mvp } from '../src/client/tally.ts';
import type { Team } from '../src/shared/battle/types.ts';

const team: Record<string, Team> = { h1: 'hero', h2: 'hero', e1: 'enemy', e2: 'enemy' };
const at = { x: 0, y: 0 };

describe('placar da batalha', () => {
  it('soma o dano e os derrubados de quem atacou, inclusive batida e queda do empurrão', () => {
    const t = emptyTally();
    addEvents(t, [{ k: 'attack', unit: 'h1', ability: 'strike', target: at }, { k: 'hit', unit: 'e1', dmg: 8, chance: 90 },
      { k: 'push', unit: 'e1', to: at }, { k: 'bump', unit: 'e1', dmg: 3 }, { k: 'die', unit: 'e1' }], team);
    expect(t.scores.h1).toEqual({ dmg: 11, kills: 1 });
  });

  it('não conta dano no próprio lado (cura, espinho do fim da vez, área que pega aliado)', () => {
    const t = emptyTally();
    addEvents(t, [{ k: 'attack', unit: 'h1', ability: 'blast', target: at }, { k: 'hit', unit: 'h2', dmg: 5, chance: 90 },
      { k: 'heal', unit: 'h2', amount: 4 }, { k: 'spike', unit: 'h1', dmg: 6 }], team);
    expect(t.scores.h1).toBeUndefined();
  });

  it('espinho de quem terminou a vez em cima dele não vai para quem atacou antes; o do empurrão vai', () => {
    const t = emptyTally();
    addEvents(t, [{ k: 'attack', unit: 'h1', ability: 'strike', target: at }, { k: 'hit', unit: 'e1', dmg: 4, chance: 90 }], team);
    addEvents(t, [{ k: 'spike', unit: 'e2', dmg: 6 }, { k: 'die', unit: 'e2' }], team); // vez do e2: parou nos espinhos
    expect(t.scores.h1).toEqual({ dmg: 4, kills: 0 });
    addEvents(t, [{ k: 'attack', unit: 'h1', ability: 'shield_bash', target: at }, { k: 'push', unit: 'e1', to: at }, { k: 'spike', unit: 'e1', dmg: 6 }], team);
    expect(t.scores.h1).toEqual({ dmg: 10, kills: 0 });
  });

  it('o destaque do lado é quem mais derrubou; empate pelo dano', () => {
    const t = emptyTally();
    addEvents(t, [{ k: 'attack', unit: 'h1', ability: 'strike', target: at }, { k: 'hit', unit: 'e1', dmg: 20, chance: 90 },
      { k: 'attack', unit: 'h2', ability: 'shot', target: at }, { k: 'hit', unit: 'e2', dmg: 5, chance: 90 }, { k: 'die', unit: 'e2' },
      { k: 'attack', unit: 'e1', ability: 'strike', target: at }, { k: 'hit', unit: 'h1', dmg: 9, chance: 90 }], team);
    expect(mvp(t, team, 'hero')).toEqual(['h2', { dmg: 5, kills: 1 }]);
    expect(mvp(t, team, 'enemy')?.[0]).toBe('e1');
    expect(mvp(emptyTally(), team, 'hero')).toBeNull();
  });
});
