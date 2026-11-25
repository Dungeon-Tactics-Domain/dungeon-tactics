import { describe, expect, it } from 'vitest';
import { actActions, bestSpot } from '../src/client/act-flow.ts';
import { actMarks, screenAction } from '../src/client/act-marks.ts';
import type { Screen } from '../src/client/command.ts';
import { helpText } from '../src/client/hud-menus.ts';
import { turnMarks } from '../src/client/turn-marks.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { posKey } from '../src/shared/battle/grid.ts';
import { gridOf, stateOf } from './battle-helpers.ts';

// Fernando, Nov 25: once the target is picked, the tiles to act from are blue where the action hits it, purple where the
// shot stops on something on the way (the cursor may stand there and act anyway), grey where the unit can walk but the
// action does not reach (no cursor); the ability's reach is drawn around the picked tile
const battle = () => {
  const s = stateOf([
    { id: 'r', def: 'rogue', team: 'hero', x: 0, y: 1 },
    { id: 'e', def: 'soldier', team: 'enemy', x: 6, y: 1 },
  ]);
  s.scenario = 'ash_wood';
  // a wall row in the middle: from the wall's side the knife stops on it, from the open lane it flies
  return new Battle(gridOf(['.......', '...#...', '...#...', '.......', '.......']), s);
};
const spotScreen = (b: Battle): Extract<Screen, { k: 'spot' }> => {
  const target = { k: 'unit' as const, unit: 'e', pos: { x: 6, y: 1 } };
  const action = actActions(b, target).findIndex((a) => a.id === 'throwing_knife');
  return { k: 'spot', target, action, index: bestSpot(actActions(b, target)[action], b) };
};

describe('the tile choice: blue, purple and grey (Nov 25)', () => {
  it('paints the three kinds, each cell once', () => {
    const b = battle();
    const kinds = actMarks(b, spotScreen(b)).tiles.filter((t) => ['move', 'blocked', 'far'].includes(t.kind));
    expect(new Set(kinds.map((t) => t.kind))).toEqual(new Set(['move', 'blocked', 'far']));
    expect(new Set(kinds.map((t) => posKey(t.pos))).size).toBe(kinds.length);
  });

  it('a purple tile is a spot the cursor reaches, after the blue ones; a grey one is not', () => {
    const b = battle();
    const s = spotScreen(b);
    const a = screenAction(b, s)!;
    const first = a.spots.findIndex((x) => x.blocked);
    expect(first).toBeGreaterThan(0);
    expect(a.spots.slice(first).every((x) => x.blocked)).toBe(true);
    expect(a.spots[s.index].blocked).toBeFalsy(); // the first pick still hits
    // the shot from a purple tile is allowed and misses the target
    expect(a.spots[first].preview!.ok).toBe(true);
    expect(a.spots[first].preview!.targets.some((t) => t.unit === 'e')).toBe(false);
    const far = actMarks(b, s).tiles.filter((t) => t.kind === 'far');
    expect(far.every((t) => !a.spots.some((x) => posKey(x.pos) === posKey(t.pos)))).toBe(true);
  });

  it('a purple tile says the shot is blocked, and acting from it is still allowed', () => {
    const b = battle();
    const s = spotScreen(b);
    const index = screenAction(b, s)!.spots.findIndex((x) => x.blocked);
    expect(helpText({ battle: b, screen: { ...s, index } } as never, true, false)).toMatch(/bloqueia/);
  });

  it("the ability's reach is drawn around the picked tile", () => {
    const b = battle();
    const s = spotScreen(b);
    const ring = turnMarks(b, s, {} as never, { x: 0, y: 0 }, true).ring;
    expect(ring?.from.map(posKey)).toContain(posKey(screenAction(b, s)!.spots[s.index].pos));
    expect(ring?.range).toBeGreaterThan(0);
  });
});
