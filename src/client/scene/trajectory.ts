// The shot preview (the trajectory grill of Nov 15, from the Mechanics lab's prototype): dots flowing along the rule's own
// path (traceShot) from the shooter's chest to the aim on the target, over a landing ring; past where the shot stops the dots
// turn red, with a red X there (Nov 13, Fernando: "there should be an X where it will hit"). A spell cast on the target
// (`cast`) gets a circle pulsing over its area, red for damage and green for a heal, and a still dashed line from the
// caster instead: no dots and no X, so it never reads as a projectile.
import * as THREE from 'three';
import { subOf } from '../../shared/battle/grid.ts';
import { SHOT_H, shotAt } from '../../shared/battle/pathing.ts';
import type { Shot } from '../../shared/battle/types.ts';
import type { TileSpace } from './space.ts';

// the Mechanics lab's trajectory colours: the path, past the stop (and a damaging spell's area), a heal's area
const AIM = { path: '#22b8f0', past: '#e0352b', heal: '#2fa84f' };

export interface Aim {
  group: THREE.Group;
  shot: Shot;
  dots: THREE.Mesh[];
  paint: [path: THREE.Material, past: THREE.Material]; // the dots' colours, before and past the stop
  x: THREE.Group | null;
  circle: THREE.Mesh | null;
}

// Built on every cursor change; `animateAim` moves it each frame
export function trajectory(space: TileSpace, t: { shot: Shot; cast: { radius: number; heal: boolean } | null }): Aim {
  const { shot } = t;
  const at = (k: number) => space.point(shotAt(shot, k));
  const paint = (color: string, opacity = 1) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const group = new THREE.Group();
  const add = <T extends THREE.Object3D>(o: T, order = 12) => {
    o.renderOrder = order;
    group.add(o);
    return o;
  };
  const aim: Aim = { group, shot, dots: [], paint: [paint(AIM.path), paint(AIM.past)], x: null, circle: null };
  // the aimed tile's ground, under the aim point
  const floor = space.point({ ...shot.to, h: shot.to.h - SHOT_H });
  floor.y += 0.03;
  if (t.cast) {
    const color = t.cast.heal ? AIM.heal : AIM.past;
    aim.circle = add(new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), paint(color, 0.85)));
    aim.circle.position.copy(floor);
    // the area's reach from the aimed whole tile's middle, in cells
    aim.circle.userData.r = (t.cast.radius + 0.5) * subOf(space.grid);
    const line = add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([at(0), at(1)]),
        new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, depthTest: false, transparent: true }),
      ),
    );
    line.computeLineDistances();
  } else {
    let len = 0;
    for (let i = 1; i <= 30; i++) len += at((i - 1) / 30).distanceTo(at(i / 30));
    const dot = new THREE.SphereGeometry(0.07, 8, 6);
    // about 2.5 dots a metre, the lab's 5 a whole tile
    for (let i = 0; i < Math.min(80, Math.max(8, Math.round(len * 2.5))); i++)
      aim.dots.push(add(new THREE.Mesh(dot, aim.paint[0])));
    add(new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 32).rotateX(-Math.PI / 2), paint(AIM.path, 0.9))).position.copy(
      floor,
    );
    if (shot.stop) {
      aim.x = add(new THREE.Group());
      aim.x.position.copy(at(shot.stop.k));
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.02), aim.paint[1]);
        bar.rotation.z = turn;
        bar.renderOrder = 13;
        aim.x.add(bar);
      }
    }
  }
  return aim;
}

// each frame: the dots flow toward the target, one gap every 0.6 s like the lab's, red past the stop; the X faces the
// camera and the cast circle pulses
export function animateAim(aim: Aim, space: TileSpace, camera: THREE.Camera) {
  const n = aim.dots.length,
    flow = (performance.now() / 600) % 1;
  aim.dots.forEach((d, i) => {
    const k = (i + flow) / n;
    d.position.copy(space.point(shotAt(aim.shot, k)));
    d.material = aim.paint[aim.shot.stop && k > aim.shot.stop.k ? 1 : 0];
  });
  aim.x?.quaternion.copy(camera.quaternion);
  aim.circle?.scale.setScalar(aim.circle.userData.r * (0.92 + 0.08 * Math.sin(performance.now() / 220)));
}

// frees the meshes' geometry and materials, and the two dot paints (with no stop or no dots, no mesh holds one)
export function disposeAim(aim: Aim) {
  aim.group.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose();
    ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
  });
  for (const m of aim.paint) m.dispose();
}
