import { describe, expect, it } from 'vitest';
import { corpseSquares } from '../src/client/corpse-squares.ts';

describe('corpseSquares', () => {
  it('a whole-tile map lays one body per cell', () => {
    expect(
      corpseSquares(
        [
          { x: 2, y: 0 },
          { x: 1, y: 0 },
        ],
        1,
      ),
    ).toEqual([
      { p: { x: 1, y: 0 }, span: 1 },
      { p: { x: 2, y: 0 }, span: 1 },
    ]);
  });

  it("a half-tile token's 4 cells are one body, whatever order they were saved in", () => {
    const cells = [
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 2 },
      { x: 3, y: 2 },
    ];
    expect(corpseSquares(cells, 2)).toEqual([{ p: { x: 3, y: 2 }, span: 2 }]);
  });

  it("the Colossus' 16 cells are 4 bodies, and a stray cell gets its own", () => {
    const cells = Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) }));
    const out = corpseSquares([...cells, { x: 6, y: 0 }], 2);
    expect(out.filter((b) => b.span === 2)).toHaveLength(4);
    expect(out.find((b) => b.span === 1)).toEqual({ p: { x: 6, y: 0 }, span: 1 });
  });
});
