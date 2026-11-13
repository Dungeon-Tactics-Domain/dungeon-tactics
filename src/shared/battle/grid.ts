import type { Pos } from './types.ts';

export type TerrainKind = 'floor' | 'forest' | 'rubble' | 'wall';

// Poucos terrenos de propósito (spec, 25/10). `blocks` é quanto o terreno sobe acima da altura da casa para a linha de
// visão: floresta tapa quem está no mesmo nível, mas quem está no alto enxerga por cima (é o que valoriza arqueiro e ladino).
export const TERRAIN: Record<TerrainKind, { walkable: boolean; blocks: number; cover: boolean }> = {
  floor: { walkable: true, blocks: 0, cover: false },
  // árvore não se atravessa nem se pisa (13/11, pedido do Fernando: "árvores não devem ser passáveis"); continua tapando
  // a visão. O entulho da cripta, que era "floresta" para ser cobertura pisável, virou terreno próprio
  forest: { walkable: false, blocks: 2, cover: true },
  rubble: { walkable: true, blocks: 1, cover: true }, // baixo, como os objetos de LOW (o da ponte do Bosque não tem `look` de entulho)
  wall: { walkable: false, blocks: 4, cover: false },
};
// objeto baixo em cima da casa (caixote, barril, corpo, baú, entulho): barra a visão só 1 nível acima do chão, não os 4 de
// um muro (13/11, pedido do Fernando: o arqueiro no morro não atirava por cima dos caixotes e corpos da estrada)
const LOW = new Set(['crates', 'barrel', 'corpse', 'chest', 'rubble']);
export const blocksOf = (t: Tile) => (t.look && LOW.has(t.look) ? 1 : TERRAIN[t.terrain].blocks);


export interface Tile {
  terrain: TerrainKind;
  h: number;
  // Só desenho (12/11, mapa de Gariland com as peças KayKit): as regras não leem. `look` escolhe as peças da casa na cena;
  // `ramp` inclina o topo, subindo `rise` níveis na direção FACING[dir]. Mapa sem os dois é desenhado como antes.
  look?: string;
  ramp?: [dir: number, rise: number];
  // Água (BMG 6.5; decisão do Fernando de 12/11): profundidade em níveis. 1 = rasa (andar custa 2), 2 ou mais = funda
  // (não dá para entrar nem parar). Quem está na água fica mais baixo: altura da casa menos a profundidade.
  depth?: number;
  // Espinhos (noite de 12/11, regra nossa, não do FFT): quem termina a vez em cima ou é empurrado para cá leva
  // COMBAT.SPIKE_DAMAGE. Andar por cima não fere. Dá uso tático aos empurrões (combat.ts) e a IA já valoriza pelo dano.
  spikes?: true;
  // Corpo no chão (13/11, pedido do Fernando: "obstáculos tipo o corpo no chão devem ser atravessáveis, o personagem só não
  // pode ficar em cima"): passa por cima, mas não para nem é empurrado para lá
  noStop?: true;
  // Árvore que ocupa um quadrado de `tree` x `tree` casas (meia casa, half.ts): fica na casa de cima à esquerda; as outras
  // casas do quadrado são floresta sem desenho próprio. Só desenho: a regra lê o terreno de cada casa
  tree?: number;
}

// Mapa imutável durante a batalha: fica fora do BattleState (o estado guarda só o id do cenário).
export interface Grid {
  width: number;
  height: number;
  tiles: Tile[];
  levelHeight?: number; // altura de um nível no desenho, em casas; só o mapa de estudo do FFT informa (níveis mais finos)
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

// altura de quem está na casa (na água, a casa menos a profundidade, BMG 6.5)
// água rasa não rebaixa quem está de pé (13/11, pedido do Fernando: "tem água por cima da pedra e não consigo descer"):
// com o pé 1 abaixo da superfície, o vau precisava subir 1 nível e ficava acima do rio; ela só custa 2 de movimento e o
// boneco afundado é só desenho (WADE). Na funda quem nada fica na profundidade (pior no acerto, alcance e visão)
export const standH = (t: Tile) => t.h - (isDeep(t) ? t.depth! : 0);
// Água funda (2 ou mais). No FFT só entra quem nada (BMG 6.5); aqui todos entram desde 13/11 (escolha do Fernando:
// "entra, mas não age dentro"): custa 2 como a rasa, quem está nela só anda ou espera (previewAbility) e o empurrão
// continua parando na beira (simulatePush). O salto para entrar e sair mede pela superfície (t.h), não pelo fundo:
// medindo pelo fundo, a margem ficava 2 níveis acima e só o Salto 2 entrava
export const isDeep = (t: Tile) => (t.depth ?? 0) >= 2;
// dá para parar na casa: pisável (a água funda também, desde 13/11)
export const canStand = (t: Tile) => TERRAIN[t.terrain].walkable;
// pontos de movimento para entrar na casa: água custa 2 (BMG 6.5, "flowing water"; a funda, por analogia, 13/11)
export const stepCost = (t: Tile) => (t.depth ? 2 : 1);

export const inBounds = (g: Grid, p: Pos) => p.x >= 0 && p.y >= 0 && p.x < g.width && p.y < g.height;
export const tileAt = (g: Grid, p: Pos): Tile => g.tiles[p.y * g.width + p.x];
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const posKey = (p: Pos) => `${p.x},${p.y}`;
// distância em passos de grade (4 direções), a mesma do movimento
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Direções de `UnitState.facing`, na ordem de um giro: +y, +x, -y, -x
export const FACING: Pos[] = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];

// De onde o ataque vem (BMG 1.4, diagrama): vale a maior entre as distâncias à frente, de lado e atrás do alvo; no empate
// ganha a mais à frente (frente sobre lado, lado sobre costas). A altura das casas não conta. Era do estudo do FFT; desde
// 13/11 vale no jogo (combat.ts, acerto pelo lado e pelas costas)
export type Side = 'front' | 'side' | 'back';
// direção de quem nasce (ou de save antigo sem direção): para o inimigo mais perto; sem inimigo, a primeira
export const faceNearest = (from: Pos, foes: Pos[]) => (foes.length ? facingTo(from, foes.reduce((a, b) => (dist(from, b) < dist(from, a) ? b : a))) : 0);
export function sideOf(target: Pos, facing: Pos, attacker: Pos): Side {
  const dx = attacker.x - target.x, dy = attacker.y - target.y;
  const ahead = dx * facing.x + dy * facing.y;
  const lateral = Math.abs(dx * facing.y - dy * facing.x);
  if (ahead > 0 && ahead >= lateral) return 'front';
  return ahead < 0 && -ahead > lateral ? 'back' : 'side';
}
// direção de `from` para `to` pelo eixo de maior diferença (empate: o eixo x, como no empurrão)
export function facingTo(from: Pos, to: Pos): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : dy > 0 ? 0 : 2;
}

const DIRS: Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
export function neighbors(g: Grid, p: Pos): Pos[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((q) => inBounds(g, q));
}
