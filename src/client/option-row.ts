// The Options list's row (Nov 16, Fernando: Options like the FFT option menu): the setting's name at the left and its
// current value at the right between ◀ ▶; left and right change it, and the window's description box says what it does.
import { button, el } from './icons.ts';

export interface Option {
  label: string;
  help: string; // one or two lines for the description box
  text: () => string; // the current value as the row shows it
  step: (dir: -1 | 1) => void;
  bar?: { fill: () => number; set: (pct: number) => void }; // a 0 to 100% value also draws a bar a pointer can set
  on?: () => boolean; // a yes or no: the 3D Options draw it as a switch beside its word
}

// the value before or after `at`, around the ends: Enter only goes forward, so the last one must lead to the first
export const cycle = <T>(values: readonly T[], at: T, dir: -1 | 1): T =>
  values[(values.indexOf(at) + dir + values.length) % values.length];
// a share of the bar's width as a value in the bars' 5% steps (Fernando, Nov 13), never under the row's floor
export const pctAt = (share: number, min = 0) => Math.min(100, Math.max(min, Math.round(share * 20) * 5));

// one of a few named values
export const pick = <T>(
  label: string,
  help: string,
  options: [value: T, text: string][],
  get: () => T,
  set: (v: T) => void,
): Option => ({
  label,
  help,
  text: () => options.find(([v]) => v === get())?.[1] ?? '',
  step: (dir) =>
    set(
      cycle(
        options.map(([v]) => v),
        get(),
        dir,
      ),
    ),
});

// 0 to 100% in steps of 5; `min`: a floor above 0 (panel opacity)
export const percent = (label: string, help: string, get: () => number, set: (v: number) => void, min = 0): Option => ({
  label,
  help,
  text: () => `${get()}%`,
  step: (dir) => set(pctAt(get() / 100 + dir * 0.05, min)),
  bar: { fill: get, set: (pct) => set(pctAt(pct / 100, min)) },
});

// One cursor for mouse, keyboard and gamepad, as in the battle menus: a pointer moving over a row takes the focus there.
// Only a real move: the list scrolling under a still mouse (the arrows walking it) must not pull the focus back
export const hoverFocus = (e: PointerEvent) => {
  if (e.movementX || e.movementY) (e.currentTarget as HTMLElement).focus({ preventScroll: true });
};

// The row is one button, so the window list's arrows, the gamepad and a screen reader ("Music 80%") see a single control;
// ◀ and ▶ inside it are drawn marks a pointer can still hit: a click is told apart by where it lands
export function optionRow(o: Option, describe: (help: string) => void): HTMLButtonElement {
  const text = el('span', { class: 'opt-text' });
  const fill = el('i');
  const bar = o.bar ? el('span', { class: 'opt-bar' }, fill) : null;
  const prev = el('span', { class: 'opt-arrow', 'aria-hidden': 'true' }, '◀');
  const next = el('span', { class: 'opt-arrow', 'aria-hidden': 'true' }, '▶');
  const value = el('span', { class: 'opt-value' }, prev, bar, text, next);
  const draw = () => {
    text.textContent = o.text();
    if (o.bar) fill.style.width = `${o.bar.fill()}%`;
  };
  const step = (dir: -1 | 1) => {
    o.step(dir);
    draw();
  };
  const row = button(
    'opt-row',
    [el('span', { class: 'opt-label' }, o.label), value],
    (e) => {
      const { clientX: x, detail } = e as MouseEvent;
      row.focus({ preventScroll: true }); // Safari does not focus a tapped button: the description must still follow the tap
      // Enter, Space and the gamepad's A click with no pointer: they go to the next value
      if (detail === 0) return step(1);
      const track = bar?.getBoundingClientRect();
      if (x < value.getBoundingClientRect().left) return; // a tap on the name only puts the cursor on the row
      if (x <= prev.getBoundingClientRect().right) step(-1);
      else if (track && x >= track.left && x <= track.right) {
        o.bar?.set(((x - track.left) / track.width) * 100);
        draw();
      } else step(1);
    },
    {
      onfocus: () => describe(o.help),
      onpointermove: hoverFocus,
      onkeydown: (e: KeyboardEvent) => {
        if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
        e.preventDefault();
        step(e.code === 'ArrowLeft' ? -1 : 1);
      },
    },
  );
  draw();
  return row;
}
