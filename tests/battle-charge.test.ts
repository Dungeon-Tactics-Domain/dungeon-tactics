import { describe, expect, it } from 'vitest';
import { chargeDanger } from '../src/client/interaction.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { resolveAbility } from '../src/shared/battle/combat.ts';
import { CLASSES_BATTLE, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { previewOrder } from '../src/shared/battle/turn-queue.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Charged actions (Nov 12, FFT turn rules on all maps): declared on the turn, resolves after N ticks
// (BMG 1.1 and A.2). Since the Nov 12 decision ("Like FFT") only spells and Aimed Shot charge: Explosion 4 and follows the unit,
// Aimed Shot 4 and targets the tile; a physical hit resolves immediately.
const grid = flat(8, 8);
const duel = (attacker: string, x = 3, y = 3) =>
  new Battle(
    grid,
    stateOf(
      [
        { id: 'a', def: attacker, team: 'hero', x, y },
        { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 3 },
        { id: 'c', def: 'soldier', team: 'enemy', x: 7, y: 7 },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 7 }, // without the target to protect the game is an instant defeat
      ],
      HIT_SEED,
    ),
  );
// passes turns (without acting) until the charge resolves; returns all events
function untilResolved(b: Battle): BattleEvent[] {
  const all: BattleEvent[] = [];
  for (let i = 0; i < 12 && b.state.charges.length; i++) all.push(...b.endTurn());
  return all;
}

describe('charged actions', () => {
  it('the charge area lights up where it will land and follows the unit (chargeDanger, warning to leave the area)', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    const area = [...chargeDanger(b.state, 8, 8).keys()].sort();
    expect(area).toEqual(['3,3', '4,2', '4,3', '4,4', '5,3'].sort());
    const moved = { ...b.state, units: b.state.units.map((u) => (u.id === 'b' ? { ...u, pos: { x: 6, y: 6 } } : u)) };
    expect(chargeDanger(moved, 8, 8).has('6,6')).toBe(true);
    expect(chargeDanger(moved, 8, 8).has('4,3')).toBe(false);
  });

  it('declaring does not hit right away: it enters the queue and resolves later, with the hit', () => {
    const b = duel('mage', 1, 3);
    const hp = b.state.units[1].hp;
    expect(b.act('blast', { x: 4, y: 3 }).map((e) => e.k)).toEqual(['charge']);
    expect(b.state.units[1].hp).toBe(hp);
    expect(b.state.charges).toEqual([{ unit: 'a', ability: 'blast', target: { x: 4, y: 3 }, follow: 'b', ticks: 4 }]);
    expect(previewOrder(b.state, 8).some((e) => e.charge === 'blast')).toBe(true);
    const out = untilResolved(b);
    expect(out[0]).toMatchObject({ k: 'attack', unit: 'a', ability: 'blast' });
    expect(b.state.charges).toEqual([]);
  });

  it("a physical hit resolves immediately; only spells, Aimed Shot and the Lancer's Jump charge (Nov 12 and Nov 13)", () => {
    const charged = Object.values(ABILITIES)
      .filter((a) => a.charge > 0 && !a.id.startsWith('fft_'))
      .map((a) => a.id)
      .sort();
    expect(charged).toEqual(['aimed_shot', 'blast', 'gust', 'heal', 'lance_jump', 'shadow_wave']);
    expect(Object.values(ABILITIES).filter((a) => a.charge > 0 && !a.magic && !a.panel)).toEqual([]);
    expect(duel('warrior').act('heavy_strike', { x: 4, y: 3 })[0].k).toBe('attack');
  });

  it('Aimed Shot targets the tile: a target that leaves it makes the charge find nobody', () => {
    const b = duel('archer', 1, 3);
    b.act('aimed_shot', { x: 4, y: 3 });
    b.state.units[1].pos = { x: 4, y: 5 };
    expect(untilResolved(b)).toContainEqual({ k: 'fizzle', unit: 'a', ability: 'aimed_shot' });
  });

  it('Explosion follows the unit that was on the tile', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    b.state.units[1].pos = { x: 4, y: 4 };
    const out = untilResolved(b);
    expect(out[0]).toMatchObject({ k: 'attack', target: { x: 4, y: 4 } });
  });

  it('moves after declaring and the charge continues (Nov 13, Fernando\'s request: "can move to cast it farther")', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    expect(b.reach().size).toBeGreaterThan(0);
    b.move({ x: 1, y: 4 });
    expect(b.state.charges.length).toBe(1);
  });

  it('whoever is charging takes 50% more physical attack, not magic (BMG 6, Charging)', () => {
    const b = duel('warrior');
    b.state.charges = [{ unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 3 }];
    const [lo, hi] = ABILITIES.strike.damage;
    expect(b.preview('strike', { x: 4, y: 3 }).targets[0]).toMatchObject({
      dmgMin: Math.floor(lo * 1.5),
      dmgMax: Math.floor(hi * 1.5),
    });
    const m = duel('mage', 2, 3);
    m.state.charges = [{ unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 3 }];
    expect(m.preview('firebolt', { x: 4, y: 3 }).targets[0]).toMatchObject({
      dmgMin: ABILITIES.firebolt.damage[0],
      dmgMax: ABILITIES.firebolt.damage[1],
    });
  });

  it('the AI turn brings the events of charges that resolve before the next turn', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    const all: BattleEvent[] = [...b.endTurn()];
    for (let i = 0; i < 6 && !all.some((e) => e.k === 'attack' && e.ability === 'blast'); i++)
      all.push(...playAiTurn(b));
    expect(all.some((e) => e.k === 'attack' && e.ability === 'blast')).toBe(true);
  });

  it('whoever dies loses the charge; a charge that followed the dead unit now targets its tile (found in the showcase, Nov 12)', () => {
    const b = duel('warrior');
    b.state.charges = [
      { unit: 'a', ability: 'heavy_strike', target: { x: 4, y: 3 }, follow: 'b', ticks: 3 },
      { unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 2 },
    ];
    b.state.units[1].hp = 1;
    resolveAbility(b.grid, b.state, 'a', 'strike', { x: 4, y: 3 });
    expect(b.state.units.some((u) => u.id === 'b')).toBe(false);
    expect(b.state.charges).toEqual([
      { unit: 'a', ability: 'heavy_strike', target: { x: 4, y: 3 }, follow: null, ticks: 3 },
    ]);
    expect(() => previewOrder(b.state, 8)).not.toThrow();
  });

  it('save and load keeps the charges; a charge with a tick out of range is rejected', () => {
    const b = Battle.start(SCENARIOS.skirmish, 1);
    b.state.charges = [
      {
        unit: b.actor.id,
        ability: UNIT_DEFS[b.actor.def].abilities[0],
        target: { x: 2, y: 2 },
        follow: null,
        ticks: 3,
      },
    ];
    expect(Battle.load(b.save())?.state.charges).toEqual(b.state.charges);
    const raw = JSON.parse(b.save());
    raw.state.charges[0].ticks = 500;
    expect(Battle.load(JSON.stringify(raw))).toBeNull();
  });
});

describe('charges in the FFT study (BMG 2.2, 3.3)', () => {
  registerFftStudy();
  it('Fire charges 4 ticks and spends MP only once, when it starts', () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    const wizard = b.state.units.find((u) => u.id === 'wizard')!;
    const knight = b.state.units.find((u) => u.id === 'e-knight')!;
    wizard.pos = { x: 5, y: 5 };
    knight.pos = { x: 5, y: 7 };
    b.state.turn = { actor: 'wizard', moved: false, usedAbility: null };
    b.act('fft_wizard_fire', { x: 5, y: 7 });
    expect(wizard.vars!.mp).toBe(11);
    expect(b.state.charges[0].ticks).toBe(4);
    untilResolved(b);
    expect(b.state.units.find((u) => u.id === 'wizard')!.vars!.mp).toBe(11);
  });
});
