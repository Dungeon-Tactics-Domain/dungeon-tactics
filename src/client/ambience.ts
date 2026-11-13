// Ambientação em volta do tabuleiro (13/11, pedido do Fernando: "cenários mais realistas… fog, iluminação, godrays,
// volumetric; na floresta, os arredores mais florestais"): chão que continua além da borda, mata, pedras e paredes em
// anéis, neblina, raios de luz, tochas e partículas. Só desenha, como a cena, e sem pós-processamento: a BattleScene
// cria (create), atualiza no relógio da batalha (frame), acompanha a luz da fase (setDaylight) e libera (dispose).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tileAt, type Grid } from '../shared/battle/grid.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';

type Kind = 'forest' | 'field' | 'crypt' | 'frost';
type Pair = [night: string, day: string];
interface Prop { model: string; n: number; d: [number, number]; h: [number, number] }
interface Mood {
  low: Pair; high: Pair; // neblina na parte de baixo e de cima da tela (a de cima é o "céu": o mais longe)
  near: number; far: number; // neblina pela distância da borda do tabuleiro: começa em near, fecha em far
  mist: number; ceiling: number; snow: number; // névoa baixa animada, escuro no alto (teto da cripta), neve no que olha para cima
  ground: string; rise: number; bump: number; // cor do chão, inclinação dos arredores e altura dos montes
  shade: number; // quanto da luz chega nos arredores (sombra das copas): mais escuros que o tabuleiro, que fica em destaque
  props: Prop[];
  beams: { n: number; color: Pair; power: [night: number, day: number]; tilt: number }; // tilt 1: na direção do sol; 0: a prumo
  motes: { n: number; color: Pair; size: number; fall: number; add: boolean; top: number };
  walls?: true; // cripta: paredes, colunas, tochas e cristais
  // luz da cena por cima da luz da fase: multiplica o céu e o sol e põe o sol em `at` (posição, como a da cena)
  light?: { sky: number; sun: number; at: [number, number, number] };
}

const F = 'floresta/', M = 'masmorra/';
export const MOODS: Record<Kind, Mood> = {
  // Bosque (13/11, pedido do Fernando: "mais escuro… luz baixa e direcional, raios entre as copas, floresta densa e mais
  // alta nas 4 laterais, fundo de mata fechada"): neblina verde-escura, céu fraco e sol baixo e de lado (sombras compridas)
  forest: {
    low: ['#03070a', '#0c1610'], high: ['#0b141a', '#2f4636'], near: 2, far: 24, mist: 0.6, ceiling: 0, snow: 0,
    ground: '#203a1c', rise: 0.22, bump: 0.7, shade: 0.6,
    props: [
      { model: F + 'Bush_2_A_Color1', n: 60, d: [0.5, 4], h: [0.5, 1] },
      { model: F + 'Rock_3_A_Color1', n: 14, d: [0.8, 7], h: [0.4, 1.1] },
      { model: F + 'Rock_1_A_Color1', n: 10, d: [0.6, 5], h: [0.3, 0.7] },
      { model: F + 'Tree_2_A_Color1', n: 40, d: [2, 8], h: [2.2, 3.5] },
      { model: F + 'Tree_1_A_Color1', n: 50, d: [3.5, 14], h: [3.5, 5] },
      { model: F + 'Tree_3_A_Color1', n: 30, d: [4, 14], h: [3.5, 4.8] },
      { model: F + 'Tree_2_C_Color1', n: 70, d: [7, 28], h: [6, 8] },
      { model: F + 'Tree_1_B_Color1', n: 60, d: [7, 28], h: [6, 8] },
      { model: F + 'Tree_4_B_Color1', n: 60, d: [8, 28], h: [6.5, 8] },
    ],
    beams: { n: 14, color: ['#8fb0ff', '#ffd79a'], power: [0.1, 0.42], tilt: 1 },
    motes: { n: 360, color: ['#c8ff7a', '#ffe7a3'], size: 0.07, fall: -0.00008, add: true, top: 6 },
    // céu 0,7 (antes 0,45): o Fernando achou o Bosque "meio escuro" (13/11); sol de lado continua, com sombra longa
    light: { sky: 0.7, sun: 0.95, at: [-10, 7, 5] },
  },
  field: {
    low: ['#0b0b18', '#7da36a'], high: ['#252648', '#b9d3c8'], near: 12, far: 48, mist: 0.06, ceiling: 0, snow: 0,
    ground: '#5f9a3e', rise: 0.12, bump: 1.2, shade: 0.9,
    props: [
      { model: F + 'Bush_2_A_Color1', n: 30, d: [0.5, 6], h: [0.4, 0.9] },
      { model: F + 'Rock_3_A_Color1', n: 16, d: [0.8, 12], h: [0.4, 1.2] },
      { model: F + 'Rock_1_A_Color1', n: 12, d: [0.6, 8], h: [0.3, 0.7] },
      { model: F + 'Tree_1_A_Color1', n: 16, d: [5, 22], h: [3, 4.5] },
      { model: F + 'Tree_3_A_Color1', n: 10, d: [6, 22], h: [3, 4] },
      { model: F + 'Tree_4_A_Color1', n: 12, d: [9, 30], h: [4, 6] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 160, color: ['#b8c8ff', '#fff3c4'], size: 0.05, fall: -0.00005, add: true, top: 5 },
  },
  crypt: {
    low: ['#04070b', '#071017'], high: ['#010203', '#020407'], near: 1.5, far: 12, mist: 0.75, ceiling: 1, snow: 0,
    ground: '#2a2c33', rise: 0, bump: 0.15, shade: 0.85,
    props: [
      { model: M + 'column', n: 10, d: [0.8, 4], h: [0.7, 1.4] },
      { model: M + 'pillar', n: 8, d: [3.5, 5], h: [2.6, 3.3] },
    ],
    beams: { n: 3, color: ['#8fc6ff', '#8fc6ff'], power: [0.07, 0.09], tilt: 0.25 },
    motes: { n: 220, color: ['#ffb070', '#ffb070'], size: 0.045, fall: -0.00012, add: true, top: 4 },
    walls: true,
  },
  frost: {
    low: ['#060a17', '#8d9db3'], high: ['#16234a', '#dde7f1'], near: 3, far: 26, mist: 0.5, ceiling: 0, snow: 1,
    ground: '#7b8593', rise: 0.45, bump: 1, shade: 0.95,
    props: [
      { model: F + 'Rock_3_A_Color1', n: 26, d: [0.6, 10], h: [0.5, 1.6] },
      { model: F + 'Rock_1_A_Color1', n: 14, d: [0.5, 6], h: [0.3, 0.8] },
      { model: F + 'Tree_Bare_1_A_Color1', n: 12, d: [1, 9], h: [1.5, 2.6] },
      { model: F + 'Tree_Bare_2_A_Color1', n: 12, d: [1.5, 10], h: [1.8, 3] },
      { model: F + 'Tree_4_A_Color1', n: 26, d: [5, 24], h: [3, 5] },
      { model: F + 'Tree_4_B_Color1', n: 26, d: [7, 26], h: [4, 6.5] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 900, color: ['#dfe8ff', '#ffffff'], size: 0.065, fall: 0.0011, add: false, top: 9 },
  },
};
// o mapa sai da grade: fase da campanha, sala do desenvolvedor e Até o amanhecer reaproveitam a Grid do mapa base, e
// os mapas base são os primeiros de SCENARIOS (o achado é o id do mapa, não o da fase)
const KIND: Record<string, Kind> = { ash_wood: 'forest', flooded_crypt: 'crypt', crypt_heart: 'crypt', frost_pass: 'frost' };
export const kindOf = (grid: Grid): Kind => KIND[Object.keys(SCENARIOS).find((id) => SCENARIOS[id].grid === grid) ?? ''] ?? 'field';
// cor do chão que continua cada casa da borda (o rio segue para fora do mapa, a neve da Colina também)
const EDGE: Record<string, string> = { water: '#1f4a6e', bridge: '#1f4a6e', snow: '#c9d2dc', snow_rock: '#c9d2dc', bare1: '#c9d2dc', bare2: '#c9d2dc', sand: '#9c8a5a', rock: '#6a6d76', gold: '#6a6d76', summit: '#4a4a52' };
const WALL = [M + 'wall', M + 'wall_arched', M + 'wall_broken'], TORCH = M + 'torch_mounted';
const SUN = new THREE.Vector3(6, -12, -4).normalize(); // o raio de luz vem de onde vem o sol da cena (sun.position -6, 12, 4)
// Nada dos arredores sobe acima desta linha: com a câmera a 32° (tan = 0,625), o que fica a d casas da borda com até
// 0,5 + 0,55·d de altura nunca tapa casa nem boneco, de nenhum ângulo do giro (a casa mais baixa tem o topo em 0,5).
// Tetos de 8 (modelos) e 5,5 (chão): mais alto que isso, longe, chega perto do plano da frente da câmera e pouco se veria
export const LIMIT = (d: number) => Math.min(0.5 + 0.55 * d, 8);
const GROUND_MAX = 5.5;
// versão de teste ?fade=preto (13/11, pedido do Fernando: "fade para preto ao redor do mapa"): a neblina dos arredores
// vira preto e fecha em 7 casas da borda; o tabuleiro não recebe essa neblina e fica igual
const FADE = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fade') : null) !== 'nao'; // padrão desde 13/11; ?fade=nao compara
const EXT_RING = 5; // casas de extensão cinza em cada lado na versão de teste (?extensao)
// Extensão do mapa: casas de fora na cor do piso da borda, bem escuras, com sombra das copas. Padrão em todos os mapas desde
// 13/11 (o Fernando gostou da versão de teste e escolheu "padrão em todos os mapas"); ?extensao=cinza mostra a 1ª versão
// de teste e ?extensao=nenhuma tira
// padrão desde 13/11 (o Fernando: "quero o fade para o preto e a textura"): extensão com a textura do piso (scene.ts)
export const EXTEND = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('extensao') : null) || 'textura';
const DARK_TONE: Record<string, string> = {
  grass: '#3f8a35', tree: '#3f8a35', tree2: '#3f8a35', tree3: '#3f8a35', tree4: '#3f8a35', sand: '#b39a5e', wood: '#8a6a44', brick: '#8a5a44',
  rock: '#7a7d86', gold: '#7a7d86', summit: '#5a5a62', stone: '#8a8c92', snow: '#dfe6ee', snow_rock: '#9aa3ad', bare1: '#dfe6ee', bare2: '#dfe6ee',
};
// altura (h) da casa mais baixa do tabuleiro a até `ring` casas de (i, j): a extensão nunca passa dela
export const extH = (g: Grid, i: number, j: number, ring: number) => {
  let h = Infinity;
  for (let b = j - ring; b <= j + ring; b++) for (let a = i - ring; a <= i + ring; a++) {
    if (a >= 0 && b >= 0 && a < g.width && b < g.height) h = Math.min(h, tileAt(g, { x: a, y: b }).h);
  }
  return h;
};
const DARK_FALLBACK = '#6b6f7a'; // pisos de cripta, altar e o resto: pedra

// sorteio com semente: o mesmo mapa monta sempre os mesmos arredores
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, x: number) => { const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// Neblina dos arredores, injetada nos materiais deles (o tabuleiro fica nítido: nada disto toca os materiais da cena).
// Pela distância da borda (não pela câmera, que gira e aproxima) e com a cor da tela de baixo para cima, para o longe
// sumir no mesmo degradê do fundo de qualquer ângulo.
const FOG_HEAD = `varying vec3 vAmbW; varying vec3 vAmbN; varying float vAmbY; varying float vAmbZ;
uniform vec3 ambLow; uniform vec3 ambHigh; uniform vec2 ambHalf; uniform float ambNear; uniform float ambFar;
uniform float ambMist; uniform float ambCeil; uniform float ambSnow;
`;
const FOG_VERT = `#include <project_vertex>
vec4 ambW = vec4(transformed, 1.0); vec3 ambN = objectNormal;
#ifdef USE_INSTANCING
ambW = instanceMatrix * ambW; ambN = mat3(instanceMatrix) * ambN;
#endif
vAmbW = (modelMatrix * ambW).xyz; vAmbN = normalize(mat3(modelMatrix) * ambN); vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; vAmbZ = -mvPosition.z;`;
const SNOW_FRAG = `#include <map_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), ambSnow * smoothstep(0.45, 0.8, vAmbN.y));`;
const FOG_FRAG = `float ambD = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
float ambF = smoothstep(ambNear, ambFar, ambD);
ambF = max(ambF, ambMist * 0.6 * (1.0 - smoothstep(-1.6, 0.4, vAmbW.y)) * smoothstep(0.5, 5.0, ambD)); // névoa baixa no chão
ambF = max(ambF, ambCeil * smoothstep(1.2, 4.5, vAmbW.y)); // cripta: o alto some no escuro, como se houvesse teto
// colado na câmera (a 30 do foco, near 0,1; só com o mapa todo à vista, na beirada de baixo): some na névoa em vez de
// mostrar o oco do modelo cortado pelo plano da frente (sobrava um anel claro no 20x20)
if (vAmbZ < 1.5) discard;
ambF = max(ambF, 1.0 - smoothstep(1.5, 5.0, vAmbZ));
gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)), ambF);
#include <tonemapping_fragment>`;

// O pixel art desenha a cena de novo com o material de normais (RenderPixelatedPass): luz, névoa e partículas viravam
// placas sólidas com contorno. Nesse passe elas não desenham (onBeforeRender roda antes do desenho de cada objeto).
const skipNormalPass = (o: THREE.Object3D) => {
  o.onBeforeRender = (_r, scene, _c, geo) => geo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
};

export class Ambience {
  readonly root = new THREE.Group();
  private scene: THREE.Scene | null = null;
  private sky: THREE.HemisphereLight | undefined;
  private sun: THREE.DirectionalLight | undefined;
  private k = 1; // luz da fase (setDaylight); sem chamada, a luz de sempre, que é a de dia
  private readonly u = {
    ambLow: { value: new THREE.Color() }, ambHigh: { value: new THREE.Color() }, ambHalf: { value: new THREE.Vector2() },
    ambNear: { value: 0 }, ambFar: { value: 0 }, ambMist: { value: 0 }, ambCeil: { value: 0 }, ambSnow: { value: 0 }, uTime: { value: 0 },
  };
  private readonly beams: { mesh: THREE.Mesh; top: THREE.Vector3; dir: THREE.Vector3; w: number; len: number }[] = [];
  private readonly glows: { mesh: THREE.Mesh; size: number; seed: number; light?: THREE.PointLight }[] = [];
  private readonly beamU = { uColor: { value: new THREE.Color() }, uPower: { value: 0 }, uTime: this.u.uTime };
  private readonly moteU = { uColor: { value: new THREE.Color() }, uTime: this.u.uTime, uScale: { value: 1 } };
  private readonly textures: THREE.Texture[] = [];
  private readonly hw: number;
  private readonly hh: number;

  constructor(private readonly grid: Grid, private readonly mood: Mood, models: Map<string, THREE.Object3D>) {
    this.hw = grid.width / 2;
    this.hh = grid.height / 2;
    const u = this.u;
    u.ambHalf.value.set(this.hw, this.hh);
    Object.assign(u, { ambNear: { value: FADE ? 0.5 : mood.near }, ambFar: { value: FADE ? 7 : mood.far }, ambMist: { value: mood.mist }, ambCeil: { value: mood.ceiling }, ambSnow: { value: mood.snow } });
    const rand = seeded(grid.width * 131 + grid.height * 7 + grid.tiles.length);
    this.buildGround();
    // na cripta não: as paredes, tochas e cristais ficam nessa faixa e sumiam dentro das colunas (revisão de 13/11)
    if (EXTEND !== 'nenhuma' && EXTEND !== 'textura' && !mood.walls) this.buildExtension(rand); // textura: a cena desenha (scene.ts)
    for (const p of mood.props) this.scatter(p, models.get(p.model)!, rand);
    if (mood.walls) this.buildCrypt(models, rand);
    this.buildMist();
    this.buildBeams(rand);
    this.buildMotes(rand);
  }

  // distância até a borda do tabuleiro (0 em cima dele), com o mapa centrado na origem como na cena
  private out(x: number, z: number) {
    return Math.hypot(Math.max(Math.abs(x) - this.hw, 0), Math.max(Math.abs(z) - this.hh, 0));
  }

  private edgeLook(x: number, z: number) {
    const c = (v: number, n: number) => THREE.MathUtils.clamp(Math.floor(v + n / 2), 0, n - 1);
    return tileAt(this.grid, { x: c(x, this.grid.width), y: c(z, this.grid.height) }).look ?? '';
  }

  // altura do chão: um degrau abaixo do tabuleiro na borda (o mapa vira um platô), subindo em volta como uma bacia
  private height(x: number, z: number) {
    const m = this.mood, d = this.out(x, z);
    let y = -0.7 - 0.3 * smooth(0, 3, d) + m.rise * Math.max(0, d - 1.5) + m.bump * smooth(2, 10, d) * (noise(x * 0.11, z * 0.11) * 2 - 1);
    if (EDGE[this.edgeLook(x, z)] === EDGE.water) y -= 0.35 * (1 - smooth(4, 14, d)); // o rio segue num leito fundo
    return Math.min(y, LIMIT(d) - 0.3, GROUND_MAX);
  }

  private material(src: THREE.Material | null, opts: THREE.MeshLambertMaterialParameters = {}) {
    const s = src as THREE.MeshStandardMaterial | null;
    // texturas KayKit são paletas: sem mipmap e no pixel mais perto, como na cena (prepare)
    if (s?.map) Object.assign(s.map, { generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, needsUpdate: true });
    if (s?.map) this.textures.push(s.map);
    // Lambert: mais barato que o Standard dos modelos, e de longe não se vê a diferença
    const mat = new THREE.MeshLambertMaterial({ map: s?.map ?? null, color: new THREE.Color(s?.color ?? 0xffffff).multiplyScalar(this.mood.shade), ...opts });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = FOG_HEAD + sh.vertexShader.replace('#include <project_vertex>', FOG_VERT);
      sh.fragmentShader = FOG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', SNOW_FRAG).replace('#include <tonemapping_fragment>', FOG_FRAG);
    };
    return mat;
  }

  private buildGround() {
    const size = Math.max(this.hw, this.hh) * 2 + 80; // cobre a tela inteira mesmo com o mapa todo à vista (F) num monitor largo
    const n = Math.ceil(size);
    const g = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(this.mood.ground), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = this.out(x, z);
      pos.setY(i, this.height(x, z));
      const edge = EDGE[this.edgeLook(x, z)];
      // perto da borda puxa a cor da casa vizinha; longe, a cor do lugar, com manchas e mais escura
      c.copy(base).lerp(new THREE.Color(edge ?? this.mood.ground), edge ? 1 - smooth(0.5, edge === EDGE.water ? 12 : 6, d) : 0);
      c.multiplyScalar((0.8 + 0.35 * noise(x * 0.35, z * 0.35)) * (1 - 0.3 * smooth(3, 18, d))).toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.root.add(new THREE.Mesh(g, this.material(null, { vertexColors: true, flatShading: true })));
  }

  // Extensão (13/11, pedido do Fernando: "tiles em preto e branco fora do limite… só para dar a vibe
  // de que o mapa continua"): EXT_RING casas de cinza em volta do tabuleiro, sem regra nem clique. Cada uma continua a
  // altura da casa da borda mais perto ou fica 1 nível abaixo, nunca acima: mais alta, na frente, tapava boneco.
  private buildExtension(rand: () => number) {
    const { width: W, height: H } = this.grid, step = this.grid.levelHeight ?? 0.5, BOTTOM = -3;
    const at: THREE.Matrix4[] = [], tones: THREE.Color[] = [];
    for (let j = -EXT_RING; j < H + EXT_RING; j++) for (let i = -EXT_RING; i < W + EXT_RING; i++) {
      if (i >= 0 && j >= 0 && i < W && j < H) continue;
      const t = tileAt(this.grid, { x: THREE.MathUtils.clamp(i, 0, W - 1), y: THREE.MathUtils.clamp(j, 0, H - 1) });
      if (t.look === 'water' || t.look === 'bridge') continue; // o rio segue no chão dos arredores
      const ring = Math.max(-i, -j, i - W + 1, j - H + 1);
      // altura = a menor casa do tabuleiro a até `ring` casas (revisão de 13/11): a câmera olha na diagonal, e copiar só a casa
      // em linha reta deixava uma coluna alta na frente de um boneco numa casa baixa ao lado (tapava meio boneco na Colina)
      const top = (extH(this.grid, i, j, ring) + 1 - (rand() < 0.15 + 0.12 * ring ? 1 : 0)) * step;
      if (top <= BOTTOM + 0.1) continue;
      const x = i - this.hw + 0.5, z = j - this.hh + 0.5;
      at.push(new THREE.Matrix4().makeScale(0.96, top - BOTTOM, 0.96).setPosition(x, (top + BOTTOM) / 2, z));
      const shade = (0.62 + 0.12 * rand()) * (1 - 0.07 * ring); // escurece para fora
      // no escuro, sombra das copas por cima (pedido do Fernando, "com uma sombra por cima deles"): manchas pelo ruído
      const dapple = 0.45 + 0.55 * noise(x * 0.3, z * 0.3);
      tones.push(EXTEND !== 'cinza' ? new THREE.Color(DARK_TONE[t.look ?? ''] ?? DARK_FALLBACK).multiplyScalar(shade * 0.5 * dapple) : new THREE.Color().setScalar(shade));
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material(null), at.length);
    at.forEach((m, k) => { mesh.setMatrixAt(k, m); mesh.setColorAt(k, tones[k]); });
    mesh.receiveShadow = true; // a sombra de verdade das árvores de fora cai em cima
    mesh.name = 'extensao'; // o teste da linha de visão mede a extensão pela casa da borda, não por LIMIT
    this.root.add(mesh);
  }

  // Um InstancedMesh por modelo (cada um é uma malha só no KayKit), com a base no chão e o meio em x e z na origem
  private instances(src: THREE.Object3D, at: THREE.Matrix4[]) {
    if (!at.length) return;
    src.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    src.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const m = mesh as unknown as THREE.Mesh;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    const inst = new THREE.InstancedMesh(g, this.material(m.material as THREE.Material), at.length);
    at.forEach((m, i) => inst.setMatrixAt(i, m));
    this.root.add(inst);
  }

  // Espalha um modelo no anel [d0, d1] da borda, com o tamanho cortado para não passar de LIMIT
  private scatter(p: Prop, src: THREE.Object3D, rand: () => number) {
    const size = new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3());
    // a copa avança para o lado do tabuleiro (meia diagonal, qualquer giro): o topo tem de caber em LIMIT no ponto mais perto
    const lean = Math.hypot(size.x, size.z) / 2 / size.y;
    const at: THREE.Matrix4[] = [];
    const span = (a: number, b: number) => a + (b - a) * rand();
    // nada além de 85% da neblina cheia: some de todo e, no pixel art, só sobrava o contorno escuro no meio da névoa
    const reach = Math.min(p.d[1], this.mood.far * 0.85);
    for (let tries = 0; at.length < p.n && tries < p.n * 30; tries++) {
      const x = span(-this.hw - reach, this.hw + reach), z = span(-this.hh - reach, this.hh + reach), d = this.out(x, z);
      if (d < p.d[0] || d > reach) continue;
      const y = this.height(x, z);
      // y + h <= 0,5 + 0,55·(d - lean·h), e o teto de 8
      const h = Math.min(span(p.h[0], p.h[1]), (0.5 + 0.55 * d - y) / (1 + 0.55 * lean), 8 - y);
      if (h < p.h[0] * 0.6) continue; // não cabe ali sem tapar o tabuleiro
      const k = h / size.y;
      // afunda um pouco: no chão inclinado a base não fica no ar
      at.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.06 * h, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2), new THREE.Vector3(k, k, k)));
    }
    this.instances(src, at);
  }

  // Cripta: paredes num retângulo em volta (de frente para o tabuleiro), tochas nelas, tochas acesas perto da borda
  // (com luz de verdade) e cristais azuis no chão
  private buildCrypt(models: Map<string, THREE.Object3D>, rand: () => number) {
    const gap = 5.5, H = 3.4; // parede a 5,5 casas da borda, 3,4 de altura: abaixo de LIMIT(5,5) com o chão em -1
    const walls = WALL.map(() => [] as THREE.Matrix4[]), torches: THREE.Matrix4[] = [];
    const k = H / 4; // a parede KayKit tem 4 x 4
    const up = new THREE.Vector3(0, 1, 0);
    const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
    sides.forEach(([sx, sz], side) => {
      const along = sx ? this.hh + gap : this.hw + gap; // meia largura do lado
      const n = Math.ceil((along * 2) / (4 * k));
      const rot = new THREE.Quaternion().setFromAxisAngle(up, -side * (Math.PI / 2));
      for (let i = 0; i < n; i++) {
        const t = -along + (i + 0.5) * ((along * 2) / n);
        const x = sx ? sx * (this.hw + gap) : t, z = sz ? sz * (this.hh + gap) : t;
        const y = this.height(x * 0.97, z * 0.97);
        walls[Math.floor(rand() * walls.length)].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rot, new THREE.Vector3(((along * 2) / n) / 4, k, k)));
        if (i % 2 === 1) {
          // tocha na face de dentro da parede, a meia altura
          const p = new THREE.Vector3(x - sx * 0.55, y + H * 0.55, z - sz * 0.55);
          torches.push(new THREE.Matrix4().compose(p, rot, new THREE.Vector3(1.1, 1.1, 1.1)));
          this.glow(p.clone().setY(p.y + 0.55), '#ffa040', 1.4, rand());
        }
      }
    });
    WALL.forEach((name, i) => this.instances(models.get(name)!, walls[i]));
    this.instances(models.get(TORCH)!, torches);
    // tochas de pé nos quatro cantos, perto da borda: a luz quente delas chega no tabuleiro (só 4 luzes: cada uma custa em todo pixel)
    const posts: THREE.BufferGeometry[] = [], crystals: THREE.BufferGeometry[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = new THREE.Vector3(sx * (this.hw + 1.2), 0, sz * (this.hh + 1.2));
      p.y = this.height(p.x, p.z) + 1.6;
      const light = new THREE.PointLight('#ff9a3c', 7, 9, 1.6);
      light.position.copy(p);
      this.root.add(light);
      this.glow(p, '#ffa040', 1.8, rand(), light);
      posts.push(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6).translate(p.x, p.y - 0.8, p.z));
    }
    // cristais: octaedros esticados que brilham sozinhos (MeshBasic, sem luz), em grupos de 3. Postes e cristais num
    // desenho só cada (eram 16 chamadas de desenho, o dobro com o pixel art)
    for (let i = 0; i < 4; i++) {
      // um lado do retângulo e um ponto ao longo dele: fica sempre a d casas da borda (nunca em cima do tabuleiro)
      const d = 1.5 + rand() * 3, along = rand() * 2 - 1, sign = rand() < 0.5 ? -1 : 1;
      const [x, z] = i % 2 ? [along * (this.hw + d), sign * (this.hh + d)] : [sign * (this.hw + d), along * (this.hh + d)];
      const y = this.height(x, z);
      for (let j = 0; j < 3; j++) {
        const at = new THREE.Vector3(x + (rand() - 0.5) * 0.6, y + 0.3, z + (rand() - 0.5) * 0.6);
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6));
        crystals.push(new THREE.OctahedronGeometry(0.18 + rand() * 0.12).scale(1, 2.2, 1).applyMatrix4(new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1))));
      }
      this.glow(new THREE.Vector3(x, y + 0.5, z), '#4fd8ff', 1.4, rand());
    }
    this.root.add(new THREE.Mesh(mergeGeometries(posts), this.material(null, { color: '#3a2a20' })), new THREE.Mesh(mergeGeometries(crystals), new THREE.MeshBasicMaterial({ color: '#7ff3ff' })));
    for (const g of [...posts, ...crystals]) g.dispose();
  }

  private glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private glowTex: THREE.Texture | null = null;
  // brilho de chama ou cristal: plano de frente para a câmera, aditivo, que tremula no frame
  private glow(p: THREE.Vector3, color: string, size: number, seed: number, light?: THREE.PointLight) {
    this.glowTex ??= this.glowTexture();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.copy(p);
    skipNormalPass(mesh);
    this.root.add(mesh);
    this.glows.push({ mesh, size, seed: seed * 100, light });
  }

  // Névoa baixa: um plano largo um pouco acima do chão, com ruído que anda devagar; some em cima do tabuleiro
  private buildMist() {
    if (!this.mood.mist) return;
    const size = Math.max(this.hw, this.hh) * 2 + 60;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vAmbW; varying float vAmbY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vAmbW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; }',
      fragmentShader: `${FOG_HEAD} uniform float uTime;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float d = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
          float k = n(vAmbW.xz * 0.16 + vec2(uTime * 0.00004, uTime * 0.000025)) * 0.6 + n(vAmbW.xz * 0.42 - vec2(uTime * 0.00007, 0.0)) * 0.4;
          float a = ambMist * smoothstep(0.3, 3.0, d) * smoothstep(0.3, 0.85, k);
          gl_FragColor = vec4(mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)) * 1.15, a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    mesh.position.y = -0.35;
    mesh.renderOrder = 1; // depois do chão e dos modelos, que são opacos
    skipNormalPass(mesh);
    this.root.add(mesh);
  }

  // Raios de luz (god rays): faixas compridas na direção do sol, aditivas, sempre de lado para a câmera (giram em volta
  // do próprio eixo no frame); uns caem em cima do tabuleiro, fracos o bastante para não esconder as casas
  private buildBeams(rand: () => number) {
    const b = this.mood.beams;
    if (!b.n) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec2 vBeam; attribute vec2 beam; void main() { vUv = uv; vBeam = beam; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uTime; varying vec2 vUv; varying vec2 vBeam;
        void main() {
          float across = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 1.6);
          float along = (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.12, vUv.y);
          float dust = 0.7 + 0.3 * sin(vUv.y * 22.0 + uTime * 0.0011 + vBeam.x) * sin(vUv.x * 9.0 - uTime * 0.0006);
          float breathe = 0.55 + 0.45 * sin(uTime * 0.0004 + vBeam.x);
          gl_FragColor = vec4(uColor * uPower * vBeam.y * across * along * dust * breathe, 1.0);
        }`,
    });
    const sun = this.mood.light ? new THREE.Vector3(...this.mood.light.at).negate().normalize() : SUN;
    const dir = sun.clone().lerp(new THREE.Vector3(0, -1, 0), 1 - b.tilt).normalize();
    for (let i = 0; i < b.n; i++) {
      // um terço cai no tabuleiro, com 35% da força (a casa e o boneco embaixo continuam legíveis); o resto na mata em volta
      const onBoard = i % 3 === 0;
      const g = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
      g.setAttribute('beam', new THREE.Float32BufferAttribute(new Array(4).fill([rand() * 100, onBoard ? 0.35 : 1]).flat(), 2));
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      skipNormalPass(mesh);
      const r = onBoard ? 0 : 1 + rand() * 7;
      const a = rand() * Math.PI * 2;
      const x = onBoard ? (rand() - 0.5) * this.hw * 1.6 : Math.cos(a) * (this.hw + r), z = onBoard ? (rand() - 0.5) * this.hh * 1.6 : Math.sin(a) * (this.hh + r);
      const foot = new THREE.Vector3(x, onBoard ? 0.5 : this.height(x, z), z);
      const len = 13 + rand() * 4;
      this.beams.push({ mesh, top: foot.clone().addScaledVector(dir, -len), dir, w: (onBoard ? 0.7 : 1) * (0.8 + rand() * 1.6), len });
      this.root.add(mesh);
    }
  }

  // Partículas no ar (pólen, vaga-lumes, flocos, cinzas): pontos numa caixa em volta do tabuleiro, movidos só no shader
  private buildMotes(rand: () => number) {
    const m = this.mood.motes;
    const box = [this.hw + 5, m.top / 2, this.hh + 5];
    const seed = new Float32Array(m.n * 4).map(() => rand());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(m.n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); // a posição sai do shader: nunca cortar pelo volume
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.moteU, uBox: { value: new THREE.Vector3(...box) }, uSize: { value: m.size }, uFall: { value: m.fall }, uAlpha: { value: m.add ? 0.9 : 0.85 } },
      transparent: true, depthWrite: false, blending: m.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed; uniform vec3 uBox; uniform float uTime; uniform float uSize; uniform float uScale; uniform float uFall; varying float vA;
        void main() {
          vec3 p = (seed.xyz * 2.0 - 1.0) * uBox;
          p.y = mod(seed.y * uBox.y * 2.0 - uTime * uFall * (0.6 + seed.w), uBox.y * 2.0) - 0.5;
          p.x += sin(uTime * 0.0006 + seed.w * 40.0) * 0.5;
          p.z += cos(uTime * 0.00045 + seed.w * 23.0) * 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max(1.0, uSize * uScale * (0.6 + seed.w * 0.8));
          vA = 0.55 + 0.45 * sin(uTime * 0.0025 + seed.w * 60.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(uColor, uAlpha * vA * (1.0 - r * 1.6)); }`,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    // tamanho em casas, não em pixels: o mesmo com e sem pixel art (o pixel art desenha numa tela menor)
    points.onBeforeRender = (r, scene, cam, geo) => {
      geo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
      const o = cam as THREE.OrthographicCamera;
      this.moteU.uScale.value = (r.getRenderTarget()?.height ?? r.domElement.height) / (o.top - o.bottom);
    };
    points.renderOrder = 2;
    this.root.add(points);
  }

  mount(scene: THREE.Scene): this {
    this.scene = scene;
    // as duas luzes da cena (céu e sol): o clima do mapa escurece e vira o sol por cima da luz da fase
    this.sky = scene.children.find((o): o is THREE.HemisphereLight => (o as THREE.HemisphereLight).isHemisphereLight);
    this.sun = scene.children.find((o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight);
    scene.add(this.root);
    this.setDaylight(this.k);
    return this;
  }

  // a mesma luz da fase que a cena usa (0 noite, 1 sol): neblina, céu, raios e partículas acompanham
  setDaylight(k: number) {
    this.k = k;
    const m = this.mood;
    // k²: a mistura é na luz linear, e com k (0,3 na Colina sob o Véu) os arredores ainda pareciam de dia
    const mix = ([night, day]: Pair, out: THREE.Color) => out.set(night).lerp(new THREE.Color(day), k * k);
    mix(m.low, this.u.ambLow.value);
    mix(m.high, this.u.ambHigh.value);
    if (FADE) { this.u.ambLow.value.set(0); this.u.ambHigh.value.set(0); } // ?fade=preto: os arredores somem no preto
    mix(m.beams.color, this.beamU.uColor.value);
    mix(m.motes.color, this.moteU.uColor.value);
    this.beamU.uPower.value = THREE.MathUtils.lerp(m.beams.power[0], m.beams.power[1], k * k);
    // o fundo só aparece se o chão não cobrir a tela: a cor do alto do degradê
    if (this.scene?.background instanceof THREE.Color) this.scene.background.copy(this.u.ambHigh.value);
    // a cena acabou de pôr a luz da fase (a BattleScene chama isto por último; sem fase, vale a do construtor, e o mount
    // chama uma vez): multiplicar aqui não acumula. Some à noite (k → 0): a noite da cena já é escura, e por cima dela os
    // bonecos do Até o amanhecer viravam sombras
    if (m.light && this.sky && this.sun) {
      this.sky.intensity *= THREE.MathUtils.lerp(1, m.light.sky, k);
      this.sun.intensity *= THREE.MathUtils.lerp(1, m.light.sun, k);
      this.sun.position.set(...m.light.at);
    }
  }

  private readonly fwd = new THREE.Vector3();
  update(ms: number, camera: THREE.Camera) {
    this.u.uTime.value = ms;
    camera.getWorldDirection(this.fwd);
    const side = new THREE.Vector3(), face = new THREE.Vector3(), up = new THREE.Vector3();
    for (const b of this.beams) {
      // a faixa fica no eixo do raio e de lado para a câmera: de qualquer giro parece um volume de luz
      side.crossVectors(b.dir, this.fwd).normalize();
      up.copy(b.dir).negate();
      face.crossVectors(side, up);
      b.mesh.matrix.makeBasis(side, up, face).scale(new THREE.Vector3(b.w, b.len, 1)).setPosition(b.top);
    }
    for (const g of this.glows) {
      g.mesh.quaternion.copy(camera.quaternion);
      // tremor de chama: duas ondas fora de fase, sem sorteio (o relógio da batalha acelera junto)
      const f = 0.85 + 0.1 * Math.sin(ms * 0.013 + g.seed) + 0.05 * Math.sin(ms * 0.031 + g.seed * 2);
      g.mesh.scale.setScalar(g.size * f);
      if (g.light) g.light.intensity = 7 * f;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
    for (const t of this.textures) t.dispose();
    this.root.removeFromParent();
  }
}

// baixa os modelos dos arredores deste mapa (em paralelo com os da cena) e monta tudo
export async function loadAmbience(grid: Grid): Promise<Ambience> {
  const mood = MOODS[kindOf(grid)];
  const names = [...new Set([...mood.props.map((p) => p.model), ...(mood.walls ? [...WALL, TORCH] : [])])];
  const loader = new GLTFLoader();
  const models = new Map(await Promise.all(names.map(async (n) => [n, (await loader.loadAsync(`/models/${n}.gltf`)).scene] as const)));
  return new Ambience(grid, mood, models);
}
