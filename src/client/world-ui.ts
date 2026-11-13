// Tela do mapa mundial (world.ts tem as regras): pergaminho com a estrada, os pontos e o retrato do grupo, que anda de
// ponto em ponto. Setas (ou A D W S) andam, Enter entra, Esc volta ao título; clique num ponto aberto anda até ele.
// Painel do lugar no canto de baixo à direita, como o nome do lugar no mapa do FFT; arte e texto nossos.
import { starText } from './campaign.ts';
import { portrait } from './hud.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { sfx } from './sound.ts';
import { WORLD, isOpen, step } from './world.ts';

const WALK_MS = 320; // um trecho de estrada; o CSS usa o mesmo valor (--walk-ms)

// Fundo desenhado em SVG (viewBox 0–100, esticado na tela): rio, lago, floresta e montanhas, só para dar lugar aos pontos.
// A estrada não chega ao último ponto (o epílogo, de volta à vila): a linha atravessaria o mapa inteiro.
const TERRAIN = `<svg class="world-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <path class="river" d="M0 48 C 18 44, 30 56, 46 50 S 70 40, 100 44" />
  <ellipse class="lake" cx="58" cy="56" rx="9" ry="6" />
  <g class="forest">${[[8, 60], [12, 66], [18, 58], [22, 70], [33, 76], [36, 58], [6, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" />`).join('')}</g>
  <g class="mountains">${[[66, 22], [76, 16], [86, 10], [93, 22], [80, 28]].map(([x, y]) => `<path d="M${x - 6} ${y + 8} L${x} ${y - 6} L${x + 6} ${y + 8} Z" />`).join('')}</g>
  <polyline class="road" points="${WORLD.slice(0, -1).map((w) => `${w.x},${w.y}`).join(' ')}" />
</svg>`;

export interface WorldOptions {
  done: number; // pontos já passados (world.ts)
  hero: string; // ficha do retrato que anda no mapa
  stars: number[]; // melhor nota de cada fase (campaign.ts)
  enter: (i: number) => void;
  back: () => void;
}

export function openWorld(host: HTMLElement, opts: WorldOptions): { root: HTMLElement; refresh: (done: number) => void } {
  const { done, hero, stars, enter, back } = opts;
  // começa no ponto mais avançado aberto (o próximo a fazer)
  let at = Math.min(done, WORLD.length - 1);
  let walking = false;
  const token = el('div', { class: 'world-token', 'aria-hidden': 'true' }, portrait(hero));
  const nodes = WORLD.map((w, i) => {
    const kind = w.chapter !== undefined ? 'battle' : 'story';
    return el('button', {
      type: 'button', class: `world-node ${kind}${i < done ? ' done' : ''}`, style: `left:${w.x}%;top:${w.y}%`,
      disabled: !isOpen(i, done), 'aria-label': t(w.name[0], w.name[1]), onclick: () => void walkTo(i),
    });
  });
  const place = el('strong', { class: 'world-place' });
  const kindText = el('p', { class: 'world-kind' });
  const enterBtn = el('button', { type: 'button', class: 'item focus', onclick: () => go() }, t('Entrar', 'Enter'));
  const panel = el('div', { class: 'panel world-panel', 'aria-live': 'polite' }, place, kindText, el('div', { class: 'world-actions' }, enterBtn,
    el('button', { type: 'button', class: 'item', onclick: back }, t('Título', 'Title'))));
  const root = el('div', { class: 'world' },
    el('div', { class: 'world-map' }, el('div', { class: 'world-svg' }), ...nodes, token),
    el('div', { class: 'panel world-head' }, el('strong', {}, t('Mapa do Vale', 'Valley Map')), ` · ${t(`${Math.min(done, WORLD.length)} de ${WORLD.length}`, `${Math.min(done, WORLD.length)} of ${WORLD.length}`)}`),
    panel,
    el('p', { class: 'panel world-help' }, t('Setas andam · Enter entra · Esc volta', 'Arrows walk · Enter enters · Esc goes back')));
  (root.querySelector('.world-svg') as HTMLElement).innerHTML = TERRAIN;
  host.append(root);

  const show = () => {
    const w = WORLD[at];
    token.style.left = `${w.x}%`;
    token.style.top = `${w.y}%`;
    nodes.forEach((n, i) => n.classList.toggle('here', i === at));
    place.textContent = t(w.name[0], w.name[1]);
    kindText.textContent = w.chapter !== undefined
      ? t(`Batalha · Capítulo ${w.chapter + 1}`, `Battle · Chapter ${w.chapter + 1}`) + (at < done ? `  ${starText(stars[w.chapter])}` : '')
      : t('História', 'Story');
  };
  // anda um trecho por vez até o ponto pedido, com passo e pausa curta em cada um (o olho segue o caminho)
  async function walkTo(target: number) {
    if (walking || target === at) return;
    walking = true;
    while (at !== target) {
      at += target > at ? 1 : -1;
      sfx('step');
      show();
      await new Promise((r) => setTimeout(r, WALK_MS));
    }
    walking = false;
  }
  const go = () => {
    if (walking) return;
    sfx('confirm');
    enter(at);
  };
  addEventListener('keydown', (e) => {
    if (!root.isConnected || document.querySelector('.overlay')) return;
    const k = e.key.toLowerCase();
    const dir = ['arrowright', 'arrowup', 'd', 'w'].includes(k) ? 1 : ['arrowleft', 'arrowdown', 'a', 's'].includes(k) ? -1 : 0;
    if (dir) {
      e.preventDefault();
      const next = step(at, dir, done);
      if (next === at) sfx('cancel'); // ponta da estrada ou ponto ainda fechado
      else void walkTo(next);
    } else if (k === 'enter' || k === ' ') {
      e.preventDefault();
      if (!e.repeat) go();
    } else if (k === 'escape') back();
  });
  root.style.setProperty('--walk-ms', `${WALK_MS}ms`);
  show();
  enterBtn.focus();
  return { root, refresh: (newDone: number) => { root.remove(); openWorld(host, { ...opts, done: newDone }); } };
}
