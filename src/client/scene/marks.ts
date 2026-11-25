// Everything drawn on the board to read a choice: tile marks of each kind (looks in mark-looks.ts), the charge danger, the
// path dots, the keyboard cursor, the dotted range ring (range-ring.ts), the shot trajectory (trajectory.ts) and the town's
// debug grid. It only draws what the scene passes in.
import * as THREE from 'three';
import { inBounds, posKey, tileAt } from '../../shared/battle/grid.ts';
import type { Pos, Shot } from '../../shared/battle/types.ts';
import type { Highlights } from '../interaction.ts';
import { MARKER } from '../markers.ts';
import { reducedMotion } from '../motion.ts';
import {
  dressTile,
  type Ground,
  groundOf,
  litPaint,
  litStyle,
  piece,
  pulse,
  square,
  tileGeometry,
  tileMaterials,
  tint,
} from './mark-kit.ts';
import { DANGER, MARK, type MarkPattern, markTexture } from './mark-looks.ts';
import { sharp } from './pixel-pass.ts';
import { rangeRing, walkRing } from './range-ring.ts';
import type { CutAdd } from './see-through.ts';
import { rectOf, sides, type TileSpace } from './space.ts';
import { type Aim, animateAim, disposeAim, trajectory } from './trajectory.ts';

const CURSOR = { frame: '#ffffff', arrow: '#ffcf4a' }; // the cursor's colors when the square fits
const NONE = new THREE.BufferGeometry(); // a lit tile mark before its first showing (its geometry is built then)
const keyPos = (k: string): Pos => {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
};

export class Marks {
  private readonly marks = new Map<string, THREE.Mesh>();
  private readonly pathDots = new Map<string, THREE.Mesh>();
  private readonly danger = new Map<string, THREE.Mesh>(); // tiles where a charge will land (chargeDanger)
  // keyboard cursor: frame at the tile height and arrow floating above, to read the level even behind a unit
  private readonly cursor = new THREE.Group();
  private readonly cursorGoal = new THREE.Vector3();
  private marked: THREE.Vector3[] = []; // marked tiles the crowns and the taller ground open a hole for
  private readonly markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
  private readonly root = new THREE.Group(); // everything this draws, so a change of style takes it all away (dispose)
  // The lit styles (mark-style.ts; null draws the flat marks of before): a tile's mark is one geometry bent over its
  // ground, built the first time the tile is marked, and the tiles of a kind share their materials, which breathe together
  private readonly style = litStyle();
  private ground: Ground;
  private readonly tileGeo = new Map<string, THREE.BufferGeometry>();
  private readonly tileMats = new Map<string, THREE.Material[]>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly camera: THREE.Camera,
  ) {
    const grid = space.grid;
    const markGeo = this.markGeo;
    const style = this.style;
    this.ground = groundOf(scene, space);
    scene.add(this.root);
    this.root.matrixAutoUpdate = false; // it never moves: a moving parent would work out every tile mark's matrix again
    // lit: a small bevelled stud instead of the flat square
    const dotGeo = style
      ? new THREE.CylinderGeometry(0.1, 0.15, 0.06, 10).translate(0, 0.03, 0)
      : new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    for (const i of grid.tiles.keys()) {
      const p = { x: i % grid.width, y: Math.floor(i / grid.width) };
      const mark = style
        ? dressTile(new THREE.Mesh(NONE, []))
        : new THREE.Mesh(
            markGeo,
            new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: markTexture('frame') }),
          );
      mark.visible = false;
      this.root.add(mark);
      this.marks.set(posKey(p), mark);
      // charge danger: its own layer, under the turn's markers (the player's choice stays on top)
      const danger = style
        ? dressTile(new THREE.Mesh(NONE, this.matsOf('danger', DANGER[0], 'solid', 0.75)))
        : new THREE.Mesh(
            markGeo,
            new THREE.MeshBasicMaterial({ color: DANGER[0], transparent: true, opacity: DANGER[1], depthWrite: false }),
          );
      danger.visible = false;
      this.root.add(danger);
      this.danger.set(posKey(p), danger);
      const dot = new THREE.Mesh(
        dotGeo,
        style
          ? litPaint(style, MARK.path[0])
          : new THREE.MeshBasicMaterial({
              color: MARK.path[0],
              transparent: true,
              opacity: MARK.path[1],
              depthWrite: false,
            }),
      );
      if (style) dressTile(dot);
      dot.visible = false;
      this.root.add(dot);
      this.pathDots.set(posKey(p), dot);
      this.seat(p);
    }
    // transparent only to enter the transparent queue, after the water (renderOrder -1): without it the water tinted the frame
    const frame = style
      ? piece(style, [{ pts: square(0.38), closed: true }], 0.07, CURSOR.frame)
      : new THREE.Mesh(
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
      style
        ? litPaint(style, CURSOR.arrow, { depthTest: false })
        : new THREE.MeshBasicMaterial({ color: CURSOR.arrow, depthTest: false }),
    );
    arrow.name = 'arrow';
    arrow.renderOrder = 11; // the arrow stays above everything (even behind a wall it shows where the cursor is); the frame does not
    this.cursor.add(frame, sharp(arrow));
    this.cursor.visible = false;
    this.root.add(this.cursor);
  }

  // a tile's marks on its ground; on a ramp lying flat on the climb, where the top half was buried (a lit mark is bent
  // over its ground instead)
  private seat(p: Pos) {
    const k = posKey(p),
      w = this.space.world(p),
      ramp = !!tileAt(this.space.grid, p).ramp,
      lit = !!this.style;
    const put = (m: THREE.Mesh, lift: number, lay: boolean) => {
      m.position.set(w.x, w.y + lift, w.z);
      m.rotation.set(0, 0, 0);
      m.scale.set(1, 1, 1);
      if (ramp && lay) this.space.lay(m, p);
      // still between seatings: thousands of tile marks no longer have their matrices worked out every frame
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      if (m.visible && lit && m !== this.pathDots.get(k)) m.geometry = this.bent(k, p);
    };
    put(this.marks.get(k)!, lit ? 0 : 0.02, !lit);
    put(this.danger.get(k)!, lit ? -0.004 : 0.015, !lit);
    put(this.pathDots.get(k)!, 0.03, true);
  }

  // The map builder's edit on a map of the same size (BattleScene.setGrid): every mark on its tile's new ground with the
  // same meshes and materials (building them again took a third of a 24x24 redraw and compiled their shaders again)
  reground() {
    this.ground = groundOf(this.scene, this.space);
    for (const g of this.tileGeo.values()) g.dispose();
    this.tileGeo.clear();
    for (const i of this.space.grid.tiles.keys())
      this.seat({ x: i % this.space.grid.width, y: Math.floor(i / this.space.grid.width) });
  }

  // the shared materials of a kind of lit tile mark: rim, glass and neon's halo
  private matsOf(kind: string, color: string, pattern: MarkPattern, opacity: number): THREE.Material[] {
    const key = `${kind}|${pattern}`;
    let m = this.tileMats.get(key);
    if (!m) this.tileMats.set(key, (m = tileMaterials(this.style!, color, pattern, opacity)));
    return m;
  }
  // a lit tile's geometry, bent over its ground: built on its first marking, kept for the battle
  private bent(k: string, p: Pos): THREE.BufferGeometry {
    let g = this.tileGeo.get(k);
    if (!g) this.tileGeo.set(k, (g = tileGeometry(this.style!, this.space, this.ground, p)));
    return g;
  }

  // a change of style (BattleScene.restyle) or of map (setGrid): this one leaves and a new one is built in the style of now
  again(): Marks {
    this.dispose();
    return new Marks(this.scene, this.space, this.camera);
  }
  private dispose() {
    this.scene.remove(this.root);
    for (const g of this.tileGeo.values()) g.dispose();
    for (const m of [...this.tileMats.values()].flat()) m.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
  }

  // charge danger tiles (chargeDanger keys)
  showDanger(hot: Map<string, string>) {
    for (const [k, m] of this.danger) {
      m.visible = hot.has(k);
      if (m.visible && this.style) m.geometry = this.bent(k, keyPos(k));
    }
  }

  // cutout points the crowns and the taller ground must not cover: the cursor and the marked tiles (see-through.ts)
  protect(add: CutAdd) {
    const c = this.cursor.position;
    if (this.cursor.visible) add(c.x, c.y + 0.3, c.z, 0.8, c.y);
    for (const w of this.marked) add(w.x, w.y + 0.05, w.z, 0.55, w.y);
  }

  update(dt: number) {
    // dt*30: arrives in ~0.1 s, fast so as not to delay whoever holds the arrow, smooth for the eye to follow
    this.cursor.position.lerp(this.cursorGoal, Math.min(1, dt * 30));
    this.cursor.getObjectByName('arrow')!.position.y =
      MARKER.arrowY + Math.sin(performance.now() / 250) * MARKER.arrowBob;
    // marked tiles breathe (±20% of opacity, ~1.9 s cycle): the map looks alive and the area reads without a strong blink
    // Reduce motion: no pulse, the marks rest at full strength
    const wave = reducedMotion() ? 1 : Math.sin(performance.now() / 300);
    if (this.style) pulse([...this.tileMats.values()].flat(), 0.5 + 0.5 * wave);
    else
      for (const m of this.marks.values())
        if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = m.userData.base * (0.8 + 0.2 * wave);
    if (this.aim) animateAim(this.aim, this.space, this.camera);
  }

  // Dotted line of the longest range (Nov 13, Fernando's request: "around the character the range of
  // their longest-hitting skill should show as dotted, and while they see the movement preview too"). Only rebuilds when it changes
  // and, on the menu, the blue outline of where the unit can still walk (`walk`, cell keys; Nov 21)
  private ring: { key: string; mesh: THREE.Group } | null = null;
  // `from`: the cells of the unit (a token occupies 2x2); `range` in cells
  setRangeRing(r: { from: Pos[]; range: number; walk?: string[] } | null) {
    const key = r ? `${posKey(r.from[0])}:${r.range}:${r.walk?.join(',') ?? ''}` : '';
    if (this.ring?.key === key) return;
    if (this.ring) {
      this.root.remove(this.ring.mesh);
      this.ring.mesh.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
      this.ring = null;
    }
    if (!r) return;
    const mesh = new THREE.Group();
    if (r.range >= 1) mesh.add(rangeRing(this.space, r, this.style, this.ground));
    if (r.walk?.length) mesh.add(walkRing(this.space, new Set(r.walk), this.style, this.ground));
    this.root.add(sharp(mesh));
    this.ring = { key, mesh };
  }

  // Shot preview (trajectory.ts), rebuilt on every cursor change, animated in update
  private aim: Aim | null = null;
  setTrajectory(t: { shot: Shot; cast: { radius: number; heal: boolean } | null } | null) {
    if (this.aim) {
      this.root.remove(this.aim.group);
      disposeAim(this.aim);
      this.aim = null;
    }
    if (!t) return;
    this.aim = trajectory(this.space, t, this.style);
    this.root.add(this.aim.group);
  }

  // where the cursor stands now (it slides), null when hidden
  cursorAt(): THREE.Vector3 | null {
    return this.cursor.visible ? this.cursor.position : null;
  }

  // `size`: the frame goes around the square a unit of that many cells per side would stand on, with its corner on `p` (Move);
  // {x, y} cells for a long body (the snake's 1x2).
  // `fits` false turns frame and arrow red: the arrow draws over everything, so a square hidden behind a barrel or a tree still
  // reads as not fitting
  setCursor(p: Pos | null, size: number | Pos = 1, fits = true) {
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
        if (this.style) tint(o, this.style, fits ? color : MARK.nogo[0]);
        else (o.material as THREE.MeshBasicMaterial).color.set(fits ? color : MARK.nogo[0]);
      // over a step or a ramp the flat frame floated off the lower cells' marks (stills at angles 0 and 2 on stage 0): there
      // the square's 4 marks and the arrow show it
      const ys = rectOf(p, size)
        .filter((c) => inBounds(this.space.grid, c))
        .map((c) => this.space.world(c).y);
      frame.visible = Math.max(...ys) - Math.min(...ys) < 0.01;
      // a square flat at its standing height, like the token on it (a big unit does not tilt on a ramp)
      if (size !== 1) {
        frame.rotation.set(0, 0, 0);
        frame.scale.set(sides(size).x, 1, sides(size).y);
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
      this.root.add(dots);
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
      this.root.add(sq);
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
    this.marked = h ? h.tiles.map(({ pos }) => this.space.world(pos)) : [];
    if (!h) return;
    for (const { pos, kind } of h.tiles) {
      const m = this.marks.get(posKey(pos))!;
      // a destination over a charge's purple keeps only its frame: the solid core washed the purple out of a token's square
      // (showDanger runs on sync, before the update that sets the marks)
      const onDanger = kind === 'target' && this.danger.get(posKey(pos))!.visible;
      const pattern = onDanger ? 'frame' : (MARK[kind][2] ?? 'frame');
      m.visible = true;
      if (this.style) {
        m.geometry = this.bent(posKey(pos), pos);
        m.material = this.matsOf(kind, MARK[kind][0], pattern, MARK[kind][1]);
        continue;
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      m.userData.base = MARK[kind][1]; // starting opacity of the pulse (frame)
      mat.color.set(MARK[kind][0]);
      mat.opacity = MARK[kind][1];
      mat.map = markTexture(pattern);
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
      dot.updateMatrix();
      dot.visible = true;
    }
  }
}
