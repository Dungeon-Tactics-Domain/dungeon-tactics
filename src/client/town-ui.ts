// What the town's windows share (opened at its buildings, game/town.ts, and from its menu, game/crawl.ts townMenu): the
// saved party, the gold counter and the reasons a button is off. The Party screen is town-party.ts, the Shop and the
// Tavern are town-shop.ts. Rules in group.ts and chest.ts.

import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { CHEST_MAX } from './chest.ts';
import { GROUP_KEY, type Group, parseGroup } from './group.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { store } from './store.ts';

// a sheet's numbers as the battle counts them: Move and Jump in half tiles (Nov 15, Fernando: "everything in half
// tiles"); the Tavern's detail box shows them
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

// the saved party (dt:party); the Party screen is town-party.ts
export const loadGroup = () => parseGroup(store.json(GROUP_KEY));
export const saveGroup = (g: Group) => store.set(GROUP_KEY, JSON.stringify(g));
export { openParty } from './town-party.ts';

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
