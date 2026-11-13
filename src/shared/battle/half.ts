// Meia casa (13/11, pedido do Fernando: "os bonecos ocupam um quadrado de 4 tiles 2x2, mas o movimento é de 1 em 1 tile;
// quero testar assim"; depois: "as árvores podem ocupar 3, 4, 5 de largura… muitos tipos de árvore"). Versão de teste
// (?cenario=meia, Bosque): o mapa é dividido em meias-casas (cada casa vira 2x2), cada unidade vira uma ficha de 2x2 com
// o movimento e os alcances dobrados, e o Bosque ganha árvores de 3 a 5 meias-casas de largura e caixotes e corpos
// espalhados. Só existe para quem chama registerHalf (o cliente com ?cenario=meia), como o estudo do FFT.
import { ABILITIES } from './abilities.ts';
import { FACING, posKey, tileAt, type Grid, type Tile } from './grid.ts';
import { SCENARIOS, type Scenario } from './scenarios.ts';
import type { Pos } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export const HALF = '½';
export const HALF_ID = 'ash_wood_meia';
export const baseDef = (def: string) => (def.endsWith(HALF) ? def.slice(0, -HALF.length) : def);

// alcance em meias-casas: corpo a corpo continua 1 (dois quadrados lado a lado ficam a 1 meia-casa), o resto dobra
const twice = (r: number) => (r <= 1 ? r : r * 2);

function registerDefs() {
  for (const a of Object.values(ABILITIES)) {
    if (a.id.endsWith(HALF) || ABILITIES[a.id + HALF]) continue;
    ABILITIES[a.id + HALF] = { ...a, id: a.id + HALF, range: [twice(a.range[0]), twice(a.range[1])], radius: a.radius * 2, push: a.push * 2 };
  }
  for (const d of Object.values(UNIT_DEFS)) {
    if (d.id.endsWith(HALF) || UNIT_DEFS[d.id + HALF]) continue;
    UNIT_DEFS[d.id + HALF] = { ...d, id: d.id + HALF, size: (d.size ?? 1) * 2, move: d.move * 2, abilities: d.abilities.map((a) => a + HALF) };
  }
}

// cada casa vira 2x2 meias-casas; a rampa só fica na meia-casa encostada na casa de cima (a outra é plana)
function split(g: Grid): Grid {
  const W = g.width * 2, H = g.height * 2, tiles: Tile[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(g, { x: x >> 1, y: y >> 1 });
    const c: Tile = { ...t };
    // objeto da casa (caixote, barril, corpo) fica só na meia-casa de cima à esquerda: senão virava 4 iguais. O caixote e
    // o barril continuam barrando o quadrado todo; o corpo só ocupa a dele
    const corner = x % 2 === 0 && y % 2 === 0;
    if (!corner && PROPS.has(t.look ?? '')) { c.look = 'sand'; if (t.look === 'corpse') { c.terrain = 'floor'; delete c.noStop; } }
    if (t.ramp) {
      const f = FACING[t.ramp[0]];
      const nearHigh = (f.x > 0 && x % 2 === 1) || (f.x < 0 && x % 2 === 0) || (f.y > 0 && y % 2 === 1) || (f.y < 0 && y % 2 === 0);
      if (!nearHigh) delete c.ramp;
    }
    tiles.push(c);
  }
  return { width: W, height: H, tiles, levelHeight: (g.levelHeight ?? 0.5) * 2 };
}

const TREE_LOOKS = ['tree', 'tree2', 'tree3', 'tree4'];
const PROPS = new Set(['crates', 'barrel', 'corpse']);

// Árvores do Bosque em meias-casas: as de antes viram árvores de 2; mais umas de 3 a 5 nas casas de grama, longe da
// estrada, da água e de onde as unidades nascem, cada uma só se o caminho dos heróis aos inimigos continuar aberto
function plantTrees(g: Grid, spawns: Pos[], hero: Pos, foe: Pos): void {
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const at = (p: Pos) => g.tiles[p.y * g.width + p.x];
  const W = g.width, H = g.height;
  // árvores que já existiam: o quadrado de 2x2 de cada casa de floresta vira uma árvore só, de 2
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const t = at({ x, y });
    if (t.terrain !== 'forest') continue;
    t.tree = 2;
    for (const c of [{ x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]) at(c).look = 'grass';
  }
  const near = (p: Pos, look: string[], r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) continue;
      const t = at(q);
      if (look.includes(t.look ?? '') || t.depth) return true; // a estrada (areia) pode encostar: a árvore só não fica em cima
    }
    return false;
  };
  // sem encostar no quadrado 2x2 de quem nasce (1 meia-casa de folga)
  const spawnClose = (p: Pos, sz: number) => spawns.some((sp) => sp.x + 2 >= p.x - 1 && sp.x <= p.x + sz && sp.y + 2 >= p.y - 1 && sp.y <= p.y + sz);
  // caminho aberto para quem ocupa 2x2 (sobe ou desce 1 nível por passo), de um herói até perto de um inimigo
  const open = () => {
    const ok = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x + 1 >= W || p.y + 1 >= H) return false;
      const cs = [p, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].map(at);
      return cs.every((t) => t.terrain === 'floor' && (t.depth ?? 0) < 2);
    };
    const seen = new Set([posKey(hero)]), queue = [hero];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (Math.abs(p.x - foe.x) <= 3 && Math.abs(p.y - foe.y) <= 3) return true;
      for (const f of FACING) {
        const n = { x: p.x + f.x, y: p.y + f.y };
        if (seen.has(posKey(n)) || !ok(n) || Math.abs(at(n).h - at(p).h) > 1) continue;
        seen.add(posKey(n));
        queue.push(n);
      }
    }
    return false;
  };
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 26; tries++) {
    const sz = 3 + Math.floor(rnd() * 3); // 3, 4 ou 5 meias-casas de largura
    const p = { x: Math.floor(rnd() * (W - sz)), y: Math.floor(rnd() * (H - sz)) };
    const cells: Pos[] = [];
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) cells.push({ x: p.x + dx, y: p.y + dy });
    const h = at(p).h;
    // árvore em encosta também (até 1 nível de diferença no quadrado): o mapa tem degraus em quase todo canto
    if (spawnClose(p, sz) || cells.some((c) => Math.abs(at(c).h - h) > 1 || near(c, ['bridge', 'water'], 1) || !['grass', undefined].includes(at(c).look) || at(c).terrain !== 'floor')) continue;
    const before = cells.map((c) => ({ ...at(c) }));
    cells.forEach((c, k) => {
      const t = at(c);
      t.terrain = 'forest';
      t.look = k === 0 ? TREE_LOOKS[Math.floor(rnd() * TREE_LOOKS.length)] : 'grass';
      if (k === 0) t.tree = sz;
    });
    if (!open()) { cells.forEach((c, k) => (g.tiles[c.y * W + c.x] = before[k])); continue; }
    placed++;
  }
}

// caixotes, barris e corpos espalhados pelos dois lados (um por meia-casa, longe da estrada e das nascentes)
function scatterProps(g: Grid, spawns: Pos[]): void {
  let s = 777;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const kinds: Partial<Tile>[] = [
    { terrain: 'wall', look: 'crates' }, { terrain: 'wall', look: 'barrel' },
    { terrain: 'floor', look: 'corpse', noStop: true }, { terrain: 'floor', look: 'corpse', noStop: true },
  ];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 14; tries++) {
    const p = { x: Math.floor(rnd() * g.width), y: Math.floor(rnd() * g.height) };
    const t = g.tiles[p.y * g.width + p.x];
    if (t.terrain !== 'floor' || t.depth || t.ramp || t.look === 'bridge' || t.noStop) continue;
    if (spawns.some((sp) => Math.abs(sp.x - p.x) <= 3 && Math.abs(sp.y - p.y) <= 3)) continue;
    Object.assign(t, kinds[placed % kinds.length]);
    placed++;
  }
}

// Bosque em meias-casas; registra as fichas e o cenário (cliente com ?cenario=meia)
export function registerHalf(): Scenario {
  registerDefs();
  const base = SCENARIOS.ash_wood;
  const grid = split(base.grid);
  const spawns = base.spawns.map((sp) => ({ ...sp, def: sp.def + HALF, x: sp.x * 2, y: sp.y * 2 }));
  const anchors = spawns.map((sp) => ({ x: sp.x, y: sp.y }));
  const hero = spawns.find((sp) => sp.team === 'hero')!, foe = spawns.find((sp) => sp.team === 'enemy')!;
  plantTrees(grid, anchors, hero, foe);
  scatterProps(grid, anchors);
  const sc: Scenario = { id: HALF_ID, name: `${base.name} (meia casa)`, en: `${base.en} (half tiles)`, grid, spawns };
  SCENARIOS[HALF_ID] = sc;
  return sc;
}
