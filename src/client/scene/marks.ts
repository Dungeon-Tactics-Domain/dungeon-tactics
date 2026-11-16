// Everything drawn on the board to read a choice: tile marks of each kind (looks in mark-looks.ts), the charge danger, the
// path dots, the keyboard cursor, the dotted range ring (range-ring.ts), the shot trajectory (trajectory.ts) and the town's
// debug grid. It only draws what the scene passes in.
import * as THREE from 'three';
import { inBounds, posKey } from '../../shared/battle/grid.ts';
import { cellsOf } from '../../shared/battle/pathing.ts';
import type { Pos } from '../../shared/battle/types.ts';
import type { Highlights } from '../interaction.ts';
import { MARKER } from '../markers.ts';
import { DANGER, MARK, markTexture } from './mark-looks.ts';
import { rangeRing } from './range-ring.ts';
import type { TileSpace } from './space.ts';
import { trajectory } from './trajectory.ts';

const CURSOR = { frame: '#ffffff', arrow: '#ffcf4a' }; // the cursor's colors when the square fits

export class Marks {
  private readonly marks = new Map<string, THREE.Mesh>();
  private readonly pathDots = new Map<string, THREE.Mesh>();
  private readonly danger = new Map<string, THREE.Mesh>(); // tiles where a charge will land (chargeDanger)
  // keyboard cursor: frame at the tile height and arrow floating above, to read the level even behind a unit
  private readonly cursor = new THREE.Group();
  private readonly cursorGoal = new THREE.Vector3();
  private marked: THREE.Vector3[] = []; // marked tiles the tree crowns open a hole for (only on maps with trees)
  private readonly markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);

  // `trees`: the map has crowns with a cutout, so the marked tiles must stay visible through them
  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly camera: THREE.Camera,
    private readonly trees: boolean,
  ) {
    const grid = space.grid;
    const markGeo = this.markGeo;
    const dotGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    for (const [i, tile] of grid.tiles.entries()) {
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
      // tile markers lying on the ramp: flat, the top half was buried on the climb
      if (tile.ramp) for (const m of [mark, danger, dot]) this.space.lay(m, p);
    }
    // transparent only to enter the transparent queue, after the water (renderOrder -1): without it the water tinted the frame
    const frame = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: CURSOR.frame,
        depthTest: MARKER.frameDepthTest,
        depthWrite: false,
        transparent: true,
      }),
    );
    frame.position.y = MARKER.frameY;
    frame.name = 'frame';
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: CURSOR.arrow, depthTest: false }),
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
  // their longest-hitting skill should show as dotted, and while they see the movement preview too"). Only rebuilds when it changes
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
    const mesh = rangeRing(this.space, r);
    this.scene.add(mesh);
    this.ring = { key, mesh };
  }

  // Trajectory preview (trajectory.ts), rebuilt on every cursor change
  private trajectory: THREE.Group | null = null;
  setTrajectory(t: { from: Pos; to: Pos; block: Pos | null } | null) {
    if (this.trajectory) {
      this.scene.remove(this.trajectory);
      this.trajectory.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.trajectory = null;
    }
    if (!t) return;
    this.trajectory = trajectory(this.space, this.camera, t);
    this.scene.add(this.trajectory);
  }

  // where the cursor stands now (it slides), null when hidden
  cursorAt(): THREE.Vector3 | null {
    return this.cursor.visible ? this.cursor.position : null;
  }

  // `size`: the frame goes around the square a unit of that many cells per side would stand on, with its corner on `p` (Move).
  // `fits` false turns frame and arrow red: the arrow draws over everything, so a square hidden behind a barrel or a tree still
  // reads as not fitting
  setCursor(p: Pos | null, size = 1, fits = true) {
    // appears in place right away; then slides from tile to tile (frame), instead of jumping
    if (p && !this.cursor.visible) this.cursor.position.copy(this.space.squareTop(p, size));
    this.cursor.visible = !!p;
    if (p) {
      this.cursorGoal.copy(this.space.squareTop(p, size));
      const frame = this.cursor.getObjectByName('frame') as THREE.Mesh;
      for (const [o, color] of [
        [frame, CURSOR.frame],
        [this.cursor.getObjectByName('arrow') as THREE.Mesh, CURSOR.arrow],
      ] as const)
        (o.material as THREE.MeshBasicMaterial).color.set(fits ? color : MARK.nogo[0]);
      // over a step or a ramp the flat frame floated off the lower cells' marks (stills at angles 0 and 2 on stage 0): there
      // the square's 4 marks and the arrow show it
      const ys = cellsOf(p, size)
        .filter((c) => inBounds(this.space.grid, c))
        .map((c) => this.space.world(c).y);
      frame.visible = Math.max(...ys) - Math.min(...ys) < 0.01;
      // a square flat at its standing height, like the token on it (a big unit does not tilt on a ramp)
      if (size > 1) {
        frame.rotation.set(0, 0, 0);
        frame.scale.set(size, 1, size);
      } else this.space.lay(frame, p);
    }
  }

  // Debug grid (the walkable town, Nov 16, Fernando): a faint dot on each of `dots` and a frame round each `size` square
  // with its corner on `squares` (the space a token takes); null hides it. The dots are built on the first call only
  private debugDots: THREE.InstancedMesh | null = null;
  private readonly debugSquares: THREE.Mesh[] = [];
  setDebugGrid(g: { dots: Pos[]; squares: Pos[]; size: number } | null) {
    if (g && !this.debugDots) {
      // the cursor frame's white, faint: it must not hide the ground it explains
      const dots = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.12, 0.12).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: CURSOR.frame, transparent: true, opacity: 0.45, depthWrite: false }),
        g.dots.length,
      );
      const m = new THREE.Matrix4();
      g.dots.forEach((p, i) => {
        const w = this.space.world(p);
        dots.setMatrixAt(i, m.makeTranslation(w.x, w.y + 0.03, w.z));
      });
      this.scene.add(dots);
      this.debugDots = dots;
    }
    if (this.debugDots) this.debugDots.visible = !!g;
    const squares = g?.squares ?? [];
    while (this.debugSquares.length < squares.length) {
      const sq = new THREE.Mesh(
        this.markGeo,
        new THREE.MeshBasicMaterial({
          color: MARK.move[0],
          transparent: true,
          depthWrite: false,
          map: markTexture('frame'),
        }),
      );
      this.scene.add(sq);
      this.debugSquares.push(sq);
    }
    this.debugSquares.forEach((sq, i) => {
      sq.visible = i < squares.length;
      if (!sq.visible || !g) return;
      sq.position.copy(this.space.squareTop(squares[i], g.size)).y += 0.025;
      sq.scale.set(g.size, 1, g.size);
    });
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
      // a destination over a charge's purple keeps only its frame: the solid core washed the purple out of a token's square
      // (showDanger runs on sync, before the update that sets the marks)
      const onDanger = kind === 'target' && this.danger.get(posKey(pos))!.visible;
      mat.map = markTexture(onDanger ? 'frame' : (MARK[kind][2] ?? 'frame'));
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
