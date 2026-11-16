// The bodies a resumed battle draws for BattleState.corpses (Nov 16 review: after a reload the cells blocked movement
// with nothing on them). The state keeps only cells, so each full sub x sub square becomes one body the size of a
// token (a 2x2-cell token lies as one body, not four halves) and any cell left over gets a body of its own.
import { posKey } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

export function corpseSquares(cells: Pos[], sub: number): { p: Pos; span: number }[] {
  const left = new Set(cells.map(posKey));
  const out: { p: Pos; span: number }[] = [];
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x); // row by row: a square's corner comes first
  for (const p of sorted) {
    if (!left.has(posKey(p))) continue;
    const square = Array.from({ length: sub * sub }, (_, i) => ({ x: p.x + (i % sub), y: p.y + Math.floor(i / sub) }));
    const span = square.every((c) => left.has(posKey(c))) ? sub : 1;
    for (const c of span === sub ? square : [p]) left.delete(posKey(c));
    out.push({ p, span });
  }
  return out;
}
