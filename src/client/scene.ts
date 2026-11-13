// Cena Three.js da batalha: mapa em blocos, unidades, marcações de casa, números flutuantes e câmera ortográfica com
// RenderPixelatedPass (o pixel art SNES da spec). Só desenha: não conhece regras, recebe estado, destaques e eventos.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ABILITIES } from '../shared/battle/abilities.ts';
import { FACING, dist, neighbors, posKey, standH, tileAt, type Grid } from '../shared/battle/grid.ts';
import { footprint } from '../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { chargeDanger, type Highlights, type TileKind } from './interaction.ts';
import { MARKER, barYOf, modelOf, unitHeight } from './markers.ts';
import type { PixelSettings } from './pixel-settings.ts';
import { TIMING, isJump, jumpAirMs, speed } from './timing.ts';
import { chargeAura, lookOf, playFx } from './fx.ts';

const STEP = 0.5; // altura de um nível em metros (1 casa = 1 de largura), o mesmo da POC aprovada
const PITCH = THREE.MathUtils.degToRad(32); // ângulo do FFT
const ZOOM = { min: 4, max: 16 };
const ZOOM_START = 1.5;
// celular em pé: no máximo ~9,5 casas de largura ao abrir. No 20x20 o mapa inteiro deixava a casa com ~20 px, pequena
// para o dedo (alvo de toque ≥ 44 px); a câmera segue o herói da vez e o botão de recentralizar mostra tudo
const PORTRAIT_START = 8.3;
// PC: abre com ~10 de altura de vista (antes até 16, o mapa quase inteiro e o boneco com ~30 px a 1280x720). O FFT mostra
// poucas casas e bonecos grandes; a câmera segue o cursor e quem age, e F ainda mostra o mapa inteiro (12/11)
const PC_START = 10;


// cores das marcações; o significado também vai em texto no HUD (nunca só a cor)
// roxo do Véu: a área de uma magia carregando fica acesa até ela sair (o texto vai na casa sob o cursor, hud.ts)
const DANGER: [string, number] = ['#9b4dff', 0.4];
const MARK: Record<TileKind | 'path', [color: string, opacity: number]> = {
  // movimento branco (12/11): o azul de antes sumia na água azul dos mapas novos
  actor: ['#ffd479', 0.75], move: ['#ffffff', 0.5], range: ['#ff6a3c', 0.5], blocked: ['#6b3a8c', 0.6],
  threat: ['#ff2d55', 0.32], area: ['#ffb020', 0.6], target: ['#fff2a0', 0.85], path: ['#1e6fff', 0.95],
};
const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
// Peças de cada aparência de casa (Tile.look), em public/models: cubo do topo e cubo da coluna embaixo. Ponte não tem
// coluna (fica a água por baixo); árvore põe o modelo da floresta em cima. Mapeamento do orquestrador em 12/11 (montagem
// de Gariland a partir do surface_type do arquivo do mapa), aprovado pelo Fernando para entrar no jogo.
// `canopy`: a altura da casa no mapa é a da copa (árvore de Gariland), e o chão sai do vizinho mais baixo.
const LOOK: Record<string, { top: string; side: string | null; prop?: string; propH?: number; propW?: number; canopy?: true }> = {
  grass: { top: 'blocos/grass', side: 'blocos/dirt' },
  stone: { top: 'blocos/gravel', side: 'blocos/stone' },
  water: { top: 'blocos/water', side: 'blocos/stone_dark' },
  roof: { top: 'blocos/bricks_B', side: 'blocos/bricks_A' },
  chimney: { top: 'blocos/stone_dark', side: 'blocos/bricks_A' },
  wood: { top: 'blocos/wood', side: 'blocos/wood' },
  bridge: { top: 'blocos/wood', side: null },
  box: { top: 'masmorra/box_large', side: 'blocos/stone' },
  tree: { top: 'blocos/grass', side: 'blocos/dirt', prop: 'floresta/Tree_1_A_Color1', canopy: true },
  // Colina do Farol (12/11, proposta aprovada pelo Fernando): rocha na colina, areia e ouro no morro do Farol, muros de
  // tijolo, quatro árvores variadas e o lado dos inimigos na neve (ler de longe de que lado cada time começa)
  rock: { top: 'blocos/stone', side: 'blocos/stone' },
  summit: { top: 'blocos/stone_dark', side: 'blocos/stone' },
  sand: { top: 'blocos/sand_with_grass', side: 'blocos/dirt' },
  gold: { top: 'blocos/stone_with_gold', side: 'blocos/stone' },
  brick: { top: 'blocos/bricks_B', side: 'blocos/bricks_A' },
  snow: { top: 'blocos/dirt_with_snow', side: 'blocos/dirt' },
  snow_rock: { top: 'blocos/snow', side: 'blocos/stone' },
  tree2: { top: 'blocos/grass', side: 'blocos/dirt', prop: 'floresta/Tree_2_A_Color1' },
  tree3: { top: 'blocos/grass', side: 'blocos/dirt', prop: 'floresta/Tree_3_A_Color1' },
  tree4: { top: 'blocos/grass', side: 'blocos/dirt', prop: 'floresta/Tree_4_A_Color1' },
  bare1: { top: 'blocos/dirt_with_snow', side: 'blocos/dirt', prop: 'floresta/Tree_Bare_1_A_Color1' },
  bare2: { top: 'blocos/dirt_with_snow', side: 'blocos/dirt', prop: 'floresta/Tree_Bare_2_A_Color1' },
  // Cripta Alagada (12/11, mapa fechado com as peças da masmorra): piso de cascalho, altar escuro, e casas que bloqueiam
  // com coluna, caixotes, barril ou baú em cima; o entulho é cobertura pisável. propH = altura da peça em casas.
  crypt: { top: 'blocos/gravel', side: 'blocos/stone_dark' },
  altar: { top: 'blocos/stone_dark', side: 'blocos/stone_dark' },
  pillar: { top: 'blocos/gravel', side: 'blocos/stone_dark', prop: 'masmorra/pillar', propH: 2 },
  crates: { top: 'blocos/gravel', side: 'blocos/stone_dark', prop: 'masmorra/crates_stacked', propH: 1 },
  barrel: { top: 'blocos/gravel', side: 'blocos/stone_dark', prop: 'masmorra/barrel_large', propH: 0.8 },
  chest: { top: 'blocos/stone_dark', side: 'blocos/stone_dark', prop: 'masmorra/chest_gold', propH: 0.6 },
  rubble: { top: 'blocos/gravel', side: 'blocos/stone_dark', prop: 'masmorra/rubble_half', propH: 0.4 },
  spikes: { top: 'blocos/gravel', side: 'blocos/stone_dark', prop: 'masmorra/floor_tile_big_spikes', propW: 0.95 },
};
const WATER = 'blocos/water';
const UNDER = 'blocos/stone_dark'; // coluna embaixo da água da ponte e da saia do mapa

// Base do mapa como um bloco (pedidos do Fernando, 12/11, olhando o tabuleiro do FFT): todas as colunas terminam no mesmo
// chão (y = 0), e as laterais da borda, do piso de cada casa para baixo, são uma cor lisa puxada do piso de cima que
// escurece até sumir no fundo ("os chaos das bordas do mapa ficam sem textura e fica melhor assim"). Os topos seguem com textura.
const BASE_DEPTH = 2; // em casas, abaixo do chão; com 1 o degradê acabava antes de escurecer de todo
const BACKGROUND = '#1b1626'; // o fundo da cena: o degradê termina nele
// cor da lateral pelo piso de cima (Tile.look) ou pelo terreno nos mapas sem aparência por casa
const WALL_COLOR: Record<string, string> = {
  grass: '#4f8f3a', tree: '#4f8f3a', floor: '#4f8f3a', forest: '#3f7a34', stone: '#7a7d86', box: '#7a7d86', wall: '#7a7d86',
  water: '#2f6fae', bridge: '#2f6fae', roof: '#8a4b32', chimney: '#4a4a52', wood: '#8a6238',
  rock: '#7a7d86', summit: '#4a4a52', sand: '#b8a06a', gold: '#7a7d86', brick: '#8a4b32', snow: '#c9d2dc', snow_rock: '#c9d2dc',
  tree2: '#4f8f3a', tree3: '#4f8f3a', tree4: '#4f8f3a', bare1: '#c9d2dc', bare2: '#c9d2dc',
  crypt: '#5a5d66', altar: '#4a4a52', pillar: '#5a5d66', crates: '#5a5d66', barrel: '#5a5d66', chest: '#4a4a52', rubble: '#5a5d66', spikes: '#5a5d66',
};
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // contorno da POC aprovada
const DEEP_DROP = 0.45; // quanto a superfície da água funda fica abaixo da rasa, em níveis (só desenho; a regra lê depth)
const WADE = 0.3; // quanto o boneco afunda na água rasa, em níveis: anda com a água nas canelas (a regra o põe 1 abaixo da margem)
const TINT_GLOW = 0.45; // força do brilho próprio (UnitDef.tint): visível no boneco escuro sem apagar a textura

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
  aura: THREE.Mesh | null; // brilho no chão enquanto carrega uma habilidade
  body: THREE.Object3D | null;
  mats: THREE.MeshStandardMaterial[]; // materiais só deste boneco (cópias): piscar um não pisca os outros do mesmo modelo
  flash: number; // conta as piscadas: só a última devolve o brilho (golpe e espinho seguidos não cortam a segunda)
}

interface Anim {
  start: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
}


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
  private readonly danger = new Map<string, THREE.Mesh>(); // casas onde uma carga vai cair (chargeDanger)
  // cursor do teclado: moldura na altura da casa e seta flutuando em cima, para ler o nível mesmo atrás de um boneco
  private readonly cursor = new THREE.Group();
  private readonly units = new Map<string, UnitView>();
  private readonly anims: Anim[] = [];
  private readonly floats: HTMLElement;
  private readonly clock = new THREE.Clock();
  private t = 0; // relógio da batalha em ms (acelera com speed())
  private frozenUntil = 0; // hit-stop: os bonecos ficam parados até aqui
  private shakeUntil = 0; // golpe forte: a câmera treme até aqui
  private readonly cursorGoal = new THREE.Vector3();
  private readonly onResize = () => this.resize();
  private viewH: number;
  private readonly fitView: number; // zoom em que o mapa inteiro cabe na largura
  private readonly step: number; // altura de um nível neste mapa
  private insets = { top: 0, bottom: 0 }; // px cobertos pelo HUD em cima e embaixo
  private yaw = Math.PI / 4;
  private yawTarget = Math.PI / 4;
  private readonly sky = new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.6);

  private constructor(private readonly host: HTMLElement, private readonly grid: Grid, private readonly models: Map<string, GLTF>, pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>, pixel: PixelSettings, private readonly lookPieces: Map<string, THREE.Object3D>, private readonly packClips: THREE.AnimationClip[]) {
    this.pixel = pixel;
    this.step = grid.levelHeight ?? STEP;
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false; // zerado à mão no começo de cada quadro (contador de desempenho)
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
    this.viewH = innerWidth < innerHeight ? Math.min(this.fitView / ZOOM_START, PORTRAIT_START) : Math.min(this.fitView, PC_START);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.pixelPass = new RenderPixelatedPass(Math.max(2, pixel.size), this.scene, this.camera, EDGES);
    // a paleta vem depois da saída em sRGB; liga e desliga sem refazer a cadeia
    for (const pass of [this.renderPass, this.pixelPass, new OutputPass(), this.palettePass]) this.composer.addPass(pass);
    this.scene.background = new THREE.Color('#1b1626');
    this.scene.add(this.sky);
    const sun = this.sun;
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
    // bonecos comprimidos com meshopt (13/11, pedido do Fernando: o jogo baixava 11 MB para abrir); decodificador do Three
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const defs = [...new Set(state.units.map((u) => modelOf(u.def)).filter(Boolean))];
    const [top, side, stone, tree, ...loaded] = await Promise.all([
      ...['dirt_with_grass', 'dirt', 'stone'].map((n) => loader.loadAsync(`/models/poc/quadrado/${n}.gltf`)),
      loader.loadAsync('/models/poc/hex/tree_single_A.gltf'), // a árvore do pack de blocos é um cubo de folhas
      ...defs.map((d) => loader.loadAsync(`/models/${d}.glb`)),
    ]);
    const models = new Map(defs.map((d, i) => [d, loaded[i]]));
    // só o mapa que traz aparência por casa baixa essas peças (~630 KB com as texturas)
    const names = [...new Set(grid.tiles.flatMap((t) => (t.look ? [LOOK[t.look].top, LOOK[t.look].side ?? WATER, LOOK[t.look].prop ?? '', UNDER] : [])))].filter(Boolean);
    const looks = new Map(await Promise.all(names.map(async (n) => [n, (await loader.loadAsync(`/models/${n}.gltf`)).scene] as const)));
    // gestos extras das habilidades (KayKit Rig_Medium, mesmos ossos dos bonecos): scripts/assets/anim-pack.mjs
    const pack = (await loader.loadAsync('/models/animacoes.glb')).animations;
    const s = new BattleScene(host, grid, models, { top: top.scene, side: side.scene, stone: stone.scene, tree: tree.scene }, pixel, looks, pack);
    s.sync(state);
    return s;
  }

  // casa (x, y) da batalha → mundo: x no eixo X, y no eixo Z, mapa centrado na origem
  private world(p: Pos): THREE.Vector3 {
    const t = tileAt(this.grid, p);
    // na rampa a unidade fica no meio da subida; na água funda, rebaixada como o desenho (cursor e marcas não flutuam)
    const drop = (t.depth ?? 0) >= 2 ? DEEP_DROP : 0;
    return new THREE.Vector3(p.x - this.grid.width / 2 + 0.5, (t.h + 1 + (t.ramp ? t.ramp[1] / 2 : 0) - drop) * this.step, p.y - this.grid.height / 2 + 0.5);
  }

  // onde o boneco fica de pé: a casa, mais baixo na água rasa (marcas e cursor seguem em world(), na superfície)
  private stand(p: Pos): THREE.Vector3 {
    const w = this.world(p);
    return tileAt(this.grid, p).depth === 1 ? w.setY(w.y - WADE * this.step) : w;
  }

  private buildBoard(pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>) {
    // normaliza a peça para 1 casa de largura e STEP de altura, com o topo em y = 0
    const norm = (src: THREE.Object3D) => {
      const o = src.clone();
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      o.scale.set(1 / size.x, this.step / size.y, 1 / size.z);
      o.position.y = -box.max.y * (this.step / size.y);
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
    const walls: { x: number; z: number; top: number; color: string }[] = []; // laterais lisas da borda
    const edge = (p: Pos) => NEIGHBORS.some(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) < 0);
    // nível mais alto ocupado pela coluna da casa (-1 fora do mapa: a borda fica à mostra)
    const columnTop = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x >= this.grid.width || p.y >= this.grid.height) return -1;
      const t = tileAt(this.grid, p);
      return t.h + (t.terrain === 'wall' ? 2 : 0);
    };
    const markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const dotGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    const looks = this.lookBatches(edge, walls);
    for (const [i, tile] of this.grid.tiles.entries()) {
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const w = this.world(p);
      const wall = tile.terrain === 'wall';
      if (tile.look) looks.add(p);
      // muro: pedra empilhada dois níveis acima da casa, para ler que bloqueia passagem e visão
      for (let k = 0; !tile.look && k <= tile.h + (wall ? 2 : 0); k++) {
        const at = new THREE.Vector3(w.x, (k + 1) * this.step, w.z);
        if (k === tile.h) {
          const b = wall ? batch.stoneTop : batch.top;
          b.at.push(at);
          b.tiles.push(p);
        } else if (wall) batch.stone.at.push(at);
        // bloco de terra cercado pelos quatro lados nunca aparece: fora da cena (eram a maior parte dos triângulos no 20x20);
        // na borda, a lateral lisa toma o lugar da terra
        else if (!edge(p) && !NEIGHBORS.every(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) >= k)) batch.side.at.push(at);
      }
      if (tile.terrain === 'forest' && !tile.look) batch.tree.at.push(w);
      if (!tile.look && edge(p)) walls.push({ x: w.x, z: w.z, top: tile.h * this.step, color: WALL_COLOR[tile.terrain] });
      const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      mark.position.set(w.x, w.y + 0.02, w.z);
      mark.visible = false;
      this.scene.add(mark);
      this.marks.set(posKey(p), mark);
      // perigo da carga: camada própria, por baixo das marcas da vez (a escolha do jogador continua por cima)
      const danger = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: DANGER[0], transparent: true, opacity: DANGER[1], depthWrite: false }));
      danger.position.set(w.x, w.y + 0.015, w.z);
      danger.visible = false;
      this.scene.add(danger);
      this.danger.set(posKey(p), danger);
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
    looks.build();
    this.buildWalls(walls);
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

  // Casas com aparência (Tile.look): coluna de cubos inteiros de 1 casa, do topo da casa para baixo, com a peça do topo
  // e a da coluna de cada aparência. Cubo inteiro porque o cubo achatado na altura de um nível (0,25 em Gariland) espremia a
  // textura em listras. A rampa inclina o cubo do topo (cisalhamento) e o estica para baixo, para não abrir fresta.
  // Laterais lisas da borda num desenho só (uma chamada de desenho): cor do piso no alto, já escurecida, até o fundo
  private buildWalls(walls: { x: number; z: number; top: number; color: string }[]) {
    if (!walls.length) return;
    const bottom = -BASE_DEPTH;
    const deep = new THREE.Color(BACKGROUND);
    const parts = walls.map(({ x, z, top, color }) => {
      const g = new THREE.BoxGeometry(1, top - bottom, 1).translate(x, (top + bottom) / 2, z);
      const high = new THREE.Color(color).multiplyScalar(0.55); // a lateral é mais escura que o topo, como sombra
      const pos = g.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) (pos.getY(i) > bottom + 0.001 ? high : deep).toArray(colors, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const g of parts) g.dispose();
    this.scene.add(mesh);
  }

  private lookBatches(edge: (p: Pos) => boolean, walls: { x: number; z: number; top: number; color: string }[]) {
    const norm = (name: string, height: number) => {
      const o = this.lookPieces.get(name)!.clone();
      const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      const box = new THREE.Box3().setFromObject(o);
      o.scale.set(1 / size.x, height / size.y, 1 / size.z);
      o.position.set(-(box.min.x + box.max.x) / 2 / size.x, -box.max.y * (height / size.y), -(box.min.z + box.max.z) / 2 / size.z);
      return prepare(new THREE.Group().add(o));
    };
    const batches = new Map<string, { piece: THREE.Object3D; at: THREE.Matrix4[]; tiles?: Pos[] }>();
    const put = (name: string, height: number, m: THREE.Matrix4, tile?: Pos) => {
      const key = `${name}@${height}${tile ? '#' : ''}`;
      let b = batches.get(key);
      // altura 0: peça como veio (a escala já vai na matriz)
      if (!b) batches.set(key, (b = { piece: height ? norm(name, height) : prepare(this.lookPieces.get(name)!.clone()), at: [], tiles: tile && [] }));
      b.at.push(m);
      if (tile) b.tiles!.push(tile);
    };
    const add = (p: Pos) => {
      const tile = tileAt(this.grid, p);
      const look = LOOK[tile.look!];
      const w = this.world(p);
      // árvore de Gariland (casa não pisável, a altura do arquivo é a da copa): o chão é o do vizinho mais baixo. Nos nossos
      // mapas a altura já é a do chão. Muro sem peça em cima: dois níveis acima da casa, como sem aparência; com peça
      // (coluna, caixote, barril), a peça é que bloqueia e a casa fica no nível do chão.
      const wall = tile.terrain === 'wall';
      const h = look.canopy && wall ? Math.min(...neighbors(this.grid, p).map((n) => tileAt(this.grid, n).h)) : tile.h + (wall && !look.prop ? 2 : 0);
      // água funda um pouco mais baixa que a rasa: a mesma peça de água, e o degrau na margem diz "aqui não se atravessa"
      const top = (h + 1) * this.step - ((tile.depth ?? 0) >= 2 ? this.step * DEEP_DROP : 0);
      // a ponte é uma tábua de um nível sobre a água; casa baixa (topo abaixo de 1) tem o cubo achatado até a base; na borda
      // o topo é uma fatia de um nível e a lateral lisa começa logo abaixo dela
      const onEdge = edge(p);
      const slab = look.side && !onEdge ? Math.min(1, top) : this.step;
      const m = new THREE.Matrix4().makeTranslation(w.x, top, w.z);
      if (tile.ramp) {
        const rise = tile.ramp[1] * this.step, f = FACING[tile.ramp[0]];
        // y' = y * (altura + subida) / altura + subida * (meio passo na direção da rampa + 1/2)
        m.set(1, 0, 0, w.x, f.x * rise, (slab + rise) / slab, f.y * rise, top + rise / 2, 0, 0, 1, w.z, 0, 0, 0, 1);
      }
      put(look.top, slab, m, p);
      // coluna até a base reta (y = 0): cubos inteiros e o último achatado no que falta, para o fundo não ficar em degraus
      const column = look.side ?? UNDER;
      let y = top - slab;
      if (!look.side) {
        put(WATER, 1, new THREE.Matrix4().makeTranslation(w.x, this.step, w.z).scale(new THREE.Vector3(1, this.step, 1)));
        y = 0;
      }
      if (onEdge) walls.push({ x: w.x, z: w.z, top: y, color: WALL_COLOR[tile.look!] });
      else for (; y > 0; y -= 1) put(column, 1, new THREE.Matrix4().makeTranslation(w.x, y, w.z).scale(new THREE.Vector3(1, Math.min(1, y), 1)));
      if (look.prop) {
        const box = new THREE.Box3().setFromObject(this.lookPieces.get(look.prop)!);
        // propW: peça de chão (espinhos) medida pela largura, para caber na casa; as outras pela altura (1,1 = a árvore)
        const k = look.propW ? look.propW / Math.max(box.max.x - box.min.x, box.max.z - box.min.z) : (look.propH ?? 1.1) / (box.max.y - box.min.y);
        put(look.prop, 0, new THREE.Matrix4().makeTranslation(w.x, top - box.min.y * k, w.z).scale(new THREE.Vector3(k, k, k)));
      }
    };
    const build = () => {
      for (const b of batches.values()) this.instanced(b.piece, b.at, b.tiles);
    };
    return { add, build };
  }

  // Um InstancedMesh por malha da peça em vez de um objeto por bloco: o 20x20 fazia 2 321 draw calls por quadro e caía
  // a 9 fps no celular emulado (medição de 11/11). `tiles` marca as peças que valem como casa no toque.
  private instanced(piece: THREE.Object3D, at: (THREE.Vector3 | THREE.Matrix4)[], tiles?: Pos[]) {
    if (!at.length) return;
    piece.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    piece.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const inst = new THREE.InstancedMesh(src.geometry, src.material, at.length);
      at.forEach((p, i) => inst.setMatrixAt(i, (p instanceof THREE.Matrix4 ? m.copy(p) : m.makeTranslation(p.x, p.y, p.z)).multiply(src.matrixWorld)));
      inst.castShadow = inst.receiveShadow = true;
      if (tiles) {
        inst.userData.tiles = tiles;
        this.tileTops.push(inst);
      }
      this.scene.add(inst);
    });
  }

  setCursor(p: Pos | null) {
    // aparece já no lugar; depois desliza de casa em casa (frame), em vez de pular
    if (p && !this.cursor.visible) this.cursor.position.copy(this.world(p));
    this.cursor.visible = !!p;
    if (p) this.cursorGoal.copy(this.world(p));
  }

  // giro para onde a câmera vai (não o do meio da animação): o WASD já anda certo logo depois do R
  get heading(): number {
    return this.yawTarget;
  }

  private makeUnit(u: UnitState): UnitView {
    const holder = new THREE.Group();
    let mixer: THREE.AnimationMixer | null = null;
    let clips: THREE.AnimationClip[] = [];
    let body: THREE.Object3D | null = null;
    const mats: THREE.MeshStandardMaterial[] = [];
    const gltf = this.models.get(modelOf(u.def));
    if (gltf) {
      body = prepare(cloneSkinned(gltf.scene));
      body.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        // brilho de fábrica (olhos amarelos dos esqueletos): o piscar de golpe e cura mexe no emissivo e precisa voltar a ele
        mat.userData.glow = { color: mat.emissive.clone(), intensity: mat.emissiveIntensity };
        mesh.material = mat;
        mats.push(mat);
      });
      this.glowBack(mats, u.def);
      const b = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(unitHeight(u.def) / (b.max.y - b.min.y));
      holder.add(body);
      mixer = new THREE.AnimationMixer(body);
      // os clipes do pacote só com as faixas dos ossos que este boneco tem (sem isso o Three avisa a cada quadro)
      const has = (track: THREE.KeyframeTrack) => !!body!.getObjectByName(track.name.split('.')[0]);
      clips = [...gltf.animations, ...this.packClips.map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(has)))];
    } else {
      // o Farol não tem modelo: um cristal que brilha, para ler de longe qual é o alvo a proteger
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#2bb8d6', emissiveIntensity: 1.2 }));
      crystal.position.y = 0.55;
      crystal.castShadow = true;
      holder.add(crystal, new THREE.PointLight('#7ff3ff', 2, 3));
    }
    // seta branca no chão para a frente da unidade (branca: a cor do time sumia nas casas marcadas), só nos mapas em que a direção conta: de cima o rosto do boneco quase não se lê
    if (u.facing !== undefined) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      arrow.position.set(0, 0.05, 0.5);
      arrow.scale.y = 0.3;
      holder.add(arrow);
    }
    // aro da cor do time no chão: o lado se lê mesmo quando o modelo é parecido
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthWrite: false, transparent: true, opacity: 0.9 }));
    ring.position.y = 0.04;
    ring.scale.setScalar(UNIT_DEFS[u.def].size ?? 1); // unidade grande: o anel cerca o quadrado inteiro
    // barra de 0,12 de altura (cheia 0,08): com 0,06 ela sumia em parte no pixel art de 2 px
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, MARKER.barHalf * 2), new THREE.MeshBasicMaterial({ color: '#1a1020', depthTest: false }));
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.08), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthTest: false }));
    bar.position.z = 0.001;
    const barHolder = new THREE.Group().add(barBg, bar);
    barHolder.position.y = barYOf(u.def);
    barHolder.name = 'bar';
    barBg.renderOrder = bar.renderOrder = 10;
    holder.add(ring, barHolder);
    // chefe da fase: coroa dourada acima da barra, para o objetivo "derrube o chefe" se ver no mapa
    if (UNIT_DEFS[u.def].boss) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 5), new THREE.MeshBasicMaterial({ color: '#f2c14e' }));
      crown.position.y = barYOf(u.def) + 0.22;
      holder.add(crown);
    }
    this.scene.add(holder);
    const view: UnitView = { holder, mixer, clips, current: null, bar, hp: u.hp, def: u.def, aura: null, body, mats, flash: 0 };
    this.play(view, 'Idle');
    return view;
  }

  // Pulo de um degrau, como o salto do FFT: agacha parado, voa em arco até a casa e aterrissa. O topo do arco passa 0,4
  // nível acima da casa mais alta, para subir parecer impulso e descer parecer queda; `levels` alonga o voo
  private async jump(v: UnitView, a: THREE.Vector3, b: THREE.Vector3, levels: number) {
    this.play(v, 'Jump_Start', true, 0.6 / (TIMING.jumpCrouch / 1000));
    await this.wait(TIMING.jumpCrouch);
    this.play(v, 'Jump_Idle');
    const c = Math.max(a.y, b.y) + 0.4 * this.step - (a.y + b.y) / 2;
    await this.animate(jumpAirMs(levels), (k) => v.holder.position.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + 4 * c * k * (1 - k)));
    this.play(v, 'Jump_Land', true, 0.67 / (TIMING.jumpLand / 1000));
    await this.wait(TIMING.jumpLand);
  }

  private play(v: UnitView, name: string, once = false, rate = 1) {
    const clip = v.clips.find((c) => c.name === name);
    if (!v.mixer || !clip) return;
    const action = v.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveTimeScale(rate);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (v.current && v.current !== action) action.crossFadeFrom(v.current, 0.15, false);
    action.play();
    v.current = action;
  }

  // ms > 0: a barra desce (ou sobe) aos poucos, como no FFT, sem segurar a sequência
  private setBar(v: UnitView, ms = 0) {
    const k = Math.max(0, v.hp / UNIT_DEFS[v.def].hp);
    const apply = (x: number) => {
      v.bar.scale.x = Math.max(0.001, x);
      v.bar.position.x = -0.33 * (1 - x);
    };
    if (!ms) return apply(k);
    const from = v.bar.scale.x;
    void this.animate(ms, (s) => apply(from + (k - from) * s));
  }

  // centro das casas que a unidade ocupa, na altura da mais alta (unidade grande: o meio do quadrado 2x2)
  private unitWorld(u: UnitState): THREE.Vector3 {
    const tiles = footprint(u).map((p) => this.stand(p));
    const c = tiles.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(tiles.length);
    return c.setY(Math.max(...tiles.map((w) => w.y)));
  }

  private face(v: UnitView, to: Pos) {
    const d = this.world(to).sub(v.holder.position);
    if (d.lengthSq() > 0.001) v.holder.rotation.y = Math.atan2(d.x, d.z);
  }

  // Põe cada unidade onde o estado diz (cria quem falta, tira quem morreu). Chamado ao abrir, depois de cada animação e no desfazer.
  sync(state: BattleState) {
    const hot = chargeDanger(state, this.grid.width, this.grid.height);
    for (const [k, m] of this.danger) m.visible = hot.has(k);
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
        if (foe) { v.holder.position.copy(this.unitWorld(u)); this.face(v, foe.pos); }
      }
      v.holder.position.copy(this.unitWorld(u));
      // mapa com direção (estudo do FFT): o modelo olha para onde o estado diz, depois de cada animação e do desfazer
      if (u.facing !== undefined) v.holder.rotation.y = (u.facing * Math.PI) / 2;
      v.hp = u.hp;
      this.setBar(v);
      // aura e gesto em laço enquanto a carga está na fila; somem quando ela sai ou é desfeita
      const charge = state.charges.find((c) => c.unit === u.id);
      if (charge && !v.aura) {
        v.aura = chargeAura(!!ABILITIES[charge.ability].magic);
        v.holder.add(v.aura);
        const loop = lookOf(charge.ability).charge;
        if (loop) this.play(v, loop);
      } else if (!charge && v.aura) {
        v.holder.remove(v.aura);
        v.aura = null;
        this.play(v, 'Idle');
      }
    }
  }

  setHighlights(h: Highlights | null) {
    for (const m of this.marks.values()) m.visible = false;
    for (const d of this.pathDots.values()) d.visible = false;
    if (!h) return;
    for (const { pos, kind } of h.tiles) {
      const m = this.marks.get(posKey(pos))!;
      const mat = m.material as THREE.MeshBasicMaterial;
      m.userData.base = MARK[kind][1]; // opacidade de partida do pulso (frame)
      mat.color.set(MARK[kind][0]);
      mat.opacity = MARK[kind][1];
      m.visible = true;
    }
    for (const p of h.path ?? []) this.pathDots.get(posKey(p))!.visible = true;
  }

  // Tudo da batalha corre no relógio da batalha (`t`), que anda 3 vezes mais rápido com o botão de acelerar seguro
  // Brilho próprio da unidade (UnitDef.tint, o Acólito sobre o mago): emissivo, porque a cor do material multiplica a
  // textura e num boneco escuro não aparecia (testado em 13/11). Golpe e cura usam o mesmo emissivo para piscar, então
  // voltam a ele no fim; sem tint, ao brilho de fábrica do material (antes zerava e apagava os olhos dos esqueletos)
  private glowBack(mats: THREE.MeshStandardMaterial[], def: string) {
    const tint = UNIT_DEFS[def]?.tint;
    for (const m of mats) {
      const glow = m.userData.glow as { color: THREE.Color; intensity: number } | undefined;
      if (tint) m.emissive.set(tint);
      else if (glow) m.emissive.copy(glow.color);
      m.emissiveIntensity = tint ? TINT_GLOW : glow?.intensity ?? 0;
    }
  }

  private animate(dur: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ start: this.t, dur, step, done }));
  }

  // começo da vez: o boneco dá um pulinho (sobe e estica um pouco), para o olho achar quem joga
  pop(unitId: string) {
    const v = this.units.get(unitId);
    if (!v?.body) return;
    const body = v.body, base = body.scale.y;
    void this.animate(TIMING.pop, (k) => {
      const s = Math.sin(Math.PI * k);
      body.position.y = s * 0.18;
      body.scale.y = base * (1 + s * 0.08);
    });
  }

  wait(ms: number): Promise<void> {
    return this.animate(ms, () => {});
  }

  // Impacto: tudo para um instante (hit-stop), o alvo pisca branco e depois treme, com o tremor sumindo
  private async impact(v: UnitView) {
    this.frozenUntil = this.t + TIMING.hitStop;
    for (const m of v.mats) m.emissive.set('#ffffff');
    const flash = ++v.flash;
    void this.animate(TIMING.hitStop * 1.6, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 1 - k))).then(() => flash === v.flash && this.glowBack(v.mats, v.def));
    await this.wait(TIMING.hitStop);
    if (v.body) void this.animate(TIMING.shake, (k) => (v.body!.position.x = Math.sin(k * Math.PI * 6) * 0.07 * (1 - k)));
  }

  private float(unitId: string, text: string, cls: string) {
    const v = this.units.get(unitId);
    if (!v) return;
    const p = v.holder.position.clone().setY(v.holder.position.y + 1.3).project(this.camera);
    const node = el('div', { class: `float ${cls}`, style: `left:${((p.x + 1) / 2) * 100}%;top:${((1 - p.y) / 2) * 100}%` }, text);
    this.floats.append(node);
    setTimeout(() => node.remove(), TIMING.float);
  }

  // Toca os eventos em sequência; a regra já está aplicada no estado, aqui é só a leitura do que aconteceu.
  // `before` roda antes de cada evento (o jogo usa para a faixa com o nome da habilidade e o destino do inimigo).
  async playEvents(events: BattleEvent[], state: BattleState, before?: (e: BattleEvent) => Promise<void>) {
    for (const e of events) {
      const v = this.units.get(e.unit);
      if (!v) continue;
      await before?.(e);
      if (e.k === 'move') {
        // a passo (13/11, pedido do Fernando: andar lento e pulo realista). Walking_A tem 2 passadas em 1,07 s: 1,25x dá
        // ~1,4 passada por casa de 0,6 s, o pé quase não escorrega
        this.play(v, 'Walking_A', false, 1.25);
        const n = e.path.length - 1;
        for (let i = 1; i <= n; i++) {
          const a = this.stand(e.path[i - 1]), b = this.stand(e.path[i]);
          this.face(v, e.path[i]);
          // pula quando a altura de pé muda ou voa um vão (a mesma conta do Salto e do som dos passos, stepMs); rampa do estudo é plano
          const dh = standH(tileAt(this.grid, e.path[i])) - standH(tileAt(this.grid, e.path[i - 1]));
          const tiles = dist(e.path[i - 1], e.path[i]);
          if (isJump(dh, tiles)) {
            await this.jump(v, a, b, Math.max(Math.abs(dh), tiles));
            if (i < n) this.play(v, 'Walking_A', false, 1.25);
            continue;
          }
          // arranca na 1ª casa e freia na última (curva seno), passo constante no meio: sai do jeito de boneco em trilho
          const ease = (k: number) => (n === 1 ? (1 - Math.cos(Math.PI * k)) / 2 : i === 1 ? 1 - Math.cos((Math.PI / 2) * k) : i === n ? Math.sin((Math.PI / 2) * k) : k);
          await this.animate(TIMING.step, (k) => v.holder.position.lerpVectors(a, b, ease(k)));
        }
        this.play(v, 'Idle');
      } else if (e.k === 'attack') {
        const target = state.units.find((u) => u.pos.x === e.target.x && u.pos.y === e.target.y);
        if (ABILITIES[e.ability].range[1] > 0) this.face(v, target?.pos ?? e.target);
        const look = lookOf(e.ability);
        this.play(v, look.clip, true);
        await this.wait(TIMING.windup);
        const from = v.holder.position.clone().setY(v.holder.position.y + 0.55);
        const to = this.world(e.target).setY(this.world(e.target).y + 0.4);
        if (look.fx === 'dash') {
          // investida: avança meia casa e volta, como o avanço rápido do FFT
          const a = v.holder.position.clone(), b = a.clone().lerp(this.world(e.target), 0.5);
          await this.animate(TIMING.lunge, (k) => v.holder.position.lerpVectors(a, b, Math.sin(Math.PI * k)));
        }
        await playFx(this.scene, (ms, step) => this.animate(ms, step), look.fx, from, to, ABILITIES[e.ability].radius, TIMING.projectile);
      } else if (e.k === 'hit' || e.k === 'bump' || e.k === 'fall' || e.k === 'spike') {
        v.hp -= e.dmg;
        // golpe forte (25% da vida ou mais): a tela treme e o número sai maior. Com 30%, nenhum de 10 golpes de uma
        // Escaramuça passou (medido 12/11): o efeito tem de aparecer de vez em quando, não nunca
        const big = e.dmg >= UNIT_DEFS[v.def].hp * 0.25;
        if (big) this.shakeUntil = this.t + TIMING.hitStop + TIMING.shake;
        await this.impact(v);
        this.setBar(v, TIMING.hpDrain);
        this.float(e.unit, `-${e.dmg}`, big ? 'dmg big' : 'dmg');
        if (v.hp > 0) this.play(v, 'Hit_A', true);
        await this.wait(e.k === 'hit' ? TIMING.hit : TIMING.crash);
        if (v.hp > 0) this.play(v, 'Idle');
      } else if (e.k === 'miss') {
        this.float(e.unit, t('Errou', 'Miss'), 'miss');
        // desvio: o alvo dá um passinho para trás e volta, para o erro se ver no boneco e não só no texto
        if (v.body) void this.animate(TIMING.hit * 0.8, (k) => (v.body!.position.z = -Math.sin(Math.PI * k) * 0.25));
        await this.wait(TIMING.hit);
      } else if (e.k === 'heal') {
        v.hp += e.amount;
        // cura pisca verde, sem a pausa nem a tremida do golpe: o mesmo sinal, com outro sentido
        for (const m of v.mats) m.emissive.set('#5dff8a');
        const flash = ++v.flash;
        void this.animate(TIMING.hit, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 0.8 * (1 - k)))).then(() => flash === v.flash && this.glowBack(v.mats, v.def));
        this.setBar(v, TIMING.hpDrain);
        this.float(e.unit, `+${e.amount}`, 'heal');
        await this.wait(TIMING.hit);
      } else if (e.k === 'push') {
        const a = v.holder.position.clone(), b = this.stand(e.to);
        await this.animate(TIMING.push, (k) => v.holder.position.lerpVectors(a, b, k));
      } else if (e.k === 'charge') {
        // começa a carregar: o gesto longo de magia (efeito próprio de cada habilidade vem no bloco das animações)
        this.face(v, e.target);
        this.play(v, lookOf(e.ability).charge ?? 'Spellcast_Long');
        this.float(e.unit, t('Carregando', 'Charging'), 'miss');
        await this.wait(TIMING.hit);
      } else if (e.k === 'fizzle') {
        this.float(e.unit, t('Sem alvo', 'No target'), 'miss');
        await this.wait(TIMING.hit);
      } else if (e.k === 'die') {
        this.play(v, 'Death_A', true);
        await this.wait(TIMING.die);
        // pisca 3 vezes antes de sumir (no sync): fica claro que saiu da batalha e não só caiu
        for (let i = 0; i < 6; i++) {
          v.holder.visible = i % 2 === 1;
          await this.wait(TIMING.blink);
        }
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
  focusOn(p: Pos, also?: Pos) {
    // com `also`, centra entre os dois (quem ataca e o alvo): o golpe nunca acontece fora da tela ou atrás do HUD
    const w = also ? this.world(p).lerp(this.world(also), 0.5) : this.world(p);
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

  // Luz do modo Até o amanhecer (survival.ts): k = 0 é noite de lua (azul e fraca), k = 1 é o sol nascendo (quente, na
  // força normal). O jogador vê o fim chegando sem ler o número; os outros mapas nunca chamam e ficam na luz de sempre.
  setDaylight(k: number) {
    const mix = (night: string, day: string) => new THREE.Color(night).lerp(new THREE.Color(day), k);
    this.sky.color.copy(mix('#7d8fd8', '#ffe2c0'));
    this.sky.groundColor.copy(mix('#141226', '#3a3050'));
    this.sky.intensity = 0.55 + 0.6 * k;
    this.sun.color.copy(mix('#a9bcff', '#ffcf9a'));
    this.sun.intensity = 0.45 + 1.15 * k;
    (this.scene.background as THREE.Color).copy(mix('#0a0c1c', '#3b2638'));
  }

  // Fundo da tela de título: a câmera gira devagar em volta do mapa. Ao parar, volta ao quarto de volta mais perto,
  // senão as setas andariam na diagonal (gridStep conta com o ângulo de 45° + n·90°).
  private spinning = false;
  setSpin(on: boolean) {
    if (this.spinning && !on) this.yawTarget = Math.PI / 4 + Math.round((this.yawTarget - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
    this.spinning = on;
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

  // Números do contador de desempenho (pedido do Fernando, 12/11): quadros e tempo médio desde a última leitura, e os
  // recursos do Three. O pixel art desenha a cena mais de uma vez por quadro: o info soma tudo e zera só no começo do quadro.
  private perf = { frames: 0, since: performance.now() };
  stats() {
    const now = performance.now(), ms = now - this.perf.since, frames = this.perf.frames;
    this.perf = { frames: 0, since: now };
    const info = this.renderer.info;
    return { fps: (frames * 1000) / ms, ms: frames ? ms / frames : 0, calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
  }

  private frame() {
    this.perf.frames++;
    this.renderer.info.reset();
    const dt = this.clock.getDelta();
    const fast = speed();
    this.t += dt * 1000 * fast;
    for (const a of [...this.anims]) {
      const k = Math.min(1, (this.t - a.start) / a.dur);
      a.step(k);
      if (k < 1) continue;
      this.anims.splice(this.anims.indexOf(a), 1);
      a.done();
    }
    if (this.spinning) this.yawTarget += dt * 0.15; // ~42 s por volta: dá para ver o mapa sem enjoar
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 10);
    if (this.focusGoal) this.focus.lerp(this.focusGoal, Math.min(1, dt * 6));
    // dt*30: chega em ~0,1 s, rápido para não atrasar quem segura a seta, macio para o olho seguir
    this.cursor.position.lerp(this.cursorGoal, Math.min(1, dt * 30));
    this.cursor.getObjectByName('arrow')!.position.y = MARKER.arrowY + Math.sin(performance.now() / 250) * MARKER.arrowBob;
    // casas marcadas respiram (±20% da opacidade, ciclo de ~1,9 s): o mapa parece vivo e a área se lê sem piscar forte
    const breath = 0.8 + 0.2 * Math.sin(performance.now() / 300);
    for (const m of this.marks.values()) if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = m.userData.base * breath;
    // tremor do golpe forte: desloca o foco só neste quadro, some sozinho (nada acumula no foco de verdade)
    const s = this.t < this.shakeUntil ? 0.12 * ((this.shakeUntil - this.t) / TIMING.shake) : 0;
    const jitter = new THREE.Vector3(Math.sin(this.t * 0.09) * s, 0, Math.cos(this.t * 0.13) * s);
    this.focus.add(jitter);
    this.placeCamera();
    this.focus.sub(jitter);
    for (const v of this.units.values()) {
      if (this.t >= this.frozenUntil) v.mixer?.update(dt * fast);
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
