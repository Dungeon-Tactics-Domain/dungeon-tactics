import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { GARILAND, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { tileAt, TERRAIN } from '../src/shared/battle/grid.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Study scenario: FFT's 1st battle in our engine (Fernando's request, Nov 11). Sources in docs/game-design/referencia-fft.md
registerFftStudy();

describe('FFT Gariland: map (fft-map-json, MAP022)', () => {
  const g = GARILAND.grid;

  it('has 10 x 15 tiles with the heights from the file', () => {
    expect([g.width, g.height]).toEqual([10, 15]);
    expect(tileAt(g, { x: 1, y: 13 }).h).toBe(10); // the chimney, highest tile
    expect(tileAt(g, { x: 3, y: 2 }).h).toBe(8);
    expect(tileAt(g, { x: 6, y: 0 }).h).toBe(0); // the river
  });

  it('floor of each tile with the counts from the file (surface_type) and 23 ramps; drawing only (Nov 12)', () => {
    const count: Record<string, number> = {};
    for (const t of g.tiles) count[t.look!] = (count[t.look!] ?? 0) + 1;
    expect(count).toEqual({ grass: 25, stone: 42, water: 38, roof: 23, wood: 7, bridge: 5, box: 5, chimney: 3, tree: 2 });
    expect(g.tiles.filter((t) => t.ramp).length).toBe(23);
    expect(tileAt(g, { x: 4, y: 2 }).ramp).toEqual([0, 2]); // roof rises toward +y up to the ridge at height 8
  });

  it('only the two trees are not walkable', () => {
    const blocked = g.tiles.flatMap((t, i) => (TERRAIN[t.terrain].walkable ? [] : [`${i % g.width},${Math.floor(i / g.width)}`]));
    expect(blocked).toEqual(['2,0', '8,3']);
  });
});

describe('FFT Gariland: level 1 units (BMG 7.1 and 7.4)', () => {
  it('health = class stat + 13 from recruit equipment', () => {
    expect(UNIT_DEFS.fft_squire.hp).toBe(43); // [507 903 * 100 / 1 638 400] = 30 (the range gives 30 or 31), + 13
    expect(UNIT_DEFS.fft_chemist.hp).toBe(37); // [507 903 * 80 / 1 638 400] = 24, + 13
    expect(UNIT_DEFS.fft_ramza.hp).toBe(51); // [507 903 * 125 / 1 638 400] = 38, + 13
  });

  it('Speed 6 for all; Move 4 (Squire) and 3 (Chemist)', () => {
    for (const id of ['fft_squire', 'fft_chemist', 'fft_ramza']) expect(UNIT_DEFS[id].speed, id).toBe(6);
    expect([UNIT_DEFS.fft_squire.move, UNIT_DEFS.fft_chemist.move]).toEqual([4, 3]);
  });

  it('attack damage: Broad Sword PA * 4, Dagger [(PA + Sp) / 2] * 3', () => {
    expect(ABILITIES.fft_squire_attack.damage).toEqual([16, 16]);
    expect(ABILITIES.fft_ramza_attack.damage).toEqual([20, 20]);
    expect(ABILITIES.fft_chemist_attack.damage).toEqual([12, 12]);
  });

  it('Throw Stone PA * (1..2) at 4 tiles, Charge PA * (1..4), both push at 50%; Potion heals 30 at 4 tiles', () => {
    expect(ABILITIES.fft_squire_stone).toMatchObject({ damage: [4, 8], range: [1, 4], push: 1, pushChance: 50 });
    expect(ABILITIES.fft_squire_dash).toMatchObject({ damage: [4, 16], range: [1, 1], push: 1, pushChance: 50 });
    expect(ABILITIES.fft_chemist_potion).toMatchObject({ heal: [30, 30], range: [1, 4] });
  });
});

describe('FFT Gariland: rules in the engine', () => {
  const b = () => Battle.start(GARILAND, 1);
  const put = (battle: Battle, id: string, x: number, y: number) => { battle.state.units.find((u) => u.id === id)!.pos = { x, y }; };

  it('5 per side: Ramza, Delita and 3 cadets against 4 Squires and 1 Chemist', () => {
    const defs = (team: string) => GARILAND.spawns.filter((s) => s.team === team).map((s) => s.def).sort();
    expect(defs('hero')).toEqual(['fft_chemist', 'fft_delita', 'fft_ramza', 'fft_squire', 'fft_squire']);
    expect(defs('enemy')).toEqual(['fft_chemist', 'fft_squire', 'fft_squire', 'fft_squire', 'fft_squire']);
  });

  it('front hit chance = 100 minus the target\'s class evasion: 95% on the Squire, 90% on Ramza; Charge is not evaded', () => {
    const battle = b();
    put(battle, 'ramza', 2, 5);
    put(battle, 'e-squire-1', 3, 5);
    battle.state.turn.actor = 'ramza';
    // facing each other (Nov 12: the study gained facing; before, the hit chance was always the front one)
    battle.state.units.find((u) => u.id === 'ramza')!.facing = 1;
    battle.state.units.find((u) => u.id === 'e-squire-1')!.facing = 3;
    expect(previewAbility(battle.grid, battle.state, 'ramza', 'fft_ramza_attack', { x: 3, y: 5 }).targets[0].chance).toBe(95);
    expect(previewAbility(battle.grid, battle.state, 'ramza', 'fft_ramza_dash', { x: 3, y: 5 }).targets[0].chance).toBe(100);
    expect(previewAbility(battle.grid, battle.state, 'e-squire-1', 'fft_squire_attack', { x: 2, y: 5 }).targets[0].chance).toBe(90);
  });

  it('Jump 3: climbs 3 height in one step, not 4', () => {
    const battle = b();
    put(battle, 'ramza', 4, 9); // height 4; beside it (3,9) has 5, (4,8) has 2 and (3,8) has 6
    const reach = reachable(battle.grid, battle.state, 'ramza');
    expect(reach.has('3,9')).toBe(true);
    put(battle, 'ramza', 4, 7); // height 2; (3,7) has 8
    expect(reachable(battle.grid, battle.state, 'ramza').get('3,7')?.cost ?? 99).toBeGreaterThan(1);
  });

  it('CT: whoever just passes the turn keeps 42 of the 102 (cost 60)', () => {
    const battle = b();
    const actor = battle.actor;
    expect(actor.ct).toBe(102); // Speed 6: 17 ticks
    battle.endTurn();
    expect(battle.state.units.find((u) => u.id === actor.id)!.ct).toBeGreaterThanOrEqual(42);
  });

  it('victory on defeating all enemies; with no target to protect it\'s not a defeat', () => {
    const battle = b();
    expect(battle.state.outcome).toBe('ongoing');
    battle.state.units = battle.state.units.filter((u) => u.team === 'hero');
    battle.endTurn();
    expect(battle.state.outcome).toBe('victory');
  });

  it('stays in the scenario list and the AI finishes the battle', () => {
    expect(SCENARIOS['fft-gariland']).toBe(GARILAND);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(simulate(GARILAND, seed, 300).outcome).not.toBe('timeout');
  });

  it('saving and loading returns the same battle', () => {
    const battle = b();
    expect(Battle.load(battle.save())?.state).toEqual(battle.state);
  });
});
