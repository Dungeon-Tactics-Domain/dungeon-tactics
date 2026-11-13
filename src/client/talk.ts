// Caixa de fala da campanha: retrato, nome e o texto aparecendo letra a letra com o bipe de quem fala. Clique, Enter,
// Espaço ou A completam a frase e, completa, passam para a próxima; Esc pula a conversa toda. É um botão dentro de um
// .overlay, então o teclado, o mouse e o controle (main.ts aperta o botão em foco) chegam pelo mesmo clique.
import { SPEAKERS, type Line } from './campaign.ts';
import type { Hero } from './hero.ts';
import { portrait } from './hud.ts';
import { LANG } from './i18n.ts';
import { el } from './icons.ts';
import { blip } from './sound.ts';
import { store } from './store.ts';

// Velocidade do texto (menu, dt:texto): Normal ~35 letras por segundo, no ritmo de quem lê devagar sem cansar quem lê rápido;
// Rápida ~3 vezes isso; Instantânea mostra a frase inteira (pedido comum em RPG tático, noite de 12/11)
export const TEXT_KEY = 'dt:texto';
export type TextSpeed = 'normal' | 'fast' | 'instant';
const CHAR_MS: Record<TextSpeed, number> = { normal: 28, fast: 10, instant: 0 };
export const textSpeed = (): TextSpeed => { const v = store.get(TEXT_KEY); return v === 'fast' || v === 'instant' ? v : 'normal'; };

export interface TalkOptions {
  title?: string; // faixa acima da caixa (nome da fase ou do lugar)
  hero?: Hero | null; // o protagonista: nome e retrato das falas de 'hero' (sem herói, "Você" com o Guerreiro)
  dark?: true; // tela quase preta atrás (abertura da história)
}

export function talk(lines: Line[], { title, hero, dark }: TalkOptions = {}): Promise<void> {
  return new Promise((done) => {
    let i = 0, shown = 0, timer = 0;
    const face = el('div', { class: 'talk-face' });
    const name = el('strong', { class: 'talk-name' });
    const text = el('p', { class: 'talk-text', 'aria-live': 'polite' });
    const box = el('button', { type: 'button', class: 'panel talk' }, face, el('div', { class: 'talk-body' }, name, text), el('span', { class: 'talk-next', 'aria-hidden': 'true' }, '▼')) as HTMLButtonElement;
    const overlay = el('div', { class: `overlay talk-overlay${dark ? ' dark' : ''}` }, ...(title ? [el('div', { class: 'panel talk-title' }, title)] : []), box);
    const full = () => (LANG === 'pt' ? lines[i].pt : lines[i].en);
    const typing = () => shown < full().length;
    const end = () => {
      clearInterval(timer);
      removeEventListener('keydown', onEsc, true);
      overlay.remove();
      done();
    };
    const show = () => {
      const base = SPEAKERS[lines[i].who];
      const who = lines[i].who === 'hero' && hero ? { ...base, name: hero.name, en: hero.name, def: hero.cls } : base;
      // quem fala mudou: o retrato dá um pulinho (reinicia a animação do CSS)
      if (i === 0 || lines[i - 1].who !== lines[i].who) {
        face.classList.remove('pop');
        void face.offsetWidth;
        face.classList.add('pop');
      }
      face.replaceChildren(portrait(who.def));
      name.textContent = LANG === 'en' && 'en' in who ? who.en : who.name; // nomes próprios são iguais nas duas línguas
      name.hidden = face.hidden = !who.name; // narrador: sem retrato nem nome
      shown = 0;
      text.textContent = '';
      box.classList.remove('done');
      clearInterval(timer);
      timer = window.setInterval(() => {
        const s = full();
        shown++;
        text.textContent = s.slice(0, shown);
        // uma letra sim, outra não (na rápida, 1 em 4): bipe sem metralhar
        if (shown % (textSpeed() === 'fast' ? 4 : 2) === 1 && /\p{L}/u.test(s[shown - 1])) blip(who.pitch);
        if (!typing()) {
          clearInterval(timer);
          box.classList.add('done');
        }
      }, CHAR_MS[textSpeed()] || 1);
      if (!CHAR_MS[textSpeed()]) {
        // instantânea: a frase inteira de uma vez, com um bipe só para marcar quem fala
        clearInterval(timer);
        shown = full().length;
        text.textContent = full();
        box.classList.add('done');
        blip(who.pitch);
      }
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
