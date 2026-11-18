// The developer menu drawn in 3D (Fernando, Nov 18: the whole interface in 3D, forms
// too), a screen of the shared 3D layer (ui3d/layer.ts) in the look of the other flow screens: the game darkened, the
// name over a hairline, one parchment sheet with the form on it, the glove on the field in focus, the keys at the foot.
//   State: the cast and its rules are dev-roster.ts'; dev-view.ts turns it into fields and an edit into the next cast.
//   Every edit is saved at once (dt:dev), as in the HTML menu.
//   Input: one real control under each drawn field (ui3d/field-dom.ts), unseen, inside a window of dialog.ts and placed
//   by the same layout: typing, the IME, Tab, Enter, Esc, the pad, a tap, the list's own scroll and a screen reader are
//   the window's. Arrows and the d-pad go to the field seen that way; on a number or a pick left and right change the
//   value, in a text they move the caret.
//   Any page size takes it (dev-view.ts devLayout); with no WebGL or the context lost, the warning (no3d.ts).
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { DEV_KEY, type DevSetup, defaultSetup, parseSetup } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { Part } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import { fill } from '../looks3d.ts';
import { alpha } from '../menu3d/column.ts';
import { store } from '../store.ts';
import { type Field, fieldParts, fieldWalk, flowFields, shown, sideways, thumb } from '../ui3d/field.ts';
import {
  type FieldActs,
  type FieldEls,
  fieldEls,
  hoverCursor,
  isTextEl,
  openFile,
  placeField,
  saveFile,
  syncField,
} from '../ui3d/field-dom.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { ease } from '../ui3d/spring.ts';
import type { Way } from '../ui3d/walk.ts';
import {
  type Change,
  type DevLayout,
  type DevUi,
  devEdit,
  devFields,
  devJson,
  devLayout,
  readSetup,
} from './dev-view.ts';
import { type Colors, colors, Hand, label, lift, put, rgba, solid } from './draw.ts';
import { FieldArt, type Live } from './field-draw.ts';

const UNIT = /^[he]\d+$/; // a unit's own row: it opens and closes its fields

export class Dev3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the form's scrolling window, unseen; it sits in the dialog, so hiding the windows hides the screen
  readonly host = el('div', { class: 'f3d-list' });
  private readonly sizer = el('div');
  private readonly color: Colors;
  private readonly warn: string;
  private readonly hand = new Hand(this.deep);
  private readonly paint = paintTexture();
  private readonly pen = document.createElement('canvas').getContext('2d')!; // measures the text under a caret
  private readonly fixed = new Part(); // the veil, the name, the keys
  private readonly band = new Part(); // under the field in focus
  private readonly mark = new Part(); // the scroll mark
  private paper?: Mesh;
  private readonly els = new Map<string, FieldEls>();
  private readonly arts = new Map<string, FieldArt>();
  private fields: Field[] = [];
  private boxes: Box[] = [];
  private content = 0;
  private at?: DevLayout;
  private win?: { overlay: HTMLElement; close(): void };
  private setup: DevSetup = defaultSetup('beacon_hill');
  private ui: DevUi = {};
  private go?: { start: (setup: DevSetup) => void; onBack?: () => void };
  private readonly release: () => void;
  private open = 0;
  private readonly ac = new AbortController();
  private readonly wake = () => this.layer.wake();
  private readonly acts: FieldActs = {
    step: (id, dir) => this.edit(id, dir),
    set: (id, v) => {
      // what was typed gives way to what the cast took of it (a number back inside its limits)
      delete this.els.get(id)?.main.dataset.from;
      if (id === 'json') this.take(readSetup(String(v)), 'text');
      else this.edit(id, v);
    },
    press: (id) => this.press(id),
  };

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.warn = getComputedStyle(layer.root).getPropertyValue('--ui3d-town-down').trim();
    this.flat.add(this.fixed.group, this.band.group, this.mark.group);
    this.host.append(this.sizer);
    const { signal } = this.ac;
    // the focus moved, a text or its caret changed, the list or an area scrolled (scroll does not bubble)
    for (const type of ['focusin', 'input']) this.host.addEventListener(type, this.wake, { signal });
    this.host.addEventListener('scroll', this.wake, { capture: true, passive: true, signal });
    document.addEventListener('selectionchange', this.wake, { signal });
    hoverCursor(this.host, signal);
    this.release = fill('dev', (start, onBack) => this.show(start, onBack));
    layer.add(this, 'dev');
  }

  private show(start: (setup: DevSetup) => void, onBack?: () => void) {
    this.hide();
    this.setup = parseSetup(store.json(DEV_KEY)) ?? defaultSetup('beacon_hill');
    this.ui = {};
    this.go = { start, onBack };
    this.win = dialog('form3d', t('Desenvolvedor', 'Developer'), [this.host], { onBack });
    this.win.overlay.addEventListener('walk', (e) => this.walk(e as CustomEvent<Way>));
    this.open = 0;
    this.layer.solo = this; // the game's own 3D pieces stay out, as its HUD does
    this.render();
    this.focus();
    this.hand.reset();
  }

  // the field in focus, by its place in the list (-1: none)
  private get focused() {
    const active = document.activeElement;
    return this.fields.findIndex((f) => this.els.get(f.id)?.main === active);
  }
  // the cursor onto the first of `ids` that is on the form; with none, the first field
  private focus(...ids: string[]) {
    const id = ids.find((x) => this.els.has(x)) ?? this.fields[fieldWalk(this.fields, this.boxes, -1, 'down')]?.id;
    this.els.get(id ?? '')?.main.focus();
  }

  // An arrow or the d-pad (dialog.ts `walked`). Not taken (the key stays the control's own): left and right in a text,
  // every arrow inside lines of text until the caret is at their first or last place
  private walk(e: CustomEvent<Way>) {
    const way = e.detail,
      at = this.focused,
      f = this.fields[at],
      active = document.activeElement;
    if (f && (way === 'left' || way === 'right')) {
      const does = sideways(f);
      if (does === 'caret') return;
      if (does === 'step') {
        e.preventDefault();
        return this.edit(f.id, way === 'left' ? -1 : 1);
      }
    }
    // a pad has no caret to move: on it the d-pad always leaves the lines
    if (active instanceof HTMLTextAreaElement && this.layer.keys === 'keyboard') {
      const edge = way === 'up' ? active.selectionEnd === 0 : active.selectionStart === active.value.length;
      if (!edge) return;
    }
    e.preventDefault();
    const to = this.els.get(this.fields[fieldWalk(this.fields, this.boxes, at, way)]?.id ?? '')?.main;
    to?.focus();
    // into lines of text: the caret at the end the cursor came from, so the same arrow goes on through
    if (to instanceof HTMLTextAreaElement && to !== active) {
      const end = way === 'up' ? to.value.length : 0;
      to.setSelectionRange(end, end);
    }
  }

  private press(id: string) {
    if (id === 'start') {
      const { go, setup } = this;
      this.win?.close();
      go?.start(setup);
    } else if (id === 'back') {
      const back = this.go?.onBack;
      this.win?.close();
      back?.();
    } else if (id === 'export') saveFile(`dungeon-tactics-elenco-${this.setup.map}.json`, devJson(this.setup));
    else if (id === 'import')
      openFile('application/json,.json', (text) => this.win && this.take(readSetup(text), 'file'));
    else if (UNIT.test(id)) {
      this.ui.open = this.ui.open === id ? undefined : id;
      this.render();
    } else this.edit(id, 1);
  }

  private edit(id: string, c: Change) {
    const before = this.setup;
    this.setup = devEdit(before, id, c);
    this.ui.msg = '';
    store.set(DEV_KEY, JSON.stringify(this.setup));
    // a unit came: its fields open, the cursor on its row; one left: the cursor on the row above it, or on Add
    const [, tag, add, n] = /^([he])(?:(\+)|(\d+)\.del)$/.exec(id) ?? [];
    const changed = !!tag && this.setup !== before;
    if (changed) this.ui.open = add ? `${tag}${this.setup[tag === 'h' ? 'heroes' : 'enemies'].length - 1}` : undefined;
    this.render();
    if (changed) this.focus(add ? (this.ui.open ?? '') : `${tag}${Math.max(0, Number(n) - 1)}`, `${tag}+`);
  }

  // a cast read from a file or from the text field: only a whole, valid one replaces the cast
  private take(setup: DevSetup | null, from: 'file' | 'text') {
    if (setup) {
      this.setup = setup;
      this.ui.open = undefined;
      store.set(DEV_KEY, JSON.stringify(setup));
    }
    const what = from === 'file' ? t('Arquivo', 'File') : t('Texto', 'Text');
    this.ui.msg = setup
      ? t('Elenco importado.', 'Cast imported.')
      : t(
          `${what} inválido: o elenco não mudou. Confira o JSON.`,
          `Invalid ${what.toLowerCase()}: the cast did not change. Check the JSON.`,
        );
    this.render();
  }
  private hide() {
    this.win?.close();
    if (this.layer.solo === this) this.layer.solo = undefined;
    this.win = this.at = this.go = undefined;
    for (const e of this.els.values()) for (const x of [e.main, e.less, e.more]) x?.remove();
    this.els.clear();
    for (const a of this.arts.values()) this.drop(a);
    this.arts.clear();
    for (const p of [this.fixed, this.band, this.mark]) p.clear();
    this.paper?.removeFromParent();
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper = undefined;
    this.fields = [];
    this.hand.point(this.layer, null, 0, 0, 0, 0, true);
    this.layer.wake();
  }
  private drop(a: FieldArt) {
    a.clear();
    a.part.group.removeFromParent();
  }

  resize() {
    if (this.win) this.render();
  }

  // The fields of the cast as it is now, the layout, each real control and each drawing onto its box. Controls and
  // drawings are kept by the field's id, so the focus and a text being typed stay through a change
  private render() {
    const { layer, sizer } = this;
    const L = (this.at = devLayout(layer.w, layer.h)),
      px = (v: number) => `${v}px`;
    this.fields = devFields(this.setup, this.ui);
    const flow = flowFields(this.fields, L.m);
    this.boxes = flow.boxes;
    this.content = flow.height;
    Object.assign(this.host.style, {
      left: px(L.list.x),
      top: px(L.list.y),
      width: px(L.list.w),
      height: px(L.list.h),
    });
    sizer.style.height = px(flow.height);
    const ids = new Set(this.fields.map((f) => f.id));
    for (const [id, e] of this.els)
      if (!ids.has(id) || e.kind !== this.fields.find((f) => f.id === id)?.kind) {
        for (const x of [e.main, e.less, e.more]) x?.remove();
        this.els.delete(id);
      }
    for (const [id, a] of this.arts)
      if (!ids.has(id)) {
        this.drop(a);
        this.arts.delete(id);
      }
    // last to first, each before the one after it: the controls keep the fields' order (Tab's and the reader's) and
    // one already in place is never moved (moving the control in focus would drop the focus)
    let next: Node | null = null;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      let e = this.els.get(f.id);
      if (!e) this.els.set(f.id, (e = fieldEls(f, this.acts)));
      syncField(f, e);
      placeField(f, e, this.boxes[i], fieldParts(f, this.boxes[i], L.m), L.m);
      for (const x of [e.more, e.less, e.main]) {
        if (!x) continue;
        if (x.parentNode !== sizer || x.nextSibling !== next) sizer.insertBefore(x, next);
        next = x;
      }
      if (!this.arts.has(f.id)) {
        const a = new FieldArt();
        this.arts.set(f.id, a);
        this.flat.add(a.part.group);
      }
    }
    this.fixed.key = '';
    this.band.key = '';
    this.paper?.removeFromParent();
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    const pad = Math.max(16, 44 * L.s),
      P = L.panel;
    const paper = paperMaterial(this.paint, layer.theme, { w: P.w, h: P.h, pad, unit: Math.max(0.6, L.s), seed: 11 });
    this.paper = quad(paper, P.x - pad, P.y - pad, P.w + 2 * pad, P.h + 2 * pad, 62);
    this.flat.add(this.paper);
    this.mark.clear();
    const th = thumb(L.list, this.content, 0, L.s);
    if (th) this.mark.box(0, 0, th.w, th.h, th.w / 2, rgba(layer.theme.ink, 0.55));
    lift(this.mark, 40);
    layer.wake();
  }

  // the veil, the name over its hairline and the keys at the foot, for the input in use
  private drawFixed(L: DevLayout) {
    const { layer, fixed, color: c } = this;
    const keys = layer.keysLine([
      ['move', t('mover e mudar o valor', 'move and change the value')],
      ['confirm', t('escolher', 'choose')],
      ['cancel', t('voltar', 'back')],
    ]);
    if (fixed.key === keys) return;
    fixed.clear();
    fixed.key = keys;
    fixed.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(c.veil)); // solid, as the Options: the game stays under it
    put(fixed, label(layer, L.s, t('Desenvolvedor', 'Developer'), 34, c.title), L.title.x, L.title.y, 'centre');
    fixed.box(L.rule.x, L.rule.y, L.rule.w, L.rule.h, 0, rgba(c.line, 0.9));
    put(fixed, label(layer, L.s, '◆', 14, c.line), L.title.x, L.rule.y + L.rule.h / 2, 'centre');
    if (keys) put(fixed, label(layer, L.s, keys, 22, c.text), L.foot.x, L.foot.y, 'centre', L.foot.w);
    lift(fixed, 30);
  }

  frame(dt: number, time: number) {
    // closed from outside (Esc, the game): nothing left to show
    if (this.win && !this.win.overlay.isConnected) this.hide();
    const L = this.at;
    if (!L) return false;
    const { layer, host } = this,
      still = layer.still || dt === 0; // a stopped clock (the bench's pause) lands everything too
    const o = (this.open = still ? 1 : ease(this.open, 1, dt, 12));
    const set = (p: Part, a: number) => {
      p.want = a;
      p.fade(10); // the fade is the screen's own: each part lands on it at once
    };
    this.drawFixed(L);
    set(this.fixed, o);
    if (this.paper) alpha(this.paper, o);
    const scroll = host.scrollTop,
      active = document.activeElement,
      at = this.focused,
      blink = still || time % 1 < 0.55 ? 1 : 0;
    this.fields.forEach((f, i) => {
      const b = this.boxes[i],
        a = this.arts.get(f.id)!,
        see = shown(L.list.h, b.y - scroll, b.h);
      a.part.group.position.set(L.list.x + b.x, -(L.list.y + b.y - scroll), 0);
      if (see > 0) {
        // what the real control holds while it is typed in; an area also says which of its lines is the first in view
        const live: Live | undefined =
          i === at && isTextEl(active)
            ? {
                value: active.value,
                start: active.selectionStart ?? 0,
                end: active.selectionEnd ?? 0,
                top: Math.round(active.scrollTop / L.m.line),
              }
            : undefined;
        const key = JSON.stringify([f, b.w, b.h, live]);
        if (key !== a.key) {
          a.draw(layer, f, b, L.m, { warn: this.warn, measure: this.measure }, live);
          a.key = key;
        }
      }
      a.fade(see * o, blink);
    });
    const th = thumb(L.list, this.content, scroll, L.s);
    if (th) this.mark.group.position.set(th.x, -th.y, 0);
    set(this.mark, o);
    // the field in focus is lit and the glove points at it
    const fb = this.boxes[at],
      r = fb && { x: L.list.x + fb.x, y: L.list.y + fb.y - scroll, w: fb.w, h: fb.h },
      see = r ? shown(L.list.h, fb.y - scroll, fb.h) * o : 0;
    if (r) {
      const key = `${r.w}x${r.h}`;
      if (this.band.key !== key) {
        this.band.clear();
        this.band.key = key;
        this.band.box(-4, -2, r.w + 8, r.h + 4, 6 * L.s, solid(layer.theme.lit), rgba(layer.theme.ink, 0.9));
        lift(this.band, 34);
      }
      this.band.group.position.set(r.x, -r.y, 0);
    }
    set(this.band, see);
    this.hand.point(layer, r, see, L.hand, dt, time, still);
    return !layer.still; // the glove sways and the caret blinks for as long as the screen shows
  }

  private readonly measure = (str: string, px: number) => {
    this.pen.font = `500 ${px}px ${this.layer.theme.font}`;
    return this.pen.measureText(str).width;
  };

  dispose() {
    this.hide();
    this.release();
    this.ac.abort();
    this.layer.remove(this);
    this.hand.dispose();
    this.paint.dispose();
    this.host.remove();
  }
}
