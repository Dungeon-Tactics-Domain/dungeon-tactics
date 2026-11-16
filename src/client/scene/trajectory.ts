// The shot's trajectory preview: a thin strip from the shooter's eye to the target's aim, red past where it hits, with
// an X on that point.
import * as THREE from 'three';
import type { Pos } from '../../shared/battle/types.ts';
import { unitHeight } from '../markers.ts';
import type { TileSpace } from './space.ts';

// Blue where it passes and red after the point where it hits (the blocking tile, sightBlock); `camera` turns the X
// to face it. Few vertices: rebuilt on every cursor change
export function trajectory(space: TileSpace, camera: THREE.Camera, t: { from: Pos; to: Pos; block: Pos | null }) {
  const eye = (p: Pos) => space.stand(p).add(new THREE.Vector3(0, unitHeight('soldier') * 0.7, 0));
  const a = eye(t.from),
    b = eye(t.to);
  const cut = t.block
    ? (() => {
        const w = space.world(t.block);
        const k = Math.hypot(w.x - a.x, w.z - a.z) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
        return a.clone().lerp(b, k);
      })()
    : b;
  const seg = (p: THREE.Vector3, q: THREE.Vector3, color: string) => {
    const len = p.distanceTo(q);
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, len, 6).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }),
    );
    m.position.copy(p).lerp(q, 0.5);
    m.lookAt(q);
    m.renderOrder = 12;
    return m;
  };
  const group = new THREE.Group();
  group.add(seg(a, cut, '#5fd6ff'));
  if (t.block) {
    group.add(seg(cut, b, '#ff4d4d'));
    // red X where the shot hits (Nov 13, Fernando's request: "there should be an X where it will hit")
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', depthTest: false });
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), mat);
      bar.position.copy(cut);
      bar.quaternion.copy(camera.quaternion);
      bar.rotateZ(turn);
      bar.renderOrder = 13;
      group.add(bar);
    }
  }
  return group;
}
