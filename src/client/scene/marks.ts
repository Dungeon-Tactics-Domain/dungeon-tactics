// Everything drawn on the board to read a choice: tile marks of each kind, the charge danger, the path dots, the keyboard
// cursor, the dotted range ring and the shot trajectory. It only draws what the scene passes in.
import * as THREE from 'three';
import { inBounds, posKey } from '../../shared/battle/grid.ts';
import { gap } from '../../shared/battle/pathing.ts';
import type { Pos } from '../../shared/battle/types.ts';
import type { Highlights, TileKind } from '../interaction.ts';
import { MARKER, unitHeight } from '../markers.ts';
import type { TileSpace } from './space.ts';

// marker colors; the meaning also goes in HUD text (never color alone)
// Veil purple: the area of a spell being charged stays lit until it goes off (the text goes on the tile under the cursor, hud.ts)
const DANGER: [string, number] = ['#9b4dff', 0.4];
// Stylized marker (Nov 13, Fernando's request: "this preview is too white... something more stylized and less washed-out"; the
// flat white square became a carpet in Ash Wood): thin frame in the type's color with a dark thread outside (reads on
// grass, dirt and water: the Nov 12 blue vanished in water for being a full square), faint core and a drawing per
// type, because color is never the only signal: smooth (walk), full (chosen tile, whoever acts, strike area), stripes
// (strike range, threat) and cross (blocked shot)
type MarkPattern = 'frame' | 'solid' | 'hatch' | 'cross';
const MARK: Record<TileKind | 'path', [color: string, opacity: number, pattern?: MarkPattern]> = {
  actor: ['#ffd479', 0.95, 'solid'],
  move: ['#6fc0ff', 0.95, 'frame'],
  range: ['#ff7a3c', 0.95, 'hatch'],
  blocked: ['#b07ae0', 0.95, 'cross'],
  threat: ['#ff2d55', 0.6, 'hatch'],
  area: ['#ffb020', 1, 'solid'],
  target: ['#fff2a0', 1, 'solid'],
  nogo: ['#ff4040', 1, 'cross'], // the unit's square does not fit where the cursor is (Move)
  path: ['#1e6fff', 0.95],
};
const markTextures = new Map<MarkPattern, THREE.CanvasTexture>();
// white texture (the color comes from the material) with the marker drawing; one per drawing, made the first time
function markTexture(p: MarkPattern): THREE.CanvasTexture {
  let t = markTextures.get(p);
  if (t) return t;
  const S = 64,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgba(255,255,255,${p === 'solid' ? 0.42 : 0.08})`; // core
  g.fillRect(4, 4, S - 8, S - 8);
  if (p === 'hatch' || p === 'cross') {
    g.save();
    g.beginPath();
    g.rect(7, 7, S - 14, S - 14);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    if (p === 'hatch')
      for (let k = -S; k < S; k += 16) {
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
      }
    else {
      g.moveTo(10, 10);
      g.lineTo(S - 10, S - 10);
      g.moveTo(S - 10, 10);
      g.lineTo(10, S - 10);
    }
    g.stroke();
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; // dark thread outside
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeStyle = '#ffffff'; // frame
  g.lineWidth = 5;
  g.strokeRect(4.5, 4.5, S - 9, S - 9);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // no mipmap: the tile shows up flat (half the height) and the mipmap blurred the frame inward, leaving the core milky
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  markTextures.set(p, t);
  return t;
}

export class Marks {
  private readonly marks = new Map<string, THREE.Mesh>();
  private readonly pathDots = new Map<string, THREE.Mesh>();
  private readonly danger = new Map<string, THREE.Mesh>(); // tiles where a charge will land (chargeDanger)
  // keyboard cursor: frame at the tile height and arrow floating above, to read the level even behind a unit
  private readonly cursor = new THREE.Group();
  private readonly cursorGoal = new THREE.Vector3();
  private marked: THREE.Vector3[] = []; // marked tiles the tree crowns open a hole for (only on maps with trees)

  // `trees`: the map has crowns with a cutout, so the marked tiles must stay visible through them
  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly camera: THREE.Camera,
    private readonly trees: boolean,
  ) {
    const grid = space.grid;
    const markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const dotGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    for (const i of grid.tiles.keys()) {
      const p = { x: i % grid.width, y: Math.floor(i / grid.width) };
      const w = this.space.world(p);
      const mark = new THREE.Mesh(
        markGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: markTexture('frame') }),
      );
      mark.position.set(w.x, w.y + 0.02, w.z);
      mark.visible = false;
      this.scene.add(mark);
      this.marks.set(posKey(p), mark);
      // charge danger: its own layer, under the turn's markers (the player's choice stays on top)
      const danger = new THREE.Mesh(
        markGeo,
        new THREE.MeshBasicMaterial({ color: DANGER[0], transparent: true, opacity: DANGER[1], depthWrite: false }),
      );
      danger.position.set(w.x, w.y + 0.015, w.z);
      danger.visible = false;
      this.scene.add(danger);
      this.danger.set(posKey(p), danger);
      const dot = new THREE.Mesh(
        dotGeo,
        new THREE.MeshBasicMaterial({
          color: MARK.path[0],
          transparent: true,
          opacity: MARK.path[1],
          depthWrite: false,
        }),
      );
      dot.position.set(w.x, w.y + 0.03, w.z);
      dot.visible = false;
      this.scene.add(dot);
      this.pathDots.set(posKey(p), dot);
    }
    // tile markers lying on the ramp: flat, the top half was buried on the climb
    for (const [i, tile] of grid.tiles.entries()) {
      if (!tile.ramp) continue;
      const p = { x: i % grid.width, y: Math.floor(i / grid.width) };
      for (const layer of [this.marks, this.danger, this.pathDots]) this.space.lay(layer.get(posKey(p))!, p);
    }
    // transparent only to enter the transparent queue, after the water (renderOrder -1): without it the water tinted the frame
    const frame = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        depthTest: MARKER.frameDepthTest,
        depthWrite: false,
        transparent: true,
      }),
    );
    frame.position.y = MARKER.frameY;
    frame.name = 'frame';
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: '#ffcf4a', depthTest: false }),
    );
    arrow.name = 'arrow';
    arrow.renderOrder = 11; // the arrow stays above everything (even behind a wall it shows where the cursor is); the frame does not
    this.cursor.add(frame, arrow);
    this.cursor.visible = false;
    this.scene.add(this.cursor);
  }

  // charge danger tiles (chargeDanger keys)
  showDanger(hot: Map<string, string>) {
    for (const [k, m] of this.danger) m.visible = hot.has(k);
  }

  // cutout points the tree crowns must not cover: the cursor and the marked tiles
  protect(add: (x: number, y: number, z: number, r: number) => void) {
    if (this.cursor.visible) add(this.cursor.position.x, this.cursor.position.y + 0.3, this.cursor.position.z, 0.8);
    for (const w of this.marked) add(w.x, w.y + 0.05, w.z, 0.55);
  }

  update(dt: number) {
    // dt*30: arrives in ~0.1 s, fast so as not to delay whoever holds the arrow, smooth for the eye to follow
    this.cursor.position.lerp(this.cursorGoal, Math.min(1, dt * 30));
    this.cursor.getObjectByName('arrow')!.position.y =
      MARKER.arrowY + Math.sin(performance.now() / 250) * MARKER.arrowBob;
    // marked tiles breathe (±20% of opacity, ~1.9 s cycle): the map looks alive and the area reads without a strong blink
    const breath = 0.8 + 0.2 * Math.sin(performance.now() / 300);
    for (const m of this.marks.values())
      if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = m.userData.base * breath;
  }

  // Dotted line of the longest range (Nov 13, Fernando's request: "around the character the range of
  // their longest-hitting skill should show as dotted, and while they see the movement preview too"): outline of the tiles within `range`
  // steps of `center` (the same distance as the rule), at each tile's ground height. Only rebuilds when it changes
  private ring: { key: string; mesh: THREE.Mesh } | null = null;
  // `from`: the cells of the unit (a token occupies 2x2); `range` in cells
  setRangeRing(r: { from: Pos[]; range: number } | null) {
    const key = r ? `${posKey(r.from[0])}:${r.range}` : '';
    if (this.ring?.key === key) return;
    if (this.ring) {
      this.scene.remove(this.ring.mesh);
      this.ring.mesh.geometry.dispose();
      (this.ring.mesh.material as THREE.Material).dispose();
      this.ring = null;
    }
    if (!r || r.range < 1) return;
    const { width: W, height: H } = this.space.grid,
      pos: number[] = [];
    const inside = (p: Pos) => inBounds(this.space.grid, p) && gap(r.from, [p]) <= r.range;
    const yAt = (p: Pos, x: number, z: number) =>
      (this.space.levels.get(posKey(p))?.surface ?? this.space.surfaceY(p, x, z)) + 0.05;
    // flat little dash lying on the ground (WebGL's 1 px line barely showed): 2 triangles from `a` to `b`, 0.07 wide
    const dash = (p: Pos, ax: number, az: number, bx: number, bz: number) => {
      const nx = -(bz - az),
        nz = bx - ax,
        k = 0.035 / Math.hypot(nx, nz);
      const v = (x: number, z: number, side: number) => [x + nx * k * side, yAt(p, x, z), z + nz * k * side];
      const a1 = v(ax, az, 1),
        a2 = v(ax, az, -1),
        b1 = v(bx, bz, 1),
        b2 = v(bx, bz, -1);
      pos.push(...a1, ...a2, ...b1, ...b1, ...a2, ...b2);
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = { x, y };
        if (!inside(p)) continue;
        // each side of the tile that touches an outside tile becomes 3 little dashes (they follow ramp and step)
        for (const [dx, dy, ax, az, bx, bz] of [
          [0, -1, 0, 0, 1, 0],
          [0, 1, 0, 1, 1, 1],
          [-1, 0, 0, 0, 0, 1],
          [1, 0, 1, 0, 1, 1],
        ] as const) {
          if (inside({ x: x + dx, y: y + dy })) continue;
          for (let k = 0; k < 3; k++) {
            const t0 = (k + 0.2) / 3,
              t1 = (k + 0.8) / 3;
            const at = (t: number) => [x + ax + (bx - ax) * t - W / 2, y + az + (bz - az) * t - H / 2];
            const [x0, z0] = at(t0),
              [x1, z1] = at(t1);
            dash(p, x0, z0, x1, z1);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: '#ffd27a',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 11;
    this.scene.add(mesh);
    this.ring = { key, mesh };
  }

  // Trajectory preview: thin strip from the shooter's eye to the target's aim, blue where it passes and red after the point
  // where it hits (the blocking tile, sightBlock). Rebuilt on every cursor change; few vertices
  private trajectory: THREE.Group | null = null;
  setTrajectory(t: { from: Pos; to: Pos; block: Pos | null } | null) {
    if (this.trajectory) {
      this.scene.remove(this.trajectory);
      this.trajectory.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.trajectory = null;
    }
    if (!t) return;
    const eye = (p: Pos) => this.space.stand(p).add(new THREE.Vector3(0, unitHeight('soldier') * 0.7, 0));
    const a = eye(t.from),
      b = eye(t.to);
    const cut = t.block
      ? (() => {
          const w = this.space.world(t.block);
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
    this.trajectory = new THREE.Group();
    this.trajectory.add(seg(a, cut, '#5fd6ff'));
    if (t.block) {
      this.trajectory.add(seg(cut, b, '#ff4d4d'));
      // red X where the shot hits (Nov 13, Fernando's request: "there should be an X where it will hit")
      const mat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', depthTest: false });
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), mat);
        bar.position.copy(cut);
        bar.quaternion.copy(this.camera.quaternion);
        bar.rotateZ(turn);
        bar.renderOrder = 13;
        this.trajectory.add(bar);
      }
    }
    this.scene.add(this.trajectory);
  }

  // `size`: the frame goes around the square a unit of that many cells per side would stand on, with its corner on `p` (Move)
  setCursor(p: Pos | null, size = 1) {
    // appears in place right away; then slides from tile to tile (frame), instead of jumping
    if (p && !this.cursor.visible) this.cursor.position.copy(this.space.squareTop(p, size));
    this.cursor.visible = !!p;
    if (p) {
      this.cursorGoal.copy(this.space.squareTop(p, size));
      const frame = this.cursor.getObjectByName('frame')!;
      // a square flat at its standing height, like the token on it (a big unit does not tilt on a ramp)
      if (size > 1) {
        frame.rotation.set(0, 0, 0);
        frame.scale.set(size, 1, size);
      } else this.space.lay(frame, p);
    }
  }

  setHighlights(h: Highlights | null) {
    for (const m of this.marks.values()) m.visible = false;
    for (const d of this.pathDots.values()) d.visible = false;
    this.marked = h && this.trees ? h.tiles.map(({ pos }) => this.space.world(pos)) : [];
    if (!h) return;
    for (const { pos, kind } of h.tiles) {
      const m = this.marks.get(posKey(pos))!;
      const mat = m.material as THREE.MeshBasicMaterial;
      m.userData.base = MARK[kind][1]; // starting opacity of the pulse (frame)
      mat.color.set(MARK[kind][0]);
      mat.opacity = MARK[kind][1];
      mat.map = markTexture(MARK[kind][2] ?? 'frame');
      m.visible = true;
    }
    // a token's path runs through the middle of its square, not over its corner cell
    const size = h.size ?? 1;
    for (const p of h.path ?? []) {
      const dot = this.pathDots.get(posKey(p))!;
      dot.position.copy(this.space.squareTop(p, size)).y += 0.03;
      if (size > 1) {
        dot.rotation.set(0, 0, 0);
        dot.scale.set(1, 1, 1);
      } else this.space.lay(dot, p);
      dot.visible = true;
    }
  }
}
