// Arqueiro com boneco próprio (13/11, pedido do Fernando: "o arqueiro está com a mesma skin do ladino, deve usar outra skin e usar
// um arco como arma"). O KayKit Adventurers só tem 5 bonecos e todos já são usados, então o Arqueiro é a Ladina (rogue.glb) sem as
// duas facas e sem o capuz, com a roupa verde tingida (a Ladina encapuzada segue verde) e o arco bow_A_withString do KayKit Fantasy
// Weapons Bits preso no osso da mão esquerda (handslot.l), a mão que segura o arco nos gestos Ranged_Bow_* do animacoes.glb.
// Rodar uma vez: node scripts/assets/ranger.mjs (gera public/models/ranger.glb; o rogue.glb não muda, os corpos caídos usam ele)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// tom da roupa: o verde da Ladina (matiz 80–170°) vira vinho, para o Arqueiro e a Ladina não se confundirem de cima
const HUE = 355, GREEN = [80, 170];
const BOW = 'assets/kaykit/armas-de-fantasia/Assets/gltf/bow_A_withString.gltf';
const BOW_IDLE = ['assets/kaykit/animacoes/Animations/gltf/Rig_Medium/Rig_Medium_CombatRanged.glb', 'Ranged_Bow_Idle'];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/models/rogue.glb');
const root = doc.getRoot();
const node = (name) => root.listNodes().find((n) => n.getName() === name) ?? (() => { throw new Error(`sem o nó ${name}: o rogue.glb mudou?`); })();

for (const name of ['Knife', 'Knife_Offhand', 'Rogue_Hood']) node(name).dispose();

// arco: junta o documento e pendura o nó na mão, como as facas estavam (filho do handslot, que acompanha a animação)
mergeDocuments(doc, await io.read(BOW));
const bow = node('bow_A_withString');
for (const s of root.listScenes().slice(1)) s.dispose();
node('handslot.l').addChild(bow);
// o arco é comprido em X com o cabo na origem e as pontas para -Z; no osso da mão o X aponta para o braço ao mirar: -90° em Y
// põe o arco de pé com as pontas para a frente e a corda do lado do corpo (conferido nos prints do Ranged_Bow_Aiming_Idle)
bow.setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);

// parado com o arco: o Idle da Ladina vira o Ranged_Bow_Idle do KayKit Character Animations (mesmos ossos, ligados pelo nome).
// No Idle da Ladina a mão fica de lado e o arco de pé atravessava o corpo. A cena acha o clipe pelo nome, então não muda código
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
for (const c of idle.listChannels()) c.dispose();
for (const s of idle.listSamplers()) s.dispose();
const ranged = (await io.read(BOW_IDLE[0])).getRoot().listAnimations().find((a) => a.getName() === BOW_IDLE[1]);
const buf = root.listBuffers()[0];
const copy = (x) => doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);
for (const c of ranged.listChannels()) {
  const target = root.listNodes().find((n) => n.getName() === c.getTargetNode().getName());
  if (!target) continue;
  const s = c.getSampler();
  const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
  idle.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(c.getTargetPath()).setSampler(sampler));
}

// roupa tingida na textura de paleta (pixel a pixel, só os verdes); o arco tem textura própria e não muda
const tex = root.listMaterials().find((m) => m.getName() === 'rogue_texture').getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) continue; // cinza, branco e preto ficam
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (h < GREEN[0] || h > GREEN[1]) continue;
  // mesma luz e saturação (HSV), só a matiz muda
  const s = d / max, f = (n) => { const k = (n + HUE / 60) % 6; return max - max * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  [data[i], data[i + 1], data[i + 2]] = [f(5), f(3), f(1)].map((x) => Math.round(x * 255));
}
tex.setImage(new Uint8Array(await sharp(data, { raw: info }).png().toBuffer()));

// keepLeaves: os nós de IK sem malha são alvo das animações
await doc.transform(prune({ keepLeaves: true }), unpartition(), meshopt({ encoder: MeshoptEncoder }));
await io.write('public/models/ranger.glb', doc);
console.log('public/models/ranger.glb', root.listNodes().length, 'nós');
