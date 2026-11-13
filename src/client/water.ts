// Água viva (13/11, pedido do Fernando: "água mais bonita… transparente… com water physics"). A casa de água é o leito
// (bloco de cascalho da cena, onde o boneco pisa) mais a superfície desenhada aqui: rasa clara e transparente (vê-se o leito
// e as pernas de quem está dentro), funda escura e quase opaca, espuma onde encosta na terra e brilho que corre. A
// superfície reage a quem entra, anda, pula ou é empurrado (anéis que se abrem do ponto e respingo) e ondula em volta de
// quem está dentro. Só desenha: lê a posição dos bonecos da cena, nunca as regras.
// Leve: um InstancedMesh para a superfície, ondas somadas no shader (um punhado de anéis num uniform), nada refeito por
// quadro. A superfície fica plana de propósito: o pixel art redesenha a cena com MeshNormalMaterial, onde um deslocamento
// de vértice sumiria; o movimento é só de cor e de normal no fragmento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inBounds, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import type { WaterLevel } from './water-levels.ts';

const RIPPLES = 24; // anéis vivos ao mesmo tempo (o mais velho dá lugar ao novo)
const BODIES = 8; // bonecos na água com colar de espuma
const LIFE = 1.5; // s de vida de um anel
const SPEED = 1.5; // casas por segundo da frente da onda
const WAVE = 0.3; // comprimento de onda, em casas: longo para ler no pixel de 3 px (1 casa ≈ 30 px do pixel art)
const TRAIL = 0.6; // largura do trem de ondas atrás da frente (2 cristas)
const IDLE_MS = 1100; // parado na água: um anel fraco a cada tanto
const WAKE_MS = 170; // andando na água: rastro
// cores (sRGB; viram lineares no uniform): rasa turquesa clara, funda azul-marinho, espuma quase branca
const COLOR = { shallow: '#1584b8', deep: '#153c74', foam: '#eaf8ff', side: '#2f78ad', drop: '#e8f8ff' };
const ALPHA = { shallow: 0.66, deep: 0.93 };

const DIRS: [dx: number, dy: number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // norte (-z), leste (+x), sul (+z), oeste (-x)
const CORNERS: [dx: number, dy: number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]]; // NE, SE, SO, NO

const VERT_HEAD = /* glsl */ `
attribute vec4 aEdge;
attribute vec4 aCorner;
attribute float aDeep;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDeep;
`;
const VERT_BODY = /* glsl */ `
vec4 wWater = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wWater = instanceMatrix * wWater;
#endif
vWaterXZ = (modelMatrix * wWater).xz;
vLocal = position.xz + 0.5;
vEdge = aEdge;
vCorner = aCorner;
vDeep = aDeep;
`;
const FRAG_HEAD = /* glsl */ `
uniform float uTime;
uniform vec4 uRipples[${RIPPLES}];
uniform vec4 uBodies[${BODIES}];
uniform vec3 uShallow;
uniform vec3 uDeepColor;
uniform vec3 uFoam;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDeep;
// altura (x) e inclinação (yz) das ondas no ponto: soma dos anéis que se abrem de cada ponto tocado (x, z, nascimento, força)
vec3 waterWave(vec2 p) {
  vec3 w = vec3(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > ${LIFE.toFixed(2)}) continue;
    vec2 d = p - r.xy;
    float dist = length(d);
    float x = age * ${SPEED.toFixed(2)} - dist; // atrás da frente
    if (x < 0.0 || x > ${TRAIL.toFixed(2)}) continue;
    float env = r.w * (1.0 - age / ${LIFE.toFixed(2)}) * sin(3.14159 * x / ${TRAIL.toFixed(2)});
    float k = 6.28318 / ${WAVE.toFixed(2)};
    w.x += env * cos(x * k);
    w.yz += env * sin(x * k) * k * d / max(dist, 0.001);
  }
  return w;
}
`;
const FRAG_COLOR = /* glsl */ `
vec3 wv = waterWave(vWaterXZ);
// colar de espuma em volta das pernas de quem está na água, tremendo de leve
float collar = 0.0;
for (int i = 0; i < ${BODIES}; i++) {
  vec4 b = uBodies[i];
  if (b.z <= 0.0) continue;
  float d = length(vWaterXZ - b.xy);
  collar = max(collar, step(abs(d - 0.25 - 0.025 * sin(uTime * 5.0 + b.w)), 0.04));
}
// espuma da margem: distância até o lado (ou o canto) com terra, ondulando devagar
float e = 1.0;
e = min(e, mix(1.0, vLocal.y, vEdge.x));
e = min(e, mix(1.0, 1.0 - vLocal.x, vEdge.y));
e = min(e, mix(1.0, 1.0 - vLocal.y, vEdge.z));
e = min(e, mix(1.0, vLocal.x, vEdge.w));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, vLocal.y)), vCorner.x));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, 1.0 - vLocal.y)), vCorner.y));
e = min(e, mix(1.0, length(vec2(vLocal.x, 1.0 - vLocal.y)), vCorner.z));
e = min(e, mix(1.0, length(vLocal), vCorner.w));
e += 0.035 * sin(uTime * 1.6 + (vWaterXZ.x + vWaterXZ.y) * 7.0);
// degraus em vez de degradê: no pixel art o degradê vira chuvisco
float foam = max(step(e, 0.08), 0.35 * step(e, 0.15));
// brilho que corre: pontinhos claros que andam devagar
vec2 q = vWaterXZ * 4.0;
float c = sin(q.x + uTime * 0.8) + sin(q.y * 1.3 - uTime * 0.6) + sin((q.x + q.y) * 0.7 + uTime * 1.1);
float glint = step(2.45, c) * (1.0 - 0.6 * vDeep);
float crest = 0.5 * step(0.2, wv.x) + 0.5 * step(0.55, wv.x);
float trough = step(wv.x, -0.2);
vec3 waterCol = mix(uShallow, uDeepColor, vDeep) * (1.0 - 0.2 * trough);
waterCol = mix(waterCol, uFoam, 0.35 * glint);
float white = max(max(foam, collar), 0.8 * crest);
diffuseColor.rgb = mix(waterCol, uFoam, white);
diffuseColor.a = max(mix(${ALPHA.shallow.toFixed(2)}, ${ALPHA.deep.toFixed(2)}, vDeep) + 0.15 * glint, 0.92 * white);
`;
const FRAG_NORMAL = /* glsl */ `
// a luz e o brilho do sol seguem as ondas: normal inclinada pela onda e por um balanço leve e constante
vec2 swell = 0.07 * vec2(sin(vWaterXZ.x * 2.3 + uTime * 1.3), cos(vWaterXZ.y * 1.9 - uTime * 1.1));
vec3 nWater = normalize(vec3(-wv.y * 0.03 + swell.x, 1.0, -wv.z * 0.03 + swell.y));
normal = normalize((viewMatrix * vec4(nWater, 0.0)).xyz);
`;

interface Body { pos: THREE.Vector3; wet: boolean; rippled: number; phase: number }
interface Drop { p: THREE.Vector3; v: THREE.Vector3; floor: number }

export class Water {
  readonly surface: THREE.InstancedMesh; // vale como casa no toque (userData.tiles), como os topos da cena
  private readonly drops: THREE.InstancedMesh;
  private readonly live: Drop[] = [];
  private readonly ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4());
  private readonly bodies = Array.from({ length: BODIES }, () => new THREE.Vector4());
  private nextRipple = 0;
  private readonly time = { value: 0 };
  private readonly seen = new WeakMap<THREE.Object3D, Body>();
  private last = 0;
  private readonly m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, private readonly grid: Grid, private readonly levels: Map<string, WaterLevel>, step: number) {
    const tiles = [...levels.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
    // terra = casa sem água; ponte rente à água (sem nível próprio) deixa a água passar e não leva espuma
    const land = (q: Pos) => inBounds(grid, q) && !levels.has(posKey(q)) && tileAt(grid, q).look !== 'bridge';
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const edge = new Float32Array(tiles.length * 4), corner = new Float32Array(tiles.length * 4), deep = new Float32Array(tiles.length);
    this.surface = new THREE.InstancedMesh(geo, this.material(), tiles.length);
    const sides: THREE.BufferGeometry[] = [];
    tiles.forEach((p, i) => {
      const lv = levels.get(posKey(p))!;
      const x = p.x - grid.width / 2 + 0.5, z = p.y - grid.height / 2 + 0.5;
      this.surface.setMatrixAt(i, this.m.makeTranslation(x, lv.surface, z));
      DIRS.forEach(([dx, dy], k) => (edge[i * 4 + k] = +land({ x: p.x + dx, y: p.y + dy })));
      CORNERS.forEach(([dx, dy], k) => (corner[i * 4 + k] = +land({ x: p.x + dx, y: p.y + dy })));
      deep[i] = +lv.deep;
      // Lado da água à mostra (borda do mapa, rasa ao lado de funda, terra mais baixa): parede de água da superfície até o
      // leito ou o que estiver na frente, 2 mm para fora para não brigar com a face do bloco. Na borda do mapa desce também
      // pela fatia do leito (um nível, onde começa a lateral lisa da cena), senão ficava uma faixa de cascalho à mostra
      for (const [dx, dy] of DIRS) {
        const q = { x: p.x + dx, y: p.y + dy };
        const ql = levels.get(posKey(q));
        const front = !inBounds(grid, q) ? -Infinity : ql ? ql.surface : (tileAt(grid, q).h + 1) * step;
        const bottom = inBounds(grid, q) ? Math.max(front, lv.bed) : lv.bed - step;
        if (bottom > lv.surface - 0.01) continue;
        sides.push(new THREE.PlaneGeometry(1, lv.surface - bottom).rotateY(Math.atan2(dx, dy)).translate(x + dx * 0.502, (lv.surface + bottom) / 2, z + dy * 0.502));
      }
    });
    geo.setAttribute('aEdge', new THREE.InstancedBufferAttribute(edge, 4));
    geo.setAttribute('aCorner', new THREE.InstancedBufferAttribute(corner, 4));
    geo.setAttribute('aDeep', new THREE.InstancedBufferAttribute(deep, 1));
    this.surface.userData.tiles = tiles;
    this.surface.receiveShadow = true;
    // desenhada antes das outras transparentes: marcas, caminho, cursor e o aro do time ficam sempre por cima da água
    this.surface.renderOrder = -1;
    scene.add(this.surface);
    if (sides.length) {
      const wall = new THREE.Mesh(mergeGeometries(sides), new THREE.MeshLambertMaterial({ color: COLOR.side, transparent: true, opacity: 0.7, depthWrite: false }));
      for (const g of sides) g.dispose();
      wall.renderOrder = -1;
      scene.add(wall);
    }
    // gotas do respingo: cubinhos (pixels, como os pedacinhos de fx.ts) num InstancedMesh só, até 64 no ar
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: COLOR.drop, emissive: '#3d7fa6' }), 64);
    this.drops.count = 0;
    this.drops.frustumCulled = false; // as gotas andam: a esfera de corte calculada uma vez ficaria velha
    scene.add(this.drops);
  }

  // Phong (iluminado): a luz por fase (setDaylight) e a sombra dos bonecos valem na água sem código a mais
  private material() {
    // brilho do sol fraco e estreito: com a superfície plana e a luz direcional, ele cai igual na água toda, e branco (o
    // primeiro valor) deixava o rio inteiro branco quando a câmera girava de frente para o sol
    const mat = new THREE.MeshPhongMaterial({ transparent: true, depthWrite: false, specular: '#2a3a44', shininess: 90 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTime: this.time, uRipples: { value: this.ripples }, uBodies: { value: this.bodies },
        uShallow: { value: new THREE.Color(COLOR.shallow) }, uDeepColor: { value: new THREE.Color(COLOR.deep) }, uFoam: { value: new THREE.Color(COLOR.foam) },
      });
      shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
      shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAG_NORMAL}`);
    };
    mat.customProgramCacheKey = () => 'agua';
    return mat;
  }

  private ripple(x: number, z: number, strength: number) {
    this.ripples[this.nextRipple++ % RIPPLES].set(x, z, this.time.value, strength);
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

  // A cada quadro, no relógio da batalha (`t` em ms): quem cruzou a superfície descendo faz respingo pela velocidade (o
  // empurrão é mais rápido que o pulo, então espirra mais), quem anda na água deixa rastro, quem está parado solta um anel
  // fraco de tempo em tempo e leva o colar de espuma. Tudo sai da posição dos bonecos, sem gancho nos eventos.
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
        // anéis dos parados defasados: dois bonecos na água não pulsam juntos
        this.seen.set(holder, { pos: pos.clone(), wet, rippled: t - Math.random() * IDLE_MS, phase: Math.random() * 6 });
        continue;
      }
      // velocidade no chão (m/s do relógio da batalha): pulo de um degrau ~2,2, andar ~1,7, empurrão ~3,8. A vertical não
      // serve para separar: o pulo cruza a superfície a ~3 m/s no total, quase o mesmo que o empurrão
      const speed = dt ? Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) / dt : 0;
      // muito acima do empurrão é o sync ou o desfazer pondo o boneco no lugar num quadro: sem respingo
      const snap = speed > 8 || Math.abs(pos.y - b.pos.y) / Math.max(dt, 0.001) > 8;
      const walking = speed > 0.3 && !snap;
      if (wet && !b.wet && !snap && (speed || pos.y !== b.pos.y)) {
        const k = THREE.MathUtils.clamp((speed - 1.5) / 2.3, 0, 1); // pulo ~0,3, empurrão 1
        this.ripple(pos.x, pos.z, 1 + k);
        this.spray(pos, lv!.surface, 6 + Math.round(14 * k), 0.7 + 0.6 * k);
        b.rippled = t;
      } else if (!wet && b.wet && !snap) this.ripple(b.pos.x, b.pos.z, 0.8);
      else if (wet && t - b.rippled >= (walking ? WAKE_MS : IDLE_MS)) {
        this.ripple(pos.x, pos.z, walking ? 0.6 : 0.45);
        b.rippled = t;
      }
      if (wet && n < BODIES) this.bodies[n++].set(pos.x, pos.z, 1, b.phase);
      b.pos.copy(pos);
      b.wet = wet;
    }
    for (let i = n; i < BODIES; i++) this.bodies[i].z = 0;
    this.fall(dt);
  }

  private fall(dt: number) {
    if (!this.live.length && !this.drops.count) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor && d.v.y < 0) this.live.splice(i, 1);
    }
    this.live.forEach((d, i) => this.drops.setMatrixAt(i, this.m.makeTranslation(d.p.x, d.p.y, d.p.z)));
    this.drops.count = this.live.length;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
