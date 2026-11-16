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
import { flat, gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

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
    const area = [...chargeDanger(grid, b.state).keys()].sort();
    expect(area).toEqual(['3,3', '4,2', '4,3', '4,4', '5,3'].sort());
    const moved = { ...b.state, units: b.state.units.map((u) => (u.id === 'b' ? { ...u, pos: { x: 6, y: 6 } } : u)) };
    expect(chargeDanger(grid, moved).has('6,6')).toBe(true);
    expect(chargeDanger(grid, moved).has('4,3')).toBe(false);
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

  // Nov 15 grill, in place of FFT's x1.5 (BMG 6, Charging): the soldier's 25 physical becomes -25, its 0 magic -25
  it('whoever is charging loses 50 physical and 25 magic resistance', () => {
    const b = duel('warrior');
    const charging = { unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 3 };
    expect(b.preview('strike', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: 37, dmgMax: 60 }); // 50 and 80 x 0.75
    b.state.charges = [charging];
    expect(b.preview('strike', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: 62, dmgMax: 100 }); // x 1.25
    const m = duel('mage', 2, 3);
    m.state.charges = [charging];
    expect(m.preview('firebolt', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: 62, dmgMax: 100 }); // x 1.25
    // the lowered resistance still stops at -100: twice the damage, no more
    UNIT_DEFS.t_frail = { ...UNIT_DEFS.soldier, id: 't_frail', resist: { phys: -80 } };
    b.state.units[1].def = 't_frail';
    expect(b.preview('strike', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: 100, dmgMax: 160 });
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

// Fernando's charge rules of Nov 15: a charge started at the turn's opening still lets the caster walk with half of what is
// left (rounded down: it loses half, rounded up), the player locks it on the tile or on the character, and the shot is traced
// when it fires, from wherever the caster stands then
describe('charge rules (Nov 15)', () => {
  // 8 movement points, so the table goes past Fernando's example (5 left: loses 3, keeps 2)
  UNIT_DEFS.test_caster = { ...UNIT_DEFS.mage, id: 'test_caster', move: 8 };
  const caster = (spent: number) => {
    const b = duel('test_caster', 1, 3);
    b.state.turn.spent = spent;
    return b;
  };

  it('starting a charge costs half of the movement left, rounded up', () => {
    // [left, kept]
    const table = [
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
      [6, 3],
      [7, 3],
      [8, 4],
    ];
    for (const [left, kept] of table) {
      const b = caster(8 - left);
      b.act('blast', { x: 4, y: 3 });
      expect(8 - (b.state.turn.spent ?? 0), `${left} left`).toBe(kept);
    }
  });

  it('it walks with what is kept; moving then charging leaves Move on the menu, not "Undo move"', () => {
    const b = caster(0);
    b.act('blast', { x: 4, y: 3 });
    expect(Math.max(...[...b.reach().values()].map((s) => s.cost))).toBe(4);
    const m = caster(0);
    m.move({ x: 1, y: 4 });
    m.act('blast', { x: 4, y: 3 });
    expect(m.lastFree).toBe(false); // the last step is the charge: "Undo move" would undo it instead
    expect(m.reach().size).toBeGreaterThan(0);
  });

  it('locked on the character it follows the unit; locked on the tile it hits whoever stands there', () => {
    // Aimed Shot aims at the tile by default; locked on the character, it follows
    const shot = duel('archer', 1, 3);
    shot.act('aimed_shot', { x: 4, y: 3 }, 'unit');
    expect(shot.state.charges[0].follow).toBe('b');
    shot.state.units[1].pos = { x: 4, y: 5 };
    expect(untilResolved(shot).find((e) => e.k === 'attack')).toMatchObject({ target: { x: 4, y: 5 } });
    // Blast follows by default; locked on the tile, it stays: the target leaves and another one steps in
    const blast = duel('mage', 1, 3);
    blast.act('blast', { x: 4, y: 3 }, 'tile');
    expect(blast.state.charges[0].follow).toBeNull();
    blast.state.units[1].pos = { x: 6, y: 6 };
    blast.state.units[2].pos = { x: 4, y: 3 };
    const out = untilResolved(blast);
    const struck = out.filter((e) => e.k === 'hit' || e.k === 'miss').map((e) => (e as { unit: string }).unit);
    expect(out.find((e) => e.k === 'attack')).toMatchObject({ target: { x: 4, y: 3 } });
    expect(struck).toEqual(['c']);
  });

  it('the shot is traced when it fires: a caster who walked behind a wall has it stop on the wall', () => {
    const g = gridOf(['........', '........', '........', '........', '.##.....', '........']);
    const b = new Battle(
      g,
      stateOf(
        [
          { id: 'a', def: 'archer', team: 'hero', x: 0, y: 3 },
          { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 3 },
          { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    b.act('aimed_shot', { x: 3, y: 3 }, 'unit');
    expect(b.move({ x: 0, y: 5 }).length).toBeGreaterThan(0);
    const out = untilResolved(b);
    const at = (out.find((e) => e.k === 'attack') as { target: { x: number; y: number } }).target;
    expect(g.tiles[at.y * g.width + at.x].terrain).toBe(g.tiles[4 * g.width + 1].terrain); // the wall
    expect(out.some((e) => (e.k === 'hit' || e.k === 'miss') && e.unit === 'b')).toBe(false);
  });

  it('save and load keep the lock and the movement the charge left', () => {
    const b = Battle.start(SCENARIOS.skirmish, 1);
    const me = b.actor;
    const foe = b.state.units.find((u) => u.team !== me.team)!;
    b.state.turn.spent = 3;
    b.state.charges = [
      { unit: me.id, ability: UNIT_DEFS[me.def].abilities[0], target: foe.pos, follow: foe.id, ticks: 2 },
    ];
    const back = Battle.load(b.save())!;
    expect(back.state.charges).toEqual(b.state.charges);
    expect(back.state.turn.spent).toBe(3);
    const raw = JSON.parse(b.save());
    raw.state.charges[0].follow = 'nobody';
    expect(Battle.load(JSON.stringify(raw))).toBeNull(); // a lock on a unit that is not there: the save is refused
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

  // the game's resistances stay out of the study (Rules.defence): x1.5 from a physical hit on a charging unit, x1 from a
  // spell (BMG 6, Charging status), and a spell shows no side, since FFT's magic ignores facing
  it('a charging unit takes x1.5 from a physical hit and x1 from a spell; a spell shows no side', () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    const wizard = b.state.units.find((u) => u.id === 'wizard')!;
    const knight = b.state.units.find((u) => u.id === 'e-knight')!;
    const fighter = b.state.units.find(
      (u) => u.team === 'hero' && !ABILITIES[UNIT_DEFS[u.def].abilities[0]].magic && UNIT_DEFS[u.def].speed > 0,
    )!;
    wizard.pos = { x: 5, y: 5 };
    knight.pos = { x: 5, y: 7 };
    knight.facing = 0; // the wizard stands to its side
    fighter.pos = { x: 5, y: 8 };
    const swing = UNIT_DEFS[fighter.def].abilities[0];
    const aim = (unit: string, ability: string) => {
      b.state.turn = { actor: unit, moved: false, usedAbility: null };
      return b.preview(ability, { x: 5, y: 7 }).targets[0];
    };
    const [fire, hit] = [aim('wizard', 'fft_wizard_fire'), aim(fighter.id, swing)];
    expect(fire.side).toBe('front');
    b.state.charges = [
      { unit: 'e-knight', ability: 'fft_wizard_fire', target: { x: 5, y: 5 }, follow: null, ticks: 3 },
    ];
    expect(aim('wizard', 'fft_wizard_fire')).toMatchObject({ dmgMin: fire.dmgMin, dmgMax: fire.dmgMax });
    expect(aim(fighter.id, swing)).toMatchObject({ dmgMax: Math.floor(hit.dmgMax * 1.5) });
  });
});
