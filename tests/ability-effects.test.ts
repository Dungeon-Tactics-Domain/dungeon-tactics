import { describe, expect, it } from 'vitest';
import { eventLog } from '../src/client/battle-text.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { abilityKind } from '../src/shared/battle/action-slots.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { moveOf } from '../src/shared/battle/effects.ts';
import type { UnitState } from '../src/shared/battle/types.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Fernando, Nov 21: the Warrior's Shield bash stuns (no actions on the target's next turn, half its movement) and its
// secondary Shove pushes 2 half tiles; the Archer's secondary Throw sand takes 25% of a foe's aim and movement for its
// next turn, and Focus gives its next attack 25% more damage and aim
const duel = (hero: string, foe = 'soldier', at = { x: 4, y: 3 }) => {
  const s = stateOf(
    [
      { id: 'a', def: hero, team: 'hero', x: 3, y: 3 },
      { id: 'b', def: foe, team: 'enemy', ...at },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 7 },
    ],
    HIT_SEED,
  );
  s.turn = { actor: 'a', moved: false, main: null, bonus: null };
  return new Battle(flat(8, 8), s);
};
const unit = (b: Battle, id: string) => b.state.units.find((u) => u.id === id) as UnitState;
// ends turns until `id` acts (the others only wait)
const until = (b: Battle, id: string) => {
  for (let i = 0; i < 30 && b.state.turn.actor !== id; i++) b.endTurn();
};

describe('Shield bash and Shove (Warrior, Nov 21)', () => {
  it('the bash stuns: on its next turn the target cannot act and walks half, then it wears off', () => {
    const b = duel('warrior');
    const full = moveOf(b.state, unit(b, 'b'));
    b.act('shield_bash', { x: 4, y: 3 });
    expect(unit(b, 'b').pos).toEqual({ x: 4, y: 3 }); // no push any more: that is the Shove
    until(b, 'b');
    expect(previewAbility(b.grid, b.state, 'b', 'strike', { x: 3, y: 3 })).toMatchObject({
      ok: false,
      reason: 'stunned',
    });
    expect(moveOf(b.state, unit(b, 'b'))).toBe(Math.floor(full / 2));
    b.endTurn();
    until(b, 'b');
    expect(previewAbility(b.grid, b.state, 'b', 'strike', { x: 3, y: 3 }).ok).toBe(true);
    expect(moveOf(b.state, unit(b, 'b'))).toBe(full);
  });

  it('the stun is said: an effect event, a line in the log', () => {
    const b = duel('warrior');
    const ev = b.act('shield_bash', { x: 4, y: 3 });
    expect(ev).toContainEqual({ k: 'effect', unit: 'b', item: 'shield_bash', turns: 1 });
    expect(eventLog(ev, b.state)).toContain('Soldado atordoado: sem ações, −50% de movimento');
  });

  it('the bash hits for less than a weapon blow', () => {
    expect(ABILITIES.shield_bash.damage[1]).toBeLessThan(ABILITIES.strike.damage[0]);
  });

  it('the Shove is a secondary action that pushes one whole tile (2 half tiles) and deals no damage', () => {
    const b = duel('warrior');
    expect(abilityKind(ABILITIES.shove)).toBe('bonus');
    const hp = unit(b, 'b').hp;
    b.act('shove', { x: 4, y: 3 });
    expect(unit(b, 'b').pos).toEqual({ x: 5, y: 3 });
    expect(unit(b, 'b').hp).toBe(hp);
  });
});

describe('Throw sand and Focus (Archer, Nov 21)', () => {
  it('sand is a secondary action on a foe beside it, never further', () => {
    expect(abilityKind(ABILITIES.sand)).toBe('bonus');
    const far = duel('archer', 'soldier', { x: 5, y: 3 });
    expect(previewAbility(far.grid, far.state, 'a', 'sand', { x: 5, y: 3 }).ok).toBe(false);
    const diag = duel('archer', 'soldier', { x: 4, y: 4 });
    expect(previewAbility(diag.grid, diag.state, 'a', 'sand', { x: 4, y: 4 }).ok).toBe(true);
  });

  it("sand takes 25% of the foe's aim and movement for its next turn, and deals no damage", () => {
    const b = duel('archer');
    const before = previewAbility(b.grid, b.state, 'b', 'strike', { x: 3, y: 3 });
    const move = moveOf(b.state, unit(b, 'b'));
    const hp = unit(b, 'b').hp;
    b.act('sand', { x: 4, y: 3 });
    expect(unit(b, 'b').hp).toBe(hp);
    until(b, 'b');
    const after = previewAbility(b.grid, b.state, 'b', 'strike', { x: 3, y: 3 });
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(after.targets[0].chance).toBe(Math.floor((before.targets[0].chance * 75) / 100));
    expect(moveOf(b.state, unit(b, 'b'))).toBe(Math.floor((move * 75) / 100));
    b.endTurn();
    until(b, 'b');
    expect(moveOf(b.state, unit(b, 'b'))).toBe(move);
  });

  it('Focus is a secondary action on itself: the next attack hits 25% harder and surer, once', () => {
    const b = duel('archer', 'soldier', { x: 3, y: 6 });
    expect(abilityKind(ABILITIES.focus)).toBe('bonus');
    const plain = previewAbility(b.grid, b.state, 'a', 'shot', { x: 3, y: 6 });
    b.act('focus', { x: 3, y: 3 });
    const sharp = previewAbility(b.grid, b.state, 'a', 'shot', { x: 3, y: 6 });
    expect(plain.ok && sharp.ok).toBe(true);
    if (!plain.ok || !sharp.ok) return;
    expect(Math.abs(sharp.targets[0].dmgMax - plain.targets[0].dmgMax * 1.25)).toBeLessThanOrEqual(1); // one rounding
    expect(sharp.targets[0].chance).toBeGreaterThan(plain.targets[0].chance);
    b.act('shot', { x: 3, y: 6 });
    const again = previewAbility(b.grid, b.state, 'a', 'shot', { x: 3, y: 6 });
    expect(again.ok && again.targets[0].dmgMax).toBe(plain.targets[0].dmgMax); // spent on that shot
  });
});
