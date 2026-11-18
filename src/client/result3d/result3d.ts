// The end of a battle drawn in 3D (localhost ?result=3d, or `result` in a sandbox spec; Fernando, Nov 16), a screen of
// the shared 3D layer (ui3d/layer.ts), laid out like FFT: The Ivalice Chronicles' victory screen (labs
// refs/fft-ivalice/73-vitoria-espolios.webp): the battle darkened, the title in capitals over a hairline, a line under
// it, and a dark band across the screen with what the battle gave on the left and who did the most on the right. A
// defeat is the same screen, darker, its title in the cold blue the classic game writes "Game Over" in (no capture of
// the remake's defeat was found).
//   State: nothing here decides anything. While this screen lives, resultBoard (game/end-screens.ts) hands it the same
//   board the HTML window would get; result-view.ts turns it into what to show and result-layout.ts says where.
//   Input: the board's own buttons, unseen, over the drawn ones, inside a window of dialog.ts: Enter, Esc, the pad
//   and the focus work as in every other window, and the glove points at the button in focus.
//   If the WebGL context goes while it shows, the HTML window opens in its place.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { dialog } from '../dialog.ts';
import { type Board, resultBoard, setBoard3d } from '../game/end-screens.ts';
import { el } from '../icons.ts';
import { alpha, clamp01, Icon, move } from '../menu3d/column.ts';
import { type Faces, faceMesh } from '../ui3d/face.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { bandMaterial, quad, type Rgb } from '../ui3d/panel.ts';
import { land, spring } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import { type Box, REF, type ResultLayout, resultLayout } from './result-layout.ts';
import { type ResultView, resultView } from './result-view.ts';

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const COLORS = ['title', 'lost', 'note', 'text', 'soft', 'veil', 'band', 'plate', 'line'] as const;

// a drawn piece: its full opacity, when it comes in as the screen opens (0 first) and how far above its place it starts
interface Part {
  mesh: Mesh;
  a: number;
  at: number;
  y: number;
  rise: number;
}
type Align = 'left' | 'centre' | 'right';

export class Result3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the board's buttons over the drawn ones; it sits in the window, so hiding the windows (the sandbox's `hide`) hides
  // the screen
  readonly host = el('div', { class: 'result3d-hits' });
  private readonly color: Record<(typeof COLORS)[number], string>;
  private readonly glove = new Icon(null, 'glove', undefined, 0.035);
  private readonly open = spring();
  private readonly gx = spring();
  private board?: Board;
  private view?: ResultView;
  private at?: ResultLayout;
  private win?: { overlay: HTMLElement; close(): void };
  private html?: { close(): void }; // the HTML window that took over after the context was lost
  private parts: Part[] = [];
  private readonly faces: Faces = new Map();
  private buttons: ShaderMaterial[] = [];
  private focus = 0;

  constructor(private readonly layer: Ui3dLayer) {
    const css = getComputedStyle(layer.root);
    this.color = Object.fromEntries(
      COLORS.map((name) => [name, css.getPropertyValue(`--ui3d-result-${name}`).trim()]),
    ) as typeof this.color;
    this.glove.model.rotation.set(0.2, -0.3, 0);
    this.glove.group.visible = false;
    this.deep.add(this.glove.group);
    const point = (e: Event) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      const i = b ? [...this.host.children].indexOf(b) : -1;
      if (i < 0) return;
      if (e.type === 'pointerover') return b?.focus();
      this.focus = i;
      this.layer.wake();
    };
    this.host.addEventListener('focusin', point);
    this.host.addEventListener('pointerover', point);
    // a held Enter or Space (the way to speed up the enemy's turn) would press the primary and close the board unread
    this.host.addEventListener('keydown', (e) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    });
    setBoard3d((b) => this.show(b));
    layer.add(this, 'result');
  }

  // The end of a battle (resultBoard): opens over whatever it showed before
  private show(board: Board) {
    this.hide();
    this.board = board;
    this.view = resultView(
      board,
      board.actions.map((b) => b.firstChild?.textContent ?? ''),
    );
    this.host.replaceChildren(...board.actions);
    this.win = dialog('result3d', board.title, [this.host], { onBack: board.onBack });
    // the arrows and the d-pad go to the button seen that way, and stay with none there (dialog.ts `walked`)
    this.win.overlay.addEventListener('walk', (e) => {
      const boxes = this.at?.buttons;
      if (!boxes) return;
      e.preventDefault();
      const at = board.actions.indexOf(document.activeElement as HTMLButtonElement);
      board.actions[neighbour(boxes, at < 0 ? this.focus : at, (e as CustomEvent<Way>).detail)]?.focus();
    });
    // Enter takes the primary, as in the HTML board: the board lists it first (the last one took the focus, and Enter
    // after a victory went to the town instead of playing again)
    (board.actions.find((b) => b.classList.contains('primary')) ?? board.actions[0])?.focus();
    land(this.open, 0);
    this.open.to = 1;
    this.build();
    land(this.gx, this.at?.buttons[this.focus]?.x ?? 0);
    return { close: () => (this.html ?? this.win)?.close() };
  }

  private hide() {
    for (const b of this.board?.actions ?? []) b.removeAttribute('style');
    this.win?.close();
    this.win = this.board = this.view = this.at = undefined;
    this.clear();
    this.glove.group.visible = false;
    this.layer.wake();
  }

  resize() {
    if (this.view) this.build();
  }

  private build() {
    const v = this.view;
    if (!v || !this.board) return;
    this.clear();
    const { layer, color: c } = this,
      s = layer.s;
    const L = (this.at = resultLayout(layer.stage, layer.w, v.heroes.length, v.spoils.length, v.actions.length));
    const add = (mesh: Mesh, a: number, at: number, rise = 0) => {
      this.parts.push({ mesh, a, at, y: mesh.position.y, rise });
      this.flat.add(mesh);
      return mesh;
    };
    const plate = (b: Box, hex: string, a: number, at: number, order = 61) =>
      add(quad(bandMaterial(b.w, b.h, s, rgb(hex)), b.x, b.y, b.w, b.h, order), a, at);
    // text in the theme's serif, `size` in px of the 1080p layout and never under the game's 16 px; shrunk to `room`
    const text = (str: string, size: number, hex: string, wrap?: number) => {
      const px = Math.max(16, size * s);
      return textMesh(
        str,
        {
          size: px,
          color: hex,
          font: layer.theme.font,
          width: wrap,
          line: wrap && Math.max(REF.noteLine * s, px * 1.3),
        },
        layer.dpr,
      );
    };
    const put = (m: Mesh, x: number, mid: number, align: Align, at: number, room = Infinity, rise = 0) => {
      m.scale.multiplyScalar(Math.min(1, room / m.scale.x));
      const left = align === 'left' ? x : align === 'right' ? x - m.scale.x : x - m.scale.x / 2;
      m.position.set(left + m.scale.x / 2, -mid, 0);
      m.renderOrder = 63;
      return add(m, 1, at, rise);
    };
    const middle = (b: Box) => b.y + b.h / 2;

    // the battle darkened (darker on a defeat), the band across the page and its two lines
    plate({ x: -8, y: -8, w: layer.w + 16, h: layer.h + 16 }, c.veil, v.won ? 0.8 : 0.92, 0, 60);
    plate({ ...L.band, x: -8, w: L.band.w + 16 }, c.band, 0.72, 0.1);
    for (const y of [L.band.y, L.band.y + L.band.h - 2 * s])
      plate({ x: -8, y, w: L.band.w + 16, h: 2 * s }, c.line, 0.9, 0.1, 62);
    put(text(v.title, REF.title, v.won ? c.title : c.lost), L.title.x, L.title.y, 'centre', 0, L.rule.w, 28 * s);
    plate(L.rule, c.line, 0.9, 0.1);
    const note = text(v.note, REF.note, v.won ? c.note : c.soft, L.note.w);
    put(note, L.note.x, L.note.y + note.scale.y / 2, 'centre', 0.15);

    // what the battle gave and each hero's line, under the left plate
    plate(L.left, c.plate, 0.95, 0.25, 62);
    put(text(v.heads[0], REF.head, c.text), L.left.x + L.left.w / 2, middle(L.left), 'centre', 0.25);
    // each hero: face, name, class and life, then what it did under the two columns' names (the HTML board's row)
    if (v.heroes.length) {
      put(text(v.did[0], REF.did, c.soft), L.did.dmg, L.did.y, 'right', 0.3);
      put(text(v.did[1], REF.did, c.soft), L.did.kills, L.did.y, 'right', 0.3);
    }
    v.heroes.forEach((h, i) => {
      const b = L.heroes[i],
        at = 0.3 + 0.05 * (i + 1),
        fell = h.tone === 'fell',
        gap = 10 * s;
      const face = faceMesh(this.faces, h.def, h.face, L.faces[i], () => layer.wake(), fell);
      face.renderOrder = 63;
      add(face, 1, at);
      // the numbers first: the words before them take the room that is left, the name the last to shrink
      put(text(h.kills, REF.row, fell ? c.soft : c.text), L.did.kills, middle(b), 'right', at);
      put(text(h.dmg, REF.row, fell ? c.soft : c.text), L.did.dmg, middle(b), 'right', at);
      let x = b.x + L.who;
      const end = L.did.dmg - 70 * s; // the damage column's own room
      const word = (str: string, size: number, hex: string, room: number) => {
        if (!str || room < 24 * s) return;
        x += put(text(str, size, hex), x, middle(b), 'left', at, room).scale.x + gap;
      };
      word(h.name, REF.row, fell ? c.soft : c.text, end - x);
      word(h.cls, REF.did, c.soft, end - x);
      word(h.life, REF.row, c.soft, end - x);
      word(h.line, REF.did, h.tone === 'gain' ? c.note : c.soft, end - x);
    });
    v.spoils.forEach(([k, value], i) => {
      const b = L.spoils[i],
        at = 0.3 + 0.05 * i;
      const key = put(text(k, REF.row, c.soft), b.x, middle(b), 'left', at, b.w * 0.75);
      put(text(value, REF.row, c.text), b.x + b.w, middle(b), 'right', at, b.w - key.scale.x - 16 * s);
    });

    // who did the most, under the right plate
    if (v.mvp) {
      plate(L.right, c.plate, 0.95, 0.25, 62);
      put(text(v.heads[1], REF.head, c.text), L.mvp.x, middle(L.right), 'centre', 0.25);
      put(text(v.mvp.name, REF.name, c.text), L.mvp.x, L.mvp.name, 'centre', 0.4, L.right.w);
      put(text(v.mvp.line, REF.row, c.soft), L.mvp.x, L.mvp.line, 'centre', 0.45, L.right.w);
      plate(L.mvp.rule, c.line, 0.9, 0.45, 62);
    }

    // the buttons, bottom right, each under its real button
    v.actions.forEach((name, i) => {
      const b = L.buttons[i];
      this.buttons.push(plate(b, c.plate, 0.95, 0.5, 62).material as ShaderMaterial);
      put(text(name, REF.button, c.text), b.x + b.w / 2, middle(b), 'centre', 0.5, b.w - 24 * s);
      Object.assign(this.board!.actions[i].style, {
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.w}px`,
        height: `${b.h}px`,
      });
    });
    layer.wake();
  }

  frame(dt: number, time: number) {
    // closed from outside (Esc, a button, the game): nothing left to show
    if (this.win && !this.win.overlay.isConnected) this.hide();
    const L = this.at;
    if (!L) return false;
    const { layer, glove } = this,
      s = L.s,
      still = layer.still;
    move(this.open, dt, still, 170, 18); // under-damped: the title drops a little past its place and settles
    const o = this.open.x;
    for (const p of this.parts) {
      alpha(p.mesh, p.a * clamp01((o - p.at) * 4));
      p.mesh.position.y = p.y + p.rise * (1 - o);
    }
    // the button in focus is lit and the glove points at it, sliding from one to the other
    const lit = rgb(this.color.line),
      plain = rgb(this.color.plate);
    this.buttons.forEach((m, i) => void m.uniforms.uColor.value.set(...(i === this.focus ? lit : plain)));
    const b = L.buttons[this.focus];
    const shown = b ? clamp01((o - 0.5) * 4) : 0;
    glove.group.visible = shown > 0.004;
    if (b) {
      this.gx.to = b.x - (REF.hand / 2) * s;
      move(this.gx, dt, still, 330, 25);
      const nudge = still ? 0 : Math.sin(time * 5.2) * 3.2 * s;
      glove.group.position.set(layer.snap(this.gx.x + nudge), -layer.snap(b.y + b.h / 2), 300);
      glove.group.scale.setScalar(REF.hand * s * shown);
    }
    return !still; // the glove sways for as long as the screen shows
  }

  private clear() {
    for (const { mesh } of this.parts) {
      if (mesh.userData.label) dropText(mesh);
      else {
        mesh.removeFromParent();
        (mesh.material as ShaderMaterial).dispose();
      }
    }
    this.parts = [];
    this.buttons = [];
  }

  dispose() {
    const board = this.board;
    this.hide();
    setBoard3d();
    this.layer.remove(this);
    this.glove.dispose();
    for (const tex of this.faces.values()) tex.dispose();
    this.host.remove();
    if (board) this.html = resultBoard(board);
  }
}
