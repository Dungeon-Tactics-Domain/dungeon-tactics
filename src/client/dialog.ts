// Modal dialog (came from the Warlock's ui.ts): closes on ✕, on Esc and on a tap outside; focus goes to the ✕ on open;
// up and down walk its window list (`.camp-list`), if it has one.
// `fixed`: the player can't close it (no ✕, Esc and tap outside do nothing): the title screen (Nov 13, Fernando's request:
// "on the title screen pressing Esc starts a battle… I want a real title screen"). `onBack`: what opens when the
// player closes it (✕, Esc, tap outside); the screens that leave the title go back to it. Closing from code (`close`) doesn't call it.
import { t } from './i18n.ts';
import { button, type Child, el, iconButton } from './icons.ts';

// With a window open, the game behind is `inert` (Nov 13, review): Tab left the window and Enter acted on the battle behind
const syncInert = () =>
  document.getElementById('app')?.toggleAttribute('inert', !!document.querySelector('.overlay > .dialog'));

// `note`: a counter at the right of the head band, like the kit's "Gold in chest" (Shop, Tavern)
export function dialog(
  cls: string,
  title: string,
  body: Node[],
  opts: { fixed?: boolean; onBack?: () => void; note?: Child } = {},
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
      const list = overlay.querySelector('.camp-list');
      const top = [...document.querySelectorAll('.overlay')].at(-1) === overlay;
      if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && list && top) {
        e.preventDefault();
        const items = [...list.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.code === 'ArrowUp' ? -1 : 1;
        items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]?.focus();
        return;
      }
      // only the topmost window takes Esc too: the fixed town menu stays open under its Shop, and took the key first
      if (e.code !== 'Escape' || !top) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // Esc closes only the dialog: without this it reached the game and canceled the choice too
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

// A row of the lab kit's list (Shop, Tavern): what it is, with its kind in small type, the price after a gold coin, and
// the action at the right with why it is off in small type under it (a disabled button says why)
export const priceRow = (what: Child[], price: number, action: HTMLButtonElement, why = '') =>
  el(
    'div',
    { class: 'price-row' },
    el('span', { class: 'price-what' }, ...what),
    el('span', { class: 'price' }, String(price)),
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
// the gamepad moves it via main.ts pollPad), number in % beside it, changes instantly on every move, no save button
export function slider(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const out = el('output', { class: 'slider-value' }, `${value}%`);
  const input = el('input', { type: 'range', min: 0, max: 100, step: 5, value, 'aria-valuetext': `${value}%` });
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
