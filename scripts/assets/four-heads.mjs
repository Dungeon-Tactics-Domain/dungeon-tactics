// Human proportions for the KayKit figures (Nov 25, Fernando: the chibis, about 2 heads tall, become 3, 4 and 5 heads
// tall, legs about 47% of the height, with shoulders; picked in Debug › Models, client bodies.ts).
// The rest pose and mesh are reshaped together in glTF space: head scaled down, legs and torso stretched piecewise in
// height, the top of the chest widened into shoulders, arms long enough to reach the thigh. Inverse bind matrices follow.
// No bone scale is used, because every clip keys scale on every bone and would undo it.
// Rest rotations stay the same, so every clip's rotations still fit. Each translation key moves by its bone's rest shift.
// The hips' own motion (crouch, fall to the ground) grows with the legs.
// The pack's clips (animations.glb) are baked in under the same names, remapped the same way. unit-view.ts plays the
// model's own clip first, so these copies win over the stock pack.
// Done in gltf-transform, not Blender: Blender re-orients each armature's bones on import, so pack clips moved onto
// another armature came out twisted (measured Nov 25).
// node scripts/assets/four-heads.mjs → public/models/<id>_{3h,4h,5h}.glb for the 10 humanoids; <id>.glb does not change.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Color, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';

// the stock Knight's landmarks (Blender measure, Nov 25)
const ANKLE = 0.145;
const KNEE = 0.292;
const CROTCH = 0.515;
const NECK = 1.18; // bottom of the head mesh, the head's pivot
const ARMPIT = 1.107; // the arms' height in the T pose
const SHOULDER = 0.212; // the arms leave the chest here
const WRIST = 0.713;
const HEAD = 1.1;
const LEG_X = 0.171;

// heads: head height = total / heads; legs: crotch height over the total (a person is about 0.5); width, legs and
// arms: thickness factors, picked by eye so the longer body is not a stick; shoulders: extra chest width at the armpit
const SHAPES = {
  '3h': { heads: 3, scale: 0.68, legs: 0.42, width: 0.95, legW: 1.1, armW: 1.05, shoulders: 0.18 },
  '4h': { heads: 4, scale: 0.55, legs: 0.47, width: 1.0, legW: 1.2, armW: 1.1, shoulders: 0.22 },
  '5h': { heads: 5, scale: 0.5, legs: 0.47, width: 1.12, legW: 1.3, armW: 1.18, shoulders: 0.25 },
};

function shape({ heads, scale, legs, width, legW, armW, shoulders }) {
  const total = HEAD * scale * heads;
  const crotch = legs * total;
  const neck = total - HEAD * scale;
  const knee = ANKLE + (crotch - ANKLE) * 0.476; // thigh 1.1 times the shin, as the 16/11 armour legs
  const lerp = (y, a, b, c, d) => c + ((y - a) / (b - a)) * (d - c);
  const up = (y) =>
    y <= ANKLE
      ? y
      : y <= KNEE
        ? lerp(y, ANKLE, KNEE, ANKLE, knee)
        : y <= CROTCH
          ? lerp(y, KNEE, CROTCH, knee, crotch)
          : y <= NECK
            ? lerp(y, CROTCH, NECK, crotch, neck)
            : neck + (y - NECK);
  // the chest widens from the waist up to the armpit, so the arms hang from shoulders instead of the ribs
  const smooth = (a, b, y) => {
    const t = Math.min(1, Math.max(0, (y - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const chestW = (y) => width * (1 + shoulders * smooth(0.8, ARMPIT, y));
  const shoulderX = SHOULDER * chestW(ARMPIT);
  const armpitY = up(ARMPIT);
  // arms down the side reach mid-thigh: shoulder to wrist about the armpit's height over the crotch
  const armK = (armpitY - crotch) / (WRIST - SHOULDER);
  const wristX = shoulderX + armK * (WRIST - SHOULDER);
  const body = (p) => new Vector3(p.x * chestW(p.y), up(p.y), p.z * width);
  const leg = (p) => {
    const cx = Math.sign(p.x) * LEG_X;
    return new Vector3(cx * width + (p.x - cx) * legW, up(p.y), p.z * legW);
  };
  const arm = (p) => {
    const x = Math.abs(p.x);
    const along = x <= SHOULDER ? shoulderX * (x / SHOULDER) : shoulderX + armK * (x - SHOULDER);
    return new Vector3(Math.sign(p.x) * along, armpitY + (p.y - ARMPIT) * armW, p.z * armW);
  };
  const hand = (p) => {
    const s = Math.sign(p.x);
    return new Vector3(s * wristX + (p.x - s * WRIST) * armW, armpitY + (p.y - ARMPIT) * armW, p.z * armW);
  };
  const head = (p) =>
    new Vector3(0, neck, 0).add(
      p
        .clone()
        .sub(new Vector3(0, NECK, 0))
        .multiplyScalar(scale),
    );
  const warpOf = (bone) =>
    bone === 'head'
      ? head
      : /^(upperarm|lowerarm|elbowIK)/.test(bone)
        ? arm
        : /^(wrist|hand|handIK)/.test(bone)
          ? hand
          : /^(upperleg|lowerleg|foot|toes|kneeIK|heelIK|IK-|control-)/.test(bone)
            ? leg
            : body;
  return { warpOf, hand, hipsGrow: up(0.406) / 0.406, shoulderX, armpitY, crotch, total };
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const packDoc = await io.read('public/models/animations.glb');

const mat = (m) => new Matrix4().fromArray(m);
const posOf = (m) => new Vector3().setFromMatrixPosition(m);
const linear = (hex) => new Color(hex).toArray(); // three's Color stores linear values, as glTF wants
const STEEL = '#8d96a3';

async function build(out, cfg, who) {
  const { warpOf, hand, hipsGrow, shoulderX, armpitY } = shape(cfg);
  const doc = await io.read(`public/models/${who}.glb`);
  await doc.transform(dequantize()); // float positions: the warp moves vertices by fractions of the quantization step
  const root = doc.getRoot();
  const bones = new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName())));
  const nodes = root.listNodes();
  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  const oldWorld = new Map(nodes.map((n) => [n, mat(n.getWorldMatrix())]));
  const oldRest = new Map(nodes.map((n) => [n, n.getTranslation()]));

  // new rest: each bone's world position warped, rotations kept; parents first (listNodes is not ordered)
  const newWorld = new Map();
  const place = (n) => {
    if (newWorld.has(n)) return newWorld.get(n);
    const parent = n.getParentNode();
    const pw = parent ? place(parent) : new Matrix4();
    let w;
    if (bones.has(n.getName())) {
      const old = oldWorld.get(n);
      const q = new Quaternion();
      const s = new Vector3();
      old.decompose(new Vector3(), q, s);
      w = new Matrix4().compose(warpOf(n.getName())(posOf(old)), q, s);
      const local = pw.clone().invert().multiply(w);
      n.setTranslation(posOf(local).toArray());
    } else w = pw.clone().multiply(mat(n.getMatrix()));
    newWorld.set(n, w);
    return w;
  };
  for (const n of nodes) place(n);

  // each skinned mesh has its own skin (its quantization folded into the bind matrices): bind space -> world through
  // any of its joints at rest, the same matrix for all (checked), then new inverse binds that keep that matrix
  const bindOf = new Map();
  for (const skin of root.listSkins()) {
    const ibmAcc = skin.getInverseBindMatrices();
    const js = skin.listJoints();
    const bind = js.map((j, i) =>
      oldWorld
        .get(j)
        .clone()
        .multiply(mat(ibmAcc.getElement(i, []))),
    );
    for (const b of bind)
      if (b.elements.some((v, i) => Math.abs(v - bind[0].elements[i]) > 1e-4))
        throw new Error('joints disagree on the bind pose: the warp would tear the mesh');
    const ibm = new Float32Array(js.length * 16);
    js.forEach((j, i) => ibm.set(newWorld.get(j).clone().invert().multiply(bind[0]).elements, i * 16));
    ibmAcc.setArray(ibm);
    bindOf.set(skin, bind[0]);
  }

  const buf = root.listBuffers()[0];
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buf);
  const done = new Set();
  for (const n of nodes) {
    let mesh = n.getMesh();
    if (!mesh) continue;
    // a mesh worn twice (the Rogue's two knives) gets its own copy, so each is moved once with its own bone
    if (mesh.listPrimitives().some((p) => done.has(p.getAttribute('POSITION')))) {
      const copy = doc.createMesh(mesh.getName());
      for (const p of mesh.listPrimitives())
        copy.addPrimitive(p.clone().setAttribute('POSITION', p.getAttribute('POSITION').clone()));
      n.setMesh(copy);
      mesh = copy;
    }
    const parent = n.getParentNode();
    const pinned = parent && bones.has(parent.getName()) ? parent.getName() : null;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (done.has(pos)) throw new Error(`shared positions on ${n.getName()}: warp would apply twice`);
      done.add(pos);
      const out = new Float32Array(pos.getCount() * 3);
      const v = new Vector3();
      if (pinned) {
        // helmet with the head, cape with the body; weapons ride the hand at their own size
        const grip = posOf(oldWorld.get(parent));
        const move = pinned.startsWith('handslot') ? (p) => hand(grip).add(p.clone().sub(grip)) : warpOf(pinned);
        const from = oldWorld.get(n);
        const to = newWorld.get(n).clone().invert();
        for (let i = 0; i < pos.getCount(); i++)
          move(v.fromArray(pos.getElement(i, [])).applyMatrix4(from))
            .applyMatrix4(to)
            .toArray(out, i * 3);
      } else {
        const B = bindOf.get(n.getSkin());
        const Binv = B.clone().invert();
        const joints = n.getSkin().listJoints();
        const J = prim.getAttribute('JOINTS_0');
        const W = prim.getAttribute('WEIGHTS_0');
        for (let i = 0; i < pos.getCount(); i++) {
          const p = v.fromArray(pos.getElement(i, [])).applyMatrix4(B);
          const ji = J.getElement(i, []);
          const wi = W.getElement(i, []);
          const sum = new Vector3();
          let total = 0;
          for (let k = 0; k < 4; k++) {
            if (wi[k] <= 0) continue;
            sum.addScaledVector(warpOf(joints[ji[k]].getName())(p), wi[k]);
            total += wi[k];
          }
          sum
            .divideScalar(total)
            .applyMatrix4(Binv)
            .toArray(out, i * 3);
        }
      }
      pos.setArray(out);
    }
  }

  // shoulders: a steel pauldron riding the upper arm
  const steel = doc
    .createMaterial('pauldron')
    .setBaseColorFactor([...linear(STEEL), 1])
    .setMetallicFactor(0.6);
  // the pauldron is the Knight's: the other adventurers keep their own shoulders
  for (const side of who === 'knight' ? ['l', 'r'] : []) {
    const arm = root.listNodes().find((n) => n.getName().endsWith(side === 'l' ? '_ArmLeft' : '_ArmRight'));
    const skin = arm.getSkin();
    const joint = skin.listJoints().findIndex((j) => j.getName() === `upperarm.${side}`);
    const s = side === 'l' ? 1 : -1;
    const g = new SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)
      .scale(1.05, 0.75, 1)
      .rotateZ(-s * 0.35)
      .translate(s * (shoulderX + 0.06), armpitY + 0.05, 0);
    const Binv = bindOf.get(skin).clone().invert();
    const p = g.attributes.position;
    const nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++)
      v3.fromBufferAttribute(p, i)
        .applyMatrix4(Binv)
        .toArray(p.array, i * 3);
    const normal = new Matrix4().extractRotation(Binv);
    for (let i = 0; i < nrm.count; i++)
      v3.fromBufferAttribute(nrm, i)
        .applyMatrix4(normal)
        .normalize()
        .toArray(nrm.array, i * 3);
    const count = p.count;
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(p.array)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(nrm.array)))
      .setAttribute(
        'JOINTS_0',
        accessor(
          'VEC4',
          new Uint16Array(count * 4).map((_, i) => (i % 4 ? 0 : joint)),
        ),
      )
      .setAttribute(
        'WEIGHTS_0',
        accessor(
          'VEC4',
          new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)),
        ),
      )
      .setIndices(accessor('SCALAR', new Uint16Array(g.index.array)))
      .setMaterial(steel);
    arm.getMesh().addPrimitive(prim);
  }

  // clips: a translation key moves by its bone's rest shift; the hips' motion grows with the legs
  const remap = (values, from, to, k) => {
    const o = values.slice();
    for (let i = 0; i < o.length; i++) o[i] = to[i % 3] + (o[i] - from[i % 3]) * k;
    return o;
  };
  const shift = (channel, node, from) => {
    const s = channel.getSampler();
    const k = node.getName() === 'hips' ? hipsGrow : 1;
    s.setOutput(accessor('VEC3', remap(s.getOutput().getArray(), from, node.getTranslation(), k))); // fresh: outputs may be shared
  };
  for (const a of root.listAnimations())
    for (const c of a.listChannels())
      if (c.getTargetPath() === 'translation') shift(c, c.getTargetNode(), oldRest.get(c.getTargetNode()));

  const own = new Set(root.listAnimations().map((a) => a.getName()));
  const copy = (x) => accessor(x.getType(), x.getArray().slice());
  for (const a of packDoc.getRoot().listAnimations()) {
    if (own.has(a.getName())) continue;
    const anim = doc.createAnimation(a.getName());
    for (const c of a.listChannels()) {
      const node = byName.get(c.getTargetNode().getName());
      if (!node) continue;
      const s = c.getSampler();
      const t = doc
        .createAnimationSampler()
        .setInput(copy(s.getInput()))
        .setOutput(copy(s.getOutput()))
        .setInterpolation(s.getInterpolation());
      const ch = doc.createAnimationChannel().setTargetNode(node).setTargetPath(c.getTargetPath()).setSampler(t);
      anim.addSampler(t).addChannel(ch);
      if (c.getTargetPath() === 'translation') shift(ch, node, c.getTargetNode().getTranslation());
    }
  }

  await doc.transform(prune({ keepLeaves: true }), unpartition(), meshopt({ encoder: MeshoptEncoder }));
  await io.write(out, doc);
  console.log(out, root.listAnimations().length, 'clips');
}

const v3 = new Vector3();
// the 10 humanoids share KayKit's Rig_Medium, so the same warp fits each of them (Nov 25: the Knight's landmarks)
const HUMANOIDS = [
  'knight',
  'ranger',
  'mage',
  'rogue_hooded',
  'lancer',
  'barbarian',
  'skeleton_warrior',
  'skeleton_rogue',
  'skeleton_mage',
  'skeleton_minion',
];
const only = process.argv.slice(2); // a few ids to rebuild only those
for (const [name, cfg] of Object.entries(SHAPES))
  for (const who of HUMANOIDS.filter((h) => !only.length || only.includes(h)))
    await build(`public/models/${who}_${name}.glb`, cfg, who);
