// Protagonist creation (hero.ts has the rules): name and class, with each class's portrait, numbers and abilities in
// view so you choose knowing what changes. Arrows switch class, Enter (outside the name field) starts.
// Own piece because none of the existing ones (dialog, choice) shows portrait and sheet side by side; style via the :root variables.

import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { HERO_CLASSES, type Hero, type HeroClass, NAME_MAX, parseHero } from './hero.ts';
import { abilityDetail, portrait } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { sfx } from './sound.ts';

// a sheet's numbers as the battle counts them: Move and Jump in half tiles (Nov 15, Fernando: "everything in half
// tiles"); the party list shows the same line (world-ui.ts)
export const statsLine = (d: { hp: number; speed: number; move: number; jump?: number }) => {
  const move = d.move * SUB,
    jump = (d.jump ?? MAX_JUMP) * SUB;
  return t(
    `Vida ${d.hp} · Velocidade ${d.speed} · Movimento ${move} · Salto ${jump}`,
    `HP ${d.hp} · Speed ${d.speed} · Move ${move} · Jump ${jump}`,
  );
};

// How to play's Move and Jump sentence, from the sheets so it follows a change. A leap needs 2 cells (a whole tile)
// to land level past a gap, so only Jump 4 or more clears one (Nov 15)
export function jumpHelp(): string {
  const j = (id: string) => (UNIT_DEFS[id].jump ?? MAX_JUMP) * SUB;
  return t(
    `Movimento e Salto contam em meias casas: o Salto do Lanceiro é ${j('lancer')}, o do Ladino e do Lacaio ${j('rogue')}, o dos outros ${j('warrior')}. Por passo se sobe ou desce metade do Salto em níveis; com Salto ${2 * SUB} ou mais também se voa 1 casa de água funda ou de buraco.`,
    `Move and Jump count in half tiles: the Lancer has Jump ${j('lancer')}, the Rogue and the Minion ${j('rogue')}, the rest ${j('warrior')}. Each step climbs or drops up to half the Jump in levels; Jump ${2 * SUB} or more also clears 1 tile of deep water or a gap.`,
  );
}

// one sentence on each class's role in the party (what changes in practice, not the lore)
const ROLE: Record<HeroClass, () => string> = {
  warrior: () =>
    t(
      'Aguenta a linha de frente; mais adiante, empurra inimigos com a Escudada.',
      'Holds the front line; later on, shoves enemies with Shield bash.',
    ),
  archer: () =>
    t('Acerta de longe; do alto alcança ainda mais.', 'Hits from afar; from high ground it reaches even farther.'),
  mage: () => t('Explode áreas e, mais adiante, aprende a curar.', 'Blasts areas and, later on, learns to heal.'),
  rogue: () =>
    t(
      'O mais rápido: joga antes e, mais adiante, derruba com o Golpe mortal.',
      'The fastest: acts first and, later on, finishes with Deathblow.',
    ),
};

export function createHero(host: HTMLElement): Promise<Hero> {
  return new Promise((done) => {
    let cls: HeroClass = 'warrior';
    // suggested name already filled in: whoever plays with only the gamepad can't type; the keyboard changes it freely
    const name = el('input', {
      id: 'hero-name',
      type: 'text',
      maxlength: String(NAME_MAX),
      value: 'Ayla',
      placeholder: t('Seu nome', 'Your name'),
      'aria-label': t('Nome do protagonista', 'Protagonist name'),
    }) as HTMLInputElement;
    const cards = HERO_CLASSES.map((c) =>
      button('create-card', [portrait(c), el('strong', {}, unitName(c))], () => pick(c), {
        'aria-pressed': 'false',
        'data-cls': c,
      }),
    );
    const sheet = el('div', { class: 'create-sheet' });
    const startBtn = button('primary', t('Começar a jornada', 'Begin the journey'), () => start());
    const warn = el('p', { class: 'create-warn', role: 'status' });
    const root = el(
      'div',
      { class: 'overlay create' },
      el(
        'div',
        { class: 'panel create-panel' },
        el('h2', {}, t('Quem lidera o grupo?', 'Who leads the party?')),
        el('label', { class: 'create-name', for: 'hero-name' }, t('Nome', 'Name')),
        name,
        el('div', { class: 'create-cards', role: 'group', 'aria-label': t('Classe', 'Class') }, ...cards),
        sheet,
        warn,
        startBtn,
      ),
    );
    function pick(c: HeroClass) {
      if (c !== cls) sfx('cursor');
      cls = c;
      cards.forEach((b, i) => b.setAttribute('aria-pressed', String(HERO_CLASSES[i] === c)));
      const d = UNIT_DEFS[c];
      sheet.replaceChildren(
        el('p', { class: 'create-role' }, ROLE[c]()),
        el('p', { class: 'create-stats' }, statsLine(d)),
        el(
          'ul',
          { class: 'create-skills' },
          ...d.abilities.map((a) => el('li', {}, el('strong', {}, abilityName(a)), ` · ${abilityDetail(a)}`)),
        ),
        el(
          'p',
          { class: 'create-stats' },
          t(
            'Começa com as 2 primeiras; as outras chegam ao longo da jornada.',
            'Starts with the first 2; the rest come along the journey.',
          ),
        ),
      );
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
      // a real key with the field focused is typing; the gamepad arrows (synthetic event) switch class anyway
      const typing = e.isTrusted && document.activeElement === name;
      if (e.key === 'Enter') {
        e.preventDefault();
        // the same press must not reach the map, which registers its listener as soon as creation ends (Nov 13 review:
        // one Enter started the journey and already entered Vauclair)
        e.stopPropagation();
        // Enter on a class card picks that class before starting (Nov 13 review: it started with the previous one)
        const f = document.activeElement;
        if (f instanceof HTMLElement && f.dataset.cls) pick(f.dataset.cls as HeroClass);
        return start();
      }
      if (typing) return;
      const i = HERO_CLASSES.indexOf(cls);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        pick(HERO_CLASSES[(i + 1) % 4]);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick(HERO_CLASSES[(i + 3) % 4]);
      }
    };
    addEventListener('keydown', onKey, true);
    host.append(root);
    pick(cls);
    name.focus();
  });
}
