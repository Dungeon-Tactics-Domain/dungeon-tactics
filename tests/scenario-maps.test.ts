import { describe, expect, it } from 'vitest';
import { blocksOf, canStand, FACING, inBounds, standH, tileAt } from '../src/shared/battle/grid.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Game maps (Nov 12: Beacon Hill dressed with pieces and the new Flooded Crypt): full grid and nobody spawning
// in a wall, deep water or on top of another
describe('game maps', () => {
  for (const s of Object.values(SCENARIOS)) {
    it(`${s.id}: full grid and free starting tiles`, () => {
      expect(s.grid.tiles.length).toBe(s.grid.width * s.grid.height);
      const cells = new Set<string>();
      for (const sp of s.spawns) {
        expect(canStand(tileAt(s.grid, sp)), `${sp.id} em ${sp.x},${sp.y}`).toBe(true);
        cells.add(`${sp.x},${sp.y}`);
      }
      expect(cells.size).toBe(s.spawns.length);
    });
  }

  // Ash Wood bridge (Nov 13, 3 tiles wide): the 6 tiles sit at plank height, including the rubble one, which is a
  // walkable low cover (the `B` tile used to come out with height 0 from the relief map: a hole in the middle of the bridge)
  it('Grove bridge: 3 tiles wide at the same height, with walkable low rubble in the middle', () => {
    const g = SCENARIOS.ash_wood.grid;
    for (const y of [4, 5])
      for (const x of [2, 3, 4]) expect(tileAt(g, { x, y }), `${x},${y}`).toMatchObject({ look: 'bridge', h: 1 });
    const rubble = tileAt(g, { x: 3, y: 4 });
    expect(rubble.terrain).toBe('rubble');
    expect(canStand(rubble)).toBe(true);
    expect(blocksOf(rubble)).toBe(1);
  });

  // ramp is only drawing (Nov 13): sits on flat walkable ground (no water or spikes) and rises exactly 1 level to the
  // neighbor, which is also ground. So the drawing never shows a climb where the rule asks for a jump of 2 or blocks passage
  it('game map ramps: ground that rises 1 level to the neighbor', () => {
    let total = 0;
    for (const s of Object.values(SCENARIOS)) {
      if (s.rules) continue; // FFT study: ramps from the original file, with climbs of 2 (fft-gariland.test)
      s.grid.tiles.forEach((t, i) => {
        if (!t.ramp) return;
        total++;
        const p = { x: i % s.grid.width, y: Math.floor(i / s.grid.width) },
          f = FACING[t.ramp[0]];
        const up = { x: p.x + f.x, y: p.y + f.y };
        const where = `${s.id} ${p.x},${p.y}`;
        expect(t.terrain === 'floor' && !t.depth && !t.spikes && t.ramp[1] === 1, where).toBe(true);
        expect(inBounds(s.grid, up), where).toBe(true);
        const u = tileAt(s.grid, up);
        expect(u.terrain === 'floor' && !u.depth && standH(u) === standH(t) + 1, where).toBe(true);
      });
    }
    expect(total).toBeGreaterThan(0);
  });

  it('Beacon Hill: snow only on the enemy side and gold on the Beacon tile', () => {
    const s = SCENARIOS.beacon_hill;
    const beacon = s.spawns.find((sp) => sp.def === 'beacon')!;
    expect(tileAt(s.grid, beacon).look).toBe('gold');
    for (const sp of s.spawns) {
      const snowy = /snow|bare/.test(tileAt(s.grid, sp).look ?? '');
      expect(snowy, sp.id).toBe(sp.team === 'enemy');
    }
  });
});
