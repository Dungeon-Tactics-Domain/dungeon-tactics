// Modal dialog (came from the Warlock's ui.ts): closes on ✕, on Esc and on a tap outside; focus goes to the ✕ on open.
// `fixed`: the player can't close it (no ✕, Esc and tap outside do nothing): the title screen (Nov 13, Fernando's request:
// "on the title screen pressing Esc starts a battle… I want a real title screen"). `onBack`: what opens when the
// player closes it (✕, Esc, tap outside); the screens that leave the title go back to it. Closing from code (`close`) doesn't call it.
import { t } from './i18n.ts';
import { el, iconButton } from './icons.ts';

// With a window open, the game behind is `inert` (Nov 13, review): Tab left the window and Enter acted on the battle behind
const syncInert = () => document.getElementById('app')?.toggleAttribute('inert', !!document.querySelector('.overlay > .dialog'));

export function dialog(cls: string, title: string, body: Node[], opts: { fixed?: boolean; onBack?: () => void } = {}) {
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
  const overlay = el('div', { class: `overlay ${cls}-overlay`, onclick: (e: Event) => e.target === overlay && back() },
    el('div', { class: `dialog ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('header', { class: 'dialog-head' }, el('h2', {}, title), x), ...body));
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // Esc closes only the dialog: without this it reached the game and canceled the choice too
    back();
  }, { capture: true, signal: ac.signal });
  document.body.append(overlay);
  syncInert();
  x?.focus();
  return { overlay, close };
}

// Group of exclusive options (like radio) in buttons with aria-pressed; switches instantly, no save button
export function choice<T>(label: string, options: [value: T, text: string][], value: T, onPick: (v: T) => void): HTMLElement {
  const buttons = options.map(([v, text]) => {
    const b = el('button', { type: 'button', class: 'secondary', 'aria-pressed': String(v === value) }, text);
    b.addEventListener('click', () => {
      for (const o of buttons) o.setAttribute('aria-pressed', String(o === b));
      onPick(v);
    });
    return b;
  });
  return el('div', { class: 'choice', role: 'group', 'aria-label': label }, el('span', { class: 'choice-label' }, label), el('div', { class: 'choice-row' }, ...buttons));
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
  return el('label', { class: 'slider' }, el('span', { class: 'choice-label' }, label), el('span', { class: 'slider-row' }, input, out));
}
