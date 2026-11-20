// Battle texts: the ability facts, the summary of the last action, the attribute rows and the Status window sheet.
// Pure (strings from the state), shared by the HUD, the party windows and the end of battle.
import { ABILITIES, type AbilityDef } from '../shared/battle/abilities.ts';
import { CONSUMABLE } from '../shared/battle/bag.ts';
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
import { type ActAction, actKind } from './act-flow.ts';
import type { Command } from './command.ts';
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
const regenText = (def: UnitDef, k: Resource) =>
  def.regen?.[k] ? t(`+${def.regen[k]} de ${k} por turno`, `+${def.regen[k]} ${k} per turn`) : '';
// the Status window's rows: "Mana · 45/60, +8 mana per turn"
export const poolRows = (def: UnitDef, u: UnitState): [string, string][] =>
  RESOURCES.filter((k) => def.vars?.[k]).map((k) => [
    k === 'mana' ? 'Mana' : 'Stamina',
    [`${poolOf(u, k)}/${def.vars![k]}`, regenText(def, k)].filter(Boolean).join(', '),
  ]);
// life regen (pieces, Nov 16): "+10 HP per turn"
const hpRegenText = (def: UnitDef) =>
  def.hpRegen ? t(`+${def.hpRegen} de vida por turno`, `+${def.hpRegen} HP per turn`) : '';
// the party sheet's line under the bars: "+5 stamina per turn · +10 HP per turn"
export const regenLine = (def: UnitDef) =>
  [...RESOURCES.map((k) => regenText(def, k)), hpRegenText(def)].filter(Boolean).join(' · ');

// A command row's name (HTML menu and 3D menu); "Undo move" is the reference's Reset, a row of its own under Move
const COMMAND_NAME: Record<Command, () => string> = {
  move: () => t('Mover', 'Move'),
  undo: () => t('Desfazer movimento', 'Undo move'),
  act: () => t('Agir', 'Act'), // Fernando, Nov 19: it opens the target, the abilities and the items, not only abilities
  wait: () => t('Esperar', 'Wait'),
  status: () => 'Status',
};
export const commandName = (c: Command) => COMMAND_NAME[c]();
// The note at the end of an ability row: its cost and charge ticks; greyed out, what is missing (a disabled row says why)
export const abilityNote = (u: UnitState, a: AbilityDef, on: boolean) =>
  on
    ? [costText(a), a.charge ? t(`${a.charge} tiq.`, `${a.charge} tk`) : ''].filter(Boolean).join(' · ')
    : shortOf(u, a);

// the tag on an Agir row (Nov 19): which of the turn's two actions it takes
// only the secondary ones are tagged: main is the usual, and a tag on every row squeezed the names (Nov 19 capture)
export const kindTag = (a: ActAction) => (actKind(a) === 'bonus' ? t('secundária', 'bonus') : '');

// an ability's facts on one line (the help line, the Party's Abilities page)
export const abilityDetail = (id: string) => abilityPages(id).flat().join(' · ');

// The facts in three groups: reach and hit, what else it does, what it costs. In abilityDetail's order, so the help line reads the same
export function abilityPages(id: string): [hit: string[], more: string[], cost: string[]] {
  const a = ABILITIES[id];
  const hit = [
    a.range[1] === 0 ? t('em volta de você', 'around you') : t(`alcance ${range(a.range)}`, `range ${range(a.range)}`),
  ];
  if (a.damage[1])
    hit.push(
      t(`dano ${range(a.damage)}`, `damage ${range(a.damage)}`),
      t(`acerto ${a.accuracy}%`, `accuracy ${a.accuracy}%`),
    );
  if (a.heal[1]) hit.push(t(`cura ${range(a.heal)}`, `heals ${range(a.heal)}`));
  const more: string[] = [];
  if (a.radius) more.push(t(`área de raio ${a.radius} (pega aliados)`, `area of radius ${a.radius} (hits allies)`)); // radius 2 has existed since Shadow wave
  if (a.push) more.push(t(`empurra ${a.push}`, `pushes ${a.push}`));
  // the path of the trajectory grill of Nov 15: what may stand in the way
  if (a.needsSight)
    more.push(
      a.arc
        ? t('tiro em curva: passa por cima do que é baixo', 'arcing shot: flies over what is low')
        : t('tiro reto: para no primeiro obstáculo', 'straight shot: stops at the first obstacle'),
    );
  else if (a.magic && a.range[1] > 0)
    more.push(t('conjurada no alvo, sem linha de visão', 'cast on the target, no line of sight'));
  if (a.heightRange) more.push(t('+1 de alcance por nível acima', '+1 range per level above'));
  const cost: string[] = [];
  if (a.cost) cost.push(t(`gasta ${costText(a)}`, `costs ${costText(a)}`));
  // Nov 15: the player locks it on the tile or the character, and starting it costs half the movement left
  if (a.charge)
    cost.push(
      t(
        `carrega ${a.charge} tiques; trava na casa ou no personagem; começar gasta metade do movimento que sobra`,
        `charges ${a.charge} ticks; locks on the tile or the character; starting it costs half the movement left`,
      ),
    );
  return [hit, more, cost];
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
    } else if (e.k === 'item') {
      flush();
      head = `${name(e.unit)}: ${itemName(e.item)} → `;
    } else if (e.k === 'mana')
      parts.push(t(`${name(e.unit)} +${e.amount} de mana`, `${name(e.unit)} +${e.amount} mana`));
    else if (e.k === 'effect')
      parts.push(t(`${name(e.unit)} por ${e.turns} turnos`, `${name(e.unit)} for ${e.turns} turns`));
    else if (e.k === 'charge') {
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
    else if (e.k === 'regen') {
      // its own sentence: after a strike it would read as the strike's heal
      flush();
      out.push(t(`${name(e.unit)} +${e.amount} de regeneração`, `${name(e.unit)} +${e.amount} regen`));
    } else if (e.k === 'bump') parts.push(t(`${name(e.unit)} bateu −${e.dmg}`, `${name(e.unit)} crashed −${e.dmg}`));
    else if (e.k === 'fall')
      parts.push(t(`${name(e.unit)} caiu de altura −${e.dmg}`, `${name(e.unit)} fell −${e.dmg}`));
    else if (e.k === 'spike')
      parts.push(t(`${name(e.unit)} nos espinhos −${e.dmg}`, `${name(e.unit)} on the spikes −${e.dmg}`));
    else if (e.k === 'die') parts.push(t(`${name(e.unit)} caiu`, `${name(e.unit)} is down`));
  }
  flush();
  return out.join(' | ');
}

// an item's name from the bag (src/content/items.ts), in the player's language
export const itemName = (id: string) => {
  const c = CONSUMABLE[id];
  return c ? t(c.name, c.en) : id;
};
// What an item does, for the help line of the Agir lists: its heal and mana, then its timed effect (bag.ts, effects.ts)
export function itemDetail(id: string): string {
  const c = CONSUMABLE[id];
  if (!c) return '';
  const out: string[] = [];
  if (c.heal) out.push(t(`cura ${c.heal}`, `heals ${c.heal}`));
  if (c.mana) out.push(t(`+${c.mana} de mana`, `+${c.mana} mana`));
  const f = c.buff;
  if (f) {
    const parts: string[] = [];
    if (f.physPower) parts.push(t(`+${f.physPower} de força`, `+${f.physPower} power`));
    if (f.element) parts.push(t(`golpe de ${ELEMENT_NAME[f.element]()}`, `${ELEMENT_NAME[f.element]()} strikes`));
    for (const [r, v] of Object.entries(f.resist ?? {})) {
      const what =
        r === 'phys'
          ? t('dano físico', 'physical damage')
          : r === 'mag'
            ? t('magia', 'magic')
            : ELEMENT_NAME[r as Element]();
      parts.push(t(`${signed(v ?? 0)} de resistência a ${what}`, `${signed(v ?? 0)} ${what} resistance`));
    }
    if (f.move) parts.push(t(`${f.move} de movimento`, `${f.move} move`));
    out.push(t(`por ${f.turns} turnos: `, `for ${f.turns} turns: `) + parts.join(', '));
  }
  return out.join(' · ');
}
// why an Agir primeiro action is off, in words under its row (Fernando's grill of Nov 19: a short line, always visible)
export function actReason(a: ActAction): string {
  if (a.reason === 'spent' && a.pool)
    return t(`faltam ${a.missing} de ${poolName(a.pool)}`, `${a.missing} ${poolName(a.pool)} short`);
  const words: Record<string, () => string> = {
    used: () => t('ação já usada neste turno', 'action already used this turn'),
    range: () => t('fora de alcance, mesmo andando', 'out of reach, even walking'),
    sight: () => t('sem linha de visão', 'no line of sight'),
    'no-target': () => t('não atinge este alvo', 'cannot reach this target'),
    water: () => t('nadando: só anda ou espera', 'swimming: only walk or wait'),
    none: () => t('acabou', 'none left'),
  };
  return words[a.reason ?? '']?.() ?? '';
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

// Move and Jump with their unit: half tiles for a token of the split map (half.ts halfDef), whole ones on a whole map
const tiles = (n: number, half: boolean) =>
  half
    ? t(`${n} ${n === 1 ? 'meia casa' : 'meias casas'}`, `${n} half ${n === 1 ? 'tile' : 'tiles'}`)
    : t(`${n} ${n === 1 ? 'casa' : 'casas'}`, `${n} ${n === 1 ? 'tile' : 'tiles'}`);
// a distance in the same unit (target list): "4 meias casas" on the halved map
export const distanceText = tiles;
// Status window sheet (like FFT's): what the unit is now. [label, value] rows; pure for the test.
export function unitStatus(state: BattleState, unitId: string): [string, string][] {
  const u = state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  const half = baseDef(u.def) !== u.def;
  const bonus = (k: string) => (u.vars?.[k] ? ` (${u.vars[k] > 0 ? '+' : ''}${u.vars[k]})` : '');
  const rows: [string, string][] = [
    [t('Lado', 'Side'), sideName(u.team)],
    [t('Vida', 'HP'), [hpText(u), hpRegenText(def)].filter(Boolean).join(', ')],
  ];
  rows.push(...poolRows(def, u));
  rows.push(
    ['CT', `${Math.max(0, Math.min(u.ct, TURN_THRESHOLD))}/${TURN_THRESHOLD}`], // the panel already capped it at 100; Status showed 108/100
    // each number with its unit (Nov 18 review: "Movimento 10" said nothing): Speed is the CT gained each tick
    [t('Velocidade', 'Speed'), t(`${def.speed} de CT por tique`, `${def.speed} CT per tick`) + bonus('sp')],
    // in half tiles on the split map, the points the game spends (Nov 15, Fernando: "the move and jump values double");
    // the unit in How to play's words (town-ui.ts jumpHelp)
    [t('Movimento', 'Move'), tiles(def.move, half)],
    [t('Salto', 'Jump'), tiles(jumpOf(state, u.def) * ((def.size ?? 1) / (UNIT_DEFS[baseDef(u.def)].size ?? 1)), half)],
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
