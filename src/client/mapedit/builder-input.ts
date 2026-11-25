// The map builder's input (Nov 25, spec "Painting"): on the map, the left button or a finger paints with the tool
// (a drag is one stroke, applied at its end as one undo step), the right button brings plain ground back, the middle
// one or two fingers move the camera, the wheel and a pinch zoom. Keys and pad buttons go through keys.ts; the pad's
// Menu walks the side panel's controls (Builder.walkPanel).

import { PLAIN_GROUND } from '../../content/map-palette.ts';
import { clamp } from '../../shared/mapedit/doc.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { tabbed } from '../icons.ts';
import { padSeen } from '../key-hints.ts';
import { gridStep } from '../keyboard.ts';
import { screenSignal } from '../nav.ts';
import type { Builder } from './builder.ts';
import { pickTool } from './builder-actions.ts';
import { type EditAction, editKey, editPad } from './keys.ts';
import { BAR, footprint, sameTool, type Tool, wholeOf } from './tools.ts';

const ERASE: Tool = { k: 'paint', entry: PLAIN_GROUND };

export function wireInput(b: Builder) {
  const signal = screenSignal(),
    o = { signal },
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
      const a = editKey(e, typing);
      // Enter and Space on a button Tab reached press that button, as on any page
      if (!a || (a.k === 'confirm' && tabbed())) return;
      e.preventDefault();
      act(b, a);
    },
    o,
  );

  const mem = emptyMemory();
  b.readPad = (now) => {
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    padSeen(gp);
    const state = { buttons: gp.buttons.map((x) => x.pressed), axes: [...gp.axes] };
    for (const k of padActions(state, mem, now)) {
      const a = editPad(k);
      if (a) act(b, a, true);
    }
  };
}

function act(b: Builder, a: EditAction, pad = false) {
  const s = b.scene;
  if (b.panelWalk && pad) {
    if (a.k === 'cursor') return b.walkPanel(a.dir);
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
  else if (a.k === 'panel') return panel(b, true);
  else if (a.k === 'rotate') s.rotate(a.dir);
  else if (a.k === 'zoom') s.zoom(a.factor);
  else if (a.k === 'recenter') s.resetView();
  else if (a.k === 'top') void s.top.toggle();
  else return b.press(a.k); // brush, undo, redo: the foot's buttons
  b.render();
  b.mark();
}

// the pad's way into the side panel and back to the map's cursor
function panel(b: Builder, on: boolean) {
  b.panelWalk = on;
  b.ui.padFocus = on;
  if (on) b.walkPanel(null);
  else (document.activeElement as HTMLElement | null)?.blur();
  b.render();
}
