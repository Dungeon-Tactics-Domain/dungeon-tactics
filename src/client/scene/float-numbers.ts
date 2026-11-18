// The floating numbers over the units: each pops from a chest, lifted over any number still showing, follows it on
// screen and leaves with its CSS animation; also where a world point falls on the canvas, and the note over the cursor.
// With the 3D effects on (screen-effects.ts) the 3D layer draws both; what is kept and for how long stays here.
import * as THREE from 'three';
import { liftOver, type NumberBox } from '../hit-weight.ts';
import { abilityIcon, el } from '../icons.ts';
import { effects3d, type NumberMark } from '../screen-effects.ts';
import { TIMING } from '../timing.ts';

const TMP = new THREE.Vector3(); // per-frame math without creating objects

// world point `w` on the canvas, in px (the canvas fills the whole host)
export function onScreen(w: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const p = TMP.copy(w).project(camera);
  return { x: ((p.x + 1) / 2) * canvas.clientWidth, y: ((1 - p.y) / 2) * canvas.clientHeight };
}

// the number as HTML: its CSS animation moves it from the point it is placed on
function htmlNumber(floats: HTMLElement, text: string, cls: string, px: number): NumberMark {
  const node = el('div', { class: `float ${cls}`, style: `font-size:${px}px` }, text);
  floats.append(node);
  return {
    w: node.offsetWidth,
    place(x, y) {
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    },
    remove: () => node.remove(),
  };
}

export class FloatNumbers {
  private readonly numbers: { mark: NumberMark; at: THREE.Vector3; box: NumberBox }[] = []; // kept on their chest

  constructor(
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly floats: HTMLElement,
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
    const mark = effects3d()?.number(text, cls, px) ?? htmlNumber(this.floats, text, cls, px);
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
  private readonly node = el('div', { class: 'cursor-note', hidden: true }, abilityIcon('strike'), el('span'));
  private text: string | null = null;

  constructor(
    floats: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly cursorAt: () => THREE.Vector3 | null,
  ) {
    floats.append(this.node);
  }

  // null hides it
  set(text: string | null) {
    this.text = text;
    this.node.lastElementChild!.textContent = text ?? '';
  }

  follow() {
    const fx = effects3d(),
      at = this.text ? this.cursorAt() : null,
      s = at && onScreen(at, this.camera, this.canvas);
    this.node.hidden = !this.text || !!fx;
    fx?.note(s ? this.text : null, s?.x ?? 0, s?.y ?? 0);
    if (!s || fx) return;
    this.node.style.left = `${s.x}px`;
    this.node.style.top = `${s.y}px`;
  }
}
