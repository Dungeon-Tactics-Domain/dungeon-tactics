// A sample of the board's marks in the 3D Options (Fernando, Nov 19: "Marks" shows each style on a piece of ground as it
// is picked): five by five tiles with a walk area, the striking area, the acting tile, a path, and the cursor, built from
// the very pieces the battle's marks are (scene/mark-kit.ts, mark-looks.ts), seen from above and aside. It lives in the
// screen's `deep` group, which has a depth buffer, so the lit styles bring their own two lights.
import {
  AmbientLight,
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import type { Pos } from '../../shared/battle/types.ts';
import type { TileKind } from '../interaction.ts';
import type { MarkStyle } from '../mark-style.ts';
import { reducedMotion } from '../motion.ts';
import { dressTile, litPaint, piece, pulse, square, tileGeometry, tileMaterials } from '../scene/mark-kit.ts';
import { MARK, markTexture } from '../scene/mark-looks.ts';
import type { Box } from './options-layout.ts';

const N = 5; // tiles a side
const at = (x: number, y: number): Pos => ({ x, y });
// the marks of a turn on the sample: where the acting tile is, where it walks, where it strikes, the path and the cursor
const KINDS: [TileKind, Pos[]][] = [
  ['move', [at(0, 1), at(0, 2), at(0, 3), at(1, 1), at(1, 2), at(1, 3)]],
  ['range', [at(3, 1), at(3, 2), at(3, 3), at(4, 2)]],
  ['actor', [at(2, 2)]],
];
const PATH = [at(1, 2), at(0, 2)];
const CURSOR = at(3, 2);
// the cursor's colours and heights are marks.ts's (CURSOR, MARKER): copied, not imported, so this chunk does not carry the
// whole Marks class; change them together
const FRAME = '#ffffff';
const ARROW = '#ffcf4a';
const TILT = 0.95; // rad: how far the ground leans back; the board's own camera is about as steep
const YAW = Math.PI / 4;

// a tile's place on the sample, centred: the TileSpace the lit marks read, needing only where a tile stands
const space = { world: (p: Pos) => new Vector3(p.x - (N - 1) / 2, 0, p.y - (N - 1) / 2) };
const ground = () => 0.022; // the board's own lift over its ground (mark-kit LIFT)

// the sample ground: two greens, so the marks read against tiles as on the map
function board(into: Group, geos: BufferGeometry[], mats: Material[]) {
  const box = new BoxGeometry(0.98, 0.4, 0.98).translate(0, -0.2, 0);
  const tone = ['#46563a', '#516343'].map((c) => new MeshStandardMaterial({ color: c, roughness: 1 }));
  geos.push(box);
  mats.push(...tone);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const m = new Mesh(box, tone[(x + y) % 2]);
      const w = space.world(at(x, y));
      m.position.set(w.x, 0, w.z);
      into.add(m);
    }
}

// the marks in the style `s`: simples is the flat drawing, the others the lit pieces
function marks(s: MarkStyle, into: Group, geos: BufferGeometry[], mats: Material[]): Material[] {
  const lit = s === 'simples' ? null : s;
  const breathe: Material[] = [];
  const flat = new PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
  geos.push(flat);
  const tile = (kind: TileKind, p: Pos) => {
    const [color, opacity, pattern = 'frame'] = MARK[kind];
    const w = space.world(p);
    let m: Mesh;
    if (lit) {
      const g = tileGeometry(lit, space, ground, p);
      const own = tileMaterials(lit, color, pattern, opacity);
      geos.push(g);
      mats.push(...own);
      breathe.push(...own);
      m = dressTile(new Mesh(g, own));
      m.position.set(w.x, 0, w.z);
    } else {
      const mat = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        map: markTexture(pattern),
        color,
        opacity,
      });
      mats.push(mat);
      m = new Mesh(flat, mat);
      m.position.set(w.x, 0.02, w.z);
    }
    into.add(m);
  };
  for (const [kind, ps] of KINDS) for (const p of ps) tile(kind, p);
  // the path's dots: studs when lit, flat squares otherwise
  const dot = lit
    ? new CylinderGeometry(0.1, 0.15, 0.06, 10).translate(0, 0.03, 0)
    : new PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
  geos.push(dot);
  for (const p of PATH) {
    const w = space.world(p);
    const mat = lit
      ? litPaint(lit, MARK.path[0])
      : new MeshBasicMaterial({ color: MARK.path[0], transparent: true, opacity: MARK.path[1], depthWrite: false });
    mats.push(mat);
    const d = new Mesh(dot, mat);
    d.position.set(w.x, lit ? 0.03 : 0.03, w.z);
    into.add(d);
  }
  // the cursor: a frame at the tile and an arrow over it
  const w = space.world(CURSOR);
  const frame = lit
    ? piece(lit, [{ pts: square(0.38), closed: true }], 0.07, FRAME)
    : new Mesh(
        new RingGeometry(0.44, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ color: FRAME, transparent: true, depthWrite: false }),
      );
  const arrowMat = lit
    ? litPaint(lit, ARROW, { depthTest: false })
    : new MeshBasicMaterial({ color: ARROW, depthTest: false });
  const arrow = new Mesh(new ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI), arrowMat);
  geos.push(arrow.geometry);
  mats.push(arrowMat);
  frame.position.set(w.x, 0.04, w.z); // the map's MARKER.frameY
  arrow.position.set(w.x, 0.7, w.z); // a unit stands here on the map, with the arrow over its head; lower, to keep the sample small
  frame.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) geos.push(m.geometry);
    if (m.material) mats.push(...[m.material].flat());
  });
  into.add(frame, arrow);
  return breathe;
}

export class MarksPreview {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private breathe: Material[] = [];
  private style?: MarkStyle;

  constructor() {
    this.body.rotation.set(TILT, YAW, 0);
    this.group.visible = false;
    const sun = new DirectionalLight('#fff2dd', 2.4);
    sun.position.set(-200, 400, 500);
    this.group.add(this.body, new AmbientLight('#b8c4e0', 1.1), sun);
  }

  // `box`: where the sample stands on the page (px, y down), or null to hide it; `time`: the layer's clock
  show(box: Box | null, style: MarkStyle, time: number) {
    this.group.visible = !!box;
    if (!box) return;
    if (style !== this.style) {
      this.style = style;
      this.clear();
      this.breathe = marks(style, this.body, this.geos, this.mats);
      board(this.body, this.geos, this.mats);
    }
    // the diagonal of the five tiles is what has to fit the width, and its lean what has to fit the height
    const diag = N * Math.SQRT2 + 0.2;
    const k = Math.min(box.w / diag, box.h / (diag * Math.sin(TILT) + 1));
    this.group.position.set(box.x + box.w / 2, -(box.y + box.h / 2), 0);
    this.body.scale.setScalar(k);
    pulse(this.breathe, reducedMotion() ? 1 : 0.5 + 0.5 * Math.sin(time * 3.3));
  }

  private clear() {
    this.body.clear();
    for (const g of this.geos.splice(0)) g.dispose();
    for (const m of this.mats.splice(0)) m.dispose();
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
