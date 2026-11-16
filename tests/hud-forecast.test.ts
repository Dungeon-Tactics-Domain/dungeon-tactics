import { describe, expect, it } from 'vitest';
import { forecast, forecastText, hpAfterText, strikeInfo } from '../src/client/hud.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT } from '../src/shared/battle/combat.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Strike preview when aiming (Nov 13, Fernando's request, as in FFT and Tactics Ogre): the same calculation as the "Executar?" (Execute?) prompt
const HP = UNIT_DEFS.soldier.hp; // the soldier's full life
const fc = (b: Battle, ability: string, target: Pos) => forecast(b, ability, b.preview(ability, target));

describe('strike preview', () => {
  // the soldier dodges 5% and resists 25% of a physical hit (Nov 15): the preview shows the numbers the roll uses
  it('strike: hit chance, damage and the resulting health as a range, after dodge and resistance', () => {
    const b = new Battle(
      flat(4, 1),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 },
      ]),
    );
    const [f] = fc(b, 'strike', { x: 1, y: 0 });
    expect(ABILITIES.strike).toMatchObject({ damage: [50, 80], accuracy: 90 });
    const [lo, hi] = [37, 60]; // 50 and 80 x 0.75, rounded down
    expect(f).toMatchObject({ chance: 86, dmg: [lo, hi], heal: null, push: 0, after: [HP - hi, HP - lo], ally: false }); // 90 x 0.95
    expect(forecastText(f)).toBe(`acerto 86% · dano ${lo}–${hi}`);
    expect(hpAfterText(f)).toBe(`vida ${HP} → ${HP - hi}–${HP - lo}`);
  });

  it('knockback against the edge: the bump counts in the damage and resulting health', () => {
    const b = new Battle(
      flat(3, 1),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 },
      ]),
    );
    const [f] = fc(b, 'shield_bash', { x: 1, y: 0 });
    expect(ABILITIES.shield_bash).toMatchObject({ damage: [20, 25], accuracy: 95 });
    const [lo, hi] = [15, 18], // x 0.75, rounded down; the bump is not resisted
      bump = COMBAT.BUMP_DAMAGE;
    expect(f.push).toBe(bump);
    expect(f.after).toEqual([HP - hi - bump, HP - lo - bump]); // damage plus the bump at the edge
    expect(forecastText(f)).toBe(`acerto 90% · dano ${lo}–${hi} · empurrão +${bump}`); // 95 x 0.95
    // small line of the preview strip (Tactics Ogre style): who, knockback and resulting health
    expect(strikeInfo(f, 'shield_bash')).toEqual([
      'Soldado',
      `empurrão +${bump}`,
      `vida ${HP} → ${HP - hi - bump}–${HP - lo - bump}`,
    ]);
  });

  it('the resulting health matches the real rule on a hit with knockback', () => {
    const b = new Battle(
      flat(3, 1),
      stateOf(
        [
          { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
          { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    const [f] = fc(b, 'shield_bash', { x: 1, y: 0 });
    b.act('shield_bash', { x: 1, y: 0 });
    const hp = b.state.units.find((u) => u.id === 's')!.hp;
    expect(hp).toBeGreaterThanOrEqual(f.after[0]);
    expect(hp).toBeLessThanOrEqual(f.after[1]);
  });

  it('heal: what goes in, without exceeding full health', () => {
    const b = new Battle(
      flat(4, 1),
      stateOf([
        { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 },
        { id: 'a', def: 'archer', team: 'hero', x: 2, y: 0, hp: 10 },
        { id: 'r', def: 'rogue', team: 'hero', x: 3, y: 0, hp: 125 },
      ]),
    );
    const [hurt] = fc(b, 'heal', { x: 2, y: 0 });
    const [lo, hi] = ABILITIES.heal.heal;
    expect(hurt).toMatchObject({ heal: [lo, hi], dmg: null, after: [10 + lo, 10 + hi], ally: false });
    expect(forecastText(hurt)).toBe(`cura ${lo}–${hi}`);
    expect(fc(b, 'heal', { x: 3, y: 0 })[0].after).toEqual([130, 130]); // Rogue has 130 health
  });

  it('area: one per target, and an ally inside it comes flagged', () => {
    const b = new Battle(
      flat(6, 2),
      stateOf([
        { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 },
        { id: 'e1', def: 'soldier', team: 'enemy', x: 3, y: 0 },
        { id: 'e2', def: 'rogue', team: 'enemy', x: 4, y: 0 },
        { id: 'h', def: 'warrior', team: 'hero', x: 3, y: 1 },
      ]),
    );
    const fs = fc(b, 'blast', { x: 3, y: 0 });
    expect(fs.map((f) => f.unit.id).sort()).toEqual(['e1', 'e2', 'h']);
    expect(fs.find((f) => f.unit.id === 'h')!.ally).toBe(true);
    expect(fs.find((f) => f.unit.id === 'e1')!.ally).toBe(false);
    expect(strikeInfo(fs.find((f) => f.unit.id === 'h')!, 'blast').at(-1)).toBe('ALIADO!');
  });
});
