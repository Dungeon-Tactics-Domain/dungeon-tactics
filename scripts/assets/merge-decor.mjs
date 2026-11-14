// Merges several .gltf/.glb files into a single GLB: each model becomes a top-level node named after the file (without extension).
// node scripts/assets/merge-decor.mjs <output.glb> <input1> <input2> ...
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, getBounds, mergeDocuments } from '@gltf-transform/functions';
import path from 'node:path';

const [out, ...inputs] = process.argv.slice(2);
const io = new NodeIO();
const base = await io.read(inputs[0]);
const scene = base.getRoot().listScenes()[0];
const names = [];

// Wraps the scene content of `doc` in a node called `name`, at the origin.
function wrap(doc, name) {
  const sc = doc.getRoot().listScenes()[0];
  const w = doc.createNode(name);
  for (const c of sc.listChildren()) {
    sc.removeChild(c);
    w.addChild(c);
  }
  sc.addChild(w);
  return w;
}
const nameOf = (f) => path.basename(f).replace(/(\.gltf)?\.(gltf|glb)$/, '');

wrap(base, nameOf(inputs[0]));
names.push(nameOf(inputs[0]));
for (const f of inputs.slice(1)) {
  const doc = await io.read(f);
  const name = nameOf(f);
  wrap(doc, name);
  mergeDocuments(base, doc);
  names.push(name);
}
// after the merge each extra scene brings its wrapped node: move it to the first scene
for (const sc of base.getRoot().listScenes().slice(1)) {
  for (const c of sc.listChildren()) {
    sc.removeChild(c);
    scene.addChild(c);
  }
  sc.dispose();
}
// GLB accepts only one buffer: moves all accessors to the first
const [buf, ...extra] = base.getRoot().listBuffers();
for (const a of base.getRoot().listAccessors()) a.setBuffer(buf);
extra.forEach((b) => b.dispose());
await base.transform(prune(), dedup());
await io.write(out, base);

const dup = names.filter((n, i) => names.indexOf(n) !== i);
if (dup.length) throw new Error('nomes duplicados: ' + dup);
for (const n of scene.listChildren()) {
  const b = getBounds(n);
  const f = (v) => v.map((x) => +x.toFixed(3)).join(',');
  console.log(`${n.getName()}\theight=${(b.max[1] - b.min[1]).toFixed(3)}\tmin=[${f(b.min)}]\tmax=[${f(b.max)}]`);
}
