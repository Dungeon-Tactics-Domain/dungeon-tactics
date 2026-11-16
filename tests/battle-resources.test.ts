import { describe, expect, it } from 'vitest';
import { buildDevScenario, unitFrom } from '../src/client/dev-roster.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { canPay, poolOf, previewAbility } from '../src/shared/battle/combat.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { startNextTurn } from '../src/shared/battle/turn-queue.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// a warrior beside a soldier, and a mage 3 tiles from it (the Beacon keeps the battle going); `first` acts
const field = (first: 'warrior' | 'mage', vars?: Record<string, number>) => {
  const units = [
    { id: 'warrior', def: 'warrior', team: 'hero' as const, x: 0, y: 1 },
    { id: 'mage', def: 'mage', team: 'hero' as const, x: 4, y: 1 },
  ];
  const s = stateOf(
    [
      ...(first === 'mage' ? units.reverse() : units),
      { id: 'b', def: 'beacon', team: 'hero', x: 7, y: 2 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 1 },
    ],
    HIT_SEED,
  );
  if (vars) s.units[0].vars = vars;
  return new Battle(flat(8, 3), s);
};

describe('mana and stamina (Nov 15 grill)', () => {
  it('a martial ability spends stamina and a spell mana; the basic attack is free', () => {
    const w = field('warrior');
    expect(w.act('heavy_strike', at(1, 1)).length).toBeGreaterThan(0);
    expect(poolOf(w.actor, 'stamina')).toBe(50 - 30);
    const free = field('warrior');
    free.act('strike', at(1, 1));
    expect(poolOf(free.actor, 'stamina')).toBe(50);
    const m = field('mage');
    m.act('blast', at(1, 1));
    expect(poolOf(m.actor, 'mana')).toBe(60 - 25);
  });

  it('a charge pays when it starts and fires later for free', () => {
    const m = field('mage');
    m.act('blast', at(1, 1));
    const spent = poolOf(m.actor, 'mana');
    expect(m.state.charges).toHaveLength(1);
    const fired: BattleEvent[] = [];
    for (let i = 0; i < 12 && m.state.charges.length; i++) {
      fired.push(...m.endTurn());
      // only regen moves it from here: the firing takes nothing
      expect(poolOf(m.state.units.find((u) => u.id === 'mage')!, 'mana')).toBeGreaterThanOrEqual(spent);
    }
    expect(fired.some((e) => e.k === 'attack' && e.ability === 'blast')).toBe(true);
  });

  it('without enough left the ability is unavailable, with the reason, and nothing is paid', () => {
    const w = field('warrior', { stamina: 29 });
    const p = previewAbility(w.grid, w.state, 'warrior', 'heavy_strike', at(1, 1));
    expect(p).toMatchObject({ ok: false, reason: 'spent' });
    expect(canPay(w.actor, ABILITIES.heavy_strike)).toBe(false);
    expect(canPay(w.actor, ABILITIES.shield_bash)).toBe(true);
    expect(w.act('heavy_strike', at(1, 1))).toEqual([]);
    expect(poolOf(w.actor, 'stamina')).toBe(29);
  });

  it('a counter-attack costs nothing', () => {
    // the soldier struck by a warrior answers when it walks away; its stamina stays whole
    const w = field('warrior');
    w.act('strike', at(1, 1));
    w.move(at(0, 0));
    w.move(at(3, 0));
    expect(poolOf(w.state.units.find((u) => u.id === 'f')!, 'stamina')).toBe(UNIT_DEFS.soldier.vars!.stamina);
  });

  it('regenerates at the start of each of the unit own turns, never above the pool', () => {
    const s = stateOf([
      { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 0 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 5, y: 0 },
    ]);
    s.units[0].vars = { mana: 10 };
    s.units[1].vars = { stamina: 48 };
    s.units[0].ct = 100;
    startNextTurn(flat(6, 1), s);
    expect(s.turn.actor).toBe('m');
    expect(s.units[0].vars).toEqual({ mana: 18 });
    expect(s.units[1].vars).toEqual({ stamina: 48 }); // not its turn
    s.units[0].ct = 0;
    s.units[1].ct = 100;
    startNextTurn(flat(6, 1), s);
    expect(s.units[1].vars).toEqual({ stamina: 50 }); // +5 capped at 50
  });

  it('a new battle starts every pool full (stamina refills in every room)', () => {
    const st = initialState(SCENARIOS.skirmish, 1);
    for (const u of st.units)
      for (const k of Object.keys(UNIT_DEFS[u.def].vars ?? {})) expect(u.vars?.[k]).toBe(UNIT_DEFS[u.def].vars![k]);
  });
});

describe('the save of the pools', () => {
  const saved = () => JSON.parse(JSON.stringify(Battle.start(SCENARIOS.skirmish, 3).state));
  it('a save from before the pools opens them full', () => {
    const raw = saved();
    for (const u of raw.units) delete u.vars;
    const st = parseBattleState(raw)!;
    expect(st).not.toBeNull();
    const w = st.units.find((u) => u.def === 'warrior')!;
    expect(w.vars).toEqual({ stamina: 50 });
  });
  it('rejects a pool below 0 or above its max, and keeps one in between', () => {
    const raw = saved();
    const i = raw.units.findIndex((u: { def: string }) => u.def === 'warrior');
    raw.units[i].vars = { stamina: 51 };
    expect(parseBattleState(raw)).toBeNull();
    raw.units[i].vars = { stamina: -1 };
    expect(parseBattleState(raw)).toBeNull();
    raw.units[i].vars = { stamina: 12 };
    expect(parseBattleState(raw)!.units[i].vars).toEqual({ stamina: 12 });
  });
});

describe('the AI and the cost', () => {
  it('never picks an ability it cannot pay for', () => {
    // an enemy warrior beside a wounded mage: the Heavy strike kills it, the Strike may not
    const st = stateOf([
      { id: 'w', def: 'warrior', team: 'enemy', x: 0, y: 0 },
      { id: 'm', def: 'mage', team: 'hero', x: 1, y: 0, hp: 100 },
    ]);
    const plan = (stamina: number) => {
      st.units[0].vars = { stamina };
      return chooseTurn(flat(6, 3), st, 'w').ability!.id;
    };
    expect(plan(50)).toBe('heavy_strike');
    const short = plan(29);
    expect(short).not.toBe('heavy_strike');
    expect(canPay(st.units[0], ABILITIES[short])).toBe(true);
  });
});

describe('battle sheets built from a class', () => {
  it('keep the class pool and regen (party, expedition rooms, developer battle)', () => {
    const sc = buildDevScenario(
      { map: 'skirmish', heroes: [unitFrom('mage')], enemies: [unitFrom('brute')] },
      'res-test',
    );
    const [h, e] = sc.spawns.filter((s) => s.def.startsWith('res-test')).map((s) => UNIT_DEFS[s.def]);
    expect([h.vars, h.regen]).toEqual([{ mana: 60 }, { mana: 8 }]);
    expect([e.vars, e.regen]).toEqual([{ stamina: 50 }, { stamina: 5 }]);
  });
});
