// Diálogo modal (veio de ui.ts do Warlock): fecha no ✕, no Esc e no toque fora; o foco vai para o ✕ ao abrir.
import { t } from './i18n.ts';
import { el, iconButton } from './icons.ts';

export function dialog(cls: string, title: string, body: Node[]) {
  const ac = new AbortController();
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    ac.abort();
  };
  const x = iconButton('✕', t('Fechar', 'Close'), close);
  const overlay = el('div', { class: `overlay ${cls}-overlay`, onclick: (e: Event) => e.target === overlay && close() },
    el('div', { class: `dialog ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('header', { class: 'dialog-head' }, el('h2', {}, title), x), ...body));
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // o Esc fecha só o diálogo: sem isto chegava ao jogo e cancelava a escolha também
    close();
  }, { capture: true, signal: ac.signal });
  document.body.append(overlay);
  x.focus();
  return { overlay, close };
}

// Grupo de opções exclusivas (como rádio) em botões com aria-pressed; troca na hora, sem botão de salvar
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
