// Tela do mapa mundial (world.ts tem as regras): pergaminho com a estrada, os pontos e o retrato do grupo, que anda de
// ponto em ponto. Setas (ou A D W S) andam, Enter entra, Esc volta ao título; clique num ponto aberto anda até ele.
// Painel do lugar no canto de baixo à direita, como o nome do lugar no mapa do FFT; arte e texto nossos.
import { starText } from './campaign.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import type { DevUnit } from './dev-roster.ts';
import { dialog } from './dialog.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { portrait } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { sfx } from './sound.ts';
import { WORLD, isOpen, step } from './world.ts';

const WALK_MS = 320; // um trecho de estrada; o CSS usa o mesmo valor (--walk-ms)
const FADE_MS = 300; // escurecer antes de entrar no ponto; o CSS usa o mesmo valor (.fade-out)

// Fundo desenhado em SVG (viewBox 0–100, esticado na tela): rio, lago, floresta e montanhas, só para dar lugar aos pontos.
// A estrada não chega ao último ponto (o epílogo, de volta à vila): a linha atravessaria o mapa inteiro.
// O trecho já andado (até o ponto aberto) vai cheio por cima do tracejado: a jornada feita se lê de longe.
const terrain = (done: number) => `<svg class="world-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <path class="river" d="M0 48 C 18 44, 30 56, 46 50 S 70 40, 100 44" />
  <ellipse class="lake" cx="58" cy="56" rx="9" ry="6" />
  <g class="forest">${[[8, 60], [12, 66], [18, 58], [22, 70], [33, 76], [36, 58], [6, 72]].flatMap(([x, y]) =>
    // cada bosque são 3 pinheiros (triângulos), lidos como floresta de longe; o círculo de antes parecia mancha
    [[-1.6, 0.6], [0, -0.8], [1.6, 0.8]].map(([dx, dy]) => `<path d="M${x + dx - 1.3} ${y + dy + 2.2} L${x + dx} ${y + dy - 2.2} L${x + dx + 1.3} ${y + dy + 2.2} Z" />`)).join('')}</g>
  <g class="mountains">${[[66, 22], [76, 16], [86, 10], [93, 22], [80, 28]].map(([x, y]) => `<path d="M${x - 6} ${y + 8} L${x} ${y - 6} L${x + 6} ${y + 8} Z" />`).join('')}</g>
  <polyline class="road" points="${WORLD.slice(0, -1).map((w) => `${w.x},${w.y}`).join(' ')}" />
  <polyline class="road walked" points="${WORLD.slice(0, Math.min(done, WORLD.length - 2) + 1).map((w) => `${w.x},${w.y}`).join(' ')}" />
</svg>`;

// Tela Grupo (como a formação do FFT): retrato, classe, números e as habilidades já aprendidas de quem vai à próxima
// batalha; diz quem fica no acampamento para o protagonista entrar. Usa o dialog() de sempre.
export function openParty(units: DevUnit[], benched: string | null) {
  dialog('party', t('Grupo', 'Party'), [
    el('ul', { class: 'party-list' }, ...units.map((u) => el('li', { class: 'party-card' }, portrait(u.base),
      el('div', {},
        el('strong', {}, u.name), el('span', { class: 'party-class' }, ` · ${unitName(u.base)}`),
        el('p', { class: 'party-stats' }, t(`Vida ${u.hp} · Velocidade ${u.speed} · Movimento ${u.move}`, `HP ${u.hp} · Speed ${u.speed} · Move ${u.move}`)),
        el('p', { class: 'party-skills' }, u.abilities.map(abilityName).join(' · '),
          ...(UNIT_DEFS[u.base].abilities.length > u.abilities.length ? [el('span', { class: 'party-more' }, t(` (+${UNIT_DEFS[u.base].abilities.length - u.abilities.length} na jornada)`, ` (+${UNIT_DEFS[u.base].abilities.length - u.abilities.length} on the journey)`))] : [])))))),
    ...(benched ? [el('p', { class: 'party-bench' }, t(`${benched} fica no acampamento e segue nas conversas.`, `${benched} stays at camp and keeps talking in the story.`))] : []),
  ]);
}

export interface WorldOptions {
  done: number; // pontos já passados (world.ts)
  hero: string; // ficha do retrato que anda no mapa
  stars: number[]; // melhor nota de cada fase (campaign.ts)
  enter: (i: number) => void;
  back: () => void;
  party: () => void; // tela do grupo (main.ts), como a formação do FFT
  from?: number; // ponto de onde o grupo vem (fase recém-vencida): abre ali e anda sozinho até o próximo aberto
}

export interface WorldView {
  root: HTMLElement;
  // troca este mapa por um novo; quem chama passa a guardar o novo (senão o 2º refresh duplicava o mapa). `from`: de onde o
  // grupo sai (a história recém-vista); sem ele, o `from` antigo repetia a caminhada da última vitória a cada história
  refresh: (done: number, from?: number) => WorldView;
}

export function openWorld(host: HTMLElement, opts: WorldOptions): WorldView {
  const { done, hero, stars, enter, back } = opts;
  // começa no ponto mais avançado aberto (o próximo a fazer)
  const goal = Math.min(done, WORLD.length - 1);
  let at = opts.from !== undefined && opts.from >= 0 && opts.from < goal ? opts.from : goal;
  let walking = false;
  const tag = el('span', { class: 'world-tag' });
  // nome do lugar logo abaixo do retrato: o olho não precisa ir ao painel do canto para saber onde o grupo está
  const token = el('div', { class: 'world-token', 'aria-hidden': 'true' }, portrait(hero), tag);
  const nodes = WORLD.map((w, i) => {
    const kind = w.chapter !== undefined ? 'battle' : 'story';
    return el('button', {
      type: 'button', class: `world-node ${kind}${i < done ? ' done' : ''}`, style: `left:${w.x}%;top:${w.y}%`,
      // title: com o mouse, o nome aparece sem precisar andar até o ponto (fechado também, para dar vontade de chegar)
      disabled: !isOpen(i, done), 'aria-label': t(w.name[0], w.name[1]), title: t(w.name[0], w.name[1]), onclick: () => void walkTo(i),
      onmouseenter: () => isOpen(i, done) && sfx('cursor'), // som de cursor ao passar por um ponto aberto, como nos menus
    });
  });
  // estrelas sob cada batalha já vencida: o mapa mostra de longe o que vale rejogar (fora do botão, que é girado 45°)
  const starMarks = WORLD.flatMap((w, i) => w.chapter !== undefined && i < done
    ? [el('span', { class: 'world-stars', style: `left:${w.x}%;top:${w.y}%`, 'aria-hidden': 'true' }, starText(stars[w.chapter]))] : []);
  const place = el('strong', { class: 'world-place' });
  const kindText = el('p', { class: 'world-kind' });
  const enterBtn = el('button', { type: 'button', class: 'item focus', onclick: () => go() }, t('Entrar', 'Enter'));
  const panel = el('div', { class: 'panel world-panel', 'aria-live': 'polite' }, place, kindText, el('div', { class: 'world-actions' }, enterBtn,
    el('button', { type: 'button', class: 'item', onclick: () => opts.party() }, t('Grupo', 'Party')),
    el('button', { type: 'button', class: 'item', onclick: back }, t('Título', 'Title'))));
  const root = el('div', { class: 'world' },
    el('div', { class: 'world-map' }, el('div', { class: 'world-svg' }), ...nodes, ...starMarks, token),
    el('div', { class: 'panel world-head' }, el('strong', {}, t('Mapa do Vale', 'Valley Map')), ` · ${t(`${Math.min(done, WORLD.length)} de ${WORLD.length}`, `${Math.min(done, WORLD.length)} of ${WORLD.length}`)}`),
    panel,
    el('p', { class: 'panel world-help' }, t('Setas andam · Enter entra · G grupo · Esc volta', 'Arrows walk · Enter enters · G party · Esc goes back')));
  (root.querySelector('.world-svg') as HTMLElement).innerHTML = terrain(done);
  host.append(root);

  const show = () => {
    const w = WORLD[at];
    token.style.left = `${w.x}%`;
    token.style.top = `${w.y}%`;
    nodes.forEach((n, i) => n.classList.toggle('here', i === at));
    place.textContent = tag.textContent = t(w.name[0], w.name[1]);
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
  // entrar: a tela escurece antes (transição de cena, como no FFT); a história abre por cima do escuro e ele some depois
  const go = () => {
    if (walking) return;
    sfx('confirm');
    const fade = el('div', { class: 'fade-out', 'aria-hidden': 'true' });
    document.body.append(fade);
    walking = true;
    setTimeout(() => {
      walking = false;
      enter(at);
      setTimeout(() => fade.remove(), 400);
    }, FADE_MS);
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
    else if (k === 'g') opts.party();
  });
  // controle: o mesmo tradutor da batalha (gamepad.ts). Direcional anda, A entra, B volta; com uma conversa aberta,
  // A aperta o botão em foco (a caixa de fala), como na batalha
  const mem = emptyMemory();
  let primed = false; // o 1º quadro só registra o que já estava apertado: o A que começou a jornada não entra no 1º ponto
  const poll = () => {
    if (!root.isConnected) return;
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    const actions = padActions({ buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] }, mem, performance.now());
    if (!primed) return void (primed = true);
    for (const a of actions) {
      if (document.querySelector('.overlay')) {
        if (a.k === 'confirm') (document.activeElement as HTMLElement | null)?.click();
        continue;
      }
      if (a.k === 'cursor') {
        const next = step(at, a.dir === 'right' || a.dir === 'up' ? 1 : -1, done);
        if (next === at) sfx('cancel');
        else void walkTo(next);
      } else if (a.k === 'confirm') go();
      else if (a.k === 'cancel') back();
    }
  };
  requestAnimationFrame(poll);
  root.style.setProperty('--walk-ms', `${WALK_MS}ms`);
  show();
  enterBtn.focus();
  // volta de uma vitória: o grupo anda até o ponto que acabou de abrir (o avanço na jornada fica visível). Rejogar uma fase
  // antiga não abre nada: o grupo fica onde jogou, em vez de atravessar o mapa inteiro sozinho
  if (at === goal - 1) setTimeout(() => void walkTo(goal), 500);
  return { root, refresh: (newDone: number, from?: number) => { root.remove(); return openWorld(host, { ...opts, done: newDone, from }); } };
}
