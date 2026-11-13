// Árvores feitas por código (13/11, pedido do Fernando: "as árvores assim não estão combinando com o jogo… construir as
// árvores na vibe do terreno"): as do KayKit são de desenho animado e o terreno é de foto (Poly Haven), então nos mapas
// abertos cada modelo de árvore vira uma árvore montada aqui, com as mesmas fotos CC0: tronco torto com casca
// (tex/bark.jpg) e copa de bolas de folhas amassadas por ruído (tex/foliage.jpg), mais escura embaixo (sombra da própria
// copa). Mesmo nome de modelo, mesmo lugar: quem chama (scene.ts, ambience.ts) só troca a peça.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Kind = 'oak' | 'pine' | 'bare' | 'bush';
const kindOf = (name: string): Kind | null =>
  /Bush/.test(name) ? 'bush' : /Tree_Bare/.test(name) ? 'bare' : /Tree_4/.test(name) ? 'pine' : /Tree_/.test(name) ? 'oak' : null;
export const isTreeModel = (name: string) => kindOf(name) !== null;

const mats: { bark: THREE.MeshStandardMaterial; leaf: THREE.MeshStandardMaterial } = {
  bark: new THREE.MeshStandardMaterial({ color: '#f0e6dc', roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#e6f0d8', roughness: 0.9, vertexColors: true }), // a textura pintada já é verde
};
mats.bark.userData.procedural = mats.leaf.userData.procedural = true; // sem o granulado de detail.ts: já têm foto

export async function loadTreeTextures() {
  const loader = new THREE.TextureLoader();
  const one = async (n: string, rx: number, ry: number) => {
    const t = await loader.loadAsync(`/tex/${n}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  [mats.bark.map, mats.leaf.map] = await Promise.all([one('bark', 1, 3), one('foliage', 3, 2)]);
}

// ruído barato e fixo pela semente
const noise = (x: number, y: number, z: number, s: number) => Math.sin(x * 5.1 + s) * Math.sin(y * 4.3 + s * 1.7) * Math.sin(z * 6.7 + s * 0.6);

function blob(r: number, at: THREE.Vector3, s: number) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.22 * noise(v.x / r, v.y / r, v.z / r, s); // amassada: sem cara de bola
    v.multiplyScalar(k).add(at);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// árvore de altura 1 (quem chama escala), base no chão (y = 0) e no meio em x e z
function build(kind: Kind, seed: number): THREE.Group {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const trunks: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  // tronco torto que abre na base, com raízes saindo para os lados e entrando no chão (13/11, pedido do Fernando: "as
  // árvores se conectassem melhor com o chão, com raízes"; referência: root_cluster e tree_stump do Poly Haven)
  const trunk = (h: number, r: number, lean: number) => {
    const g = new THREE.CylinderGeometry(r * 0.55, r, h, 8, 8, true).translate(0, h / 2, 0);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h, flare = 1 + 0.9 * Math.pow(Math.max(0, 1 - y * 4), 2); // pé mais largo
      p.setXYZ(i, p.getX(i) * flare + Math.sin(y * 2.2) * lean, p.getY(i), p.getZ(i) * flare);
    }
    trunks.push(g);
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const len = 0.16 + rnd() * 0.1, a = (k / n) * Math.PI * 2 + rnd() * 0.6;
      const root = new THREE.CylinderGeometry(0.006, r * 0.55, len, 5, 3).translate(0, len / 2, 0);
      // deita para fora e afunda a ponta: só o começo da raiz fica acima do chão
      root.rotateZ(-(1.2 + rnd() * 0.25)).rotateY(a).translate(0, 0.035, 0);
      trunks.push(root);
    }
  };
  if (kind === 'oak' || kind === 'bush') {
    const h = kind === 'bush' ? 0.1 : 0.42 + rnd() * 0.08;
    if (kind === 'oak') trunk(h + 0.15, 0.06, (rnd() - 0.5) * 0.08);
    const n = kind === 'bush' ? 3 : 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), d = kind === 'bush' ? 0.12 : 0.13 + rnd() * 0.1;
      const at = new THREE.Vector3(Math.cos(a) * d, (kind === 'bush' ? 0.15 : h + 0.18) + rnd() * 0.22, Math.sin(a) * d);
      leaves.push(blob(kind === 'bush' ? 0.16 : 0.17 + rnd() * 0.09, at, seed + i));
    }
    if (kind === 'oak') leaves.push(blob(0.22, new THREE.Vector3(0, h + 0.42, 0), seed + 99)); // topo
  } else if (kind === 'pine') {
    trunk(0.35, 0.05, 0);
    for (let i = 0; i < 4; i++) {
      const r = 0.3 - i * 0.06, y = 0.22 + i * 0.17;
      const g = new THREE.ConeGeometry(r, 0.34, 9, 3).translate(0, y + 0.17, 0);
      const p = g.getAttribute('position');
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (1 + 0.12 * noise(p.getX(k) * 4, p.getY(k) * 4, p.getZ(k) * 4, seed + i)));
      leaves.push(g);
    }
  } else {
    trunk(0.75, 0.06, (rnd() - 0.5) * 0.06);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CylinderGeometry(0.012, 0.03, 0.35, 5).translate(0, 0.17, 0);
      g.rotateZ(0.7 + rnd() * 0.4).rotateY(rnd() * Math.PI * 2).translate(0, 0.4 + i * 0.09, 0);
      trunks.push(g);
    }
  }
  const out = new THREE.Group();
  if (trunks.length) out.add(new THREE.Mesh(mergeGeometries(trunks.map((g) => g.toNonIndexed())), mats.bark)); // moita não tem tronco
  if (leaves.length) {
    const g = mergeGeometries(leaves.map((l) => (l.index ? l.toNonIndexed() : l)));
    g.computeVertexNormals();
    // sombra da própria copa: mais escura embaixo e por dentro
    const p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
    const box = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
    for (let i = 0; i < p.count; i++) {
      const k = 0.7 + 0.55 * THREE.MathUtils.smoothstep(p.getY(i), box.min.y, box.max.y);
      col.set([k, k, k], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.add(new THREE.Mesh(g, mats.leaf));
  }
  return out;
}

// troca as peças de árvore do KayKit pelas feitas aqui (mesmo nome, uma variação por modelo)
export function swapTrees(pieces: Map<string, THREE.Object3D>) {
  for (const name of pieces.keys()) {
    const k = kindOf(name);
    if (k) pieces.set(name, build(k, [...name].reduce((a, c) => a + c.charCodeAt(0), 0)));
  }
}
