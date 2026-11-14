// Merges into a single glb the KayKit Character Animations 1.1 (Rig_Medium) clips that the abilities use (Nov 12, one
// gesture per ability, FFT style). The characters share the same bones: the scene applies the clips by bone name.
// node scripts/assets/anim-pack.mjs  →  public/models/animations.glb
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

const DIR = 'assets/kaykit/animations/Animations/gltf/Rig_Medium/';
const WANT = {
  'Rig_Medium_CombatMelee.glb': [
    'Melee_1H_Attack_Chop',
    'Melee_1H_Attack_Stab',
    'Melee_1H_Attack_Slice_Diagonal',
    'Melee_2H_Attack_Chop',
    'Melee_Block_Attack',
    'Melee_Unarmed_Attack_Punch_A',
  ],
  'Rig_Medium_CombatRanged.glb': [
    'Ranged_Bow_Aiming_Idle',
    'Ranged_Bow_Release',
    'Ranged_Magic_Shoot',
    'Ranged_Magic_Raise',
    'Ranged_Magic_Spellcasting',
  ],
  'Rig_Medium_General.glb': ['Use_Item'],
  // step-by-step walk and the jump in 3 parts (Nov 13, Fernando's request: slow walk and realistic jump on the steps)
  'Rig_Medium_MovementBasic.glb': ['Walking_A', 'Jump_Start', 'Jump_Idle', 'Jump_Land'],
};
const io = new NodeIO();
let doc = null;
for (const [file, names] of Object.entries(WANT)) {
  const src = await io.read(DIR + file);
  const root = src.getRoot();
  // only animation and bone: mesh, skin and material are dropped (the characters already have them)
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const a of root.listAnimations()) {
    if (names.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  if (!doc) {
    doc = src;
    continue;
  }
  // appends this file's clips, linking each channel to the bone of the same name in the first
  const bone = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const buf = doc.getRoot().listBuffers()[0];
  const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
  for (const a of root.listAnimations()) {
    const anim = doc.createAnimation(a.getName());
    for (const c of a.listChannels()) {
      const node = bone.get(c.getTargetNode().getName());
      if (!node) continue;
      const s = c.getSampler();
      const t = doc
        .createAnimationSampler()
        .setInput(copy(s.getInput()))
        .setOutput(copy(s.getOutput()))
        .setInterpolation(s.getInterpolation());
      anim
        .addSampler(t)
        .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(c.getTargetPath()).setSampler(t));
    }
  }
}
await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
await io.write('public/models/animations.glb', doc);
console.log(
  'clips:',
  doc
    .getRoot()
    .listAnimations()
    .map((a) => a.getName())
    .join(', '),
);
