import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { chooseTurn, playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import {
  faithMagic,
  hitPercent,
  magicHitPercent,
  sideOf,
  statBreakBase,
  wish,
} from '../src/shared/battle/fft/formulas.ts';
import { CLASSES_BATTLE, GARILAND, POTION_STOCK, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { seedWhere } from './battle-helpers.ts';

// FFT study supplements (Fernando's request, Nov 11): facing, missing abilities, four classes and stock
// of potions. Source of the formulas: Battle Mechanics Handbook v6.1 (docs/game-design/referencia-fft.md).
registerFftStudy();

describe('FFT: where the attack comes from (BMG 1.4, diagram)', () => {
  it("reproduces the guide's 5x5 diagram, with the target in the center facing down", () => {
    // rows top to bottom, as in the guide; X = the target
    const diagram = ['SBBBS', 'SSBSS', 'SSXSS', 'SFFFS', 'FFFFF'];
    const name = { S: 'side', B: 'back', F: 'front' } as const;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const c = diagram[row][col] as 'S' | 'B' | 'F' | 'X';
        if (c === 'X') continue;
        expect(sideOf({ x: 2, y: 2 }, { x: 0, y: 1 }, { x: col, y: row }), `${col},${row}`).toBe(name[c]);
      }
    }
  });

  it('guide example: from the side, a 40% shield and a 40% mantle leave a 36% hit chance', () => {
    expect(hitPercent(100, { c: 10, s: 40, a: 40, w: 0 }, 'side')).toBe(36);
  });

  it('guide example: Flare against a 15% magic shield and a 30% mantle hits 59%', () => {
    expect(magicHitPercent(100, 15, 30)).toBe(59);
  });
});

describe('FFT: formulas of the new abilities', () => {
  it('Fire and Heal: [(MA * fé * fé * 14) / 10000] (BMG 3.4)', () => {
    expect(faithMagic(6, 60, 60, 14)).toBe(30); // Black Mage level 1, MA 6
    expect(faithMagic(4, 60, 60, 14)).toBe(20); // White Mage level 1, MA 4
    expect(faithMagic(6, 100, 100, 14)).toBe(84); // full faith on both sides: MA * Q
  });

  it('Wish heals RU{MaxHP * 2/5} and costs RU{MaxHP / 5} (BMG 3.3)', () => {
    expect(wish(51)).toEqual([21, 11]); // Ramza from the study
    expect(wish(50)).toEqual([20, 10]);
  });

  it('stat break starts at (PA + 50)% (BMG 3.6)', () => {
    expect(statBreakBase(6)).toBe(56);
  });
});

const at = (b: Battle, id: string) => b.state.units.find((u) => u.id === id)!;
const put = (b: Battle, id: string, x: number, y: number, facing?: number) => {
  const u = at(b, id);
  u.pos = { x, y };
  if (facing !== undefined) u.facing = facing;
};
const chance = (b: Battle, ability: string, x: number, y: number) => b.preview(ability, { x, y }).targets[0].chance;

describe('FFT Gariland: facing', () => {
  const start = () => {
    const b = Battle.start(GARILAND, 1);
    b.state.turn.actor = 'ramza';
    return b;
  };

  it('heroes spawn facing +y and enemies -y; on the game maps each faces the nearest enemy (Nov 13), without counters', () => {
    const b = start();
    expect(at(b, 'ramza').facing).toBe(0);
    expect(at(b, 'e-squire-1').facing).toBe(2);
    const game = Battle.start(FIRST_BATTLE, 1).state.units;
    expect(game.every((u) => u.vars === undefined)).toBe(true);
    expect(game.filter((u) => u.def !== 'beacon').every((u) => u.facing !== undefined)).toBe(true);
    expect(game.find((u) => u.def === 'beacon')!.facing).toBeUndefined(); // the Beacon has no front or back
  });

  it('Squire (class evasion 5, no shield): 95% from the front, 100% from the side and back', () => {
    const b = start();
    put(b, 'ramza', 2, 5);
    put(b, 'e-squire-1', 3, 5, 3); // facing Ramza
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(95);
    at(b, 'e-squire-1').facing = 0;
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(100);
    at(b, 'e-squire-1').facing = 1; // back turned
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(100);
  });

  it('whoever moves ends facing where they were going, whoever attacks turns to the target and the player chooses at the end of the turn', () => {
    const b = start();
    put(b, 'ramza', 3, 5);
    put(b, 'e-squire-1', 4, 6);
    b.move({ x: 4, y: 5 });
    expect(b.actor.facing).toBe(1); // moved toward +x
    b.act('fft_ramza_attack', { x: 4, y: 6 });
    expect(b.actor.facing).toBe(0); // target at +y
    b.face(2);
    expect(b.actor.facing).toBe(2);
    b.face(7); // nonexistent direction: ignored
    expect(b.actor.facing).toBe(2);
  });

  it('the AI ends its turn facing the nearest enemy', () => {
    const b = Battle.start(GARILAND, 3);
    const id = b.actor.id;
    playAiTurn(b);
    const me = at(b, id);
    const foe = b.state.units
      .filter((u) => u.team !== me.team)
      .reduce((a, c) =>
        Math.abs(c.pos.x - me.pos.x) + Math.abs(c.pos.y - me.pos.y) <
        Math.abs(a.pos.x - me.pos.x) + Math.abs(a.pos.y - me.pos.y)
          ? c
          : a,
      );
    expect(
      sideOf(
        me.pos,
        [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: -1, y: 0 },
        ][me.facing!],
        foe.pos,
      ),
    ).toBe('front');
  });

  it('saving and loading keeps facing and counters; invalid facing is refused, a missing one (old save) is filled in', () => {
    const b = start();
    b.face(3);
    at(b, 'ramza').vars!.pa = 2;
    expect(Battle.load(b.save())?.state).toEqual(b.state);
    const raw = JSON.parse(b.save());
    raw.state.units[0].facing = 9;
    expect(Battle.load(JSON.stringify(raw))).toBeNull();
    delete raw.state.units[0].facing;
    expect(Battle.load(JSON.stringify(raw))?.state.units[0].facing).toBeTypeOf('number');
  });
});

describe('FFT Gariland: missing abilities (BMG 3.3)', () => {
  const start = () => {
    const b = Battle.start(GARILAND, 1);
    b.state.turn.actor = 'ramza';
    put(b, 'ramza', 2, 5);
    put(b, 'delita', 2, 6);
    put(b, 'e-squire-1', 3, 5, 3);
    return b;
  };

  it('lists: Squire with Accumulate; Ramza also with Wish and Yell', () => {
    expect(UNIT_DEFS.fft_squire.abilities).toEqual([
      'fft_squire_attack',
      'fft_squire_stone',
      'fft_squire_dash',
      'fft_squire_accumulate',
    ]);
    expect(UNIT_DEFS.fft_ramza.abilities.slice(3)).toEqual([
      'fft_ramza_accumulate',
      'fft_ramza_wish',
      'fft_ramza_yell',
    ]);
  });

  it("Accumulate gives PA +1 to the user: Ramza's sword goes from 20 to 24 in the preview and the strike", () => {
    const b = start();
    expect(b.preview('fft_ramza_attack', { x: 3, y: 5 }).targets[0]).toMatchObject({ dmgMin: 20, dmgMax: 20 });
    expect(b.act('fft_ramza_accumulate', { x: 2, y: 5 }).map((e) => e.k)).toEqual(['attack']);
    expect(at(b, 'ramza').vars!.pa).toBe(1);
    b.state.turn.usedAbility = null;
    expect(b.preview('fft_ramza_attack', { x: 3, y: 5 }).targets[0]).toMatchObject({ dmgMin: 24, dmgMax: 24 });
    b.state.rng = seedWhere((v) => v < 0.9); // hits (95%)
    const hit = b.act('fft_ramza_attack', { x: 3, y: 5 }).find((e) => e.k === 'hit');
    expect(hit && 'dmg' in hit && hit.dmg).toBeGreaterThanOrEqual(24); // 24, or more on a critical
  });

  it('Yell gives Speed +1 to the target (can be the user): it now gains 7 CT per tick', () => {
    const b = start();
    b.act('fft_ramza_yell', { x: 2, y: 6 });
    expect(at(b, 'delita').vars!.sp).toBe(1);
    expect(GARILAND.rules!.speed!(at(b, 'delita'))).toBe(7);
    expect(GARILAND.rules!.speed!(at(b, 'ramza'))).toBe(6);
    const self = start();
    expect(self.preview('fft_ramza_yell', { x: 2, y: 5 }).ok).toBe(true);
  });

  it('Wish heals 21 on the adjacent ally and takes 11 from Ramza; never leaves him below 1', () => {
    const b = start();
    at(b, 'delita').hp = 10;
    const events = b.act('fft_ramza_wish', { x: 2, y: 6 });
    expect(at(b, 'delita').hp).toBe(31);
    expect(at(b, 'ramza').hp).toBe(40);
    expect(events).toContainEqual({ k: 'hit', unit: 'ramza', dmg: 11, chance: 100 });
    const low = start();
    at(low, 'ramza').hp = 5;
    at(low, 'delita').hp = 10;
    low.act('fft_ramza_wish', { x: 2, y: 6 });
    expect(at(low, 'ramza').hp).toBe(1);
    expect(low.actor.id).toBe('ramza');
  });

  it(`Potion: each Chemist has ${POTION_STOCK} (assumption); without stock it can't be used`, () => {
    const b = start();
    b.state.turn.actor = 'chemist';
    put(b, 'chemist', 2, 7);
    at(b, 'delita').hp = 10;
    expect(at(b, 'chemist').vars!.potions).toBe(POTION_STOCK);
    b.act('fft_chemist_potion', { x: 2, y: 6 });
    expect(at(b, 'chemist').vars!.potions).toBe(POTION_STOCK - 1);
    at(b, 'chemist').vars!.potions = 0;
    b.state.turn.usedAbility = null;
    expect(b.preview('fft_chemist_potion', { x: 2, y: 6 })).toMatchObject({ ok: false, reason: 'spent' });
  });
});

describe('FFT basic classes (BMG 7.4): level 1 sheets', () => {
  const hp = (id: string) => UNIT_DEFS[id].hp;
  const dmg = (id: string) => ABILITIES[id].damage;

  it('health: Knight 57 (37 + helmet and leather armor), Archer 43, White Mage 37, Black Mage 36', () => {
    expect([hp('fft_knight'), hp('fft_archer'), hp('fft_priest'), hp('fft_wizard')]).toEqual([57, 43, 37, 36]);
  });

  it("attack: Knight's sword PA 6 * 4, bow [(5 + 6) / 2] * 4, staff MA 4 * 3, rod PA 3 * 3", () => {
    expect([
      dmg('fft_knight_attack'),
      dmg('fft_archer_attack'),
      dmg('fft_priest_attack'),
      dmg('fft_wizard_attack'),
    ]).toEqual([
      [24, 24],
      [20, 20],
      [12, 12],
      [9, 9],
    ]);
    expect(ABILITIES.fft_archer_attack.range).toEqual([3, 5]);
  });

  it('Charge +1 and +2 add K to PA and Speed in the bow formula (BMG 2.2)', () => {
    expect([dmg('fft_archer_charge1'), dmg('fft_archer_charge2')]).toEqual([
      [24, 24],
      [28, 28],
    ]); // [(6+7)/2]*4 e [(7+8)/2]*4
  });

  it('Fire deals 30 in an area and Heal restores 20, each for 6 MP; 17 MP gives 2 uses', () => {
    expect(ABILITIES.fft_wizard_fire).toMatchObject({ damage: [30, 30], radius: 1, range: [1, 4], cost: ['mp', 6] });
    expect(ABILITIES.fft_priest_cure).toMatchObject({ heal: [20, 20], radius: 1, cost: ['mp', 6] });
    expect([UNIT_DEFS.fft_wizard.vars!.mp, UNIT_DEFS.fft_priest.vars!.mp]).toEqual([17, 17]);
  });
});

describe('FFT basic classes: rules in the engine', () => {
  const start = () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    b.state.turn.actor = 'knight';
    put(b, 'knight', 2, 5);
    put(b, 'e-knight', 3, 5, 3); // facing the hero
    return b;
  };

  it("Knight's shield (10%) applies from front and side, not from behind: 81%, 90% and 100%", () => {
    const b = start();
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(81); // [100 * 90 * 90 / 10000]
    at(b, 'e-knight').facing = 0;
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(90);
    at(b, 'e-knight').facing = 1;
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(100);
  });

  it('Speed break: (PA 6 + 50)% before evasion, removes 2 Speed from the target', () => {
    const b = start();
    at(b, 'e-knight').facing = 1; // from behind: the full 56%
    expect(chance(b, 'fft_knight_speed_break', 3, 5)).toBe(56);
    b.state.rng = seedWhere((v) => v < 0.5);
    b.act('fft_knight_speed_break', { x: 3, y: 5 });
    expect(at(b, 'e-knight').vars!.sp).toBe(-2);
  });

  it("Power break removes 3 PA: the target's sword drops from 24 to 12", () => {
    const b = start();
    at(b, 'e-knight').vars!.pa = -3;
    b.state.turn.actor = 'e-knight';
    expect(b.preview('fft_knight_attack', { x: 2, y: 5 }).targets[0]).toMatchObject({ dmgMin: 12, dmgMax: 12 });
  });

  it('Fire only goes through the magic shield (97% on the Knight) and runs out of MP after 2 uses', () => {
    const b = start();
    b.state.turn.actor = 'wizard';
    put(b, 'wizard', 0, 5);
    expect(chance(b, 'fft_wizard_fire', 3, 5)).toBe(97);
    at(b, 'wizard').vars!.mp = 5;
    expect(b.preview('fft_wizard_fire', { x: 3, y: 5 }).reason).toBe('spent');
  });

  it("AI doesn't cast area Heal on a wounded enemy (Nov 12: it healed enemies 4,701 times in 1,000 battles)", () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    b.state.turn.actor = 'priest';
    b.state.units = b.state.units.filter((u) => ['priest', 'e-knight'].includes(u.id));
    put(b, 'priest', 2, 5);
    put(b, 'e-knight', 5, 5);
    at(b, 'e-knight').hp = 10;
    expect(chooseTurn(b.grid, b.state, 'priest').ability?.id).not.toBe('fft_priest_cure');
  });

  it('stays in the scenario list and the AI finishes the battle', () => {
    expect(SCENARIOS['fft-classes']).toBe(CLASSES_BATTLE);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(simulate(CLASSES_BATTLE, seed, 300).outcome).not.toBe('timeout');
  });
});
