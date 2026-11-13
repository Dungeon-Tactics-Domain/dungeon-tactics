// Ponte de verdade (13/11, pedido do Fernando: "uma ponte bem feita, com texturas, escadinha, madeira correta com placas
// de madeira e cordinhas dos lados"): nos mapas abertos, cada grupo de casas de ponte (Tile.look 'bridge') vira tábuas
// soltas com fresta, duas vigas por baixo, postes nos cantos e no meio, corda nos dois lados e escadinha nas pontas que
// descem até a margem. Textura CC0 do Poly Haven (public/tex/wood.jpg, bark.jpg). Só desenho: a casa da ponte continua
// com a altura dela na regra, e o topo das tábuas fica exatamente nessa altura (o boneco pisa nelas).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inBounds, neighbors, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

const PLANK = 0.19; // profundidade de cada tábua, com 0,03 de fresta
const DECK = 0.07; // espessura da tábua
const RAIL = 0.55; // altura da corda de cima acima das tábuas

// caixa com o UV numa faixa da textura (uma tábua da foto), para a tábua não ficar com a foto inteira espremida
function plankBox(w: number, h: number, d: number, shift: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.5 + shift, uv.getY(i) * 0.11 + (shift % 1));
  return g;
}

// corda com barriga entre dois postes
function rope(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0));
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 12, 0.018, 5);
}

export function buildBridges(grid: Grid, step: number, wood: THREE.Texture, bark: THREE.Texture): THREE.Group {
  const out = new THREE.Group();
  out.name = 'pontes';
  const isBridge = (p: Pos) => inBounds(grid, p) && tileAt(grid, p).look === 'bridge';
  const seen = new Set<string>();
  const planks: THREE.BufferGeometry[] = [], beams: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = [], ropes: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  grid.tiles.forEach((_, i) => {
    const start = { x: i % grid.width, y: Math.floor(i / grid.width) };
    if (!isBridge(start) || seen.has(posKey(start))) return;
    // grupo de casas de ponte ligadas
    const comp: Pos[] = [], queue = [start];
    seen.add(posKey(start));
    while (queue.length) {
      const p = queue.pop()!;
      comp.push(p);
      for (const n of neighbors(grid, p)) if (isBridge(n) && !seen.has(posKey(n))) { seen.add(posKey(n)); queue.push(n); }
    }
    const x0 = Math.min(...comp.map((p) => p.x)), x1 = Math.max(...comp.map((p) => p.x)) + 1;
    const z0 = Math.min(...comp.map((p) => p.y)), z1 = Math.max(...comp.map((p) => p.y)) + 1;
    const top = (tileAt(grid, comp[0]).h + 1) * step;
    // atravessa no sentido em que a ponte encosta em terra seca nas duas pontas (no Bosque, de norte a sul)
    const dry = (p: Pos) => inBounds(grid, p) && !tileAt(grid, p).depth && tileAt(grid, p).look !== 'bridge';
    const alongZ = dry({ x: x0, y: z0 - 1 }) || dry({ x: x0, y: z1 });
    // eixos locais: `a` ao longo da travessia, `c` de lado; tudo em coordenadas do mundo (mapa centrado na origem)
    const [a0, a1, c0, c1] = alongZ ? [z0, z1, x0, x1] : [x0, x1, z0, z1];
    const at = (a: number, c: number, y: number) => (alongZ ? new THREE.Vector3(c - grid.width / 2, y, a - grid.height / 2) : new THREE.Vector3(a - grid.width / 2, y, c - grid.height / 2));
    const put = (g: THREE.BufferGeometry, a: number, c: number, y: number, list: THREE.BufferGeometry[], turn = 0) => {
      g.rotateY((alongZ ? 0 : Math.PI / 2) + turn);
      const p = at(a, c, y);
      list.push(g.translate(p.x, p.y, p.z));
    };
    const width = c1 - c0 - 0.1, mid = (c0 + c1) / 2;
    // tábuas soltas, com fresta e um tico de torto cada uma
    for (let a = a0 + 0.02; a + PLANK <= a1; a += PLANK + 0.03) {
      put(plankBox(width * (0.96 + 0.04 * rnd()), DECK, PLANK, rnd() * 4), a + PLANK / 2, mid + (rnd() - 0.5) * 0.06, top - DECK / 2 - rnd() * 0.012, planks, (rnd() - 0.5) * 0.05);
    }
    // duas vigas por baixo, de ponta a ponta
    for (const c of [c0 + 0.25, c1 - 0.25]) put(plankBox(0.14, 0.14, a1 - a0 + 0.3, 0), (a0 + a1) / 2, c, top - DECK - 0.07, beams, Math.PI / 2);
    // escadinha em cada ponta: da altura das tábuas até a margem, para fora da ponte (no terço da casa vizinha)
    for (const [end, dir] of [[a0, -1], [a1, 1]] as const) {
      const nb = alongZ ? { x: Math.floor(mid), y: dir < 0 ? z0 - 1 : z1 } : { x: dir < 0 ? x0 - 1 : x1, y: Math.floor(mid) };
      if (!inBounds(grid, nb)) continue;
      const ground = (tileAt(grid, nb).h + 1) * step;
      const drop = top - ground;
      if (drop < 0.08) continue;
      const n = Math.max(2, Math.round(drop / 0.13)), run = 0.36 / n;
      for (let k = 1; k <= n; k++) {
        const y = top - (drop * k) / (n + 0.5);
        put(plankBox(width * 0.9, DECK, run + 0.02, rnd() * 4), end + dir * (k - 0.5) * run, mid, y - DECK / 2, planks);
        // pé de cada degrau até o chão
        put(plankBox(0.08, y - ground + 0.05, 0.08, 0), end + dir * (k - 0.5) * run, c0 + 0.2, (y + ground) / 2 - 0.03, beams);
        put(plankBox(0.08, y - ground + 0.05, 0.08, 0), end + dir * (k - 0.5) * run, c1 - 0.2, (y + ground) / 2 - 0.03, beams);
      }
    }
    // postes a cada casa nos dois lados, descendo até a água, e corda em cima e no meio entre eles
    const stations: number[] = [];
    for (let a = a0; a <= a1 + 1e-6; a += 1) stations.push(a);
    for (const c of [c0 + 0.04, c1 - 0.04]) {
      const tops: THREE.Vector3[] = [], mids: THREE.Vector3[] = [];
      for (const a of stations) {
        const len = RAIL + 1.2;
        const g = new THREE.CylinderGeometry(0.05, 0.06, len, 6);
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * len * 0.6);
        put(g, a, c, top + RAIL - len / 2 + 0.05, posts);
        tops.push(at(a, c, top + RAIL));
        mids.push(at(a, c, top + RAIL * 0.5));
      }
      for (let k = 1; k < tops.length; k++) {
        ropes.push(rope(tops[k - 1], tops[k], 0.08), rope(mids[k - 1], mids[k], 0.06));
      }
    }
  });
  const woodMat = new THREE.MeshLambertMaterial({ map: wood, color: '#c9a37a' });
  const barkMat = new THREE.MeshLambertMaterial({ map: bark, color: '#b08860' });
  const ropeMat = new THREE.MeshLambertMaterial({ color: '#c9b07c' });
  for (const [list, mat] of [[planks, woodMat], [beams, woodMat], [posts, barkMat], [ropes, ropeMat]] as const) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
    for (const g of list) g.dispose();
  }
  return out;
}

export async function loadBridgeTextures(): Promise<{ wood: THREE.Texture; bark: THREE.Texture }> {
  const loader = new THREE.TextureLoader();
  const one = async (n: string) => {
    const t = await loader.loadAsync(`/tex/${n}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const [wood, bark] = await Promise.all([one('wood'), one('bark')]);
  return { wood, bark };
}
