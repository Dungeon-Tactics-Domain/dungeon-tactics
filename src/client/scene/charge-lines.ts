// Draws the charge lines (charge-lines.ts): one thin line per charging unit, kept on screen through every turn, and the
// brighter line from where the charging unit would stop while it picks where to walk. Past the point where the shot stops the
// line goes dim red, with an X there: red on an enemy, orange on the caster's own side (friendly fire, half), white on
// terrain. Drawn over everything (no depth test), so a line behind a wall still reads.
import * as THREE from 'three';
import type { ChargeLine, Square } from '../charge-lines.ts';
import { unitHeight } from '../markers.ts';
import type { TileSpace } from './space.ts';

const COLOR = { hero: '#7fd8ff', enemy: '#ff6fb0', preview: '#ffe27a', past: '#ff4d4d', fizzle: '#9a9a9a' };
const X = { foe: '#ff3b3b', friendly: '#ffa53b', terrain: '#f2f2f2' };

export class ChargeLines {
  private kept = new THREE.Group();
  private preview = new THREE.Group();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly camera: THREE.Camera,
  ) {
    scene.add(this.kept, this.preview);
  }

  set(lines: ChargeLine[] | null) {
    this.kept = this.redraw(this.kept, lines ?? [], 0.022, 0.7);
  }

  setPreview(line: ChargeLine | null) {
    this.preview = this.redraw(this.preview, line ? [line] : [], 0.035, 0.95, true);
  }

  private redraw(old: THREE.Group, lines: ChargeLine[], width: number, opacity: number, preview = false) {
    this.scene.remove(old);
    old.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    const g = new THREE.Group();
    // eye height like the aim trajectory (Marks.setTrajectory), over the middle of each square
    const eye = (s: Square) =>
      this.space.squareTop(s.pos, s.size).add(new THREE.Vector3(0, unitHeight('soldier') * 0.7, 0));
    const seg = (p: THREE.Vector3, q: THREE.Vector3, color: string) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(width, width, Math.max(1e-3, p.distanceTo(q)), 6).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      m.position.copy(p).lerp(q, 0.5);
      m.lookAt(q);
      m.renderOrder = 12;
      g.add(m);
    };
    for (const l of lines) {
      const a = eye(l.from),
        b = eye(l.to);
      const color = !l.ok ? COLOR.fizzle : preview ? COLOR.preview : COLOR[l.team];
      if (!l.stop) {
        seg(a, b, color);
        continue;
      }
      // the stop along the line, by the ground distance (the same reading as Marks.setTrajectory)
      const w = this.space.squareTop(l.stop.pos, l.stop.size);
      const k = Math.hypot(w.x - a.x, w.z - a.z) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
      const cut = a.clone().lerp(b, Math.min(1, k));
      seg(a, cut, color);
      seg(cut, b, COLOR.past);
      const mark = l.hits.some((h) => h.friendly) ? X.friendly : l.hits.length ? X.foe : X.terrain;
      const mat = new THREE.MeshBasicMaterial({ color: mark, depthTest: false });
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(preview ? 0.42 : 0.3, 0.07, 0.07), mat);
        bar.position.copy(cut);
        bar.quaternion.copy(this.camera.quaternion);
        bar.rotateZ(turn);
        bar.renderOrder = 13;
        g.add(bar);
      }
    }
    this.scene.add(g);
    return g;
  }
}
