// Modal dialog (came from the Warlock's ui.ts): closes on ✕, on Esc and on a tap outside; focus goes to the ✕ on open;
// up and down walk its window list (`.camp-list`, or `.arrow-walk` with left and right too), if it has one.
// `fixed`: the player can't close it (no ✕, Esc and tap outside do nothing): the title screen (Nov 13, Fernando's request:
// "on the title screen pressing Esc starts a battle… I want a real title screen"). `onBack`: what opens when the
// player closes it (✕, Esc, tap outside); the screens that leave the title go back to it. Closing from code (`close`) doesn't call it.
import { t } from './i18n.ts';
import { button, type Child, el, iconButton } from './icons.ts';
import type { KeyAction } from './keyboard.ts';
import { nextSpot, type WalkDir } from './spot-walk.ts';
import { moreBelow, type ScrollBox, scrollPick, scrollStep } from './window-scroll.ts';

// A `.spot-walk` window (the 3D expedition map; Fernando, Nov 17) walks its buttons by where they are on screen: a
// direction goes to the nearest button that way, and stays where nothing lies (spot-walk.ts), keys and pad alike. An
// `.arrow-walk` group (the end of a battle's commands, the HTML map's rooms) walks its own `items` the same way, a
// place out of line too when it is no farther to the side than ahead (the map's floors do not line up)
function spotWalk(overlay: HTMLElement, dir: WalkDir, within?: string) {
  const items = [...overlay.querySelectorAll<HTMLElement>(within ?? 'button:not([disabled])')].filter(
    (b) => b.offsetParent,
  );
  const at = items.indexOf(document.activeElement as HTMLElement);
  const boxes = items.map((b) => b.getBoundingClientRect());
  items[at < 0 ? 0 : nextSpot(boxes, at, dir, !!within)]?.focus();
}
const WAYS: Record<string, WalkDir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// With a window open, the game behind is `inert` (Nov 13, review): Tab left the window and Enter acted on the battle behind
const syncInert = () =>
  document.getElementById('app')?.toggleAttribute('inert', !!document.querySelector('.overlay > .dialog'));

// `note`: a counter at the right of the head band, like the kit's "Gold in chest" (Shop, Tavern)
export function dialog(
  cls: string,
  title: string,
  body: Node[],
  opts: { fixed?: boolean; onBack?: () => void; note?: Child; leave?: () => boolean } = {},
) {
  const ac = new AbortController();
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    ac.abort();
    syncInert();
  };
  const back = () => {
    if (opts.fixed) return;
    close();
    opts.onBack?.();
  };
  const x = opts.fixed ? null : iconButton('✕', t('Fechar', 'Close'), back);
  const overlay = el(
    'div',
    { class: `overlay ${cls}-overlay`, onclick: (e: Event) => e.target === overlay && back() },
    el(
      'div',
      { class: `dialog ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('header', { class: 'dialog-head' }, el('h2', {}, title), opts.note, x),
      ...body,
    ),
  );
  addEventListener(
    'keydown',
    (e) => {
      // up and down walk a window list (title, Quick battle, Town), as the title footer says; only the topmost window moves
      // (a list behind another window stays put), even after a click left the focus on the page
      // `.arrow-walk` takes the arrows where the rows are not menu rows (Nov 16 QA: the expedition map's rooms and the
      // end of a battle's commands walked by Tab only), all four by where each button is (Fernando, Nov 17): the
      // map's rooms of a row sit side by side, and nothing wraps or goes more sideways than ahead
      const walk = ':is(.camp-list, .arrow-walk) :is(button:not([disabled]), [role="button"])';
      const items = [...overlay.querySelectorAll<HTMLElement>(walk)].filter((b) => b.offsetParent);
      const top = [...document.querySelectorAll('.overlay')].at(-1) === overlay;
      if (WAYS[e.code] && top && overlay.matches('.spot-walk')) {
        e.preventDefault();
        return spotWalk(overlay, WAYS[e.code]);
      }
      const dir = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.code];
      // a 3D screen drawn over this window walks its own boxes, by what is seen (`walked`)
      if (dir && top && walked(overlay, e.code.slice(5).toLowerCase())) return e.preventDefault();
      if (dir && items.length && top && overlay.querySelector('.arrow-walk')) {
        e.preventDefault();
        return spotWalk(overlay, WAYS[e.code], walk);
      }
      // the page keys scroll a window that has `.scroll-cue` boxes, as the pad's right stick does (padDialog)
      const page = { PageUp: -1, PageDown: 1 }[e.code] as 1 | -1 | undefined;
      if (page && top && scrollWindow(overlay, page)) return e.preventDefault();
      const sideways = e.code === 'ArrowLeft' || e.code === 'ArrowRight';
      if (dir && items.length && top && !sideways) {
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[at < 0 ? (dir > 0 ? 0 : items.length - 1) : (at + dir + items.length) % items.length]?.focus();
        return;
      }
      // only the topmost window takes Esc too: the fixed town menu stays open under its Shop, and took the key first
      if (e.code !== 'Escape' || !top || e.repeat) return; // a held Esc would close every stacked window
      e.preventDefault();
      e.stopImmediatePropagation(); // Esc closes only the dialog: without this it reached the game and canceled the choice too
      // an armed 2nd-tap button takes the first Esc back (secondTap), so it does not close the window under it
      const armed = overlay.querySelector<HTMLElement>('[data-armed]');
      if (armed) return disarm(armed);
      // `leave`: the window takes Esc (and the pad's B, which comes as Esc) for a step back of its own and stays open
      if (opts.leave?.()) return;
      back();
    },
    { capture: true, signal: ac.signal },
  );
  // a 'close' event closes it from outside without its onBack: the town menu closes the window beside it, which reopens
  // itself after each purchase, so no caller keeps its handle
  overlay.addEventListener('close', close);
  document.body.append(overlay);
  syncInert();
  x?.focus();
  return { overlay, close };
}

// The 2nd tap of an action that loses something (Delete, Restart, Leave the room, Dismiss, a new expedition over a live
// one): the 1st only arms the button and says what the next does, true on the 2nd. It disarms (the label back) after
// ARM_MS, when the focus leaves it, on Esc (dialog above). The label is the button's last child, so a
// command row keeps its orb. Nov 16 QA: Dismiss acted on the 1st tap and the armed ones never disarmed
const ARM_MS = 5000; // long enough to read "Confirm: ends the current expedition, the gold found goes to town"
const timers = new WeakMap<HTMLElement, number>();
function disarm(btn: HTMLElement) {
  if (btn.dataset.armed === undefined) return;
  btn.lastChild!.textContent = btn.dataset.armed;
  delete btn.dataset.armed;
  clearTimeout(timers.get(btn));
}
export function secondTap(e: Event, text: string): boolean {
  const btn = e.currentTarget as HTMLElement;
  if (btn.dataset.armed !== undefined) return true;
  btn.dataset.armed = btn.lastChild?.textContent ?? '';
  btn.lastChild!.textContent = text;
  timers.set(
    btn,
    window.setTimeout(() => disarm(btn), ARM_MS),
  );
  btn.addEventListener('blur', () => disarm(btn), { once: true });
  return false;
}

// An arrow or the d-pad in a window: a 3D screen drawn over it (flow3d/sheet3d.ts, result3d/) takes the 'walk' event and
// moves the cursor to the box seen in that direction (Fernando, Nov 17), in place of the walk in the window's own order
const walked = (overlay: HTMLElement, way: string) =>
  !overlay.dispatchEvent(new CustomEvent('walk', { detail: way, cancelable: true }));
// A scroll box of a window that may hold more than it shows (Nov 18 tablet review): `.scroll-cue` and, at its foot while
// more lies below, "▼ More below" (a tablet shows its scrollbar only while a finger moves; a tap scrolls a page). The
// page keys and the pad's right stick scroll it (scrollWindow). Its class `has-more` follows the scroll and the size
const measure = (b: HTMLElement): ScrollBox => ({ top: b.scrollTop, view: b.clientHeight, height: b.scrollHeight });
export function scrollCue(box: HTMLElement) {
  const more = el(
    'span',
    {
      class: 'scroll-more',
      'aria-hidden': 'true', // the screen reader reads on past the fold; the cue is for the eye
      onclick: () => box.scrollBy({ top: scrollStep(measure(box), 1) }),
      onmousedown: (e: Event) => e.preventDefault(), // the focus stays on its button, not on the page behind
    },
    `▼ ${t('Mais abaixo', 'More below')}`,
  );
  box.classList.add('scroll-cue');
  box.append(more);
  const sync = () => box.classList.toggle('has-more', moreBelow(measure(box)));
  box.addEventListener('scroll', sync, { passive: true });
  // the box and what is in it: a face that loads late makes the page taller
  const seen = new ResizeObserver(sync);
  for (const e of [box, ...box.children]) seen.observe(e);
}
// the focused element's box first, then the window's others; false when none can move that way
function scrollWindow(overlay: HTMLElement, dir: 1 | -1): boolean {
  const own = document.activeElement?.closest<HTMLElement>('.scroll-cue');
  const boxes = [...new Set([own, ...overlay.querySelectorAll<HTMLElement>('.scroll-cue')])].filter(
    (b): b is HTMLElement => !!b && overlay.contains(b),
  );
  const i = scrollPick(boxes.map(measure), dir);
  if (i < 0) return false;
  boxes[i].scrollBy({ top: scrollStep(measure(boxes[i]), dir) });
  return true;
}

// The gamepad inside the topmost window (the battle's and the town's loops): A presses the focused button, B closes
// the window like Esc, the d-pad's up and down move between its visible buttons, and its left and right are the arrow
// keys they stand for (Fernando, Nov 17: sideways never walks a list): they change a focused volume bar or Options
// row, turn the Party's pages, walk an `.arrow-walk` row. False with no window open, so the action goes to the map behind
export function padDialog(a: KeyAction): boolean {
  // the topmost window: the town menu stays open under the window beside it
  const overlay = [...document.querySelectorAll<HTMLElement>('.overlay')].at(-1);
  if (!overlay) return false;
  // only what is in view: the hidden Options section holds buttons that would take focus without showing. The Party rows
  // are `li[role=button]` (Nov 16 review: without them the d-pad never left the ✕ there)
  const buttons = [
    ...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), [role="button"], input[type=range]'),
  ].filter((e) => e.offsetParent);
  const at = buttons.indexOf(document.activeElement as HTMLElement);
  const range =
    document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'range'
      ? document.activeElement
      : null;
  if (a.k === 'cancel' || a.k === 'help')
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  else if (a.k === 'confirm') (document.activeElement as HTMLElement | null)?.click();
  // the shoulders turn a window's pages where it has them (the 3D Options' categories, flow3d/options3d.ts)
  else if (a.k === 'rotate') overlay.dispatchEvent(new CustomEvent('shoulder', { detail: a.dir }));
  else if (a.k === 'turns') scrollWindow(overlay, a.dir);
  else if (a.k === 'cursor' && overlay.matches('.spot-walk')) spotWalk(overlay, a.dir);
  else if (a.k === 'cursor' && walked(overlay, a.dir)) return true;
  else if (a.k === 'cursor' && range && (a.dir === 'left' || a.dir === 'right')) {
    // on the volume bar, left and right change the value (stepUp/Down do not fire 'input': it is dispatched by hand)
    if (a.dir === 'right') range.stepUp();
    else range.stepDown();
    range.dispatchEvent(new Event('input'));
  } else if (
    a.k === 'cursor' &&
    (a.dir === 'left' || a.dir === 'right' || overlay.querySelector('.place-walk, .arrow-walk'))
  ) {
    // the arrow it stands for, to whatever takes that key: a window that walks its buttons by where they are
    // (town3d/town3d.ts, `.arrow-walk` above), an Options row's value (option-row.ts), the Party's roster and pages
    const code = `Arrow${a.dir[0].toUpperCase()}${a.dir.slice(1)}`;
    (overlay.contains(document.activeElement) ? document.activeElement! : overlay).dispatchEvent(
      new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }),
    );
  } else if (a.k === 'cursor') buttons[(at + (a.dir === 'up' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  return true;
}

// A row of the lab kit's list (the Equipment window): what it is, with its kind in small type, the price after a gold coin, and
// the action at the right with why it is off in small type under it (a disabled button says why). A null price leaves
// its column empty, without the coin: the Equipment window's rows (Nov 16)
export const priceRow = (what: Child[], price: number | null, action: HTMLButtonElement, why = '') =>
  el(
    'div',
    { class: 'price-row' },
    el('span', { class: 'price-what' }, ...what),
    price === null ? el('span') : el('span', { class: 'price' }, String(price)),
    el('span', { class: 'price-act' }, action, why ? el('small', {}, why) : null),
  );

export type Orb = 'gold' | 'blue' | 'bronze';
// A row of the lab kit's command menu inside a window (town, title): a glass orb before the name, in a `.command-list`
export const commandRow = (orb: Orb, label: Child | Child[], onclick: (e: Event) => void, cls = 'secondary') =>
  button(cls, [el('span', { class: `orb ${orb}`, 'aria-hidden': 'true' }), ...[label].flat()], onclick);

// Group of exclusive options (like radio) in buttons with aria-pressed; switches instantly, no save button
export function choice<T>(
  label: string,
  options: [value: T, text: string][],
  value: T,
  onPick: (v: T) => void,
): HTMLElement {
  const buttons = options.map(([v, text]) => {
    const b = el('button', { type: 'button', class: 'secondary', 'aria-pressed': String(v === value) }, text);
    b.addEventListener('click', () => {
      for (const o of buttons) o.setAttribute('aria-pressed', String(o === b));
      onPick(v);
    });
    return b;
  });
  return el(
    'div',
    { class: 'choice', role: 'group', 'aria-label': label },
    el('span', { class: 'choice-label' }, label),
    el('div', { class: 'choice-row' }, ...buttons),
  );
}

// 0 to 100% bar (Nov 13, Fernando's request: volume "in 5% steps"): native range input (keyboard arrows already move it;
// the gamepad moves it via main.ts pollPad), number in % beside it, changes instantly on every move, no save button.
// `min`: a floor above 0 (panel opacity: below it the panels stop reading as the interface)
export function slider(label: string, value: number, onChange: (v: number) => void, min = 0): HTMLElement {
  const out = el('output', { class: 'slider-value' }, `${value}%`);
  const input = el('input', { type: 'range', min, max: 100, step: 5, value, 'aria-valuetext': `${value}%` });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = `${v}%`;
    input.setAttribute('aria-valuetext', `${v}%`);
    onChange(v);
  });
  return el(
    'label',
    { class: 'slider' },
    el('span', { class: 'choice-label' }, label),
    el('span', { class: 'slider-row' }, input, out),
  );
}
