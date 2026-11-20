import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { slotFor } from '../src/shared/battle/action-slots.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { actionOptions } from '../src/shared/battle/options.ts';
import { parseBattleState } from '../src/shared/battle/parse-state.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Fernando, Nov 20: the Throwing knife is a main action at full damage or the secondary one at half; when both slots are
// free the player picks at the end (the Agir slot step), else the free one is used
const knife = ABILITIES.throwing_knife;
const scene = () => {
  const s = stateOf(
    [
      { id: 'r', def: 'rogue', team: 'hero', x: 0, y: 1 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 3, y: 1 },
    ],
    HIT_SEED,
  );
  s.units[1].facing = 0; // from the side: the Rogue's flank damage adds nothing
  return new Battle(flat(6, 3), s);
};
const at = { x: 3, y: 1 };
const dealt = (events: ReturnType<Battle['act']>) =>
  events.flatMap((e) => (e.k === 'hit' && e.unit === 'f' ? [e.dmg] : []))[0];

describe('an action that is main or secondary (Nov 20)', () => {
  it('the knife can be either; a plain main ability only the main', () => {
    expect(knife.bonusShare).toBe(50);
    const turn = { actor: 'r', moved: false, main: null, bonus: null } as never;
    expect(slotFor(turn, knife)).toBe('main');
    expect(slotFor(turn, knife, 'bonus')).toBe('bonus');
    expect(slotFor({ ...(turn as object), main: 'stab' } as never, knife)).toBe('bonus');
    expect(slotFor({ ...(turn as object), main: 'stab', bonus: 'trip' } as never, knife)).toBeNull();
    expect(slotFor(turn, ABILITIES.stab, 'bonus')).toBeNull();
    // a secondary never spills into the main slot when asked for the secondary
    expect(slotFor({ ...(turn as object), bonus: 'trip' } as never, knife, 'bonus')).toBeNull();
  });

  it('as the secondary it deals half the damage, fills the secondary slot and leaves the main free', () => {
    const b = scene();
    const full = previewAbility(b.grid, b.state, 'r', 'throwing_knife', at).targets[0];
    const half = previewAbility(b.grid, b.state, 'r', 'throwing_knife', at, false, undefined, 0.5).targets[0];
    expect([half.dmgMin, half.dmgMax]).toEqual([Math.floor(full.dmgMin / 2), Math.floor(full.dmgMax / 2)]);
    const dmg = dealt(b.act('throwing_knife', at, undefined, 'bonus'));
    expect(dmg).toBeGreaterThanOrEqual(half.dmgMin);
    expect(dmg).toBeLessThanOrEqual(half.dmgMax);
    expect(b.state.turn).toMatchObject({ main: null, bonus: 'throwing_knife' });
  });

  it('as the main it deals full damage; with the main spent it goes to the secondary at half by itself', () => {
    const b = scene();
    const full = previewAbility(b.grid, b.state, 'r', 'throwing_knife', at).targets[0];
    const dmg = dealt(b.act('throwing_knife', at, undefined, 'main'));
    expect(dmg).toBeGreaterThanOrEqual(full.dmgMin);
    expect(b.state.turn.main).toBe('throwing_knife');
    const c = scene();
    c.state.turn.main = 'stab';
    const half = previewAbility(c.grid, c.state, 'r', 'throwing_knife', at, false, undefined, 0.5).targets[0];
    expect(dealt(c.act('throwing_knife', at))).toBeLessThanOrEqual(half.dmgMax);
    expect(c.state.turn.bonus).toBe('throwing_knife');
  });

  it('the Agir options keep it on while either slot is free; a save keeps it in the secondary slot', () => {
    const b = scene();
    b.state.turn.main = 'stab';
    const o = actionOptions(b.grid, b.state, 'r').find((x) => x.ability === 'throwing_knife')!;
    expect(o.enabled).toBe(true);
    b.state.turn.bonus = 'trip';
    expect(actionOptions(b.grid, b.state, 'r').find((x) => x.ability === 'throwing_knife')).toMatchObject({
      enabled: false,
      reason: 'used',
    });
    // a real save (the parser wants a known map) with its actor made a Rogue
    const save = (bonus: string) => {
      const s = JSON.parse(JSON.stringify(Battle.start(SCENARIOS.skirmish, 1).state));
      const actor = s.units.find((u: { id: string }) => u.id === s.turn.actor);
      Object.assign(actor, { def: 'rogue', hp: 1, vars: undefined });
      return parseBattleState({ ...s, turn: { ...s.turn, bonus } });
    };
    expect(save('throwing_knife')?.turn.bonus).toBe('throwing_knife');
    expect(save('stab')).toBeNull(); // a main-only damage ability never sits in the secondary slot
  });
});
