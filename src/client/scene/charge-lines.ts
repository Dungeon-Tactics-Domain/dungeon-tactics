// Draws the charge lines (charge-lines.ts): one thin line per charging unit, kept on screen through every turn, and the
// brighter line from where the charging unit would stop while it picks where to walk. Past the point where the shot stops the
// line goes dim red, with an X there: red on an enemy, orange on the caster's own side (friendly fire, half), white on
// terrain. Drawn over everything (no depth test), so a line behind a wall still reads.
import * as THREE from 'three';
import { shotAt } from '../../shared/battle/pathing.ts';
import type { ChargeLine, Counters, Square } from '../charge-lines.ts';
import { unitHeight } from '../markers.ts';
import type { TileSpace } from './space.ts';

// counter: a violet apart from both sides and the charge preview (Nov 15, the counter indicator)
const COLOR = {
  hero: '#7fd8ff',
  enemy: '#ff6fb0',
  preview: '#ffe27a',
  counter: '#c79bff',
  past: '#ff4d4d',
  fizzle: '#9a9a9a',
};
const X = { foe: '#ff3b3b', friendly: '#ffa53b', terrain: '#f2f2f2' };

export class ChargeLines {
  private kept = new THREE.Group();
  private preview = new THREE.Group();
  private counter = new THREE.Group();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly camera: THREE.Camera,
  ) {
    scene.add(this.kept, this.preview, this.counter);
  }

  set(lines: ChargeLine[] | null) {
    this.kept = this.redraw(this.kept, lines ?? [], 0.022, 0.7);
  }

  setPreview(line: ChargeLine | null) {
    this.preview = this.redraw(this.preview, line ? [line] : [], 0.035, 0.95, COLOR.preview);
  }

  // the counters a strike earns or a destination draws: their shots as lines, a melee one as an arrow from whoever strikes
  // back toward the attacker, over the heads (at eye height the two adjacent bodies hid it)
  setCounters(c: Counters | null) {
    this.counter = this.redraw(this.counter, c?.lines ?? [], 0.03, 0.95, COLOR.counter);
    const mat = new THREE.MeshBasicMaterial({ color: COLOR.counter, depthTest: false });
    const above = new THREE.Vector3(0, unitHeight('soldier') * 0.6, 0);
    for (const m of c?.melee ?? []) {
      const a = this.eye(m.from).add(above),
        b = this.eye(m.to).add(above);
      const tip = a.clone().lerp(b, Math.min(0.85, 1.1 / Math.max(1e-3, a.distanceTo(b))));
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, a.distanceTo(tip), 6).rotateX(Math.PI / 2),
        mat,
      );
      shaft.position.copy(a).lerp(tip, 0.5);
      shaft.lookAt(tip);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 8).rotateX(Math.PI / 2), mat);
      head.position.copy(tip);
      head.lookAt(b);
      shaft.renderOrder = head.renderOrder = 13;
      this.counter.add(shaft, head);
    }
  }

  // eye height over the middle of each square: the melee arrows and a cast spell's line
  private eye(s: Square) {
    return this.space.squareTop(s.pos, s.size).add(new THREE.Vector3(0, unitHeight('soldier') * 0.7, 0));
  }

  private redraw(old: THREE.Group, lines: ChargeLine[], width: number, opacity: number, color?: string) {
    this.scene.remove(old);
    old.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    const g = new THREE.Group();
    const eye = (s: Square) => this.eye(s);
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
      const tint = !l.ok ? COLOR.fizzle : (color ?? COLOR[l.team]);
      // a flying shot follows the rule's own path (traceShot), cut where it stops; a spell cast on the target, a straight line
      const { shot } = l;
      const [a, b] = [eye(l.from), eye(l.to)];
      const at = shot ? (k: number) => this.space.point(shotAt(shot, k)) : (k: number) => a.clone().lerp(b, k);
      const path = (k0: number, k1: number, c: string) => {
        const n = shot?.fall ? Math.ceil((k1 - k0) * 24) : 1;
        for (let i = 0; i < n; i++) seg(at(k0 + ((k1 - k0) * i) / n), at(k0 + ((k1 - k0) * (i + 1)) / n), c);
      };
      const k = shot?.stop?.k ?? 1;
      path(0, k, tint);
      if (!l.stop) continue;
      const cut = at(k);
      path(k, 1, COLOR.past);
      const mark = l.hits.some((h) => h.friendly) ? X.friendly : l.hits.length ? X.foe : X.terrain;
      const mat = new THREE.MeshBasicMaterial({ color: mark, depthTest: false });
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(color ? 0.42 : 0.3, 0.07, 0.07), mat);
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
