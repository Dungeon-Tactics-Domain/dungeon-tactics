// The battle builder's input (grill, Nov 25), the map builder's keys and gestures (mapedit/keys.ts) with the battle
// builder's meaning: the left button, a tap or Enter use the tool on the tile, the right button or Del remove the unit,
// the middle button or two fingers move the camera, the wheel and a pinch zoom; 1 to 9 press the bar's plates, B and the
// pad's Y the next class, the pad's X the next tool, Menu into the side panel and back.
import { clamp } from '../../shared/mapedit/doc.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { tabbed } from '../icons.ts';
import { padSeen } from '../key-hints.ts';
import { gridStep } from '../keyboard.ts';
import { type EditAction, editKey, editPad } from '../mapedit/keys.ts';
import { wholeOf } from '../mapedit/tools.ts';
import { screenSignal } from '../nav.ts';
import { applyAt, nextClass, pressBar, remove } from './actions.ts';
import type { BattleBuilder } from './builder.ts';
import { BAR } from './panel.ts';

export function wireInput(b: BattleBuilder) {
  const signal = screenSignal(),
    o = { signal },
    host = b.host,
    pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let panning = false;
  let moved = false; // a finger that moved the map does not also tap
  const tileAt = (x: number, y: number) => {
    const p = b.scene.pick(x, y);
    return p && wholeOf(p);
  };
  const onMap = (e: Event) => (e.target as Element).classList?.contains('board');

  host.addEventListener(
    'pointerdown',
    (e) => {
      if (!onMap(e)) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = pointers.size > 1;
      if (pointers.size > 1) {
        const [p, q] = [...pointers.values()];
        pinch = Math.hypot(p.x - q.x, p.y - q.y);
      }
      panning = e.pointerType === 'mouse' && e.button === 1;
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
    },
    o,
  );
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId) || pointers.size) return;
    pinch = 0;
    const tap = !moved && !panning && e.type === 'pointerup' && (e.pointerType !== 'mouse' || e.button !== 1);
    panning = false;
    const p = tap && tileAt(e.clientX, e.clientY);
    if (p) {
      b.cursor = p;
      if (e.pointerType === 'mouse' && e.button === 2) remove(b, p);
      else applyAt(b, p);
      b.render();
    }
    if (e.pointerType !== 'mouse') b.hover = null;
    b.mark();
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

function act(b: BattleBuilder, a: EditAction, pad = false) {
  const s = b.scene;
  if (b.panelWalk && pad) {
    if (a.k === 'cursor') return b.walkPanel(a.dir);
    if (a.k === 'confirm') return (document.activeElement as HTMLElement | null)?.click();
    if (a.k === 'panel' || a.k === 'erase') return panel(b, false);
  }
  if (a.k === 'cursor') {
    const step = gridStep(a.dir, s.heading),
      m = b.doc.map;
    b.cursor = { x: clamp(b.cursor.x + step.x, 0, m.width - 1), y: clamp(b.cursor.y + step.y, 0, m.height - 1) };
    b.hover = null;
  } else if (a.k === 'confirm') applyAt(b, b.cursor);
  else if (a.k === 'erase') remove(b, b.cursor);
  else if (a.k === 'tool') pressBar(b, a.index);
  // the pad's X walks the four tools (the bar's first plates)
  else if (a.k === 'nextTool') pressBar(b, (BAR.indexOf(b.tool) + 1) % 4);
  else if (a.k === 'brush') nextClass(b, 1);
  else if (a.k === 'panel') return panel(b, true);
  else if (a.k === 'rotate') s.rotate(a.dir);
  else if (a.k === 'zoom') s.zoom(a.factor);
  else if (a.k === 'recenter') s.resetView();
  else if (a.k === 'top') void s.top.toggle();
  else return b.press(a.k); // undo, redo: the foot's buttons
  b.render();
  b.mark();
}

function panel(b: BattleBuilder, on: boolean) {
  b.panelWalk = on;
  b.ui.padFocus = on;
  if (on) b.walkPanel(null);
  else (document.activeElement as HTMLElement | null)?.blur();
  b.render();
}
