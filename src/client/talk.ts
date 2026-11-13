// Caixa de fala da campanha: retrato, nome e o texto aparecendo letra a letra com o bipe de quem fala. Clique, Enter,
// Espaço ou A completam a frase e, completa, passam para a próxima; Esc pula a conversa toda. É um botão dentro de um
// .overlay, então o teclado, o mouse e o controle (main.ts aperta o botão em foco) chegam pelo mesmo clique.
import { SPEAKERS, type Line } from './campaign.ts';
import { portrait } from './hud.ts';
import { LANG } from './i18n.ts';
import { el } from './icons.ts';
import { blip } from './sound.ts';

const CHAR_MS = 28; // ~35 letras por segundo: lê no ritmo de quem lê devagar e não cansa quem lê rápido

export function talk(lines: Line[], title?: string): Promise<void> {
  return new Promise((done) => {
    let i = 0, shown = 0, timer = 0;
    const face = el('div', { class: 'talk-face' });
    const name = el('strong', { class: 'talk-name' });
    const text = el('p', { class: 'talk-text', 'aria-live': 'polite' });
    const box = el('button', { type: 'button', class: 'panel talk' }, face, el('div', { class: 'talk-body' }, name, text), el('span', { class: 'talk-next', 'aria-hidden': 'true' }, '▼')) as HTMLButtonElement;
    const overlay = el('div', { class: 'overlay talk-overlay' }, ...(title ? [el('div', { class: 'panel talk-title' }, title)] : []), box);
    const full = () => (LANG === 'pt' ? lines[i].pt : lines[i].en);
    const typing = () => shown < full().length;
    const end = () => {
      clearInterval(timer);
      removeEventListener('keydown', onEsc, true);
      overlay.remove();
      done();
    };
    const show = () => {
      const who = SPEAKERS[lines[i].who];
      face.replaceChildren(portrait(who.def));
      name.textContent = who.name;
      name.hidden = face.hidden = !who.name; // narrador: sem retrato nem nome
      shown = 0;
      text.textContent = '';
      box.classList.remove('done');
      clearInterval(timer);
      timer = window.setInterval(() => {
        const s = full();
        shown++;
        text.textContent = s.slice(0, shown);
        if (shown % 2 && /\p{L}/u.test(s[shown - 1])) blip(who.pitch); // uma letra sim, outra não: bipe sem metralhar
        if (!typing()) {
          clearInterval(timer);
          box.classList.add('done');
        }
      }, CHAR_MS);
    };
    box.addEventListener('click', () => {
      if (typing()) {
        shown = full().length;
        text.textContent = full();
        clearInterval(timer);
        box.classList.add('done');
      } else if (++i < lines.length) show();
      else end();
    });
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      end();
    };
    addEventListener('keydown', onEsc, true);
    document.body.append(overlay);
    box.focus();
    show();
  });
}
