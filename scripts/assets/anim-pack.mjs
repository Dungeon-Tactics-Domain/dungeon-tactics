// Junta num glb só os clipes do KayKit Character Animations 1.1 (Rig_Medium) que as habilidades usam (12/11, gesto
// próprio por habilidade no jeito do FFT). Os bonecos têm os mesmos ossos: a cena aplica os clipes pelo nome do osso.
// node scripts/assets/anim-pack.mjs  →  public/models/animacoes.glb
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

const DIR = 'assets/kaykit/animacoes/Animations/gltf/Rig_Medium/';
const WANT = {
  'Rig_Medium_CombatMelee.glb': ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Stab', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_2H_Attack_Chop', 'Melee_Block_Attack', 'Melee_Unarmed_Attack_Punch_A'],
  'Rig_Medium_CombatRanged.glb': ['Ranged_Bow_Aiming_Idle', 'Ranged_Bow_Release', 'Ranged_Magic_Shoot', 'Ranged_Magic_Raise', 'Ranged_Magic_Spellcasting'],
  'Rig_Medium_General.glb': ['Use_Item'],
  // andar a passo e o pulo em 3 partes (13/11, pedido do Fernando: andar lento e pulo realista nos degraus)
  'Rig_Medium_MovementBasic.glb': ['Walking_A', 'Jump_Start', 'Jump_Idle', 'Jump_Land'],
};
const io = new NodeIO();
let doc = null;
for (const [file, names] of Object.entries(WANT)) {
  const src = await io.read(DIR + file);
  const root = src.getRoot();
  // só animação e osso: malha, pele e material saem (os bonecos já têm)
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const a of root.listAnimations()) {
    if (names.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  if (!doc) { doc = src; continue; }
  // anexa os clipes deste arquivo, ligando cada canal ao osso de mesmo nome do primeiro
  const bone = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const buf = doc.getRoot().listBuffers()[0];
  const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
  for (const a of root.listAnimations()) {
    const anim = doc.createAnimation(a.getName());
    for (const c of a.listChannels()) {
      const node = bone.get(c.getTargetNode().getName());
      if (!node) continue;
      const s = c.getSampler();
      const t = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(t).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(c.getTargetPath()).setSampler(t));
    }
  }
}
await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
await io.write('public/models/animacoes.glb', doc);
console.log('clipes:', doc.getRoot().listAnimations().map((a) => a.getName()).join(', '));
