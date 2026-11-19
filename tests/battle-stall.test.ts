import { describe, expect, it } from 'vitest';
import { CRAWL_THEMES } from '../src/content/crawl/rooms.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { parseGrid } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import { MAPS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';

// AI against AI must not freeze (Nov 19): a battle where every unit passes in turn, with nobody moving, hurt or dying, never
// ends by itself. The state's signature (where each unit stands and its life, and the bodies) must change within one lap of
// turns, or the battle must end first. Runs every map whole, two on half tiles, and the first rooms the crawl builds (halved, as the game plays them: a whole-tile room has no Beacon and ends at turn 0).
const CAP = 80; // turns per battle: a freeze shows well before it (a half-tile map costs 1 to 4 s: only two, and three rooms (one boss), run on half tiles to keep the file near 10 s)
const SLACK = 4; // laps of the turn order without a change that count as stalled

const sign = (b: Battle) =>
  `${b.state.units.map((u) => `${u.id}@${u.pos.x},${u.pos.y}:${u.hp}`).join(' ')}|${b.state.corpses?.length ?? 0}`;

// the turn the battle froze at (null when it kept moving or ended)
function stalledAt(scenario: Scenario, seed: number): number | null {
  const b = Battle.start(scenario, seed);
  let last = sign(b),
    still = 0;
  while (!b.over && b.state.turnsPlayed < CAP) {
    playAiTurn(b);
    const now = sign(b);
    still = now === last ? still + 1 : 0;
    last = now;
    if (still >= SLACK * b.state.units.length) return b.state.turnsPlayed;
  }
  return null;
}

describe('AI vs AI never freezes', () => {
  const themes = Object.keys(CRAWL_THEMES);
  const rooms = [0, 1, 5].map((i) =>
    halve(generateRoom(i, { depth: 1 + (i % 4), boss: i % 10 === 0, theme: themes[i % themes.length] })),
  );
  const cases = [
    ...MAPS.flatMap((m) => [1, 2, 3].map((seed) => ({ name: `${m.id} #${seed}`, scenario: m, seed }))),
    ...MAPS.filter((m) => ['skirmish', 'frost_pass'].includes(m.id)).map((m) => ({
      name: `${m.id} on half tiles`,
      scenario: halve(m),
      seed: 3,
    })),
    ...rooms.map((r) => ({ name: r.id, scenario: r, seed: 5 })),
  ];

  it('moves, hurts or ends within a lap of turns, on every map and room', () => {
    const frozen = cases.map((c) => ({ ...c, at: stalledAt(c.scenario, c.seed) })).filter((c) => c.at !== null);
    expect(frozen.map((c) => `${c.name} seed ${c.seed} turn ${c.at}`)).toEqual([]);
  }, 60_000);

  // the detector itself: a wall splits the map so nobody can ever reach anybody, and the battle must read as frozen
  it('flags a battle sealed by a wall, where nobody can reach anybody', () => {
    const sealed: Scenario = {
      id: 'sealed',
      name: 'sealed',
      en: 'sealed',
      grid: parseGrid(Array(5).fill('..#..'), Array(5).fill('00000')),
      spawns: [
        { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
        { id: 'h', def: 'warrior', team: 'hero', x: 0, y: 2 },
        { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 2 },
      ],
    };
    expect(stalledAt(sealed, 1)).not.toBeNull();
  });
});
