// Battle texts: the ability sheet, the summary of the last action, the attribute rows and the Status window sheet.
// Pure (strings from the state), shared by the HUD, the party windows and the end of battle.
import { ABILITIES, type AbilityDef } from '../shared/battle/abilities.ts';
import { poolOf } from '../shared/battle/combat.ts';
import { jumpOf } from '../shared/battle/pathing.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { TURN_THRESHOLD } from '../shared/battle/turn-queue.ts';
import type { BattleEvent, BattleState, UnitState } from '../shared/battle/types.ts';
import {
  baseDef,
  dodgeOf,
  ELEMENTS,
  type Element,
  RESOURCES,
  type Resource,
  resistOf,
  UNIT_DEFS,
  type UnitDef,
} from '../shared/battle/units.ts';
import { abilityName, t, unitName } from './i18n.ts';

const hpText = (u: UnitState) => `${u.hp}/${UNIT_DEFS[u.def].hp}`;
export const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
// the side under a unit's name (unit panel, strike strip, Status)
export const sideName = (team: UnitState['team']) => (team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy'));

// the counters an ability may spend (UnitState.vars): mana and stamina (Nov 16; the lab's words in both languages)
const POOL_NAME: Record<string, () => string> = {
  mana: () => 'mana',
  stamina: () => 'stamina',
};
const poolName = (k: string) => POOL_NAME[k]?.() ?? k;
export const costText = (a: AbilityDef) => (a.cost ? `${a.cost[1]} ${poolName(a.cost[0])}` : '');
// why a unit cannot pay for it, in words (the grayed ability row and the help line): "15 stamina short"
export const shortOf = (u: UnitState, a: AbilityDef) =>
  a.cost
    ? t(
        `faltam ${a.cost[1] - poolOf(u, a.cost[0])} de ${poolName(a.cost[0])}`,
        `${a.cost[1] - poolOf(u, a.cost[0])} ${poolName(a.cost[0])} short`,
      )
    : '';
// "Execute?": what it spends and what is left, paid now even on a charge (it fires later for free)
export const spendNote = (u: UnitState, a: AbilityDef) =>
  a.cost
    ? t(
        `Gasta ${costText(a)}: ${poolOf(u, a.cost[0])} → ${poolOf(u, a.cost[0]) - a.cost[1]}`,
        `Spends ${costText(a)}: ${poolOf(u, a.cost[0])} → ${poolOf(u, a.cost[0]) - a.cost[1]}`,
      )
    : '';
const regenText = (def: UnitDef, k: Resource) =>
  def.regen?.[k] ? t(`+${def.regen[k]} de ${k} por turno`, `+${def.regen[k]} ${k} per turn`) : '';
// the Status window's rows: "Mana · 45/60, +8 mana per turn"
export const poolRows = (def: UnitDef, u: UnitState): [string, string][] =>
  RESOURCES.filter((k) => def.vars?.[k]).map((k) => [
    k === 'mana' ? 'Mana' : 'Stamina',
    [`${poolOf(u, k)}/${def.vars![k]}`, regenText(def, k)].filter(Boolean).join(', '),
  ]);
// the party sheet's line under the bars: "+5 stamina per turn"
export const regenLine = (def: UnitDef) =>
  RESOURCES.map((k) => regenText(def, k))
    .filter(Boolean)
    .join(' · ');

// ability sheet (submenu and status window)
export function abilityDetail(id: string): string {
  const a = ABILITIES[id];
  const parts = [
    a.range[1] === 0 ? t('em volta de você', 'around you') : t(`alcance ${range(a.range)}`, `range ${range(a.range)}`),
  ];
  if (a.damage[1])
    parts.push(
      t(`dano ${range(a.damage)}`, `damage ${range(a.damage)}`),
      t(`acerto ${a.accuracy}%`, `accuracy ${a.accuracy}%`),
    );
  if (a.heal[1]) parts.push(t(`cura ${range(a.heal)}`, `heals ${range(a.heal)}`));
  if (a.radius) parts.push(t(`área de raio ${a.radius} (pega aliados)`, `area of radius ${a.radius} (hits allies)`)); // radius 2 has existed since Shadow wave
  if (a.push) parts.push(t(`empurra ${a.push}`, `pushes ${a.push}`));
  if (a.needsSight) parts.push(t('precisa de visão', 'needs sight'));
  if (a.heightRange) parts.push(t('+1 de alcance por nível acima', '+1 range per level above'));
  if (a.cost) parts.push(t(`gasta ${costText(a)}`, `costs ${costText(a)}`));
  // Nov 15: the player locks it on the tile or the character, and starting it costs half the movement left
  if (a.charge)
    parts.push(
      t(
        `carrega ${a.charge} tiques; trava na casa ou no personagem; começar gasta metade do movimento que sobra`,
        `charges ${a.charge} ticks; locks on the tile or the character; starting it costs half the movement left`,
      ),
    );
  return parts.join(' · ');
}

// Text summary of what the last action did: the floating number vanishes in 1 s and the screen reader does not read it.
// Whoever died has already left the state; the name comes from the scenario.
export function eventLog(events: BattleEvent[], state: BattleState): string {
  const name = (id: string) =>
    unitName((state.units.find((u) => u.id === id) ?? SCENARIOS[state.scenario].spawns.find((s) => s.id === id))!.def);
  // one sentence per action: charges that fire in the same interval bring several actions in a single list
  const out: string[] = [];
  let head = '';
  let parts: string[] = [];
  // action with no result on a target (Accumulate, Yell): just who used what
  const flush = () => {
    if (parts.length) out.push(head + parts.join(' · '));
    else if (head) out.push(head.slice(0, -3));
    head = '';
    parts = [];
  };
  for (const e of events) {
    if (e.k === 'attack') {
      flush();
      head = `${name(e.unit)}: ${abilityName(e.ability)} → `;
    } else if (e.k === 'charge') {
      flush();
      out.push(
        t(`${name(e.unit)} carrega ${abilityName(e.ability)}`, `${name(e.unit)} charges ${abilityName(e.ability)}`),
      );
    } else if (e.k === 'fizzle') {
      flush();
      out.push(
        t(
          `${name(e.unit)}: ${abilityName(e.ability)} não achou o alvo`,
          `${name(e.unit)}: ${abilityName(e.ability)} found no target`,
        ),
      );
    } else if (e.k === 'hit') parts.push(`${name(e.unit)} −${e.dmg}`);
    else if (e.k === 'miss')
      parts.push(t(`errou ${name(e.unit)} (${e.chance}%)`, `missed ${name(e.unit)} (${e.chance}%)`));
    else if (e.k === 'heal') parts.push(`${name(e.unit)} +${e.amount}`);
    else if (e.k === 'bump') parts.push(t(`${name(e.unit)} bateu −${e.dmg}`, `${name(e.unit)} crashed −${e.dmg}`));
    else if (e.k === 'fall')
      parts.push(t(`${name(e.unit)} caiu de altura −${e.dmg}`, `${name(e.unit)} fell −${e.dmg}`));
    else if (e.k === 'spike')
      parts.push(t(`${name(e.unit)} nos espinhos −${e.dmg}`, `${name(e.unit)} on the spikes −${e.dmg}`));
    else if (e.k === 'die') parts.push(t(`${name(e.unit)} caiu`, `${name(e.unit)} is down`));
  }
  flush();
  return out.join(' | ');
}

export const ELEMENT_NAME: Record<Element, () => string> = {
  fire: () => t('fogo', 'fire'),
  ice: () => t('gelo', 'ice'),
  lightning: () => t('raio', 'lightning'),
  shadow: () => t('sombra', 'shadow'),
  wind: () => t('vento', 'wind'),
  light: () => t('luz', 'light'),
};
export const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`; // the HUD's minus sign, as in −12
// The Nov 15 grill's attributes, for the Status window and the party sheet: power (class and equipment), resistances in %
// (negative = weakness), dodge; elements only when set
export function attrRows(def: UnitDef): [string, string][] {
  const els = ELEMENTS.filter((e) => resistOf(def, e)).map((e) => `${ELEMENT_NAME[e]()} ${signed(resistOf(def, e))}`);
  const rows: [string, string][] = [
    [t('Poder físico', 'Physical power'), String(def.physPower ?? 0)],
    [t('Poder mágico', 'Magic power'), String(def.magPower ?? 0)],
    ...defenceRows(def),
  ];
  if (els.length) rows.push([t('Elementos', 'Elements'), els.join(' · ')]);
  return rows;
}
// physical and magic resistance and dodge: the party list's short line too
export const defenceRows = (def: UnitDef): [string, string][] => [
  [t('Resistência física', 'Physical resistance'), signed(resistOf(def, 'phys'))],
  [t('Resistência mágica', 'Magic resistance'), signed(resistOf(def, 'mag'))],
  [t('Esquiva', 'Dodge'), `${dodgeOf(def)}%`],
];

// Status window sheet (like FFT's): what the unit is now. [label, value] rows; pure for the test.
export function unitStatus(state: BattleState, unitId: string): [string, string][] {
  const u = state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  const bonus = (k: string) => (u.vars?.[k] ? ` (${u.vars[k] > 0 ? '+' : ''}${u.vars[k]})` : '');
  const rows: [string, string][] = [
    [t('Lado', 'Side'), sideName(u.team)],
    [t('Vida', 'HP'), hpText(u)],
  ];
  rows.push(...poolRows(def, u));
  rows.push(
    ['CT', `${Math.max(0, Math.min(u.ct, TURN_THRESHOLD))}/${TURN_THRESHOLD}`], // the panel already capped it at 100; Status showed 108/100
    [t('Velocidade', 'Speed'), `${def.speed}${bonus('sp')}`],
    // in half tiles on the split map, the points the game spends (Nov 15, Fernando: "the move and jump values double")
    [t('Movimento', 'Move'), String(def.move)],
    [t('Salto', 'Jump'), String(jumpOf(state, u.def) * ((def.size ?? 1) / (UNIT_DEFS[baseDef(u.def)].size ?? 1)))],
    ...attrRows(def),
  );
  const c = state.charges.find((x) => x.unit === u.id);
  if (c)
    rows.push([
      t('Carregando', 'Charging'),
      t(
        `${abilityName(c.ability)}, sai em ${c.ticks} tiques`,
        `${abilityName(c.ability)}, goes off in ${c.ticks} ticks`,
      ),
    ]);
  // map cardinal points (our convention: grid row 0 is north)
  if (u.facing !== undefined)
    rows.push([
      t('Olhando para', 'Facing'),
      [t('sul', 'south'), t('leste', 'east'), t('norte', 'north'), t('oeste', 'west')][u.facing],
    ]);
  rows.push([t('Habilidades', 'Abilities'), def.abilities.map(abilityName).join(', ') || '—']);
  return rows;
}
