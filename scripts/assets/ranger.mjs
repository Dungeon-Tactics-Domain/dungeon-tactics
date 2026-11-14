// Ranger with its own character (Nov 13, Fernando's request: "the archer has the same skin as the rogue, it should use another skin and use
// a bow as a weapon"). KayKit Adventurers only has 5 characters and all are already used, so the Ranger is the Rogue (rogue.glb) without the
// two knives and without the hood, with the green clothes tinted (the hooded Rogue stays green) and the KayKit Fantasy
// Weapons Bits bow_A_withString attached to the left hand bone (handslot.l), the hand that holds the bow in the Ranged_Bow_* gestures of animations.glb.
// Run once: node scripts/assets/ranger.mjs (generates public/models/ranger.glb; rogue.glb does not change, the fallen bodies use it)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// clothes tone: the Rogue's green (hue 80–170°) becomes wine red, so the Ranger and the Rogue are not confused from above
const HUE = 355,
  GREEN = [80, 170];
const BOW = 'assets/kaykit/fantasy-weapons/Assets/gltf/bow_A_withString.gltf';
const BOW_IDLE = ['assets/kaykit/animations/Animations/gltf/Rig_Medium/Rig_Medium_CombatRanged.glb', 'Ranged_Bow_Idle'];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/models/rogue.glb');
const root = doc.getRoot();
const node = (name) =>
  root.listNodes().find((n) => n.getName() === name) ??
  (() => {
    throw new Error(`no node ${name}: did rogue.glb change?`);
  })();

for (const name of ['Knife', 'Knife_Offhand', 'Rogue_Hood']) node(name).dispose();

// bow: merges the document and hangs the node on the hand, as the knives were (child of the handslot, which follows the animation)
mergeDocuments(doc, await io.read(BOW));
const bow = node('bow_A_withString');
for (const s of root.listScenes().slice(1)) s.dispose();
node('handslot.l').addChild(bow);
// the bow is long in X with the grip at the origin and the tips toward -Z; on the hand bone X points toward the arm when aiming: -90° in Y
// stands the bow upright with the tips forward and the string on the body's side (checked in the Ranged_Bow_Aiming_Idle screenshots)
bow.setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);

// idle with the bow: the Rogue's Idle becomes the KayKit Character Animations Ranged_Bow_Idle (same bones, linked by name).
// In the Rogue's Idle the hand stays at the side and the upright bow went through the body. The scene finds the clip by name, so no code changes
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
for (const c of idle.listChannels()) c.dispose();
for (const s of idle.listSamplers()) s.dispose();
const ranged = (await io.read(BOW_IDLE[0]))
  .getRoot()
  .listAnimations()
  .find((a) => a.getName() === BOW_IDLE[1]);
const buf = root.listBuffers()[0];
const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
for (const c of ranged.listChannels()) {
  const target = root.listNodes().find((n) => n.getName() === c.getTargetNode().getName());
  if (!target) continue;
  const s = c.getSampler();
  const sampler = doc
    .createAnimationSampler()
    .setInput(copy(s.getInput()))
    .setOutput(copy(s.getOutput()))
    .setInterpolation(s.getInterpolation());
  idle
    .addSampler(sampler)
    .addChannel(
      doc.createAnimationChannel().setTargetNode(target).setTargetPath(c.getTargetPath()).setSampler(sampler),
    );
}

// clothes tinted in the palette texture (pixel by pixel, only the greens); the bow has its own texture and does not change
const tex = root
  .listMaterials()
  .find((m) => m.getName() === 'rogue_texture')
  .getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage()))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d < 0.08) continue; // gray, white and black stay
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (h < GREEN[0] || h > GREEN[1]) continue;
  // same lightness and saturation (HSV), only the hue changes
  const s = d / max,
    f = (n) => {
      const k = (n + HUE / 60) % 6;
      return max - max * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
  [data[i], data[i + 1], data[i + 2]] = [f(5), f(3), f(1)].map((x) => Math.round(x * 255));
}
tex.setImage(new Uint8Array(await sharp(data, { raw: info }).png().toBuffer()));

// keepLeaves: IK nodes without a mesh are targets of the animations
await doc.transform(prune({ keepLeaves: true }), unpartition(), meshopt({ encoder: MeshoptEncoder }));
await io.write('public/models/ranger.glb', doc);
console.log('public/models/ranger.glb', root.listNodes().length, 'nodes');
