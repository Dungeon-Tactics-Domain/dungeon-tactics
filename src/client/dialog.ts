// Diálogo modal (veio de ui.ts do Warlock): fecha no ✕, no Esc e no toque fora; o foco vai para o ✕ ao abrir.
// `fixed`: não fecha pelo jogador (sem ✕, Esc e toque fora não fazem nada): a tela de título (13/11, pedido do Fernando:
// "no título quando aperta Esc inicia uma batalha… quero uma tela de título mesmo"). `onBack`: o que abre quando o
// jogador fecha (✕, Esc, toque fora); as telas que saem do título voltam para ele. Fechar pelo código (`close`) não chama.
import { t } from './i18n.ts';
import { el, iconButton } from './icons.ts';

// Com janela aberta, o jogo atrás fica `inert` (13/11, revisão): o Tab saía da janela e o Enter agia na batalha de trás
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
    e.stopImmediatePropagation(); // o Esc fecha só o diálogo: sem isto chegava ao jogo e cancelava a escolha também
    back();
  }, { capture: true, signal: ac.signal });
  document.body.append(overlay);
  syncInert();
  x?.focus();
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

// Barra de 0 a 100% (13/11, pedido do Fernando: volume "de 5 em 5%"): input range nativo (setas do teclado já andam;
// o controle anda por main.ts pollPad), número em % ao lado, troca na hora a cada movimento, sem botão de salvar
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
