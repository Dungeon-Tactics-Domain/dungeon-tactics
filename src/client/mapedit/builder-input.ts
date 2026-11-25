// The map builder's input (Nov 25, spec "Painting"): on the map, the left button or a finger paints with the tool
// (a drag is one stroke, applied at its end as one undo step), the right button brings plain ground back, the middle
// one or two fingers move the camera, the wheel and a pinch zoom. Keys and pad buttons go through keys.ts; the pad's
// Menu walks the side panel's controls (Builder.walkPanel). The battle builder's live map edit (battleedit/live-mode.ts)
// paints through the same input, with M, Esc or the pad's Menu leaving it (it has no panel).

import { PLAIN_GROUND } from '../../content/map-palette.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { clamp, type MapDoc } from '../../shared/mapedit/doc.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { tabbed } from '../icons.ts';
import { padSeen } from '../key-hints.ts';
import { gridStep, keyAction } from '../keyboard.ts';
import { screenSignal } from '../nav.ts';
import type { BattleScene } from '../scene.ts';
import type { Way } from '../ui3d/walk.ts';
import { pickTool } from './builder-actions.ts';
import type { BuilderUi } from './builder-ui.ts';
import { type EditAction, editKey, editPad } from './keys.ts';
import { BAR, type Brush, footprint, type Stroke, sameTool, type Tool, wholeOf } from './tools.ts';

export const ERASE: Tool = { k: 'paint', entry: PLAIN_GROUND };

// what the input paints on: the map builder (builder.ts) or the battle builder's live edit (battleedit/live-mode.ts)
export interface Painter {
  readonly host: HTMLElement;
  readonly scene: BattleScene;
  readonly doc: MapDoc;
  readonly ui: BuilderUi;
  tool: Tool;
  picked: string;
  brush: Brush;
  note: string;
  cursor: Pos;
  hover: Pos | null;
  stroke: Stroke | null;
  readPad?: (now: number, held?: boolean) => void; // `held`: only record what is down
  mark(): void;
  render(): void;
  endStroke(): void;
  applyAt(at: Pos, tool?: Tool): void;
  press(id: string): void;
  panelWalk?: boolean; // the pad walks the side panel's controls
  walkPanel?(way: Way | null): void;
  leave?(): void; // the live edit's way out, in place of the panel
}

export function wireInput(b: Painter, signal = screenSignal()) {
  const o = { signal },
    host = b.host,
    pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let panning = false;
  const tileAt = (x: number, y: number) => {
    const p = b.scene.pick(x, y);
    return p && wholeOf(p);
  };
  const onMap = (e: Event) => (e.target as Element).classList?.contains('board');
  const grow = (x: number, y: number) => {
    const p = tileAt(x, y);
    if (!p || !b.stroke) return;
    b.stroke.cells.push(...footprint(b.doc, p, b.brush));
    // the keyboard's cursor follows the paint, so Enter goes on where the mouse or the finger stopped
    b.hover = b.cursor = p;
    b.mark();
  };

  host.addEventListener(
    'pointerdown',
    (e) => {
      if (!onMap(e)) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size > 1) {
        // a second finger: a pinch and a pan, never paint
        b.stroke = null;
        const [p, q] = [...pointers.values()];
        pinch = Math.hypot(p.x - q.x, p.y - q.y);
        b.mark();
        return;
      }
      if (e.pointerType === 'mouse' && e.button === 1) {
        panning = true;
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      b.stroke = { tool: e.button === 2 ? ERASE : b.tool, cells: [] };
      grow(e.clientX, e.clientY);
    },
    o,
  );
  host.addEventListener(
    'pointermove',
    (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse' && onMap(e)) {
          b.hover = tileAt(e.clientX, e.clientY);
          b.mark();
        }
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()],
          d = Math.hypot(p.x - q.x, p.y - q.y);
        if (pinch && d) b.scene.zoom(pinch / d);
        pinch = d;
        b.scene.pan((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      } else if (panning) b.scene.pan(e.clientX - prev.x, e.clientY - prev.y);
      else grow(e.clientX, e.clientY);
    },
    o,
  );
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId) || pointers.size) return;
    pinch = 0;
    panning = false;
    if (e.type === 'pointercancel') b.stroke = null;
    b.endStroke();
    if (e.pointerType !== 'mouse') b.hover = null;
  };
  host.addEventListener('pointerup', up, o);
  host.addEventListener('pointercancel', up, o);
  host.addEventListener('contextmenu', (e) => e.preventDefault(), o);
  host.addEventListener(
    'wheel',
    (e) => {
      if (!onMap(e)) return;
      e.preventDefault();
      b.scene.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    },
    { ...o, passive: false },
  );

  addEventListener(
    'keydown',
    (e) => {
      const el = document.activeElement,
        typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && typing) return void (el as HTMLElement).blur();
      // a window over the battle (the debug panel, Options) keeps its keys
      if (document.querySelector('.overlay')) return;
      const k = keyAction(e)?.k;
      if (b.leave && (k === 'live' || k === 'cancel')) {
        e.preventDefault();
        return b.leave();
      }
      const a = editKey(e, typing);
      // Enter and Space on a button Tab reached press that button, as on any page
      if (!a || (a.k === 'confirm' && tabbed())) return;
      e.preventDefault();
      // a held Enter or Del paints once: the Enter that chose a row of a window must not paint on and on behind it
      if (b.leave && e.repeat && (a.k === 'confirm' || a.k === 'erase')) return;
      act(b, a);
    },
    o,
  );

  const mem = emptyMemory();
  let primed = false;
  b.readPad = (now, held = false) => {
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    padSeen(gp);
    const state = { buttons: gp.buttons.map((x) => x.pressed), axes: [...gp.axes] },
      acts = padActions(state, mem, now);
    // the first frame only records what is already down: the A that opened the screen does not paint
    if (!primed || held) return void (primed = true);
    for (const k of acts) {
      const a = editPad(k);
      if (a) act(b, a, true);
    }
  };
}

function act(b: Painter, a: EditAction, pad = false) {
  const s = b.scene;
  if (b.panelWalk && pad) {
    if (a.k === 'cursor') return b.walkPanel?.(a.dir);
    if (a.k === 'confirm') return (document.activeElement as HTMLElement | null)?.click();
    if (a.k === 'panel' || a.k === 'erase') return panel(b, false);
  }
  if (a.k === 'cursor') {
    const step = gridStep(a.dir, s.heading);
    b.cursor = {
      x: clamp(b.cursor.x + step.x, 0, b.doc.width - 1),
      y: clamp(b.cursor.y + step.y, 0, b.doc.height - 1),
    };
    b.hover = null;
  } else if (a.k === 'confirm') b.applyAt(b.cursor);
  else if (a.k === 'erase') b.applyAt(b.cursor, ERASE);
  else if (a.k === 'tool') pickTool(b, a.index);
  else if (a.k === 'nextTool') pickTool(b, BAR.findIndex((slot) => sameTool(slot.tool(b.picked), b.tool)) + 1);
  else if (a.k === 'panel') return b.leave ? b.leave() : panel(b, true);
  else if (a.k === 'rotate') s.rotate(a.dir);
  else if (a.k === 'zoom') s.zoom(a.factor);
  else if (a.k === 'recenter') s.resetView();
  else if (a.k === 'top') void s.top.toggle();
  else return b.press(a.k); // brush, undo, redo: the foot's buttons
  b.render();
  b.mark();
}

// the pad's way into the side panel and back to the map's cursor
function panel(b: Painter, on: boolean) {
  b.panelWalk = on;
  b.ui.padFocus = on;
  if (on) b.walkPanel?.(null);
  else (document.activeElement as HTMLElement | null)?.blur();
  b.render();
}
