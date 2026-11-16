// The town's windows (opened at its buildings, game/town.ts, and from its menu, game/crawl.ts townMenu): Party with each
// member's sheet (class, equipment, who goes) and their Equipment; the Shop and the Tavern are in town-shop.ts. Rules in
// group.ts and chest.ts.

import { withGear } from '../shared/battle/equipment.ts';
import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { defenceRows } from './battle-text.ts';
import { CHEST_MAX } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { dialog } from './dialog.ts';
import { DEPLOY_MAX, GROUP_KEY, type Group, type Member, parseGroup } from './group.ts';
import { stillFace } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { loadEquip } from './sheet-lines.ts';
import { store } from './store.ts';
import { openSheet } from './town-sheet.ts';

// a sheet's numbers as the battle counts them: Move and Jump in half tiles (Nov 15, Fernando: "everything in half
// tiles"); the party list shows them
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

// Party screen (like the FFT formation): everyone in the party, who goes to the next battle (up to 4) and who stays in town,
// with the painted face (portrait for a class without one), class and numbers; each row opens the sheet. Every member knows the whole kit of their class.
// Nov 13, delivery 5 of the design (docs/game-design/towns-party-equipment.md): recruits and class change
export const loadGroup = () => parseGroup(store.json(GROUP_KEY));
export const saveGroup = (g: Group) => store.set(GROUP_KEY, JSON.stringify(g));

export function openParty(back?: () => void) {
  const g = loadGroup(),
    eq = loadEquip();
  const again = () => openParty(back);
  const card = (m: Member) => {
    const u = unitFrom(m.cls, m.name),
      going = g.deployed.includes(m.id),
      sheet = withGear(UNIT_DEFS[m.cls], eq[m.id]); // the numbers with the pieces on, as the battle counts them
    const open = () => {
      d.close();
      openSheet(m, again);
    };
    return el(
      'li',
      {
        class: 'party-card',
        role: 'button',
        tabindex: '0',
        'aria-label': t(`Ficha de ${u.name}`, `${u.name}’s sheet`),
        onclick: open,
        onkeydown: (e: KeyboardEvent) => {
          // Space too, like a real button (the design system's Confirm)
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            open();
          }
        },
      },
      stillFace(m.cls, 'neutral'),
      el(
        'div',
        {},
        el('strong', {}, u.name),
        el(
          'span',
          { class: 'party-class' },
          ` · ${unitName(m.cls)} · ${going ? t('vai à batalha', 'goes to battle') : t('fica na cidade', 'stays in town')}`,
        ),
        el('p', { class: 'party-stats' }, statsLine(sheet)),
        // resistances and dodge (Nov 15); the sheet shows every attribute
        el(
          'p',
          { class: 'party-stats' },
          defenceRows(sheet)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · '),
        ),
        el('p', { class: 'party-skills' }, u.abilities.map(abilityName).join(' · ')),
      ),
    );
  };
  const d = dialog(
    'party',
    t('Grupo', 'Party'),
    [
      el(
        'p',
        {},
        t(
          `${g.deployed.length} de ${DEPLOY_MAX} vão à batalha. Escolha alguém para trocar a classe ou quem vai.`,
          `${g.deployed.length} of ${DEPLOY_MAX} go to battle. Pick someone to change class or who goes.`,
        ),
      ),
      el(
        'ul',
        { class: 'party-list arrow-walk' }, // the arrows walk the rows (dialog.ts)
        ...g.deployed.map((id) => g.members.find((m) => m.id === id)!).map(card),
        ...g.members.filter((m) => !g.deployed.includes(m.id)).map(card),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLElement>('.party-card')?.focus();
}

// the windows open beside the town menu (crawl.ts): every overlay but the menu's own
export const sideWindows = <T>(overlays: Iterable<T>, menu: T) => [...overlays].filter((o) => o !== menu);

// what is missing to buy, under the Shop row's turned-off button; nothing when the gold covers it
export const shortBy = (gold: number, price: number) =>
  gold < price ? t(`faltam ${price - gold} de ouro`, `${price - gold} gold short`) : '';
// why a piece cannot go into the chest (CHEST_MAX): under Buy and Remove, and before Dismiss
export const chestFull = () => t(`baú cheio (${CHEST_MAX})`, `chest full (${CHEST_MAX})`);

// the lab kit's gold counter on a window's head band (Shop, Tavern): small uppercase label, the number after a coin
export const goldNote = (label: string, gold: number) =>
  el('p', { class: 'gold' }, el('span', { class: 'result-label' }, label), el('strong', {}, String(gold)));
