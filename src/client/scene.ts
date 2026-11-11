// Cena Three.js da batalha: mapa em blocos, unidades, marcações de casa, números flutuantes e câmera ortográfica com
// RenderPixelatedPass (o pixel art SNES da spec). Só desenha: não conhece regras, recebe estado, destaques e eventos.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ABILITIES } from '../shared/battle/abilities.ts';
import { posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import type { Highlights, TileKind } from './interaction.ts';
import { MARKER, unitHeight } from './markers.ts';
import type { PixelSettings } from './pixel-settings.ts';

const STEP = 0.5; // altura de um nível em metros (1 casa = 1 de largura), o mesmo da POC aprovada
const PITCH = THREE.MathUtils.degToRad(32); // ângulo do FFT
const ZOOM = { min: 4, max: 16 };
const ZOOM_START = 1.5;
// celular em pé: no máximo ~9,5 casas de largura ao abrir. No 20x20 o mapa inteiro deixava a casa com ~20 px, pequena
// para o dedo (alvo de toque ≥ 44 px); a câmera segue o herói da vez e o botão de recentralizar mostra tudo
const PORTRAIT_START = 8.3;

// modelos KayKit que já estão em public/models; o Bruto usa o bárbaro (não há esqueleto grande)
const MODEL: Record<string, string> = {
  warrior: 'knight', archer: 'rogue', mage: 'mage', rogue: 'rogue_hooded',
  soldier: 'skeleton_warrior', skeleton_archer: 'skeleton_rogue', dark_mage: 'skeleton_mage', brute: 'barbarian',
};
// gesto de cada habilidade, entre os clipes que todo boneco KayKit carrega
const CAST_CLIP = (id: string) => (ABILITIES[id].heal[1] > 0 || ['firebolt', 'blast', 'gust'].includes(id) ? 'Spellcast_Shoot'
  : ABILITIES[id].range[1] > 1 ? 'Throw' : '2H_Melee_Attack_Spin');

// cores das marcações; o significado também vai em texto no HUD (nunca só a cor)
const MARK: Record<TileKind | 'path', [color: string, opacity: number]> = {
  actor: ['#ffd479', 0.75], move: ['#3d9bff', 0.55], range: ['#ff6a3c', 0.5], blocked: ['#6b3a8c', 0.6],
  threat: ['#ff2d55', 0.32], area: ['#ffb020', 0.6], target: ['#fff2a0', 0.85], path: ['#cfe8ff', 0.9],
};
const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // contorno da POC aprovada

// Paleta reduzida: cada canal em poucos degraus, depois da conversão para sRGB (degraus iguais ao olho). 6 níveis
// lembram os 15 bits do SNES sem virar pôster; a opção existe para o Fernando comparar.
const PALETTE_SHADER = {
  uniforms: { tDiffuse: { value: null }, levels: { value: 6 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(floor(c.rgb * levels + 0.5) / levels, c.a); }',
};

interface UnitView {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  current: THREE.AnimationAction | null;
  bar: THREE.Mesh; // parte cheia da barra de vida
  hp: number;
  def: string;
}

interface Anim {
  start: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// As texturas KayKit são paletas: com mipmap o render em baixa resolução mistura cores vizinhas (aprendido na POC)
function prepare(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const map = (mesh.material as THREE.MeshStandardMaterial).map;
    if (map && map.generateMipmaps) Object.assign(map, { generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, needsUpdate: true });
  });
  return o;
}

export class BattleScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly composer = new EffectComposer(this.renderer);
  private readonly renderPass: RenderPass; // sem pixel art
  private readonly pixelPass: RenderPixelatedPass;
  private readonly palettePass = new ShaderPass(PALETTE_SHADER);
  private pixel: PixelSettings;
  private readonly focus = new THREE.Vector3();
  private focusGoal: THREE.Vector3 | null = null; // para onde a câmera desliza (herói da vez, recentralizar)
  private readonly tileTops: THREE.Object3D[] = [];
  private readonly marks = new Map<string, THREE.Mesh>();
  private readonly pathDots = new Map<string, THREE.Mesh>();
  // cursor do teclado: moldura na altura da casa e seta flutuando em cima, para ler o nível mesmo atrás de um boneco
  private readonly cursor = new THREE.Group();
  private readonly units = new Map<string, UnitView>();
  private readonly anims: Anim[] = [];
  private readonly floats: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly onResize = () => this.resize();
  private viewH: number;
  private readonly fitView: number; // zoom em que o mapa inteiro cabe na largura
  private insets = { top: 0, bottom: 0 }; // px cobertos pelo HUD em cima e embaixo
  private yaw = Math.PI / 4;
  private yawTarget = Math.PI / 4;

  private constructor(private readonly host: HTMLElement, private readonly grid: Grid, private readonly models: Map<string, GLTF>, pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>, pixel: PixelSettings) {
    this.pixel = pixel;
    this.renderer.shadowMap.enabled = true;
    // o pixel art desenha a cena duas vezes por quadro (cor e normais); a sombra só precisa da primeira (pedida no frame)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'board';
    host.append(this.renderer.domElement);
    this.floats = el('div', { class: 'floats', 'aria-hidden': 'true' });
    host.append(this.floats);
    // fitView: a diagonal do mapa (ele aparece em losango) mais meia casa de cada lado cabe na largura do celular em pé.
    // Começa 1,5x mais perto: com o mapa todo a casa tinha ~45x24 px, pequena para o dedo (auditoria mobile de 25/10);
    // a câmera vai até o herói da vez, e o botão de recentralizar volta ao mapa inteiro
    this.fitView = ((grid.width + grid.height) / Math.SQRT2 + 1) / 1.15;
    this.viewH = innerWidth < innerHeight ? Math.min(this.fitView / ZOOM_START, PORTRAIT_START) : Math.min(this.fitView, ZOOM.max); // deitado (PC): mapa inteiro até o 8x8; no 20x20 abre mais perto e segue o herói
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.pixelPass = new RenderPixelatedPass(Math.max(2, pixel.size), this.scene, this.camera, EDGES);
    // a paleta vem depois da saída em sRGB; liga e desliga sem refazer a cadeia
    for (const pass of [this.renderPass, this.pixelPass, new OutputPass(), this.palettePass]) this.composer.addPass(pass);
    this.scene.background = new THREE.Color('#1b1626');
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-6, 12, 4);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    this.buildBoard(pieces);
    addEventListener('resize', this.onResize);
    this.setPixel(pixel);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  static async create(host: HTMLElement, grid: Grid, state: BattleState, pixel: PixelSettings): Promise<BattleScene> {
    const loader = new GLTFLoader();
    const defs = [...new Set(state.units.map((u) => MODEL[u.def]).filter(Boolean))];
    const [top, side, stone, tree, ...loaded] = await Promise.all([
      ...['dirt_with_grass', 'dirt', 'stone'].map((n) => loader.loadAsync(`/models/poc/quadrado/${n}.gltf`)),
      loader.loadAsync('/models/poc/hex/tree_single_A.gltf'), // a árvore do pack de blocos é um cubo de folhas
      ...defs.map((d) => loader.loadAsync(`/models/${d}.glb`)),
    ]);
    const models = new Map(defs.map((d, i) => [d, loaded[i]]));
    const s = new BattleScene(host, grid, models, { top: top.scene, side: side.scene, stone: stone.scene, tree: tree.scene }, pixel);
    s.sync(state);
    return s;
  }

  // casa (x, y) da batalha → mundo: x no eixo X, y no eixo Z, mapa centrado na origem
  private world(p: Pos): THREE.Vector3 {
    return new THREE.Vector3(p.x - this.grid.width / 2 + 0.5, (tileAt(this.grid, p).h + 1) * STEP, p.y - this.grid.height / 2 + 0.5);
  }

  private buildBoard(pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>) {
    // normaliza a peça para 1 casa de largura e STEP de altura, com o topo em y = 0
    const norm = (src: THREE.Object3D) => {
      const o = src.clone();
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      o.scale.set(1 / size.x, STEP / size.y, 1 / size.z);
      o.position.y = -box.max.y * (STEP / size.y);
      return prepare(new THREE.Group().add(o));
    };
    const top = norm(pieces.top), side = norm(pieces.side), stone = norm(pieces.stone);
    const treeBox = new THREE.Box3().setFromObject(pieces.tree);
    const treeScale = 1.1 / (treeBox.max.y - treeBox.min.y);
    const tree = prepare(pieces.tree.clone());
    tree.scale.setScalar(treeScale);
    tree.position.y = -treeBox.min.y * treeScale;
    const list = () => ({ at: [] as THREE.Vector3[], tiles: [] as Pos[] });
    const batch = { top: list(), stoneTop: list(), side: list(), stone: list(), tree: list() };
    // nível mais alto ocupado pela coluna da casa (-1 fora do mapa: a borda fica à mostra)
    const columnTop = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x >= this.grid.width || p.y >= this.grid.height) return -1;
      const t = tileAt(this.grid, p);
      return t.h + (t.terrain === 'wall' ? 2 : 0);
    };
    const markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const dotGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    for (const [i, tile] of this.grid.tiles.entries()) {
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const w = this.world(p);
      const wall = tile.terrain === 'wall';
      // muro: pedra empilhada dois níveis acima da casa, para ler que bloqueia passagem e visão
      for (let k = 0; k <= tile.h + (wall ? 2 : 0); k++) {
        const at = new THREE.Vector3(w.x, (k + 1) * STEP, w.z);
        if (k === tile.h) {
          const b = wall ? batch.stoneTop : batch.top;
          b.at.push(at);
          b.tiles.push(p);
        } else if (wall) batch.stone.at.push(at);
        // bloco de terra cercado pelos quatro lados nunca aparece: fora da cena (eram a maior parte dos triângulos no 20x20)
        else if (!NEIGHBORS.every(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) >= k)) batch.side.at.push(at);
      }
      if (tile.terrain === 'forest') batch.tree.at.push(w);
      const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      mark.position.set(w.x, w.y + 0.02, w.z);
      mark.visible = false;
      this.scene.add(mark);
      this.marks.set(posKey(p), mark);
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: MARK.path[0], transparent: true, opacity: MARK.path[1], depthWrite: false }));
      dot.position.set(w.x, w.y + 0.03, w.z);
      dot.visible = false;
      this.scene.add(dot);
      this.pathDots.set(posKey(p), dot);
    }
    this.instanced(top, batch.top.at, batch.top.tiles);
    this.instanced(stone, batch.stoneTop.at, batch.stoneTop.tiles);
    this.instanced(side, batch.side.at);
    this.instanced(stone, batch.stone.at);
    this.instanced(new THREE.Group().add(tree), batch.tree.at);
    this.focus.set(0, STEP, 0);
    const frame = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: MARKER.frameDepthTest, depthWrite: false }));
    frame.position.y = MARKER.frameY;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffcf4a', depthTest: false }));
    arrow.name = 'arrow';
    arrow.renderOrder = 11; // a seta fica acima de tudo (até atrás de um muro mostra onde está o cursor); a moldura não
    this.cursor.add(frame, arrow);
    this.cursor.visible = false;
    this.scene.add(this.cursor);
  }

  // Um InstancedMesh por malha da peça em vez de um objeto por bloco: o 20x20 fazia 2 321 draw calls por quadro e caía
  // a 9 fps no celular emulado (medição de 11/11). `tiles` marca as peças que valem como casa no toque.
  private instanced(piece: THREE.Object3D, at: THREE.Vector3[], tiles?: Pos[]) {
    if (!at.length) return;
    piece.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    piece.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const inst = new THREE.InstancedMesh(src.geometry, src.material, at.length);
      at.forEach((p, i) => inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z).multiply(src.matrixWorld)));
      inst.castShadow = inst.receiveShadow = true;
      if (tiles) {
        inst.userData.tiles = tiles;
        this.tileTops.push(inst);
      }
      this.scene.add(inst);
    });
  }

  setCursor(p: Pos | null) {
    this.cursor.visible = !!p;
    if (p) this.cursor.position.copy(this.world(p));
  }

  // giro para onde a câmera vai (não o do meio da animação): o WASD já anda certo logo depois do R
  get heading(): number {
    return this.yawTarget;
  }

  private makeUnit(u: UnitState): UnitView {
    const holder = new THREE.Group();
    let mixer: THREE.AnimationMixer | null = null;
    let clips: THREE.AnimationClip[] = [];
    const gltf = this.models.get(MODEL[u.def]);
    if (gltf) {
      const body = prepare(cloneSkinned(gltf.scene));
      const b = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(unitHeight(u.def) / (b.max.y - b.min.y));
      holder.add(body);
      mixer = new THREE.AnimationMixer(body);
      clips = gltf.animations;
    } else {
      // o Farol não tem modelo: um cristal que brilha, para ler de longe qual é o alvo a proteger
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#2bb8d6', emissiveIntensity: 1.2 }));
      crystal.position.y = 0.55;
      crystal.castShadow = true;
      holder.add(crystal, new THREE.PointLight('#7ff3ff', 2, 3));
    }
    // aro da cor do time no chão: o lado se lê mesmo quando o modelo é parecido
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthWrite: false, transparent: true, opacity: 0.9 }));
    ring.position.y = 0.04;
    // barra de 0,12 de altura (cheia 0,08): com 0,06 ela sumia em parte no pixel art de 2 px
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, MARKER.barHalf * 2), new THREE.MeshBasicMaterial({ color: '#1a1020', depthTest: false }));
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.08), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthTest: false }));
    bar.position.z = 0.001;
    const barHolder = new THREE.Group().add(barBg, bar);
    barHolder.position.y = MARKER.barY;
    barHolder.name = 'bar';
    barBg.renderOrder = bar.renderOrder = 10;
    holder.add(ring, barHolder);
    this.scene.add(holder);
    const view: UnitView = { holder, mixer, clips, current: null, bar, hp: u.hp, def: u.def };
    this.play(view, 'Idle');
    return view;
  }

  private play(v: UnitView, name: string, once = false) {
    const clip = v.clips.find((c) => c.name === name);
    if (!v.mixer || !clip) return;
    const action = v.mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (v.current && v.current !== action) action.crossFadeFrom(v.current, 0.15, false);
    action.play();
    v.current = action;
  }

  private setBar(v: UnitView) {
    const k = Math.max(0, v.hp / UNIT_DEFS[v.def].hp);
    v.bar.scale.x = Math.max(0.001, k);
    v.bar.position.x = -0.33 * (1 - k);
  }

  private face(v: UnitView, to: Pos) {
    const d = this.world(to).sub(v.holder.position);
    if (d.lengthSq() > 0.001) v.holder.rotation.y = Math.atan2(d.x, d.z);
  }

  // Põe cada unidade onde o estado diz (cria quem falta, tira quem morreu). Chamado ao abrir, depois de cada animação e no desfazer.
  sync(state: BattleState) {
    const alive = new Set(state.units.map((u) => u.id));
    for (const [id, v] of this.units) if (!alive.has(id)) { this.scene.remove(v.holder); this.units.delete(id); }
    const enemies = state.units.filter((u) => u.team === 'enemy');
    for (const u of state.units) {
      let v = this.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.units.set(u.id, v);
        // nasce olhando para o lado de lá
        const foe = u.team === 'hero' ? enemies[0] : state.units.find((x) => x.team === 'hero');
        if (foe) { v.holder.position.copy(this.world(u.pos)); this.face(v, foe.pos); }
      }
      v.holder.position.copy(this.world(u.pos));
      v.hp = u.hp;
      this.setBar(v);
    }
  }

  setHighlights(h: Highlights | null) {
    for (const m of this.marks.values()) m.visible = false;
    for (const d of this.pathDots.values()) d.visible = false;
    if (!h) return;
    for (const { pos, kind } of h.tiles) {
      const m = this.marks.get(posKey(pos))!;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(MARK[kind][0]);
      mat.opacity = MARK[kind][1];
      m.visible = true;
    }
    for (const p of h.path ?? []) this.pathDots.get(posKey(p))!.visible = true;
  }

  private animate(dur: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ start: performance.now(), dur, step, done }));
  }

  private float(unitId: string, text: string, cls: string) {
    const v = this.units.get(unitId);
    if (!v) return;
    const p = v.holder.position.clone().setY(v.holder.position.y + 1.3).project(this.camera);
    const node = el('div', { class: `float ${cls}`, style: `left:${((p.x + 1) / 2) * 100}%;top:${((1 - p.y) / 2) * 100}%` }, text);
    this.floats.append(node);
    setTimeout(() => node.remove(), 1100);
  }

  // Toca os eventos em sequência; a regra já está aplicada no estado, aqui é só a leitura do que aconteceu.
  async playEvents(events: BattleEvent[], state: BattleState) {
    for (const e of events) {
      const v = this.units.get(e.unit);
      if (!v) continue;
      if (e.k === 'move') {
        this.play(v, 'Running_A');
        for (let i = 1; i < e.path.length; i++) {
          const a = this.world(e.path[i - 1]), b = this.world(e.path[i]);
          this.face(v, e.path[i]);
          const hop = Math.abs(b.y - a.y) > 0.01 ? 0.25 : 0; // degrau: pulinho para ler a altura
          await this.animate(150, (k) => v.holder.position.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + Math.sin(Math.PI * k) * hop));
        }
        this.play(v, 'Idle');
      } else if (e.k === 'attack') {
        const target = state.units.find((u) => u.pos.x === e.target.x && u.pos.y === e.target.y);
        if (ABILITIES[e.ability].range[1] > 0) this.face(v, target?.pos ?? e.target);
        this.play(v, CAST_CLIP(e.ability), true);
        await wait(380);
      } else if (e.k === 'hit' || e.k === 'bump' || e.k === 'fall') {
        v.hp -= e.dmg;
        this.setBar(v);
        this.float(e.unit, `-${e.dmg}`, 'dmg');
        if (v.hp > 0) this.play(v, 'Hit_A', true);
        await wait(e.k === 'hit' ? 320 : 220);
        if (v.hp > 0) this.play(v, 'Idle');
      } else if (e.k === 'miss') {
        this.float(e.unit, t('Errou', 'Miss'), 'miss');
        await wait(320);
      } else if (e.k === 'heal') {
        v.hp += e.amount;
        this.setBar(v);
        this.float(e.unit, `+${e.amount}`, 'heal');
        await wait(320);
      } else if (e.k === 'push') {
        const a = v.holder.position.clone(), b = this.world(e.to);
        await this.animate(140, (k) => v.holder.position.lerpVectors(a, b, k));
      } else if (e.k === 'die') {
        this.play(v, 'Death_A', true);
        await wait(700);
      }
    }
    this.sync(state);
  }

  celebrate(team: 'hero' | 'enemy', state: BattleState) {
    for (const u of state.units) if (u.team === team) this.play(this.units.get(u.id)!, 'Cheer');
  }

  // Casa sob o dedo. O corpo da unidade vale antes do chão: o boneco desenhado cobre a casa de trás, e quem toca nele
  // quer a unidade (auditoria mobile de 25/10: tocar no inimigo escolhia a casa atrás dele)
  pick(clientX: number, clientY: number): Pos | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const holders = [...this.units.values()];
    for (const hit of ray.intersectObjects(holders.map((v) => v.holder), true)) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const unit = holders.find((v) => v.holder === o);
        if (unit) return this.posOf(unit);
      }
    }
    const hit = ray.intersectObjects(this.tileTops, false)[0];
    return hit ? (hit.object.userData.tiles as Pos[])[hit.instanceId!] : null;
  }

  // desliza a câmera até a casa (o herói da vez), sem mudar o zoom
  focusOn(p: Pos) {
    const w = this.world(p);
    this.focusGoal = new THREE.Vector3(w.x, STEP, w.z);
  }

  // volta ao enquadramento do mapa inteiro
  resetView() {
    this.viewH = this.fitView;
    this.focusGoal = new THREE.Vector3(0, STEP, 0);
    this.resize();
  }

  private posOf(v: UnitView): Pos {
    const p = v.holder.position;
    return { x: Math.round(p.x + this.grid.width / 2 - 0.5), y: Math.round(p.z + this.grid.height / 2 - 0.5) };
  }

  // arrastar move o foco no chão, no sentido do dedo (o mapa acompanha o dedo)
  pan(dx: number, dy: number) {
    const k = (this.camera.top - this.camera.bottom) / this.renderer.domElement.clientHeight;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.focusGoal = null; // o dedo manda: para o deslize automático
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / Math.sin(PITCH));
    const lim = Math.max(this.grid.width, this.grid.height) / 2;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -lim, lim);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -lim, lim);
  }

  zoom(factor: number) {
    // o teto acompanha o mapa: no 20x20 o mapa inteiro pede mais que os 16 do 8x8
    this.viewH = THREE.MathUtils.clamp(this.viewH * factor, ZOOM.min, Math.max(ZOOM.max, this.fitView));
    this.resize();
  }

  // Aplica as opções do pixel art na hora, sem recarregar a página
  setPixel(p: PixelSettings) {
    this.pixel = p;
    const on = p.size > 0;
    this.renderPass.enabled = !on;
    this.pixelPass.enabled = on;
    if (on) this.pixelPass.setPixelSize(p.size);
    this.pixelPass.depthEdgeStrength = p.outline ? EDGES.depthEdgeStrength : 0;
    this.pixelPass.normalEdgeStrength = p.outline ? EDGES.normalEdgeStrength : 0;
    this.palettePass.enabled = p.palette;
    // pixel art desenha em 1x mesmo em tela 3x (os blocos já são maiores que o pixel do aparelho e o celular agradece);
    // sem ele, nitidez da tela até 2x
    const ratio = on ? 1 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.resize();
  }

  setInsets(top: number, bottom: number) {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.resize();
  }

  rotate(dir: 1 | -1) {
    this.yawTarget += (dir * Math.PI) / 2;
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const a = w / h;
    // celular em pé: abre o quadro até a largura mostrar o mapa todo (pinça para ajustar)
    const viewH = a < 1 ? (this.viewH * 1.15) / a : this.viewH;
    // centra o mapa no espaço livre entre o HUD de cima e o de baixo, não no meio da tela
    const off = ((this.insets.bottom - this.insets.top) / 2) * (viewH / h);
    Object.assign(this.camera, { left: (-viewH * a) / 2, right: (viewH * a) / 2, top: viewH / 2 - off, bottom: -viewH / 2 - off });
    this.camera.updateProjectionMatrix();
  }

  private placeCamera() {
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(this.yaw) * Math.cos(PITCH)).multiplyScalar(30);
    this.camera.position.copy(this.focus).add(off);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
    // trava a câmera na grade de pixels: sem isso o chão "ferve" quando a câmera anda (mesma ideia do Warlock)
    if (!this.pixel.snap || !this.pixel.size) return;
    const block = ((this.camera.top - this.camera.bottom) / this.renderer.domElement.height) * this.pixel.size;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const px = this.camera.position.dot(right), py = this.camera.position.dot(up);
    this.camera.position.addScaledVector(right, Math.round(px / block) * block - px).addScaledVector(up, Math.round(py / block) * block - py);
    this.camera.updateMatrixWorld();
  }

  private frame() {
    const dt = this.clock.getDelta();
    const now = performance.now();
    for (const a of [...this.anims]) {
      const k = Math.min(1, (now - a.start) / a.dur);
      a.step(k);
      if (k < 1) continue;
      this.anims.splice(this.anims.indexOf(a), 1);
      a.done();
    }
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 10);
    if (this.focusGoal) this.focus.lerp(this.focusGoal, Math.min(1, dt * 6));
    this.cursor.getObjectByName('arrow')!.position.y = MARKER.arrowY + Math.sin(performance.now() / 250) * MARKER.arrowBob;
    this.placeCamera();
    for (const v of this.units.values()) {
      v.mixer?.update(dt);
      // barra de vida sempre de frente para a câmera
      v.holder.getObjectByName('bar')!.quaternion.copy(v.holder.quaternion.clone().invert().multiply(this.camera.quaternion));
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.floats.remove();
  }
}
