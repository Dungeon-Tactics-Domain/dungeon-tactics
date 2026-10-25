// POC descartável (spike): compara grade quadrada e hexagonal para o Dungeon Tactics.
// Não é o esqueleto do jogo; nada daqui vai para src/ sem passar pelo desenho aprovado.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

type Grade = 'quadrada' | 'hex';
type Cell = { c: number; r: number; h: number; tree: boolean };
type Unit = { name: string; c: number; r: number; move: number; jump: number; kind: 'empurrar' | 'arco' | 'magia'; enemy: boolean; obj: THREE.Object3D };

const params = new URLSearchParams(location.search);
const grade: Grade = params.get('grade') === 'hex' ? 'hex' : 'quadrada';
const N = 10;
const STEP = 0.5; // altura de um nível em metros de mundo (1 casa = 1 de largura)
const HEX_DZ = Math.sqrt(3) / 2; // distância entre fileiras de hexágono pontudo com largura 1

// mesmo relevo nas duas grades: platô alto num canto, encosta em degraus, vale e um morro solto
function height(c: number, r: number) {
  if (c >= 6 && r <= 3) return 3;
  if (c >= 5 && r <= 4) return 2;
  if (c >= 4 && r <= 5) return 1;
  if (c <= 2 && r >= 6 && r <= 8) return 2;
  if (c === 3 && r === 7) return 1;
  return 0;
}
const TREES = new Set(['2,2', '3,2', '7,6', '8,7', '1,4', '5,8']);
const cells: Cell[][] = [];
for (let r = 0; r < N; r++) {
  cells.push([]);
  for (let c = 0; c < N; c++) cells[r].push({ c, r, h: height(c, r), tree: TREES.has(`${c},${r}`) });
}
const cell = (c: number, r: number) => (c >= 0 && r >= 0 && c < N && r < N ? cells[r][c] : null);

function toWorld(c: number, r: number) {
  return grade === 'hex' ? new THREE.Vector3(c + (r & 1) * 0.5 - N / 2, 0, r * HEX_DZ - (N * HEX_DZ) / 2) : new THREE.Vector3(c - N / 2 + 0.5, 0, r - N / 2 + 0.5);
}
const top = (cl: Cell) => (cl.h + 1) * STEP;

// vizinhos: quadrada em 4 direções (como FFT), hexagonal em 6 (deslocamento "odd-r")
function neighbors(c: number, r: number): [number, number][] {
  if (grade === 'quadrada') return [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
  const odd = r & 1;
  return odd
    ? [[c + 1, r], [c - 1, r], [c, r - 1], [c + 1, r - 1], [c, r + 1], [c + 1, r + 1]]
    : [[c + 1, r], [c - 1, r], [c - 1, r - 1], [c, r - 1], [c - 1, r + 1], [c, r + 1]];
}
function dist(a: { c: number; r: number }, b: { c: number; r: number }) {
  if (grade === 'quadrada') return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
  const cube = (p: { c: number; r: number }) => { const x = p.c - (p.r - (p.r & 1)) / 2; return [x, p.r, -x - p.r]; };
  const [ax, ay, az] = cube(a), [bx, by, bz] = cube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// ---------- cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: false });
// pixel art: desenha em 1x mesmo em tela 3x; os blocos já são maiores que o pixel do aparelho e o celular agradece
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7fb4d9');
scene.add(new THREE.HemisphereLight('#fff6e0', '#4a5a3a', 1.1));
const sun = new THREE.DirectionalLight('#ffffff', 1.7);
sun.position.set(-6, 12, 4);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// câmera ortográfica no ângulo do FFT: o RenderPixelatedPass foi feito para ela (o Warlock usava perspectiva + remendo no shader)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
let viewH = 9; // metros de mundo na altura da tela
let yaw = Math.PI / 4, yawTarget = yaw;
const PITCH = THREE.MathUtils.degToRad(32);
const focus = new THREE.Vector3();

let pixelSize = 3;
const composer = new EffectComposer(renderer);
const pixelPass = new RenderPixelatedPass(pixelSize, scene, camera, { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 });
composer.addPass(pixelPass);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  const a = innerWidth / innerHeight;
  // celular em pé: abre o quadro até a largura mostrar ~10 m (meio-termo: o mapa inteiro deixa os bonecos com 3 px; pinça para ajustar)
  const h = a < 1 ? (viewH * 1.15) / a : viewH;
  Object.assign(camera, { left: (-h * a) / 2, right: (h * a) / 2, top: h / 2, bottom: -h / 2 });
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function placeCamera() {
  const d = 30;
  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH)).multiplyScalar(d);
  camera.position.copy(focus).add(off);
  camera.lookAt(focus);
  camera.updateMatrixWorld();
  // trava a câmera na grade de pixels (mesma ideia do Warlock): sem isso o chão "ferve" quando a câmera anda
  const block = ((camera.top - camera.bottom) / innerHeight) * pixelSize;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const px = camera.position.dot(right), py = camera.position.dot(up);
  camera.position.addScaledVector(right, Math.round(px / block) * block - px).addScaledVector(up, Math.round(py / block) * block - py);
  camera.updateMatrixWorld();
}

// ---------- modelos ----------
const loader = new GLTFLoader();
const load = (url: string) => loader.loadAsync(url).then((g) => g);
const dir = `/models/poc/${grade === 'hex' ? 'hex' : 'quadrado'}/`;
const [topM, sideM, treeM] = await Promise.all(
  // a árvore do pack de hexágonos serve às duas (a do pack de blocos é um cubo de folhas)
  [...(grade === 'hex' ? ['hex_grass', 'hex_grass_bottom'] : ['dirt_with_grass', 'dirt']).map((n) => load(dir + n + '.gltf')), load('/models/poc/hex/tree_single_A.gltf')],
);
// as texturas KayKit são paletas de cor: com mipmap, o render em baixa resolução do pixel art mistura cores vizinhas
// (a grama do hexágono virava amarela); sem mipmap cada face pega a cor certa da paleta
function shadowy(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const map = (mesh.material as THREE.MeshStandardMaterial).map;
    if (map && map.generateMipmaps) Object.assign(map, { generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, needsUpdate: true });
  });
  return o;
}

// normaliza um modelo de chão para 1 casa de largura e STEP de altura, com o topo em y = 0
function tilePiece(src: THREE.Object3D) {
  const o = src.clone();
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const sx = grade === 'hex' ? 1 / size.x : 1 / size.x;
  o.scale.set(sx, STEP / size.y, sx);
  o.position.y = -box.max.y * (STEP / size.y);
  const g = new THREE.Group();
  g.add(o);
  return shadowy(g);
}
const topPiece = tilePiece(topM.scene), sidePiece = tilePiece(sideM.scene);

const tileTops: THREE.Object3D[] = [];
const board = new THREE.Group();
scene.add(board);
for (const row of cells) for (const cl of row) {
  const p = toWorld(cl.c, cl.r);
  for (let k = 0; k <= cl.h; k++) {
    const piece = (k === cl.h ? topPiece : sidePiece).clone();
    piece.position.set(p.x, (k + 1) * STEP, p.z);
    piece.userData.cell = cl;
    board.add(piece);
    if (k === cl.h) tileTops.push(piece);
  }
  if (cl.tree) {
    const t = shadowy(treeM.scene.clone());
    const b = new THREE.Box3().setFromObject(t);
    const s = 1.1 / (b.max.y - b.min.y);
    t.scale.setScalar(s);
    t.position.set(p.x, top(cl) - b.min.y * s, p.z);
    board.add(t);
  }
}

// marcadores de alcance: uma placa fina em cima de cada casa, recolorida conforme o modo
const markGeo = grade === 'hex' ? new THREE.CircleGeometry(0.5, 6) : new THREE.PlaneGeometry(0.92, 0.92);
markGeo.rotateX(-Math.PI / 2);
if (grade === 'hex') markGeo.rotateY(Math.PI / 6);
const marks = new Map<Cell, THREE.Mesh>();
for (const row of cells) for (const cl of row) {
  const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.65, depthWrite: false }));
  const p = toWorld(cl.c, cl.r);
  m.position.set(p.x, top(cl) + 0.02, p.z);
  m.visible = false;
  m.userData.cell = cl;
  scene.add(m);
  marks.set(cl, m);
}

// ---------- unidades ----------
async function unit(file: string, name: string, c: number, r: number, kind: Unit['kind'], enemy: boolean, move = 4, jump = 1): Promise<Unit> {
  const g = await load(`/models/${file}.glb`);
  const o = shadowy(g.scene);
  const b = new THREE.Box3().setFromObject(o);
  o.scale.setScalar(0.85 / (b.max.y - b.min.y));
  const holder = new THREE.Group();
  holder.add(o);
  scene.add(holder);
  const idle = g.animations.find((a) => /idle/i.test(a.name)) ?? g.animations[0];
  if (idle) { const mix = new THREE.AnimationMixer(o); mix.clipAction(idle).play(); mixers.push(mix); }
  const u: Unit = { name, c, r, move, jump, kind, enemy, obj: holder };
  placeUnit(u);
  return u;
}
const mixers: THREE.AnimationMixer[] = [];
function placeUnit(u: Unit) {
  const cl = cell(u.c, u.r)!;
  const p = toWorld(u.c, u.r);
  u.obj.position.set(p.x, top(cl), p.z);
}
const units = await Promise.all([
  unit('knight', 'Cavaleiro', 1, 1, 'empurrar', false),
  unit('rogue', 'Arqueira', 7, 1, 'arco', false),
  unit('mage', 'Maga', 2, 8, 'magia', false),
  unit('skeleton_warrior', 'Esqueleto', 5, 6, 'empurrar', true),
  unit('skeleton_rogue', 'Esqueleto arqueiro', 8, 8, 'arco', true),
]);
for (const u of units) if (u.enemy) u.obj.rotation.y = Math.PI;
const unitAt = (c: number, r: number) => units.find((u) => u.c === c && u.r === r);

// ---------- regras da POC ----------
// movimento: busca em largura; subir ou descer mais que `jump` níveis por passo bloqueia; árvore e unidade bloqueiam
function moveRange(u: Unit) {
  const out = new Map<Cell, number>();
  const start = cell(u.c, u.r)!;
  const q: [Cell, number][] = [[start, 0]];
  const seen = new Set([start]);
  while (q.length) {
    const [cl, d] = q.shift()!;
    if (d > 0) out.set(cl, d);
    if (d === u.move) continue;
    for (const [nc, nr] of neighbors(cl.c, cl.r)) {
      const n = cell(nc, nr);
      if (!n || seen.has(n) || n.tree || Math.abs(n.h - cl.h) > u.jump) continue;
      const other = unitAt(nc, nr);
      if (other && other.enemy !== u.enemy) continue;
      seen.add(n);
      q.push([n, d + 1]);
    }
  }
  for (const k of [...out.keys()]) if (unitAt(k.c, k.r)) out.delete(k); // passa por aliado, mas não para em cima
  return out;
}
// linha de visão: amostra o caminho entre os dois e bloqueia se o terreno (ou uma árvore) passar acima da linha
function lineOfSight(a: Cell, b: Cell) {
  const pa = toWorld(a.c, a.r).setY(top(a) + 0.6), pb = toWorld(b.c, b.r).setY(top(b) + 0.4);
  for (let i = 1; i < 24; i++) {
    const p = pa.clone().lerp(pb, i / 24);
    const cl = pick2d(p.x, p.z);
    if (!cl || cl === a || cl === b) continue;
    const blockTop = top(cl) + (cl.tree ? 1 : 0);
    if (blockTop > p.y) return false;
  }
  return true;
}
function pick2d(x: number, z: number) {
  let best: Cell | null = null, bd = Infinity;
  for (const row of cells) for (const cl of row) { const p = toWorld(cl.c, cl.r); const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = cl; } }
  return best;
}
type Target = { cell: Cell; ok: boolean };
// ação: arco alcança 4 casas +1 por nível acima do alvo e precisa ver; empurrar e magia pegam a casa vizinha / até 3
function actionRange(u: Unit): Target[] {
  const from = cell(u.c, u.r)!;
  const out: Target[] = [];
  for (const row of cells) for (const cl of row) {
    const d = dist(u, cl);
    if (d === 0) continue;
    if (u.kind === 'empurrar' && d === 1 && Math.abs(cl.h - from.h) <= 1) out.push({ cell: cl, ok: true });
    if (u.kind === 'magia' && d <= 3) out.push({ cell: cl, ok: true });
    if (u.kind === 'arco' && d >= 2 && d <= 4 + Math.max(0, from.h - cl.h)) out.push({ cell: cl, ok: lineOfSight(from, cl) });
  }
  return out;
}
// empurrão: a vítima vai uma casa para longe; se a casa for mais baixa ela cai (dano de queda), se for parede ou árvore bate
function push(by: Unit, victim: Unit) {
  const dirs = neighbors(by.c, by.r);
  const i = dirs.findIndex(([c, r]) => c === victim.c && r === victim.r);
  if (i < 0) return 'longe demais';
  const [nc, nr] = neighbors(victim.c, victim.r)[i];
  const to = cell(nc, nr), from = cell(victim.c, victim.r)!;
  if (!to || to.tree || unitAt(nc, nr) || to.h > from.h) return `${victim.name} bateu e ficou no lugar`;
  victim.c = nc; victim.r = nr;
  placeUnit(victim);
  const fall = from.h - to.h;
  return fall > 0 ? `${victim.name} caiu ${fall} nível(is)` : `${victim.name} foi empurrado`;
}

// ---------- interface ----------
let selected: Unit | null = units[0];
let mode: 'mover' | 'acao' = 'mover';
let msg = '';
const info = document.getElementById('info')!;
const $ = (id: string) => document.getElementById(id) as HTMLButtonElement;
$('grade').textContent = grade === 'hex' ? 'Ver quadrada' : 'Ver hexagonal';
$('grade').onclick = () => { location.search = `?grade=${grade === 'hex' ? 'quadrada' : 'hex'}`; };
$('mover').onclick = () => { mode = 'mover'; refresh(); };
$('acao').onclick = () => { mode = 'acao'; refresh(); };
const turnStep = grade === 'hex' ? Math.PI / 3 : Math.PI / 2;
$('girarE').onclick = () => { yawTarget -= turnStep; };
$('girarD').onclick = () => { yawTarget += turnStep; };
$('pixel').onclick = () => {
  pixelSize = pixelSize === 3 ? 4 : pixelSize === 4 ? 2 : 3;
  pixelPass.setPixelSize(pixelSize);
  $('pixel').textContent = `Pixel ${pixelSize}`;
};

function refresh() {
  for (const m of marks.values()) m.visible = false;
  $('mover').classList.toggle('on', mode === 'mover');
  $('acao').classList.toggle('on', mode === 'acao');
  const paint = (cl: Cell, color: string) => { const m = marks.get(cl)!; (m.material as THREE.MeshBasicMaterial).color.set(color); m.visible = true; };
  if (selected) {
    paint(cell(selected.c, selected.r)!, '#ffd479');
    if (mode === 'mover') for (const cl of moveRange(selected).keys()) paint(cl, '#4aa8ff');
    else for (const t of actionRange(selected)) paint(t.cell, t.ok ? '#ff2020' : '#2a0a4a');
  }
  const help = mode === 'mover' ? 'azul = pode andar (altura máx. 1 nível por passo)' : selected?.kind === 'arco' ? 'vermelho = acerta · roxo = no alcance mas sem visão (altura/árvore) · alcance +1 por nível acima' : selected?.kind === 'empurrar' ? 'toque num inimigo vizinho para empurrar' : 'vermelho = alcance da magia';
  info.innerHTML = `<b>${grade === 'hex' ? 'Hexagonal' : 'Quadrada'}</b> · ${selected ? `${selected.name}` : 'toque numa unidade'} · ${help}${msg ? `<br>${msg}` : ''}`;
}

const ray = new THREE.Raycaster();
function cellAtScreen(x: number, y: number): Cell | null {
  ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hits = ray.intersectObjects([...tileTops, ...units.map((u) => u.obj)], true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o && !o.userData.cell && !units.some((u) => u.obj === o)) o = o.parent;
    if (!o) continue;
    const u = units.find((v) => v.obj === o);
    return u ? cell(u.c, u.r) : o.userData.cell;
  }
  return null;
}
function tap(x: number, y: number) {
  const cl = cellAtScreen(x, y);
  if (!cl) return;
  const u = unitAt(cl.c, cl.r);
  msg = '';
  if (selected && mode === 'mover' && moveRange(selected).has(cl)) { selected.c = cl.c; selected.r = cl.r; placeUnit(selected); }
  else if (selected && mode === 'acao' && u && u !== selected) {
    const t = actionRange(selected).find((x) => x.cell === cl);
    if (!t) msg = 'fora do alcance';
    else if (!t.ok) msg = 'sem linha de visão';
    else msg = selected.kind === 'empurrar' ? push(selected, u) : `${selected.name} acertou ${u.name}`;
  } else if (u) { selected = u; }
  refresh();
}

// toque: arrastar com um dedo move a câmera, dois dedos dão zoom, toque curto escolhe a casa
const pointers = new Map<number, { x: number; y: number }>();
let downAt: { x: number; y: number; t: number } | null = null, moved = false, pinch = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) { viewH = THREE.MathUtils.clamp(viewH * (pinch / d), 4, 16); resize(); }
    pinch = d;
    return;
  }
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) moved = true;
  if (!moved) return;
  const k = (camera.top - camera.bottom) / innerHeight;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  focus.addScaledVector(right, -(e.clientX - prev.x) * k).addScaledVector(fwd, ((e.clientY - prev.y) * k) / Math.sin(PITCH));
});
const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { if (downAt && !moved) tap(e.clientX, e.clientY); downAt = null; pinch = 0; }
};
renderer.domElement.addEventListener('pointerup', up);
renderer.domElement.addEventListener('pointercancel', up);
addEventListener('wheel', (e) => { viewH = THREE.MathUtils.clamp(viewH * (e.deltaY > 0 ? 1.1 : 0.9), 4, 16); resize(); });
addEventListener('keydown', (e) => { if (e.key === 'q') yawTarget -= turnStep; if (e.key === 'e') yawTarget += turnStep; });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  yaw += (yawTarget - yaw) * Math.min(1, dt * 10);
  for (const m of mixers) m.update(dt);
  placeCamera();
  composer.render();
});
refresh();
