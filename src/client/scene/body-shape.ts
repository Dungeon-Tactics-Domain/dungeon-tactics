// The woman's body on one unit's own copy of its model (Fernando, Nov 25; ported from the bonecos lab's body.ts):
// wider hips, narrow waist, a bust, slimmer arms. Each vertex follows the reshape of the bones that move it, measured
// at the file's rest; the bones never move, so every clip still fits.
import * as THREE from 'three';

// the lab's numbers, picked by eye on the 3 to 5 heads figures (widths as factors of the man's, the bust in heights)
const WOMAN = { hips: 1.15, waist: 0.8, chest: 0.88, bust: 0.06, arms: 0.85, thighs: 1.05, shins: 0.92 };

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
type Warp = (p: THREE.Vector3) => THREE.Vector3;
const v = new THREE.Vector3();
const sum = new THREE.Vector3();

// GLTFLoader drops the dots of bone names (upperleg.l becomes upperlegl)
const san = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

// the unit's own geometry in plain floats: the models are shared between units and quantized (KHR_mesh_quantization),
// so writing the packed ints would deform every unit of the kind, by rounding steps
function ownGeometry(mesh: THREE.Mesh) {
  const geo = mesh.geometry.clone();
  for (const k of ['position', 'normal'] as const) {
    const a = geo.getAttribute(k) as Attr;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) f.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    geo.setAttribute(k, new THREE.BufferAttribute(f, 3));
  }
  mesh.geometry = geo;
  return geo;
}

// the body in its file's rest pose (just cloned, before any clip plays): skeleton.pose() would trust every inverse
// bind, and some of the reshaped files' are stale for joints that move no vertex
export function shapeWoman(body: THREE.Object3D) {
  body.updateMatrixWorld(true);
  const rootInv = body.matrixWorld.clone().invert();
  const at = (name: string) =>
    body.getObjectByName(san(name))?.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv) ?? null;
  const meshes: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) meshes.push(m);
  });
  for (const m of meshes) box.expandByObject(m);
  const [legL, armL] = [at('upperleg.l'), at('upperarm.l')];
  if (!legL || !armL) return; // not KayKit's rig
  const crotch = legL.y,
    armpit = armL.y,
    total = (box.max.y - box.min.y) * rootInv.getMaxScaleOnAxis();
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  const bell = (d: number, r: number) => Math.exp(-(d * d) / (r * r));
  const widthAt = (y: number) => {
    const u = (y - crotch) / (armpit - crotch);
    return u < 0.45 ? lerp(WOMAN.hips, WOMAN.waist, u / 0.45) : lerp(WOMAN.waist, WOMAN.chest, (u - 0.45) / 0.55);
  };
  const bustY = lerp(crotch, armpit, 0.78);
  const torso: Warp = (p) => {
    const k = widthAt(p.y);
    const q = new THREE.Vector3(p.x * k, p.y, p.z * k);
    // KayKit characters face +z: the bust pushes the front only
    if (q.z > 0)
      for (const s of [1, -1])
        q.z += WOMAN.bust * total * bell(Math.hypot(p.x - s * 0.065 * total, p.y - bustY), 0.06 * total);
    return q;
  };
  // a limb thinner or thicker around its own bone segment, its length kept
  const limb = (a: string, b: string, k: number): Warp | null => {
    const A0 = at(a),
      B0 = at(b);
    if (!A0 || !B0) return null;
    const ab = B0.clone().sub(A0);
    return (p) => {
      const c = A0.clone().addScaledVector(ab, Math.min(1, Math.max(0, p.clone().sub(A0).dot(ab) / ab.lengthSq())));
      return c.add(p.clone().sub(c).multiplyScalar(k));
    };
  };
  const warps = new Map<string, Warp | null>(['root', 'hips', 'spine', 'chest'].map((b) => [b, torso]));
  for (const s of ['l', 'r']) {
    warps.set(san(`upperarm.${s}`), limb(`upperarm.${s}`, `lowerarm.${s}`, WOMAN.arms));
    warps.set(san(`lowerarm.${s}`), limb(`lowerarm.${s}`, `wrist.${s}`, (WOMAN.arms + 1) / 2));
    warps.set(san(`upperleg.${s}`), limb(`upperleg.${s}`, `lowerleg.${s}`, WOMAN.thighs));
    warps.set(san(`lowerleg.${s}`), limb(`lowerleg.${s}`, `foot.${s}`, WOMAN.shins));
  }
  const warpOf = (name: string) => warps.get(name) ?? null;

  for (const m of meshes) {
    let up = m.parent;
    while (up && !(up as THREE.Bone).isBone) up = up.parent;
    const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
    if (!skinned && (!up || /handslot/.test(up.name))) continue; // weapons stay as they are
    const pinned = skinned ? null : warpOf(up!.name);
    if (!skinned && !pinned) continue; // a hat or hood on the head: nothing to reshape
    const geo = ownGeometry(m);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const out = pos.array as Float32Array;
    const toRoot = rootInv.clone().multiply(m.matrixWorld);
    if (pinned) {
      const back = toRoot.clone().invert();
      for (let i = 0; i < pos.count; i++)
        pinned(v.fromArray(out, i * 3).applyMatrix4(toRoot))
          .applyMatrix4(back)
          .toArray(out, i * 3);
    } else {
      const sm = m as THREE.SkinnedMesh;
      // each vertex reaches the model's space through its main bone at rest (bind, bone, mesh)
      const mats = sm.skeleton.bones.map((b, j) =>
        toRoot
          .clone()
          .multiply(sm.bindMatrixInverse)
          .multiply(b.matrixWorld)
          .multiply(sm.skeleton.boneInverses[j])
          .multiply(sm.bindMatrix),
      );
      const invs = new Map<number, THREE.Matrix4>();
      const sk = geo.getAttribute('skinIndex') as Attr,
        sw = geo.getAttribute('skinWeight') as Attr;
      for (let i = 0; i < pos.count; i++) {
        let best = 0,
          moved = false;
        for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
        const main = sk.getComponent(i, best);
        const p = v.fromArray(out, i * 3).applyMatrix4(mats[main]);
        sum.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (w <= 0) continue;
          const f = warpOf(sm.skeleton.bones[sk.getComponent(i, k)].name);
          if (f) moved = true;
          sum.addScaledVector(f ? f(p) : p, w);
        }
        if (!moved) continue;
        if (!invs.has(main)) invs.set(main, mats[main].clone().invert());
        sum.applyMatrix4(invs.get(main)!).toArray(out, i * 3);
      }
    }
    geo.computeVertexNormals();
  }
}
