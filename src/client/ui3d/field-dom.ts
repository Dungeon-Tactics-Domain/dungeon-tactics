// The real controls under a 3D form's drawn fields (field.ts; the screen draws with flow3d/field-draw.ts): one unseen
// element per field, the one the keyboard, the IME, a tap, the pad and a screen reader work on. A number is a text box
// that says it is a spin button (a `type=number` has no caret to read and brings the browser's own arrows), a pick is a
// button that says its value, a mark a real checkbox, a text a real `<input>`, lines of text a real `<textarea>`. The
// two arrows of a number or a pick are taps only: the cursor never stops on them (left and right do the same) and the
// screen reader has the control itself. field.css keeps them all unseen; their boxes come from the screen's layout.
import { el } from '../icons.ts';
import './field.css';
import type { Field, Metrics, Parts } from './field.ts';
import type { Box } from './layout.ts';

// what the screen does with what the player did to the field `id`
export interface FieldActs {
  step(id: string, dir: -1 | 1): void; // an arrow, or a press on a pick
  set(id: string, v: string | boolean): void; // a text or a number left, a mark turned
  press(id: string): void; // a button
}
export interface FieldEls {
  kind: Field['kind'];
  main: HTMLElement;
  less?: HTMLButtonElement;
  more?: HTMLButtonElement;
}
export type TextEl = HTMLInputElement | HTMLTextAreaElement;
export const isTextEl = (e: Element | null): e is TextEl =>
  e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && e.type === 'text');

export function fieldEls(f: Field, act: FieldActs): FieldEls {
  const { id, kind } = f,
    cls = { class: 'f3d' };
  // a tap on an arrow changes the value and leaves the focus alone (a phone would open its keyboard on a number);
  // with a mouse the cursor follows to the row
  const arrow = (dir: -1 | 1, main: HTMLElement) =>
    el('button', {
      ...cls,
      type: 'button',
      tabindex: '-1',
      'aria-hidden': 'true',
      onmousedown: (e: Event) => e.preventDefault(),
      onclick: (e: Event) => {
        if ((e as PointerEvent).pointerType !== 'touch') main.focus({ preventScroll: true });
        act.step(id, dir);
      },
    });
  const arrows = (main: HTMLElement): FieldEls => ({ kind, main, less: arrow(-1, main), more: arrow(1, main) });
  if (kind === 'head') return { kind, main: el('h3', cls) };
  if (kind === 'note') return { kind, main: el('p', { ...cls, role: 'status' }) };
  if (kind === 'pick') return arrows(el('button', { ...cls, type: 'button', onclick: () => act.step(id, 1) }));
  if (kind === 'button') return { kind, main: el('button', { ...cls, type: 'button', onclick: () => act.press(id) }) };
  if (kind === 'check') {
    const box = el('input', {
      ...cls,
      type: 'checkbox',
      onchange: () => act.set(id, box.checked),
      // Enter marks it too, as the pad's A does (a checkbox of its own only takes Space)
      onkeydown: (e: KeyboardEvent) => e.code === 'Enter' && box.click(),
    });
    return { kind, main: box };
  }
  if (kind === 'area') {
    const area = el('textarea', { ...cls, spellcheck: 'false', onchange: () => act.set(id, area.value) });
    return { kind, main: area };
  }
  const input = el('input', {
    ...cls,
    type: 'text',
    autocomplete: 'off',
    ...(kind === 'number' && { inputmode: 'numeric', role: 'spinbutton' }),
    // what was typed may come back as the value there was (past a limit, an empty name): written again all the same
    onchange: () => {
      delete input.dataset.from;
      act.set(id, input.value);
    },
  });
  return kind === 'number' ? arrows(input) : { kind, main: input };
}

// What the field says now, onto its controls. A text being typed is the player's until it is left: only a value that
// changed since the last time is written over it (an area keeps a text that did not import, to be mended)
export function syncField(f: Field, e: FieldEls) {
  const m = e.main;
  const attr = (name: string, v: string | number) =>
    m.getAttribute(name) !== String(v) && m.setAttribute(name, String(v));
  const value = (v: string) => {
    const box = m as TextEl;
    if (box.dataset.from === v) return;
    box.value = box.dataset.from = v;
  };
  if (f.kind === 'head' || f.kind === 'note' || f.kind === 'button') {
    if (m.textContent !== f.label) m.textContent = f.label;
    if (f.kind !== 'button') return;
    (m as HTMLButtonElement).disabled = !!f.off;
    if (f.fold !== undefined) attr('aria-expanded', String(f.fold));
    return;
  }
  if (f.kind === 'pick') {
    const says = `${f.label}: ${f.text}`;
    if (m.textContent !== says) m.textContent = says;
    return;
  }
  attr('aria-label', f.label);
  if (f.kind === 'check') (m as HTMLInputElement).checked = f.on;
  else if (f.kind === 'number') {
    attr('aria-valuemin', f.min);
    attr('aria-valuemax', f.max);
    attr('aria-valuenow', f.value);
    value(String(f.value));
  } else {
    if (f.kind === 'text') attr('maxlength', f.max);
    value(f.value);
  }
}

// Each control onto its box (the column's own space): the row's control under the whole row, so a tap on the name
// takes it too, and the arrows over its ends
export function placeField(f: Field, e: FieldEls, b: Box, p: Parts, m: Metrics) {
  const px = (v: number) => `${v}px`;
  const put = (target: HTMLElement | undefined, r: Box | undefined) =>
    target && r && Object.assign(target.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
  put(e.main, b);
  put(e.less, p.less);
  put(e.more, p.more);
  // an area scrolls line by line with the drawing: the same line height and the same margin
  if (f.kind === 'area') Object.assign(e.main.style, { lineHeight: px(m.line), padding: px(m.inset) });
}

// A form's file out and in, through the browser's own save and open windows
export function saveFile(name: string, text: string, type = 'application/json') {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
export function openFile(accept: string, read: (text: string) => void) {
  const input = el('input', { type: 'file', accept });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) read(await file.text());
  });
  input.click();
}

// One cursor for the mouse too, as on the other 3D screens: it goes to the control under a moving pointer, unless a
// text is being typed in (the field would lose what was typed halfway)
export function hoverCursor(host: HTMLElement, signal: AbortSignal) {
  host.addEventListener(
    'pointermove',
    (e) => {
      if (!(e.movementX || e.movementY) || isTextEl(document.activeElement)) return;
      const to = e.target instanceof HTMLElement ? e.target : null;
      if (to?.matches('.f3d:not([tabindex="-1"], h3, p)')) to.focus({ preventScroll: true });
    },
    { signal },
  );
}
