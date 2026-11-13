// Água com volume e física (13/11, pedido do Fernando: "água volumétrica mesmo, com física? essa ainda está estranha"). A casa
// de água é o leito (o chão da cena, onde o boneco pisa) mais o volume desenhado aqui:
// - física: um campo de altura em grade fina (FIELD células por casa, equação de onda amortecida na CPU). Boneco que entra,
//   anda, pula ou é empurrado afunda a água no ponto; a onda se espalha, bate na margem e volta. No rio a correnteza arrasta
//   o campo e o desenho no sentido da água. O campo dorme quando a água acalma (nada roda nem sobe para a placa);
// - superfície: uma malha só, subdividida, com os vértices subindo e descendo pelo campo mais um balanço leve; casas vizinhas
//   da mesma altura leem o mesmo campo, então viram uma superfície contínua;
// - volume: cor em faixas pela profundidade (rasa clara e transparente, deixa ver o leito; funda escura), espuma na margem e
//   nas cristas; os degraus de água viram cachoeira em arco (a água sai da borda e cai), a borda do mapa mostra o corte da água.
// Só desenha: lê a posição dos bonecos da cena, nunca as regras.
// Pixel art: o passe de normais redesenha a cena com MeshNormalMaterial, que ignora o shader daqui. A malha guarda normal
// para cima e posição plana, então nesse passe a água continua um plano liso (sem contorno nas ondas); o deslocamento e a
// normal das ondas só existem no passe de cor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inBounds, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import { pickTiles, type River } from './terrain.ts';
import type { WaterLevel } from './water-levels.ts';

const FIELD = 8; // células do campo por casa: onda de ~0,5 casa ainda tem 4 células (8 já lê no pixel de 3 px)
const SUB = 8; // quadrados da malha por casa (um vértice por célula)
const HZ = 60; // passos da física por segundo do relógio da batalha (passo fixo: a onda não muda com o fps)
// velocidade da onda² em células por passo: √0,05 × 60 / 8 ≈ 1,7 casa/s (o anel antigo andava 1,5). Estável abaixo de 0,5
const C2 = 0.05;
const DAMP = 0.982; // por passo: a onda perde 90% em ~2 s
const RELAX = 0.995; // por passo: o nível volta ao normal em ~5 s
const AMP = 0.1; // m de altura que cabem na textura de 8 bits (±): 1 passo ≈ 0,8 mm
const SWELL = 0.008; // m do balanço constante (soma de 3 senos ≈ ±2,5 × isso)
const FLOW = { deep: 0.45, shallow: 0.3 }; // casas/s da correnteza do rio dentro do mapa (a de fora, terrain.ts, é parecida)
const BODIES = 8; // bonecos na água com colar de espuma
const IDLE_MS = 1300; // parado na água: um empurrãozinho de tempo em tempo (respira)
const WAKE_MS = 110; // andando na água: rastro
// cores (sRGB; viram lineares no uniform): três faixas de profundidade, espuma quase branca
const COLOR = { shallow: '#3aa6c4', mid: '#1f6fa3', deep: '#173d72', foam: '#eaf8ff', side: '#2a6ea3', drop: '#e8f8ff' };
const ALPHA = { shallow: 0.42, mid: 0.72, deep: 0.93 };

const DIRS: [dx: number, dy: number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // norte (-z), leste (+x), sul (+z), oeste (-x)
const CORNERS: [dx: number, dy: number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]]; // NE, SE, SO, NO

// altura das ondas em (x, z) do mundo: campo da física (textura) + balanço; usado pela superfície e pelo topo da cachoeira,
// para as duas subirem juntas
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform sampler2D uField;
uniform vec2 uMap; // largura e altura do mapa, em casas
float fieldH(vec2 p) { return (texture2D(uField, (p + 0.5 * uMap) / uMap).r - 0.5) * ${(2 * AMP).toFixed(3)}; }
float swellH(vec2 p) { return ${SWELL.toFixed(4)} * (sin(p.x * 2.1 + uTime * 1.3) + sin(p.y * 1.7 - uTime * 1.1) + 0.5 * sin((p.x - p.y) * 3.3 + uTime * 2.0)); }
vec2 swellD(vec2 p) {
  float c = 0.5 * 3.3 * cos((p.x - p.y) * 3.3 + uTime * 2.0);
  return ${SWELL.toFixed(4)} * vec2(2.1 * cos(p.x * 2.1 + uTime * 1.3) + c, 1.7 * cos(p.y * 1.7 - uTime * 1.1) - c);
}
`;
const VERT_HEAD = /* glsl */ `
${WAVE_GLSL}
attribute vec2 aLocal;
attribute vec4 aEdge;
attribute vec4 aCorner;
attribute float aDepth;
attribute vec2 aFlow;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const VERT_BODY = /* glsl */ `
vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
// o balanço anda com a correnteza; parado fora do rio
transformed.y += fieldH(vWaterXZ) + swellH(vWaterXZ - aFlow * uTime);
vLocal = aLocal;
vEdge = aEdge;
vCorner = aCorner;
vDepth = aDepth;
vFlow = aFlow;
`;
const FRAG_HEAD = /* glsl */ `
${WAVE_GLSL}
uniform vec4 uBodies[${BODIES}];
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeepColor;
uniform vec3 uFoam;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const FRAG_COLOR = /* glsl */ `
vec2 pf = vWaterXZ - vFlow * uTime; // ponto arrastado pela correnteza (o desenho corre com a água)
float hw = fieldH(vWaterXZ);
const float CELL = ${(1 / FIELD).toFixed(4)};
vec2 slope = vec2(fieldH(vWaterXZ + vec2(CELL, 0.0)) - fieldH(vWaterXZ - vec2(CELL, 0.0)),
                  fieldH(vWaterXZ + vec2(0.0, CELL)) - fieldH(vWaterXZ - vec2(0.0, CELL))) / (2.0 * CELL) + swellD(pf);
// colar de espuma em volta das pernas de quem está na água, tremendo de leve
float collar = 0.0;
for (int i = 0; i < ${BODIES}; i++) {
  vec4 b = uBodies[i];
  if (b.z <= 0.0) continue;
  float d = length(vWaterXZ - b.xy);
  collar = max(collar, step(abs(d - 0.25 - 0.025 * sin(uTime * 5.0 + b.w)), 0.04));
}
// espuma da margem: distância até o lado (ou o canto) com terra, ondulando devagar e crescendo quando a onda chega
float e = 1.0;
e = min(e, mix(1.0, vLocal.y, vEdge.x));
e = min(e, mix(1.0, 1.0 - vLocal.x, vEdge.y));
e = min(e, mix(1.0, 1.0 - vLocal.y, vEdge.z));
e = min(e, mix(1.0, vLocal.x, vEdge.w));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, vLocal.y)), vCorner.x));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, 1.0 - vLocal.y)), vCorner.y));
e = min(e, mix(1.0, length(vec2(vLocal.x, 1.0 - vLocal.y)), vCorner.z));
e = min(e, mix(1.0, length(vLocal), vCorner.w));
e += 0.035 * sin(uTime * 1.6 + (vWaterXZ.x + vWaterXZ.y) * 7.0) - 2.0 * max(hw, 0.0);
// degraus em vez de degradê (estilo pintado; no pixel art o degradê vira chuvisco)
float foam = max(step(e, 0.08), 0.35 * step(e, 0.15));
// faixas de profundidade com a borda ondulando, como pinceladas: rasa (vê-se o leito), média, funda
float dq = vDepth + 0.05 * sin(pf.x * 5.0 + pf.y * 3.0) + 0.6 * hw;
float midB = step(0.42, dq), deepB = step(0.78, dq);
vec3 waterCol = mix(mix(uShallow, uMid, midB), uDeepColor, deepB);
float alpha = mix(mix(${ALPHA.shallow.toFixed(2)}, ${ALPHA.mid.toFixed(2)}, midB), ${ALPHA.deep.toFixed(2)}, deepB);
// brilho que corre: pontinhos claros; no rio, fios esticados no sentido da água
vec2 q = pf * 4.0;
float c = sin(q.x + uTime * 0.8) + sin(q.y * 1.3 - uTime * 0.6) + sin((q.x + q.y) * 0.7 + uTime * 1.1);
float glint = step(2.45, c) * (1.0 - 0.6 * deepB);
float fl = length(vFlow);
if (fl > 0.0) {
  vec2 fd = vFlow / fl, side = vec2(-fd.y, fd.x);
  float lane = fract(dot(pf, fd) * 0.9 + 0.35 * sin(dot(vWaterXZ, side) * 6.0));
  glint = max(glint, step(0.93, lane) * step(0.2, fract(dot(vWaterXZ, side) * 3.0 + 0.5 * sin(dot(pf, fd) * 2.0))));
}
// crista clara e cavado escuro: a onda da física se lê como tinta, sem depender só da luz
// (limiares baixos: a onda boa de ver tem 1 a 3 cm; com 2 cm de limiar ela só aparecia no primeiro instante)
float crest = 0.35 * step(0.007, hw) + 0.5 * step(0.022, hw);
float trough = step(hw, -0.007) + step(hw, -0.025);
waterCol *= 1.0 - 0.18 * trough;
waterCol = mix(waterCol, uFoam, 0.4 * glint);
float white = max(max(foam, collar), crest);
diffuseColor.rgb = mix(waterCol, uFoam, white);
diffuseColor.a = max(alpha + 0.15 * glint + 0.08 * trough, 0.92 * white);
`;
const FRAG_NORMAL = /* glsl */ `
// luz e brilho do sol seguem a inclinação da onda (campo + balanço)
// (×2,5: de cima e no pixel art a inclinação real de poucos cm quase não muda a luz)
normal = normalize((viewMatrix * vec4(normalize(vec3(-2.5 * slope.x, 1.0, -2.5 * slope.y)), 0.0)).xyz);
`;

interface Body { pos: THREE.Vector3; wet: boolean; rippled: number; phase: number }
interface Drop { p: THREE.Vector3; v: THREE.Vector3; floor: number }

// Campo de altura da água em grade fina (FIELD x FIELD por casa), puro e sem Three: só as células de água rodam. Célula vizinha
// de outra altura (margem, degrau da cachoeira) reflete a onda; a correnteza (fx, em células por passo) arrasta altura e
// velocidade a favor da água (upwind: a mistura que ele faz some no amortecimento).
export class WaveField {
  readonly h: Float32Array;
  private readonly v: Float32Array;
  private readonly tmp: Float32Array;
  private readonly cells: Int32Array;
  awake = false;
  constructor(readonly nx: number, readonly nz: number, private readonly lvl: Int32Array, private readonly fx: Float32Array) {
    this.h = new Float32Array(nx * nz);
    this.v = new Float32Array(nx * nz);
    this.tmp = new Float32Array(nx * nz);
    this.cells = Int32Array.from(lvl.keys()).filter((i) => lvl[i] >= 0);
  }

  // afunda um disco de raio r (células) em (cx, cz) (células) por `depth` m, mais no meio
  poke(cx: number, cz: number, depth: number, r = 2) {
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || z < 0 || x >= this.nx || z >= this.nz || this.lvl[z * this.nx + x] < 0) continue;
      const d2 = ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2) / (r * r);
      if (d2 < 1) this.h[z * this.nx + x] -= depth * (1 - d2);
    }
    this.awake = true;
  }

  step() {
    const { h, v, lvl, nx } = this;
    let energy = 0;
    for (const i of this.cells) {
      const l = lvl[i], x = i % nx, hi = h[i];
      let lap = 0;
      if (x > 0 && lvl[i - 1] === l) lap += h[i - 1] - hi;
      if (x < nx - 1 && lvl[i + 1] === l) lap += h[i + 1] - hi;
      if (i >= nx && lvl[i - nx] === l) lap += h[i - nx] - hi;
      if (i + nx < lvl.length && lvl[i + nx] === l) lap += h[i + nx] - hi;
      v[i] = (v[i] + C2 * lap) * DAMP;
    }
    // RELAX: o toque só afunda (não devolve a água em volta) e a margem fechada guarda o volume; sem isso a água ficava
    // mais baixa para sempre e o campo nunca dormia
    for (const i of this.cells) { h[i] = (h[i] + v[i]) * RELAX; energy = Math.max(energy, Math.abs(h[i]) + Math.abs(v[i])); }
    this.advect(h);
    this.advect(v);
    // abaixo de 0,2 mm ninguém vê: zera e dorme até o próximo toque
    if (energy < 2e-4) { h.fill(0); v.fill(0); this.awake = false; }
  }

  private advect(a: Float32Array) {
    const { fx, lvl, tmp } = this;
    tmp.set(a);
    for (const i of this.cells) {
      const f = fx[i];
      if (!f) continue;
      const up = i - Math.sign(f); // célula de onde a água vem (mesma linha: o rio corre em x)
      if (lvl[up] === lvl[i] && Math.floor(up / this.nx) === Math.floor(i / this.nx)) a[i] = tmp[i] + Math.abs(f) * (tmp[up] - tmp[i]);
    }
  }
}

export class Water {
  readonly surface: THREE.InstancedMesh; // casa de água no toque (userData.tiles, como os topos da cena): plano invisível na superfície
  private readonly drops: THREE.InstancedMesh;
  private readonly live: Drop[] = [];
  private readonly bodies = Array.from({ length: BODIES }, () => new THREE.Vector4());
  private readonly time = { value: 0 };
  private readonly field: WaveField;
  private readonly tex: THREE.DataTexture;
  private readonly seen = new WeakMap<THREE.Object3D, Body>();
  private last = 0;
  private acc = 0;
  private readonly m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, private readonly grid: Grid, private readonly levels: Map<string, WaterLevel>, step: number, river: River | null = null) {
    const W = grid.width, H = grid.height;
    const tiles = [...levels.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
    // terra = casa sem água; ponte rente à água (sem nível próprio) deixa a água passar e não leva espuma
    const land = (q: Pos) => inBounds(grid, q) && !levels.has(posKey(q)) && tileAt(grid, q).look !== 'bridge';
    // profundidade de cada casa para a cor: terra 0 (a cor clareia chegando na margem), rasa 0,3, funda 1; fora do mapa, a
    // casa da borda (o rio continua)
    const depthOf = (i: number, j: number) => {
      const lv = levels.get(`${THREE.MathUtils.clamp(i, 0, W - 1)},${THREE.MathUtils.clamp(j, 0, H - 1)}`);
      return lv ? (lv.deep ? 1 : 0.3) : 0;
    };
    // correnteza: só nas linhas do rio que cruza o mapa, da nascente (river.dir) para o outro lado
    const flowOf = (p: Pos, lv: WaterLevel) => (river?.rows.includes(p.y) ? -river.dir * (lv.deep ? FLOW.deep : FLOW.shallow) : 0);

    // campo da física: nível de cada célula (mm da superfície; -1 sem água) e correnteza em células por passo
    const nx = W * FIELD, nz = H * FIELD;
    const lvl = new Int32Array(nx * nz).fill(-1), fx = new Float32Array(nx * nz);
    for (const p of tiles) {
      const lv = levels.get(posKey(p))!;
      for (let b = 0; b < FIELD; b++) for (let a = 0; a < FIELD; a++) {
        const i = (p.y * FIELD + b) * nx + p.x * FIELD + a;
        lvl[i] = Math.round(lv.surface * 1000);
        fx[i] = (flowOf(p, lv) * FIELD) / HZ;
      }
    }
    this.field = new WaveField(nx, nz, lvl, fx);
    this.tex = new THREE.DataTexture(new Uint8Array(nx * nz).fill(128), nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; // a onda entre duas células sai interpolada, sem degrau
    this.tex.needsUpdate = true;

    // superfície: SUB x SUB quadrados por casa, normal para cima (ver o topo sobre o pixel art)
    const pos: number[] = [], nor: number[] = [], loc: number[] = [], edge: number[] = [], corner: number[] = [], dep: number[] = [], flow: number[] = [], idx: number[] = [];
    const sides: THREE.BufferGeometry[] = [];
    for (const p of tiles) {
      const lv = levels.get(posKey(p))!;
      const e = DIRS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
      const c = CORNERS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
      const f = flowOf(p, lv), base = pos.length / 3;
      for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
        const u = p.x + a / SUB, v = p.y + b / SUB; // em casas, 0 = canto do mapa
        // profundidade suave: média das 4 casas cujo meio cerca o vértice (bilinear)
        const fu = u - 0.5, fv = v - 0.5, i0 = Math.floor(fu), j0 = Math.floor(fv), tu = fu - i0, tv = fv - j0;
        const d = (depthOf(i0, j0) * (1 - tu) + depthOf(i0 + 1, j0) * tu) * (1 - tv) + (depthOf(i0, j0 + 1) * (1 - tu) + depthOf(i0 + 1, j0 + 1) * tu) * tv;
        pos.push(u - W / 2, lv.surface, v - H / 2);
        nor.push(0, 1, 0);
        loc.push(a / SUB, b / SUB);
        edge.push(...e);
        corner.push(...c);
        // a casa própria pesa: funda ao lado da margem continua funda no meio dela
        dep.push(Math.max(d, lv.deep ? 0.8 : 0.3) * (lv.deep ? 1 : Math.min(1, d / 0.3)));
        flow.push(f, 0);
      }
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const v0 = base + b * (SUB + 1) + a;
        idx.push(v0, v0 + SUB + 1, v0 + 1, v0 + 1, v0 + SUB + 1, v0 + SUB + 2);
      }
      this.sides(p, lv, step, sides);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 2));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 4));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 4));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    const water = new THREE.Mesh(g, this.material());
    water.receiveShadow = true;
    // desenhada antes das outras transparentes: marcas, caminho, cursor e o aro do time ficam sempre por cima da água
    water.renderOrder = -1;
    water.name = 'agua';
    scene.add(water);
    this.surface = pickTiles(tiles.map((p) => ({ p, at: new THREE.Vector3(p.x - W / 2 + 0.5, levels.get(posKey(p))!.surface, p.y - H / 2 + 0.5) })));
    scene.add(this.surface);
    if (sides.length) {
      const wall = new THREE.Mesh(mergeGeometries(sides), this.fallMaterial());
      for (const s of sides) s.dispose();
      wall.renderOrder = -1;
      wall.name = 'cachoeiras';
      scene.add(wall);
    }
    // gotas do respingo: cubinhos (pixels, como os pedacinhos de fx.ts) num InstancedMesh só, até 64 no ar
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: COLOR.drop, emissive: '#3d7fa6' }), 64);
    this.drops.count = 0;
    this.drops.frustumCulled = false; // as gotas andam: a esfera de corte calculada uma vez ficaria velha
    scene.add(this.drops);
  }

  // Lado da água à mostra (degrau para água mais baixa ou terra mais baixa, borda do mapa): da superfície até o leito ou o
  // que estiver na frente. Degrau dentro do mapa vira cachoeira em arco: a água sai da borda com velocidade e cai
  // (x ∝ √queda, como um jato); na borda do mapa é o corte reto do volume (desce também pela fatia do leito, um nível, onde
  // começa a lateral lisa da cena). 2 mm para fora para não brigar com a face do bloco
  private sides(p: Pos, lv: WaterLevel, step: number, out: THREE.BufferGeometry[]) {
    const x = p.x - this.grid.width / 2 + 0.5, z = p.y - this.grid.height / 2 + 0.5;
    for (const [dx, dy] of DIRS) {
      const q = { x: p.x + dx, y: p.y + dy };
      const inside = inBounds(this.grid, q), ql = this.levels.get(posKey(q));
      const front = !inside ? -Infinity : ql ? ql.surface : (tileAt(this.grid, q).h + 1) * step;
      const bottom = inside ? Math.max(front, lv.bed) : lv.bed - step;
      const drop = lv.surface - bottom;
      if (drop < 0.01) continue;
      const rows = inside ? 8 : 1;
      const pos: number[] = [], uv: number[] = [], fall: number[] = [], idx: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const s = r / rows; // 0 no topo, 1 no pé
        const out = 0.502 + (inside ? 0.22 * Math.sqrt(s) * Math.min(1, drop / step) : 0);
        for (const t of [-0.5, 0.5]) {
          // o lado corre ao longo da borda (perpendicular a dx, dy)
          pos.push(x + dx * out - dy * t, lv.surface - s * drop, z + dy * out + dx * t);
          uv.push(t + 0.5, 1 - s);
          fall.push(+inside);
        }
        if (r < rows) { const v = r * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      out.push(g);
    }
  }

  private uniforms() {
    return { uTime: this.time, uField: { value: this.tex }, uMap: { value: new THREE.Vector2(this.grid.width, this.grid.height) } };
  }

  // Phong (iluminado): a luz por fase (setDaylight) e a sombra dos bonecos valem na água sem código a mais
  private material() {
    // brilho do sol fraco e estreito: branco (o primeiro valor) deixava o rio inteiro branco com a câmera de frente para o sol
    const mat = new THREE.MeshPhongMaterial({ transparent: true, depthWrite: false, specular: '#2a3a44', shininess: 90 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms(), {
        uBodies: { value: this.bodies },
        uShallow: { value: new THREE.Color(COLOR.shallow) }, uMid: { value: new THREE.Color(COLOR.mid) }, uDeepColor: { value: new THREE.Color(COLOR.deep) }, uFoam: { value: new THREE.Color(COLOR.foam) },
      });
      shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
      shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAG_NORMAL}`);
    };
    mat.customProgramCacheKey = () => 'agua-volume';
    return mat;
  }

  // cachoeira: fios de espuma que escorrem e espuma no pé, onde bate; o corte da borda do mapa escurece para o fundo. O topo
  // sobe e desce com a superfície (mesmo campo), senão abria uma fresta quando a onda chegava na borda
  private fallMaterial() {
    const mat = new THREE.MeshLambertMaterial({ color: COLOR.side, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.defines = { USE_UV: '' };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms());
      sh.vertexShader = `${WAVE_GLSL}\nattribute float aFall;\nvarying float vFall;\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFall = aFall;
        vec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;
        transformed.y += step(0.999, uv.y) * (fieldH(wxz) + swellH(wxz));`);
      sh.fragmentShader = 'uniform float uTime;\nvarying float vFall;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        // fios verticais: cada um com fase e força próprias (sorteio pela coluna)
        float col = floor(vUv.x * 14.0), rnd = fract(sin(col * 12.9898) * 43758.5453);
        float streak = fract(vUv.y * 2.0 + uTime * (1.2 + 0.8 * rnd) + rnd);
        float fallFoam = step(0.72, streak) * (0.35 + 0.45 * rnd) + step(0.82, 1.0 - vUv.y) * 0.75 + step(0.94, vUv.y) * 0.5;
        // corte do volume: claro na linha da superfície, escurecendo para o fundo, em 3 faixas como a superfície
        vec3 cut = mix(vec3(0.09, 0.24, 0.45), diffuseColor.rgb, step(0.5, vUv.y)) * (1.0 + 0.6 * step(0.92, vUv.y));
        float foam = clamp(fallFoam, 0.0, 1.0) * vFall;
        diffuseColor.rgb = mix(mix(cut, diffuseColor.rgb * 1.15, vFall), vec3(0.92, 0.97, 1.0), foam);
        diffuseColor.a = max(mix(0.85, 0.7, vFall), foam);`);
    };
    mat.customProgramCacheKey = () => 'agua-cachoeira';
    return mat;
  }

  private spray(at: THREE.Vector3, floor: number, n: number, power: number) {
    for (let i = 0; i < n && this.live.length < this.drops.instanceMatrix.count; i++) {
      const a = Math.random() * Math.PI * 2, out = (0.4 + Math.random() * 0.8) * power;
      this.live.push({ p: at.clone().setY(floor), v: new THREE.Vector3(Math.cos(a) * out, (1.4 + Math.random() * 1.4) * power, Math.sin(a) * out), floor });
    }
  }

  private levelAt(p: THREE.Vector3) {
    return this.levels.get(`${Math.floor(p.x + this.grid.width / 2)},${Math.floor(p.z + this.grid.height / 2)}`);
  }

  // afunda a água em (x, z) do mundo por `depth` m, num disco de `r` casas
  private poke(x: number, z: number, depth: number, r = 0.28) {
    this.field.poke((x + this.grid.width / 2) * FIELD, (z + this.grid.height / 2) * FIELD, depth, r * FIELD);
  }

  // A cada quadro, no relógio da batalha (`t` em ms): quem cruzou a superfície descendo afunda a água e espirra pela
  // velocidade (o empurrão é mais rápido que o pulo, então mexe mais), quem anda deixa rastro, quem está parado respira e
  // leva o colar de espuma. Depois a física anda em passos fixos de 1/HZ s. Tudo sai da posição dos bonecos, sem gancho nos
  // eventos.
  update(t: number, units: Iterable<{ holder: THREE.Object3D }>) {
    const dt = Math.min(0.1, Math.max(0, t - this.last) / 1000);
    this.last = t;
    this.time.value = t / 1000;
    let n = 0;
    for (const { holder } of units) {
      const pos = holder.position;
      const lv = this.levelAt(pos);
      const wet = holder.visible && !!lv && pos.y < lv.surface - 0.01;
      const b = this.seen.get(holder);
      if (!b) {
        // parados defasados: dois bonecos na água não respiram juntos
        this.seen.set(holder, { pos: pos.clone(), wet, rippled: t - Math.random() * IDLE_MS, phase: Math.random() * 6 });
        continue;
      }
      // velocidade no chão (m/s do relógio da batalha): pulo de um degrau ~2,2, andar ~1,7, empurrão ~3,8. A vertical não
      // serve para separar: o pulo cruza a superfície a ~3 m/s no total, quase o mesmo que o empurrão
      const speed = dt ? Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) / dt : 0;
      // muito acima do empurrão é o sync ou o desfazer pondo o boneco no lugar num quadro: sem onda
      const snap = speed > 8 || Math.abs(pos.y - b.pos.y) / Math.max(dt, 0.001) > 8;
      const walking = speed > 0.3 && !snap;
      if (wet && !b.wet && !snap && (speed || pos.y !== b.pos.y)) {
        const k = THREE.MathUtils.clamp((speed - 1.5) / 2.3, 0, 1); // pulo ~0,3, empurrão 1
        this.poke(pos.x, pos.z, 0.07 + 0.07 * k, 0.3 + 0.1 * k);
        this.spray(pos, lv!.surface, 6 + Math.round(14 * k), 0.7 + 0.6 * k);
        b.rippled = t;
      } else if (!wet && b.wet && !snap) this.poke(b.pos.x, b.pos.z, -0.04); // saiu: a água volta para o buraco
      else if (wet && t - b.rippled >= (walking ? WAKE_MS : IDLE_MS)) {
        this.poke(pos.x, pos.z, walking ? 0.03 : 0.012, walking ? 0.25 : 0.22);
        b.rippled = t;
      }
      if (wet && n < BODIES) this.bodies[n++].set(pos.x, pos.z, 1, b.phase);
      b.pos.copy(pos);
      b.wet = wet;
    }
    for (let i = n; i < BODIES; i++) this.bodies[i].z = 0;
    this.simulate(dt);
    this.fall(dt);
  }

  private simulate(dt: number) {
    if (!this.field.awake) { this.acc = 0; return; }
    // no máximo 6 passos por quadro: quadro travado não vira avalanche de passos
    this.acc = Math.min(this.acc + dt * HZ, 6);
    for (; this.acc >= 1; this.acc--) this.field.step();
    const data = this.tex.image.data as Uint8Array, h = this.field.h;
    for (let i = 0; i < h.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(128 + (h[i] / AMP) * 127)));
    this.tex.needsUpdate = true;
  }

  private fall(dt: number) {
    if (!this.live.length && !this.drops.count) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor && d.v.y < 0) {
        this.live.splice(i, 1);
        this.poke(d.p.x, d.p.z, 0.004, 0.12); // a gota que volta faz o seu anelzinho
      }
    }
    this.live.forEach((d, i) => this.drops.setMatrixAt(i, this.m.makeTranslation(d.p.x, d.p.y, d.p.z)));
    this.drops.count = this.live.length;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
