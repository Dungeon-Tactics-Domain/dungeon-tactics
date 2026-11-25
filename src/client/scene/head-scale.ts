// A smaller head on the KayKit figures, a runtime sample for the 4-heads restyle (Fernando, Nov 25: "gere uma amostra
// desse segundo ai ... no menu de debug"): the debug panel scales every `head` bone, saved per player. Only a uniform
// head scale: stretching limbs with a non-uniform scale shears the mesh when a child joint turns
import type * as THREE from 'three';
import { store } from '../store.ts';

const KEY = 'dt:head-scale';
export const HEAD_MIN = 0.55;
const heads = new Set<THREE.Object3D>(); // the head bones drawn now; a removed unit's bone is skipped and dropped

// the saved scale, rebuilt from the browser: anything odd is the model's own size
export function parseHeadScale(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= HEAD_MIN && v <= 1 ? v : 1;
}
let scale = parseHeadScale(store.json(KEY));
export const headScale = () => scale;

// every KayKit clip keys head.scale (always 1, measured Nov 25), which would undo the bone's scale each frame
export const keepsHeadScale = (track: THREE.KeyframeTrack) => track.name !== 'head.scale';

export function trackHead(body: THREE.Object3D) {
  const head = body.getObjectByName('head');
  if (!head) return;
  heads.add(head);
  head.scale.setScalar(scale);
}

export function setHeadScale(v: number) {
  scale = parseHeadScale(v);
  store.set(KEY, JSON.stringify(scale));
  for (const h of heads) {
    if (!h.parent) heads.delete(h);
    else h.scale.setScalar(scale);
  }
}
