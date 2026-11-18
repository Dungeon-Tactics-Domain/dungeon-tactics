// The floating numbers over the units: each pops from a chest, lifted over any number still showing, follows it on
// screen and leaves when its time is up; also where a world point falls on the canvas, and the note over the cursor.
// The 3D layer draws both (hints3d/effects3d.ts, through looks3d.ts); what is kept and for how long stays here.
import * as THREE from 'three';
import { liftOver, type NumberBox } from '../hit-weight.ts';
import { looks3d, type NumberMark } from '../looks3d.ts';
import { TIMING } from '../timing.ts';

const TMP = new THREE.Vector3(); // per-frame math without creating objects

// world point `w` on the canvas, in px (the canvas fills the whole host)
export function onScreen(w: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const p = TMP.copy(w).project(camera);
  return { x: ((p.x + 1) / 2) * canvas.clientWidth, y: ((1 - p.y) / 2) * canvas.clientHeight };
}

export class FloatNumbers {
  private readonly numbers: { mark: NumberMark; at: THREE.Vector3; box: NumberBox }[] = []; // kept on their chest

  constructor(
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  // the numbers follow their chest while the camera slides or closes in
  follow() {
    for (const n of this.numbers) {
      const s = onScreen(n.at, this.camera, this.canvas);
      n.box.x = s.x;
      n.box.y = s.y - n.box.h / 2;
      n.mark.place(n.box.x, n.box.y + n.box.h / 2 - n.box.lift);
    }
  }

  // The number pops from the chest `at` on the impact frame and follows it (follow), lifted over any number still on
  // screen (liftOver); `px` sizes it by the share of life. It leaves on the wall clock with its CSS animation
  // (TIMING.float), so a slow motion, a camera that goes back or a death never leaves one hanging
  show(at: THREE.Vector3, text: string, cls: string, px: number) {
    const s = onScreen(at, this.camera, this.canvas);
    const mark = looks3d.effects?.number(text, cls, px);
    if (!mark) return; // the context lost: the warning covers the page
    // measured once on screen, so a wider number (a ✦, a "Miss") keeps its real room; `y` is where it is drawn while
    // it holds: `pop` raises it by its own height from the chest, so a big number sits higher than a small one
    const box = {
      x: s.x,
      y: s.y - px / 2,
      w: mark.w,
      h: px,
    };
    const lift = liftOver(
      this.numbers.map((o) => o.box),
      box,
    );
    // placed now, not on the next frame, so it never flashes in the corner
    mark.place(box.x, box.y + px / 2 - lift);
    const n = { mark, at, box: { ...box, lift } };
    this.numbers.push(n);
    setTimeout(() => {
      mark.remove();
      this.numbers.splice(this.numbers.indexOf(n), 1);
    }, TIMING.float);
  }
}

// The counter a Move destination draws (Nov 15, Fernando): a sword and the damage the counters there would deal, beside
// the cursor, following its slide and the camera every frame like the menu beside the unit
export class CursorNote {
  private text: string | null = null;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly cursorAt: () => THREE.Vector3 | null,
  ) {}

  // null hides it
  set(text: string | null) {
    this.text = text;
  }

  follow() {
    const at = this.text ? this.cursorAt() : null,
      s = at && onScreen(at, this.camera, this.canvas);
    looks3d.effects?.note(s ? this.text : null, s?.x ?? 0, s?.y ?? 0);
  }
}
