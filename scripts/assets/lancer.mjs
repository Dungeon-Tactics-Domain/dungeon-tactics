// Lancer with its own character (Nov 13, Fernando's request via the orchestrator: the new class had the Barbarian's character and
// needed its own, with a spear). Same approach as the Ranger (ranger.mjs): KayKit Adventurers only has 5 characters, so
// the Lancer is the Knight (knight.glb) without the sword, shield and cape, with the gray armor tinted teal steel and
// the KayKit Fantasy Weapons Bits spear_A attached to the right hand bone (handslot.r), where the sword was. Idle,
// it holds the spear with both hands (KayKit Character Animations Melee_2H_Idle in place of the Idle). Design and parts from
// KayKit (CC0), nothing copied from another game.
// Run once: node scripts/assets/lancer.mjs (generates public/models/lancer.glb; knight.glb does not change)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// armor tone: the Knight's gray becomes teal steel, so the Lancer and the Warrior are not confused from above.
// Without the cape almost no red is left on the character, and the belt and boots have the skin's hue: tinting by color caught the face
const STEEL = [0.56, 0.86, 0.9];
const SPEAR = 'assets/kaykit/fantasy-weapons/Assets/gltf/spear_A.gltf';
const SPEAR_IDLE = ['assets/kaykit/animations/Animations/gltf/Rig_Medium/Rig_Medium_CombatMelee.glb', 'Melee_2H_Idle'];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/models/knight.glb');
const root = doc.getRoot();
const node = (name) =>
  root.listNodes().find((n) => n.getName() === name) ??
  (() => {
    throw new Error(`sem o nó ${name}: o knight.glb mudou?`);
  })();

for (const name of ['1H_Sword', 'Round_Shield', 'Knight_Cape']) node(name).dispose();

// spear: merges the document and hangs the node on the right hand, as the sword was (child of the handslot, which follows the animation)
mergeDocuments(doc, await io.read(SPEAR));
const spear = node('spear_A');
for (const s of root.listScenes().slice(1)) s.dispose();
node('handslot.r').addChild(spear);

// idle with the spear in both hands: the Knight's Idle becomes Melee_2H_Idle (same bones, linked by name). The scene finds
// the clip by name, so no code changes
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
for (const c of idle.listChannels()) c.dispose();
for (const s of idle.listSamplers()) s.dispose();
const twoHands = (await io.read(SPEAR_IDLE[0]))
  .getRoot()
  .listAnimations()
  .find((a) => a.getName() === SPEAR_IDLE[1]);
const buf = root.listBuffers()[0];
const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
for (const c of twoHands.listChannels()) {
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

// armor tinted in the palette texture (pixel by pixel, only the mid grays); the spear has its own texture and does not change
const tex = root
  .listMaterials()
  .find((m) => m.getName() === 'knight_texture')
  .getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage()))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]),
    min = Math.min(data[i], data[i + 1], data[i + 2]);
  if (max - min > 20 || max < 50 || max > 235) continue; // color (skin, leather), black and white (eyes) stay
  for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * STEEL[c]);
}
tex.setImage(new Uint8Array(await sharp(data, { raw: info }).png().toBuffer()));

// keepLeaves: IK nodes without a mesh are targets of the animations
await doc.transform(prune({ keepLeaves: true }), unpartition(), meshopt({ encoder: MeshoptEncoder }));
await io.write('public/models/lancer.glb', doc);
console.log('public/models/lancer.glb', root.listNodes().length, 'nós');
