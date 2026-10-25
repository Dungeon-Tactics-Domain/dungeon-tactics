import type { Pos } from './types.ts';

export type TerrainKind = 'floor' | 'forest' | 'wall';

// Poucos terrenos de propósito (spec, 25/10). `blocks` é quanto o terreno sobe acima da altura da casa para a linha de
// visão: floresta tapa quem está no mesmo nível, mas quem está no alto enxerga por cima (é o que valoriza arqueiro e ladino).
export const TERRAIN: Record<TerrainKind, { walkable: boolean; blocks: number; cover: boolean }> = {
  floor: { walkable: true, blocks: 0, cover: false },
  forest: { walkable: true, blocks: 2, cover: true },
  wall: { walkable: false, blocks: 4, cover: false },
};

export interface Tile {
  terrain: TerrainKind;
  h: number;
}

// Mapa imutável durante a batalha: fica fora do BattleState (o estado guarda só o id do cenário).
export interface Grid {
  width: number;
  height: number;
  tiles: Tile[];
}

const SYMBOL: Record<string, TerrainKind> = { '.': 'floor', T: 'forest', '#': 'wall' };

// Formato ASCII: uma grade de terreno (`.` chão, `T` floresta, `#` parede) e outra de alturas (dígito 0 a 9), mesma forma.
export function parseGrid(terrain: string[], heights: string[]): Grid {
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  if (heights.length !== height) throw new Error('altura: número de linhas difere do terreno');
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    if (terrain[y].length !== width) throw new Error(`largura da linha ${y} difere da primeira`);
    if (heights[y].length !== width) throw new Error(`altura: largura da linha ${y} difere do terreno`);
    for (let x = 0; x < width; x++) {
      const kind = SYMBOL[terrain[y][x]];
      if (!kind) throw new Error(`símbolo desconhecido '${terrain[y][x]}' em ${x},${y}`);
      const h = Number(heights[y][x]);
      if (!Number.isInteger(h)) throw new Error(`altura inválida '${heights[y][x]}' em ${x},${y}`);
      tiles.push({ terrain: kind, h });
    }
  }
  return { width, height, tiles };
}

export const inBounds = (g: Grid, p: Pos) => p.x >= 0 && p.y >= 0 && p.x < g.width && p.y < g.height;
export const tileAt = (g: Grid, p: Pos): Tile => g.tiles[p.y * g.width + p.x];
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const posKey = (p: Pos) => `${p.x},${p.y}`;
// distância em passos de grade (4 direções), a mesma do movimento
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const DIRS: Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
export function neighbors(g: Grid, p: Pos): Pos[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((q) => inBounds(g, q));
}
