import { describe, expect, it } from 'vitest';
import { chooseTurn, playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { halve } from '../src/shared/battle/half.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';

// Nov 25, Fernando: "as IAs n estao atacando meus personagens ... msm no modo easy devem atacar sempre q disponivel".
// Measured on six depth-1 rooms: in 56 of 75 enemy turns a hero was in reach at 72 to 95% and the enemy only walked.
// Whether some reachable stop lets the unit land a hit on a foe (the AI's own preview, chance above 0)
function canHit(b: Battle): boolean {
  const a = b.actor;
  const spots = [a.pos, ...[...reachable(b.grid, b.state, a.id).values()].map((s) => s.pos)];
  return spots.some((sp) => {
    const moved = { ...b.state, units: b.state.units.map((u) => (u.id === a.id ? { ...u, pos: sp } : u)) };
    return UNIT_DEFS[a.def].abilities.some((ab) =>
      b.state.units
        .filter((u) => u.team !== a.team)
        .some((h) => {
          const p = previewAbility(b.grid, moved, a.id, ab, h.pos);
          return p.ok && p.targets.some((t) => t.chance > 0 && t.dmgMax > 0);
        }),
    );
  });
}

describe('the AI attacks whenever it can (Nov 25)', () => {
  it('an enemy with a foe in reach always acts, in expedition rooms', { timeout: 60000 }, () => {
    const idle: string[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const b = Battle.start(halve(generateRoom(seed, { depth: 1 })), 7);
      for (let i = 0; i < 120 && !b.over; i++) {
        const a = b.actor;
        if (a.team === 'enemy' && canHit(b) && !chooseTurn(b.grid, b.state, a.id).ability)
          idle.push(`room ${seed} turn ${i} ${a.def}`);
        playAiTurn(b);
      }
    }
    expect(idle).toEqual([]);
  });
});
