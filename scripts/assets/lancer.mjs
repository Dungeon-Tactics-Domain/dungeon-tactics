// Lanceiro com boneco próprio (13/11, pedido do Fernando pelo orquestrador: a classe nova estava com o boneco do Bárbaro e
// precisava de um próprio, com lança). No mesmo jeito do Arqueiro (ranger.mjs): o KayKit Adventurers só tem 5 bonecos, então
// o Lanceiro é o Cavaleiro (knight.glb) sem a espada, o escudo e a capa, com a armadura cinza tingida de aço verde-azulado e
// a lança spear_A do KayKit Fantasy Weapons Bits presa no osso da mão direita (handslot.r), onde a espada ficava. Parado,
// segura a lança com as duas mãos (Melee_2H_Idle do KayKit Character Animations no lugar do Idle). Desenho e peças do
// KayKit (CC0), nada copiado de outro jogo.
// Rodar uma vez: node scripts/assets/lancer.mjs (gera public/models/lancer.glb; o knight.glb não muda)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// tom da armadura: o cinza do Cavaleiro vira aço verde-azulado, para o Lanceiro e o Guerreiro não se confundirem de cima.
// Sem a capa quase não sobra vermelho no boneco, e o cinto e as botas têm a matiz da pele: tingir pela cor pegava o rosto
const STEEL = [0.56, 0.86, 0.9];
const SPEAR = 'assets/kaykit/armas-de-fantasia/Assets/gltf/spear_A.gltf';
const SPEAR_IDLE = ['assets/kaykit/animacoes/Animations/gltf/Rig_Medium/Rig_Medium_CombatMelee.glb', 'Melee_2H_Idle'];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/models/knight.glb');
const root = doc.getRoot();
const node = (name) => root.listNodes().find((n) => n.getName() === name) ?? (() => { throw new Error(`sem o nó ${name}: o knight.glb mudou?`); })();

for (const name of ['1H_Sword', 'Round_Shield', 'Knight_Cape']) node(name).dispose();

// lança: junta o documento e pendura o nó na mão direita, como a espada estava (filho do handslot, que acompanha a animação)
mergeDocuments(doc, await io.read(SPEAR));
const spear = node('spear_A');
for (const s of root.listScenes().slice(1)) s.dispose();
node('handslot.r').addChild(spear);

// parado com a lança nas duas mãos: o Idle do Cavaleiro vira o Melee_2H_Idle (mesmos ossos, ligados pelo nome). A cena acha
// o clipe pelo nome, então não muda código
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
for (const c of idle.listChannels()) c.dispose();
for (const s of idle.listSamplers()) s.dispose();
const twoHands = (await io.read(SPEAR_IDLE[0])).getRoot().listAnimations().find((a) => a.getName() === SPEAR_IDLE[1]);
const buf = root.listBuffers()[0];
const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
for (const c of twoHands.listChannels()) {
  const target = root.listNodes().find((n) => n.getName() === c.getTargetNode().getName());
  if (!target) continue;
  const s = c.getSampler();
  const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
  idle.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(c.getTargetPath()).setSampler(sampler));
}

// armadura tingida na textura de paleta (pixel a pixel, só os cinzas do meio); a lança tem textura própria e não muda
const tex = root.listMaterials().find((m) => m.getName() === 'knight_texture').getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
  if (max - min > 20 || max < 50 || max > 235) continue; // cor (pele, couro), preto e branco (olhos) ficam
  for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * STEEL[c]);
}
tex.setImage(new Uint8Array(await sharp(data, { raw: info }).png().toBuffer()));

// keepLeaves: os nós de IK sem malha são alvo das animações
await doc.transform(prune({ keepLeaves: true }), unpartition(), meshopt({ encoder: MeshoptEncoder }));
await io.write('public/models/lancer.glb', doc);
console.log('public/models/lancer.glb', root.listNodes().length, 'nós');
