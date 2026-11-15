import { describe, expect, it } from 'vitest';
import { buildDevScenario, unitFrom } from '../src/client/dev-roster.ts';
import { barYOf, MARKER, unitHeight } from '../src/client/markers.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Oct 25 bug (mobile, PR 1 environment): the cursor frame and the yellow arrow were drawn on top of the hero
describe('marker heights', () => {
  const tallest = Math.max(...Object.keys(UNIT_DEFS).map(unitHeight));

  it('the cursor frame sits on the ground and respects depth (the character covers it)', () => {
    expect(MARKER.frameY).toBeLessThan(0.1);
    expect(MARKER.frameDepthTest).toBe(true);
  });

  // a cast built from sheets (dev menu, expedition rooms) gets units of its own (dev-e0…), drawn at the class's height
  it("a unit on its own sheet has its class's height", () => {
    const s = buildDevScenario({ map: 'beacon_hill', heroes: [unitFrom('warrior')], enemies: [unitFrom('brute')] });
    const brute = s.spawns.find((sp) => sp.team === 'enemy')!;
    expect(brute.def).not.toBe('brute');
    expect(unitHeight(brute.def)).toBe(unitHeight('brute'));
    expect(unitHeight(brute.def)).toBeGreaterThan(unitHeight('soldier'));
  });

  it('the health bar sits above each character, the large one included', () => {
    for (const def of Object.keys(UNIT_DEFS)) expect(barYOf(def), def).toBeGreaterThan(unitHeight(def));
    expect(barYOf('colossus')).toBeGreaterThan(tallest - 0.01);
  });

  it('the arrow floats above the health bar, even at the lowest point of the bob', () => {
    expect(MARKER.arrowY - MARKER.arrowBob - MARKER.arrowHalf).toBeGreaterThan(MARKER.barY + MARKER.barHalf);
  });
});
