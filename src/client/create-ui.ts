// Criação do protagonista (hero.ts tem as regras): nome e classe, com retrato, números e habilidades de cada classe à
// vista para escolher sabendo o que muda. Setas trocam a classe, Enter (fora do campo de nome) começa.
// Peça própria porque nenhuma das existentes (dialog, choice) mostra retrato e ficha lado a lado; estilo pelas variáveis do :root.
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { HERO_CLASSES, NAME_MAX, parseHero, type Hero, type HeroClass } from './hero.ts';
import { abilityDetail, portrait } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { sfx } from './sound.ts';

// uma frase do papel de cada classe no grupo (o que muda na prática, não o lore)
const ROLE: Record<HeroClass, () => string> = {
  warrior: () => t('Aguenta a linha de frente e empurra inimigos com a Escudada.', 'Holds the front line and shoves enemies with Shield bash.'),
  archer: () => t('Acerta de longe; do alto alcança ainda mais.', 'Hits from afar; from high ground it reaches even farther.'),
  mage: () => t('Explode áreas e, mais adiante, aprende a curar.', 'Blasts areas and, later on, learns to heal.'),
  rogue: () => t('O mais rápido: joga antes e derruba com o Golpe mortal.', 'The fastest: acts first and finishes with Deathblow.'),
};

export function createHero(host: HTMLElement): Promise<Hero> {
  return new Promise((done) => {
    let cls: HeroClass = 'warrior';
    const name = el('input', { id: 'hero-name', type: 'text', maxlength: String(NAME_MAX), placeholder: t('Seu nome', 'Your name'), 'aria-label': t('Nome do protagonista', 'Protagonist name') }) as HTMLInputElement;
    const cards = HERO_CLASSES.map((c) => el('button', { type: 'button', class: 'create-card', 'aria-pressed': 'false', onclick: () => pick(c) }, portrait(c), el('strong', {}, unitName(c))));
    const sheet = el('div', { class: 'create-sheet' });
    const startBtn = el('button', { type: 'button', class: 'primary', onclick: () => start() }, t('Começar a jornada', 'Begin the journey'));
    const warn = el('p', { class: 'create-warn', role: 'status' });
    const root = el('div', { class: 'overlay create' },
      el('div', { class: 'panel create-panel' },
        el('h2', {}, t('Quem lidera o grupo?', 'Who leads the party?')),
        el('label', { class: 'create-name', for: 'hero-name' }, t('Nome', 'Name')), name,
        el('div', { class: 'create-cards', role: 'group', 'aria-label': t('Classe', 'Class') }, ...cards),
        sheet, warn, startBtn));
    function pick(c: HeroClass) {
      if (c !== cls) sfx('cursor');
      cls = c;
      cards.forEach((b, i) => b.setAttribute('aria-pressed', String(HERO_CLASSES[i] === c)));
      const d = UNIT_DEFS[c];
      sheet.replaceChildren(
        el('p', { class: 'create-role' }, ROLE[c]()),
        el('p', { class: 'create-stats' }, t(`Vida ${d.hp} · Velocidade ${d.speed} · Movimento ${d.move}`, `HP ${d.hp} · Speed ${d.speed} · Move ${d.move}`)),
        el('ul', { class: 'create-skills' }, ...d.abilities.map((a) => el('li', {}, el('strong', {}, abilityName(a)), ` · ${abilityDetail(a)}`))),
        el('p', { class: 'create-stats' }, t('Começa com as 2 primeiras; as outras chegam ao longo da jornada.', 'Starts with the first 2; the rest come along the journey.')));
    }
    function start() {
      const hero = parseHero({ name: name.value, cls });
      if (!hero) {
        warn.textContent = t('Escreva um nome (até 16 letras).', 'Type a name (up to 16 letters).');
        sfx('cancel');
        return name.focus();
      }
      sfx('confirm');
      removeEventListener('keydown', onKey, true);
      root.remove();
      done(hero);
    }
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === name;
      if (e.key === 'Enter') { e.preventDefault(); return start(); }
      if (typing) return;
      const i = HERO_CLASSES.indexOf(cls);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(HERO_CLASSES[(i + 1) % 4]); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(HERO_CLASSES[(i + 3) % 4]); }
    };
    addEventListener('keydown', onKey, true);
    host.append(root);
    pick(cls);
    name.focus();
  });
}
