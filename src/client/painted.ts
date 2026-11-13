// Peças pintadas feitas por código (13/11, pedido do Fernando: o Bosque no estilo pintado que ele escolheu, "tipo FFT"):
// árvores (trees.ts) e objetos (props.ts) usam um material só. A cor vem pintada vértice a vértice (massas de tom, mais
// claras em cima e escuras embaixo, como a luz pintada à mão) e uma textura neutra de manchas (tex/paint.jpg, gerada por
// scripts/assets/paint-textures.py, a mesma receita do chão) quebra a cor lisa de perto. Um material, uma malha por peça:
// uma chamada de desenho por modelo. Convenção das peças: y = 0 é o chão; o que desce abaixo disso (raiz, saia do tronco)
// entra na terra. `userData.box` é a caixa acima do chão, a que vale para medir e escalar a peça.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const painted = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
painted.color.setScalar(1.35); // a textura de manchas escurece em média 25%
painted.userData.procedural = true; // sem o granulado de detail.ts e com mipmap (prepare e Ambience.material respeitam)

let loading: Promise<void> | null = null;
export const loadPaint = () => (loading ??= new THREE.TextureLoader().loadAsync('/tex/paint.jpg').then((t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  painted.map = t;
  painted.needsUpdate = true;
}));

// caixa da peça acima do chão (as pintadas dizem a sua; as do KayKit são medidas)
export const boxOf = (o: THREE.Object3D): THREE.Box3 => (o.userData.box as THREE.Box3 | undefined) ?? new THREE.Box3().setFromObject(o);

// variações de uma peça: `nome`, `nome~1`, `nome~2`… no mesmo mapa de peças; `r` (0 a 1) sorteia uma
export function variant(pieces: Map<string, THREE.Object3D>, name: string, r: number): string {
  let n = 1;
  while (pieces.has(`${name}~${n}`)) n++;
  const i = Math.min(n - 1, Math.floor(r * n));
  return i ? `${name}~${i}` : name;
}

export const UP = new THREE.Vector3(0, 1, 0);
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const tones = (...hex: string[]) => hex.map((h) => new THREE.Color(h));
export const rng = (seed: number) => {
  let s = (Math.abs(Math.floor(seed)) * 9301 + 49297) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
// ruído barato de -1 a 1, fixo pela semente
export const noise3 = (x: number, y: number, z: number, s: number) =>
  0.65 * Math.sin(x * 2.1 + s) * Math.sin(y * 2.7 + s * 1.3) * Math.sin(z * 2.3 + s * 0.7) + 0.35 * Math.sin(x * 4.7 + s * 2) * Math.sin(y * 5.3 + s) * Math.sin(z * 4.1 + s * 3);

// cor na escala de tons (do escuro ao claro), t de 0 a 1; devolve sempre o mesmo objeto (copie antes de guardar)
const RAMP = new THREE.Color();
export function ramp(stops: THREE.Color[], t: number): THREE.Color {
  const k = THREE.MathUtils.clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k));
  // degrau entre um tom e o outro, com a passagem curta: massas de tom, como tinta, em vez de um degradê
  return RAMP.copy(stops[i]).lerp(stops[i + 1], THREE.MathUtils.smoothstep(k - i, 0.3, 0.7));
}

// UV pela face (projeção de caixa): a textura não estica em nenhuma direção; normais por face (facetado, como os bonecos)
export function boxUV(g: THREE.BufferGeometry, scale = 0.8, facet = true): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position'), uv = new Float32Array(p.count * 2);
  const a = V(), b = V(), c = V(), n = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      uv.set(ay >= ax && ay >= az ? [x * scale, z * scale] : ax >= az ? [z * scale, y * scale] : [x * scale, y * scale], (i + k) * 2);
    }
  }
  src.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (facet) src.computeVertexNormals();
  return src;
}

export interface Ring { p: THREE.Vector3; r: number }
interface TubeOpts {
  flat?: boolean; // anéis deitados (tronco de pé); sem isto, cada anel fica de frente para o caminho (galho, raiz)
  shape?: (a: number, i: number) => number; // fator do raio pelo ângulo e pelo anel (sapopema, ponta de galho)
  lift?: (a: number, i: number) => number; // sobe ou desce o vértice (ponta caída do ramo do pinheiro)
  v?: number; // repetições da textura por metro ao longo do tubo
}
// tubo de anéis ao longo de um caminho, com normais lisas; a cor de cada vértice vem de `tint`
export function tube(rings: Ring[], sides: number, tint: (p: THREE.Vector3, i: number, a: number) => THREE.Color, o: TubeOpts = {}): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const q = new THREE.Quaternion(), v = V(), tan = V();
  let len = 0;
  rings.forEach((ring, i) => {
    if (i) len += ring.p.distanceTo(rings[i - 1].p);
    if (!o.flat) q.setFromUnitVectors(UP, tan.subVectors(rings[Math.min(rings.length - 1, i + 1)].p, rings[Math.max(0, i - 1)].p).normalize());
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2, r = ring.r * (o.shape?.(a, i) ?? 1);
      v.set(Math.cos(a) * r, o.lift?.(a, i) ?? 0, Math.sin(a) * r).applyQuaternion(q).add(ring.p);
      pos.push(v.x, v.y, v.z);
      const c = tint(v, i, a);
      col.push(c.r, c.g, c.b);
      uv.push(j / sides, len * (o.v ?? 1));
    }
    if (i) for (let j = 0; j < sides; j++) {
      const a = (i - 1) * (sides + 1) + j, c = a + sides + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

interface LumpOpts { rough?: number; under?: number; detail?: number; uv?: number; facet?: boolean }
// massa amassada por ruído (tufo de copa, pedra, saco): bola de poucas faces, mais chata embaixo (`under`)
export function lump(at: THREE.Vector3, rx: number, ry: number, rz: number, seed: number, tint: (p: THREE.Vector3, d: THREE.Vector3) => THREE.Color, o: LumpOpts = {}): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 1);
  const p = g.getAttribute('position'), nor = g.getAttribute('normal'), d = V(), v = V(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const k = 1 + (o.rough ?? 0.28) * noise3(d.x, d.y, d.z, seed);
    v.set(d.x * rx * k, d.y * ry * k * (d.y < 0 ? (o.under ?? 0.55) : 1), d.z * rz * k).add(at);
    p.setXYZ(i, v.x, v.y, v.z);
    tint(v, d).toArray(col, i * 3);
    // normal lisa (a da bola esticada): a massa pega a luz como um volume só e o tom pintado manda
    if (!o.facet) { v.set(d.x / rx, d.y / ry, d.z / rz).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return boxUV(g, o.uv, !!o.facet);
}

// caixa pintada: uma cor por face (cima, lados, baixo), girada e posta no lugar
export function slab(w: number, h: number, d: number, at: THREE.Vector3, top: THREE.Color, side: THREE.Color, turn = 0, tilt = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const n = g.getAttribute('normal'), col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const y = n.getY(i);
    RAMP.copy(y > 0.5 ? top : side).multiplyScalar(y < -0.5 ? 0.45 : y > 0.5 ? 1 : 0.72 + 0.28 * Math.abs(n.getX(i))).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateZ(tilt).rotateY(turn).translate(at.x, at.y, at.z);
  return boxUV(g);
}

// junta as partes numa malha só, com a caixa acima do chão (largura w, altura h) para quem mede e escala
export function piece(parts: THREE.BufferGeometry[], w: number, h: number, extra: Record<string, unknown> = {}): THREE.Group {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(g, painted);
  mesh.castShadow = mesh.receiveShadow = true;
  const out = new THREE.Group().add(mesh);
  Object.assign(out.userData, { box: new THREE.Box3(V(-w / 2, 0, -w / 2), V(w / 2, h, w / 2)), ...extra });
  return out;
}
