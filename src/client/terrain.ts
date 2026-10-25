// Terreno liso (13/11, escolha do Fernando em múltipla escolha: "terreno liso de verdade" no lugar dos blocos KayKit, que
// "parecem Minecraft"; texturas CC0 do Poly Haven em public/tex). Uma malha só para o chão de todos os mapas abertos (as
// criptas seguem em blocos): cada casa fica plana no meio (onde ficam boneco, marca e cursor) e o degrau vira encosta no
// terço da borda. A mesma malha continua EXT_RING casas para fora (a extensão), escurecendo até o preto total, e o rio que
// cruza o mapa segue por fora: nasce mais alto de um lado e sai mais baixo do outro, em cascatas. Só desenho: as regras
// continuam lendo a altura de cada casa (grid.ts).
import * as THREE from 'three';
import { posKey, tileAt, type Grid, type Tile } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import { WADE, type WaterLevel } from './water-levels.ts';

// extensão em volta do mapa (pedido do Fernando, 13/11): escurece em EXT_FADE blocos e vai ao preto total nos EXT_DARK
// seguintes; árvores e objetos de fora somem no preto no mesmo trecho (neblina dos arredores, ambience.ts)
export const EXT_FADE = 2, EXT_DARK = 4, EXT_RING = EXT_FADE + EXT_DARK;
// tom de cada anel de fora: escurece logo na 1ª casa depois da borda e chega ao preto total no 4º (13/11, pedido do
// Fernando: "o sombreamento começa no último tile da borda e escurece mais forte e mais rápido"); antes ia até o 6º
const TONES = [1, 0.4, 0.16, 0.05, 0];
export const extTone = (ring: number) => TONES[Math.min(ring, TONES.length - 1)];
const SUB = 6; // subdivisões por casa: o meio (4 de 6) fica plano e a encosta ocupa 1/3 de casa em volta de cada borda
const RISE = 0.5; // quanto o lado da nascente sobe (em níveis) a cada 2 casas para fora, junto com a água

// pintura de cada aparência de casa: grama, folhas, terra, neve e pedra (a pedra também entra sozinha nas encostas)
type Paint = [grass: number, leaves: number, dirt: number, snow: number, stone: number];
export const PAINT: Record<string, Paint> = {
  grass: [1, 0, 0, 0, 0], tree: [0.5, 0.5, 0, 0, 0], tree2: [0.6, 0.4, 0, 0, 0], tree3: [0.6, 0.4, 0, 0, 0], tree4: [0.6, 0.4, 0, 0, 0],
  sand: [0.15, 0, 0.85, 0, 0], water: [0, 0, 1, 0, 0], crates: [0, 0, 1, 0, 0], barrel: [0, 0, 1, 0, 0], corpse: [0.2, 0, 0.8, 0, 0],
  snow: [0, 0, 0.3, 0.7, 0], snow_rock: [0, 0, 0, 0.8, 0.2], bare1: [0, 0, 0.3, 0.7, 0], bare2: [0, 0, 0.3, 0.7, 0],
  rock: [0, 0, 0, 0, 1], summit: [0, 0, 0, 0, 1], gold: [0, 0, 0.3, 0, 0.7], stone: [0, 0, 0.4, 0, 0.6],
};

// altura (h) da casa mais baixa do tabuleiro a até `ring` casas de (i, j): a extensão nunca passa dela, porque a câmera
// olha na diagonal e uma coluna alta na frente de um boneco numa casa baixa tapava meio boneco (revisão de 13/11)
export const extH = (g: Grid, i: number, j: number, ring: number) => {
  let h = Infinity;
  for (let b = j - ring; b <= j + ring; b++) for (let a = i - ring; a <= i + ring; a++) {
    if (a >= 0 && b >= 0 && a < g.width && b < g.height) h = Math.min(h, tileAt(g, { x: a, y: b }).h);
  }
  return h;
};
export const ringOf = (g: Grid, i: number, j: number) => Math.max(-i, -j, i - g.width + 1, j - g.height + 1);

// rio que cruza o mapa de um lado ao outro (linhas com água nas duas bordas). dir 1: a nascente fica à direita (x >= W),
// o lado onde a água da borda está mais alta (no Bosque, o vau)
export interface River { rows: number[]; dir: 1 | -1 }
export function riverOf(grid: Grid, levels: Map<string, WaterLevel>): River | null {
  const W = grid.width;
  const rows = Array.from({ length: grid.height }, (_, y) => y).filter((y) => levels.has(`0,${y}`) && levels.has(`${W - 1},${y}`));
  if (!rows.length) return null;
  const y = rows[0];
  return { rows, dir: levels.get(`${W - 1},${y}`)!.surface >= levels.get(`0,${y}`)!.surface ? 1 : -1 };
}

// quanto o chão de fora sobe no lado da nascente (em níveis): o rio "vem do alto", e a margem sobe junto com a água
const riseAt = (grid: Grid, river: River | null, i: number) => {
  if (!river) return 0;
  const k = river.dir > 0 ? i - grid.width + 1 : -i;
  return k > 0 ? Math.ceil(k / 2) * RISE : 0; // para cima: a margem fica acima da corredeira contínua (streamAt)
};

// topo do chão de fora em (i, j), em metros
export const outerTop = (grid: Grid, step: number, river: River | null, i: number, j: number) =>
  (extH(grid, i, j, ringOf(grid, i, j)) + 1 + riseAt(grid, river, i)) * step;

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Rio de fora (13/11, pedido do Fernando: "a cachoeira retona está tosca… água mais fluida… água descendo pelo morro"):
// superfície contínua em `u` (casas, contínuo; fora do tabuleiro), plana na 1ª metade de cada par de casas e descendo em
// corredeira na 2ª, RISE nível por par. Sobe do lado da nascente e desce do outro; null fora das linhas do rio
export function streamAt(grid: Grid, step: number, levels: Map<string, WaterLevel>, river: River | null, u: number, j: number): number | null {
  if (!river || !river.rows.includes(j) || (u >= 0 && u < grid.width)) return null;
  const right = u >= grid.width;
  const lv = levels.get(`${right ? grid.width - 1 : 0},${j}`)!;
  const k = right ? u - grid.width : -u; // distância da borda, em casas
  const up = (right ? 1 : -1) === river.dir ? 1 : -1;
  return lv.surface + up * (Math.floor(k / 2) + smooth(0.5, 1, (k / 2) % 1)) * RISE * step;
}

// casas de fora com água (o meio de cada uma), para o chão e as árvores dos arredores saberem onde é rio
export function riverOutside(grid: Grid, step: number, levels: Map<string, WaterLevel>, river: River | null): Map<string, WaterLevel> {
  const out = new Map<string, WaterLevel>();
  if (!river) return out;
  for (const y of river.rows) for (const [edge, side] of [[grid.width - 1, 1], [0, -1]] as const) {
    const deep = levels.get(`${edge},${y}`)!.deep;
    for (let k = 1; k <= EXT_RING; k++) {
      const i = edge + side * k, surface = streamAt(grid, step, levels, river, i + 0.5, y)!;
      out.set(`${i},${y}`, { surface, bed: surface - (deep ? step : WADE * step), deep });
    }
  }
  return out;
}

// Malha do rio de fora: uma faixa por lado, com correnteza animada (listras que andam a favor da água) e espuma onde a
// descida é mais forte; escurece com a extensão até o preto, como o chão. `time` anda no relógio da batalha (scene.ts)
export function buildStream(grid: Grid, step: number, levels: Map<string, WaterLevel>, river: River | null): { meshes: THREE.Mesh[]; time: { value: number } } {
  const time = { value: 0 };
  if (!river) return { meshes: [], time };
  const W = grid.width, H = grid.height, N = 8;
  const z0 = Math.min(...river.rows), z1 = Math.max(...river.rows) + 1;
  const meshes = ([1, -1] as const).map((side) => {
    const pos: number[] = [], col: number[] = [], flow: number[] = [], slope: number[] = [], idx: number[] = [];
    const nu = EXT_RING * N, nv = (z1 - z0) * 2;
    for (let b = 0; b <= nv; b++) for (let a = 0; a <= nu; a++) {
      const k = a / N, u = side > 0 ? W + k : -k, v = z0 + b / 2;
      const j = Math.min(z1 - 1, Math.floor(v));
      const y = streamAt(grid, step, levels, river, side > 0 ? u + 1e-4 : u - 1e-4, j)!;
      const y2 = streamAt(grid, step, levels, river, side > 0 ? u + 0.05 : u - 0.05, j) ?? y;
      pos.push(u - W / 2, y + 0.01, v - H / 2);
      const ring = Math.floor(k) + 1;
      const t = extTone(ring);
      col.push(t, t, t);
      flow.push(k);
      slope.push(Math.abs(y2 - y) / 0.05);
    }
    for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
      const v = b * (nu + 1) + a;
      // a faixa da esquerda corre para -x: a ordem dos vértices vira para a face continuar para cima
      if (side > 0) idx.push(v, v + nu + 1, v + 1, v + 1, v + nu + 1, v + nu + 2);
      else idx.push(v, v + 1, v + nu + 1, v + 1, v + nu + 2, v + nu + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    // a água corre da nascente para fora: do lado da nascente, para a borda (k diminui); do outro, para longe (k aumenta)
    const dir = side === river.dir ? 1 : -1;
    const mat = new THREE.MeshLambertMaterial({ color: '#1d4f7a', vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSTime = time;
      sh.vertexShader = 'attribute float aFlow; attribute float aSlope; varying float vFlow; varying float vSlope; varying vec2 vSXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow; vSlope = aSlope; vSXZ = position.xz;');
      sh.fragmentShader = 'uniform float uSTime; varying float vFlow; varying float vSlope; varying vec2 vSXZ;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float w = sin(vSXZ.y * 9.0 + vFlow * 3.0) * 0.08;
        float lane = fract(vFlow * 1.6 + ${dir.toFixed(1)} * uSTime * (0.7 + 0.9 * clamp(vSlope, 0.0, 1.5)) + w);
        float streak = smoothstep(0.75, 1.0, lane) * (0.35 + 0.65 * fract(sin(floor(vSXZ.y * 6.0) * 78.233) * 43758.5));
        float foam = clamp(smoothstep(0.15, 0.7, vSlope) * (0.45 + 0.55 * streak) + streak * 0.3, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 1.0), foam);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`);
    };
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -1; // junto da água do mapa: marcas e cursor por cima
    m.receiveShadow = true;
    m.name = 'rio-de-fora';
    return m;
  });
  return { meshes, time };
}

const VERT_HEAD = 'attribute vec4 aW; attribute float aStone; varying vec4 vW; varying float vStone; varying vec3 vWPos; varying vec3 vWN;\n';
const FRAG_HEAD = 'uniform sampler2D tGrass; uniform sampler2D tLeaves; uniform sampler2D tDirt; uniform sampler2D tSnow; uniform sampler2D tCliff;\nvarying vec4 vW; varying float vStone; varying vec3 vWPos; varying vec3 vWN;\n';
// mistura das texturas: o chão pela pintura da casa; a pedra nas encostas (pela inclinação) e onde a casa é de pedra, em
// projeção pelos três eixos para não esticar no barranco. 0,35 = uma textura de 512 px a cada ~3 casas
const FRAG_MIX = `
vec2 tuv = vWPos.xz * 0.35;
vec3 tg = texture2D(tGrass, tuv).rgb, tl = texture2D(tLeaves, tuv * 1.3).rgb, td = texture2D(tDirt, tuv).rgb, ts = texture2D(tSnow, tuv).rgb;
vec3 base = (tg * vW.x + tl * vW.y + td * vW.z + ts * vW.w) / max(vW.x + vW.y + vW.z + vW.w, 1e-3);
vec3 tn = normalize(vWN), an = abs(tn);
vec3 cl = (texture2D(tCliff, vWPos.zy * 0.45).rgb * an.x + texture2D(tCliff, vWPos.xy * 0.45).rgb * an.z + texture2D(tCliff, vWPos.xz * 0.45).rgb * an.y) / (an.x + an.y + an.z);
float rocky = max(1.0 - smoothstep(0.5, 0.82, tn.y), vStone);
// manchas de sol no chão, como no FFT (13/11, "pintado, tipo FFT"): ruído largo tirado da própria grama, só no plano
float dap = smoothstep(0.55, 0.62, dot(texture2D(tGrass, vWPos.xz * 0.045 + 0.3).rgb, vec3(0.333)) * 1.6);
base = mix(base, base * vec3(1.45, 1.32, 0.72), dap * 0.55 * (1.0 - rocky) * vW.x);
diffuseColor.rgb *= mix(base, cl, rocky);
`;

export interface TerrainTextures { grass: THREE.Texture; leaves: THREE.Texture; dirt: THREE.Texture; snow: THREE.Texture; cliff: THREE.Texture; wood: THREE.Texture; bark: THREE.Texture }
export function loadTerrainTextures(): Promise<TerrainTextures> {
  const loader = new THREE.TextureLoader();
  const one = async (n: string) => {
    const t = await loader.loadAsync(`/tex/${n}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // wood e bark: a ponte de verdade (bridge.ts)
  return Promise.all(['grass', 'leaves', 'dirt', 'snow', 'cliff', 'wood', 'bark'].map(one)).then(([grass, leaves, dirt, snow, cliff, wood, bark]) => ({ grass, leaves, dirt, snow, cliff, wood, bark }));
}

export interface TerrainOptions {
  step: number;
  // altura do chão (metros) no ponto (x, z) do mundo dentro da casa p: o meio de cada casa, a rampa, o leito da água
  inner: (p: Pos, x: number, z: number) => number;
  outside: Map<string, WaterLevel>; // água de fora (riverOutside): o chão ali é o leito
  levels: Map<string, WaterLevel>;
  river: River | null;
  extend: boolean; // com a extensão em volta (EXT_RING casas); sem ela, só o tabuleiro
  tex: TerrainTextures;
}

export function buildTerrain(grid: Grid, o: TerrainOptions): THREE.Mesh {
  const W = grid.width, H = grid.height, R = o.extend ? EXT_RING : 0;
  const NX = (W + 2 * R) * SUB, NZ = (H + 2 * R) * SUB; // sub-casas
  const raw = new Float32Array(NX * NZ), paint = new Float32Array(NX * NZ * 5), tone = new Float32Array(NX * NZ);
  for (let b = 0; b < NZ; b++) for (let a = 0; a < NX; a++) {
    const u = (a + 0.5) / SUB - R, v = (b + 0.5) / SUB - R; // em casas, 0 = canto do tabuleiro
    const i = Math.floor(u), j = Math.floor(v), c = b * NX + a;
    const x = u - W / 2, z = v - H / 2;
    const inside = i >= 0 && j >= 0 && i < W && j < H;
    const edge: Tile = tileAt(grid, { x: THREE.MathUtils.clamp(i, 0, W - 1), y: THREE.MathUtils.clamp(j, 0, H - 1) });
    const wet = o.outside.get(`${i},${j}`);
    const flowing = wet ? streamAt(grid, o.step, o.levels, o.river, u, j) : null;
    raw[c] = inside ? o.inner({ x: i, y: j }, x, z) : wet && flowing !== null ? flowing - (wet.surface - wet.bed) : outerTop(grid, o.step, o.river, i, j);
    const ring = inside ? 0 : ringOf(grid, i, j);
    // escurece de 1 até 0,12 nos EXT_FADE primeiros anéis e vai ao preto total nos EXT_DARK seguintes
    tone[c] = extTone(ring);
    paint.set(wet ? PAINT.water : PAINT[edge.look ?? 'grass'] ?? PAINT.grass, c * 5);
  }
  // vértice = média das até 4 sub-casas em volta: a borda entre duas alturas vira encosta, o meio da casa fica plano
  const VX = NX + 1, VZ = NZ + 1;
  const pos = new Float32Array(VX * VZ * 3), col = new Float32Array(VX * VZ * 3), w4 = new Float32Array(VX * VZ * 4), st = new Float32Array(VX * VZ);
  for (let b = 0; b < VZ; b++) for (let a = 0; a < VX; a++) {
    let y = 0, k = 0, t = 0;
    const p = [0, 0, 0, 0, 0];
    for (const [da, db] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ca = a + da, cb = b + db;
      if (ca < 0 || cb < 0 || ca >= NX || cb >= NZ) continue;
      const c = cb * NX + ca;
      y += raw[c]; t += tone[c]; k++;
      for (let n = 0; n < 5; n++) p[n] += paint[c * 5 + n];
    }
    const v = b * VX + a;
    pos.set([a / SUB - R - W / 2, y / k, b / SUB - R - H / 2], v * 3);
    col.set([t / k, t / k, t / k], v * 3);
    w4.set([p[0] / k, p[1] / k, p[2] / k, p[3] / k], v * 4);
    st[v] = p[4] / k;
  }
  const idx: number[] = [];
  for (let b = 0; b < NZ; b++) for (let a = 0; a < NX; a++) {
    const v = b * VX + a;
    idx.push(v, v + VX, v + 1, v + 1, v + VX, v + VX + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aW', new THREE.BufferAttribute(w4, 4));
  g.setAttribute('aStone', new THREE.BufferAttribute(st, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: o.tex.grass }, tLeaves: { value: o.tex.leaves }, tDirt: { value: o.tex.dirt }, tSnow: { value: o.tex.snow }, tCliff: { value: o.tex.cliff } });
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW; vStone = aStone; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', FRAG_MIX);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = mesh.castShadow = true;
  mesh.name = 'terreno';
  return mesh;
}

// casas do tabuleiro para o toque e o mouse (o raio acerta a casa, não a encosta): um quadrado invisível no meio de cada
export function pickTiles(tiles: { p: Pos; at: THREE.Vector3 }[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), tiles.length);
  tiles.forEach((t, n) => m.setMatrixAt(n, new THREE.Matrix4().makeTranslation(t.at.x, t.at.y, t.at.z)));
  m.userData.tiles = tiles.map((t) => t.p);
  return m;
}

export const keyOf = posKey;
