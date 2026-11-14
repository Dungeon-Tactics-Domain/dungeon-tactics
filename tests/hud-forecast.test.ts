import { describe, expect, it } from 'vitest';
import { forecast, forecastText, hpAfterText, strikeInfo } from '../src/client/hud.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT } from '../src/shared/battle/combat.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

// Strike preview when aiming (Nov 13, Fernando's request, as in FFT and Tactics Ogre): the same calculation as the "Executar?" (Execute?) prompt
const fc = (b: Battle, ability: string, target: Pos) => forecast(b, ability, b.preview(ability, target));

describe('strike preview', () => {
  it('strike: hit chance, damage and the resulting health as a range', () => {
    const b = new Battle(
      flat(4, 1),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 's', def: 'soldier', team: 'enemy', x: 1, y: 0 },
      ]),
    );
    const [f] = fc(b, 'strike', { x: 1, y: 0 });
    const [lo, hi] = ABILITIES.strike.damage; // the numbers come from the table (changed with the x1.75 damage of Nov 13)
    expect(f).toMatchObject({ chance: 90, dmg: [lo, hi], heal: null, push: 0, after: [45 - hi, 45 - lo], ally: false });
    expect(forecastText(f)).toBe(`acerto 90% · dano ${lo}–${hi}`);
    expect(hpAfterText(f)).toBe(`vida 45 → ${45 - hi}–${45 - lo}`);
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
    const [lo, hi] = ABILITIES.shield_bash.damage,
      bump = COMBAT.BUMP_DAMAGE;
    expect(f.push).toBe(bump);
    expect(f.after).toEqual([45 - hi - bump, 45 - lo - bump]); // damage plus the bump at the edge
    expect(forecastText(f)).toBe(`acerto 95% · dano ${lo}–${hi} · empurrão +${bump}`);
    // small line of the preview strip (Tactics Ogre style): who, knockback and resulting health
    expect(strikeInfo(f, 'shield_bash')).toEqual([
      'Soldado',
      `empurrão +${bump}`,
      `vida 45 → ${45 - hi - bump}–${45 - lo - bump}`,
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
        { id: 'r', def: 'rogue', team: 'hero', x: 3, y: 0, hp: 25 },
      ]),
    );
    const [hurt] = fc(b, 'heal', { x: 2, y: 0 });
    const [lo, hi] = ABILITIES.heal.heal;
    expect(hurt).toMatchObject({ heal: [lo, hi], dmg: null, after: [10 + lo, 10 + hi], ally: false });
    expect(forecastText(hurt)).toBe(`cura ${lo}–${hi}`);
    expect(fc(b, 'heal', { x: 3, y: 0 })[0].after).toEqual([26, 26]); // Rogue has 26 health
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
