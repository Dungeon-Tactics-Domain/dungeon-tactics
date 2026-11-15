// Battle HUD in the style of the FFT battle screen (Fernando's request, Nov 12: "discard the current interfaces and recreate
// the interface the same way as the original final fantasy tactics"). Only the layout and flow come from there; frames,
// colors and portraits are ours (CSS and KayKit characters). Pieces, top to bottom:
//   top left: the tile under the cursor (height and floor) and, below it, the list of upcoming turns (AT);
//   top middle: the help line for what to do now and, below it, the banner with the ability name;
//   beside the acting character: the command menu (Move · Act · Wait · Status), the abilities submenu and the
//   "Execute?" (Nov 13, Fernando's request: "beside the character like in FFT"; `place` follows the camera every frame);
//   bottom left: the acting unit (portrait, HP, MP and CT bars); bottom right: the unit under the cursor; when aiming, the
//   strike preview (Tactics Ogre's idea, Nov 13; the lab kit's two-colour strip, Nov 15) takes its place beside the acting
//   panel: one strip per target with the big damage, the hit chance and the target's bar with the part that goes away.
// Redraws everything on each change (it is little DOM); the menu position changes only via left/top.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { COMBAT, type Preview, simulatePush } from '../shared/battle/combat.ts';
import { type Grid, inBounds, posKey, standH, TERRAIN, tileAt } from '../shared/battle/grid.ts';
import { cellsOf, jumpOf, unitAt } from '../shared/battle/pathing.ts';
import { rulesOf } from '../shared/battle/rules.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { previewOrder, type QueueEntry, TURN_THRESHOLD } from '../shared/battle/turn-queue.ts';
import type { BattleEvent, BattleState, Lock, Pos, UnitState } from '../shared/battle/types.ts';
import { baseDef, UNIT_DEFS } from '../shared/battle/units.ts';
import { battleFace, type Expression, frameOf } from './battle-face.ts';
import { chargeFromText, chargeNote } from './charge-lines.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  type Command,
  canUndoMove,
  commandEnabled,
  type Screen,
  swimming,
} from './command.ts';
import { classOf } from './dev-roster.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el, icon, iconButton, UI_ICON } from './icons.ts';
import { chargeDanger, type Highlights } from './interaction.ts';
import { modelOf } from './markers.ts';
import { isSurvival, turnsLeft } from './survival.ts';
import { type Face, faceSheet } from './talk.ts';
import { anchorScroll, pageStep, twoRounds } from './turn-list.ts';

export interface HudActions {
  command(index: number): void; // click on a command menu item
  ability(index: number): void; // click on a submenu ability
  answer(yes: boolean): void; // "Execute?" Yes or No
  lock(on: Lock): void; // a charge's lock step: on the character or on the tile (Nov 15)
  cancel(): void;
  rotate(dir: 1 | -1): void;
  recenter(): void;
  pixel(): void;
  fast(): void; // toggles the 3x faster battle (the touch way; on the keyboard, hold Enter)
  undo(): void; // undoes the last step (same as the Z key): whoever plays with a mouse only had no way to
  menu(): void;
}
export interface HudView {
  battle: Battle;
  screen: Screen;
  hl: Highlights | null;
  busy: boolean; // animation or enemy turn: nothing responds
  log: string; // summary of the last action (eventLog)
  acting: string | null; // def of the enemy playing now (the state has already passed the turn when the animation plays)
  cursor: Pos; // tile under the cursor (keyboard, mouse or gamepad)
  ability: string | null; // ability being aimed on the map (the strike preview on the target panel)
  face: (u: UnitState) => Expression; // the painted face's expression now (battle-face.ts)
}

// rows of the queue projection the turn list reads: today's speeds (5 to 12) show 12 units twice in about 60 rows
// (ponytail: a unit too slow to show within the cap is left off the list; raise it if a battle ever needs more)
const QUEUE_CAP = 128;
const KEYS = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const hint = (k: string) => el('kbd', { class: 'hint', 'aria-hidden': 'true' }, k);
const hpText = (u: UnitState) => `${u.hp}/${UNIT_DEFS[u.def].hp}`;
const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

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
  if (a.cost)
    parts.push(
      t(
        `gasta ${a.cost[1]} de ${a.cost[0] === 'mp' ? 'MP' : 'estoque'}`,
        `costs ${a.cost[1]} ${a.cost[0] === 'mp' ? 'MP' : 'stock'}`,
      ),
    );
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
      parts.push(t(`${name(e.unit)} errou (${e.chance}%)`, `missed ${name(e.unit)} (${e.chance}%)`));
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

// Status window sheet (like FFT's): what the unit is now. [label, value] rows; pure for the test.
const INFO_LABEL: Record<string, () => string> = {
  pa: () => t('Força (PA)', 'Physical attack (PA)'),
  ma: () => t('Magia (MA)', 'Magic attack (MA)'),
  brave: () => 'Brave',
  faith: () => t('Fé', 'Faith'),
  weapon: () => t('Arma', 'Weapon'),
  shield: () => t('Escudo', 'Shield'),
};
export function unitStatus(state: BattleState, unitId: string): [string, string][] {
  const u = state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  const bonus = (k: string) => (u.vars?.[k] ? ` (${u.vars[k] > 0 ? '+' : ''}${u.vars[k]})` : '');
  const rows: [string, string][] = [
    [t('Lado', 'Side'), u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy')],
    [t('Vida', 'HP'), hpText(u)],
  ];
  if (u.vars?.mp !== undefined) rows.push(['MP', String(u.vars.mp)]);
  if (u.vars?.potions !== undefined) rows.push([t('Poções', 'Potions'), String(u.vars.potions)]);
  rows.push(
    ['CT', `${Math.max(0, Math.min(u.ct, TURN_THRESHOLD))}/${TURN_THRESHOLD}`], // the panel already capped it at 100; Status showed 108/100
    [t('Velocidade', 'Speed'), `${rulesOf(state).speed?.(u) ?? def.speed}${bonus('sp')}`],
    // in half tiles on the split map, the points the game spends (Nov 15, Fernando: "the move and jump values double")
    [t('Movimento', 'Move'), String(def.move)],
    [t('Salto', 'Jump'), String(jumpOf(state, u.def) * ((def.size ?? 1) / (UNIT_DEFS[baseDef(u.def)].size ?? 1)))],
  );
  for (const [k, v] of Object.entries(def.info ?? {}))
    rows.push([INFO_LABEL[k]?.() ?? k, `${v}${k === 'pa' ? bonus('pa') : ''}`]);
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

// Info on the tile under the cursor (FFT corner): position, height and floor type
const LOOK_NAME: Record<string, () => string> = {
  grass: () => t('grama', 'grass'),
  stone: () => t('pedra', 'stone'),
  water: () => t('água', 'water'),
  roof: () => t('telhado', 'roof'),
  chimney: () => t('chaminé', 'chimney'),
  wood: () => t('madeira', 'wood'),
  bridge: () => t('ponte', 'bridge'),
  box: () => t('caixa', 'crate'),
  tree: () => t('árvore', 'tree'),
  // Beacon Hill and Flooded Crypt (Nov 12)
  rock: () => t('rocha', 'rock'),
  summit: () => t('topo de rocha', 'rock top'),
  sand: () => t('areia', 'sand'),
  gold: () => t('veio de ouro', 'gold vein'),
  brick: () => t('muro de tijolo', 'brick wall'),
  snow: () => t('neve', 'snow'),
  snow_rock: () => t('rocha com neve', 'snowy rock'),
  tree2: () => t('árvore', 'tree'),
  tree3: () => t('árvore', 'tree'),
  tree4: () => t('árvore', 'tree'),
  bare1: () => t('árvore seca', 'bare tree'),
  bare2: () => t('árvore seca', 'bare tree'),
  crypt: () => t('piso de pedra', 'stone floor'),
  altar: () => t('altar', 'altar'),
  pillar: () => t('coluna', 'pillar'),
  crates: () => t('caixotes', 'crates'),
  barrel: () => t('barril', 'barrel'),
  chest: () => t('baú', 'chest'),
  rubble: () => t('entulho', 'rubble'),
  spikes: () => t('armadilha de espinhos', 'spike trap'),
  boulder: () => t('rochedo', 'boulder'),
  corpse: () => t('corpo', 'body'),
};
const TERRAIN_NAME: Record<string, () => string> = {
  floor: () => t('chão', 'ground'),
  forest: () => t('árvore', 'tree'),
  rubble: () => t('entulho (cobertura)', 'rubble (cover)'),
  wall: () => t('muro', 'wall'),
};
export function tileInfo(grid: Grid, p: Pos): string {
  const tile = tileAt(grid, p);
  const kind = tile.look ? (LOOK_NAME[tile.look]?.() ?? tile.look) : TERRAIN_NAME[tile.terrain]();
  // shallow and deep water share the same drawing: the tile text is what says which is which (found looking at the Crypt Heart)
  const blocked =
    (TERRAIN[tile.terrain].walkable ? '' : t(' · não dá para pisar', ' · not walkable')) +
    ((tile.depth ?? 0) >= 2
      ? t(' · funda: não se age nela', ' · deep: no actions inside')
      : tile.depth === 1
        ? t(' · rasa', ' · shallow')
        : '') +
    (tile.spikes
      ? t(
          ` · espinhos: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez ou ser empurrado aqui`,
          ` · spikes: −${COMBAT.SPIKE_DAMAGE} when ending a turn or pushed here`,
        )
      : '');
  // in shallow water the height one stands at counts (the one Jump compares), not the surface's
  const h = tile.depth === 1 ? standH(tile) : tile.h;
  return t(
    `Casa ${p.x},${p.y} · altura ${h}${tile.ramp ? ' (rampa)' : ''} · ${kind}${blocked}`,
    `Tile ${p.x},${p.y} · height ${h}${tile.ramp ? ' (slope)' : ''} · ${kind}${blocked}`,
  );
}

// The tile line under the cursor. `size` > 1 (a token choosing where to stop): its whole square counts, because a charge hits
// a token on any of its cells (combat.ts inArea over the footprint) and spikes hurt on any cell at the turn's end (battle.ts)
export function cursorInfo(grid: Grid, state: BattleState, p: Pos, size = 1): string {
  const square = cellsOf(p, size).filter((c) => inBounds(grid, c));
  const danger = chargeDanger(grid, state);
  const hit = square.map((c) => danger.get(posKey(c))).find((a) => a);
  const spikes = !tileAt(grid, p).spikes && square.some((c) => tileAt(grid, c).spikes);
  return (
    tileInfo(grid, p) +
    (spikes
      ? t(
          ` · espinhos sob a unidade: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez aqui`,
          ` · spikes under the unit: −${COMBAT.SPIKE_DAMAGE} when ending a turn here`,
        )
      : '') +
    (hit ? t(` · ⚠ ${abilityName(hit)} vai cair aqui`, ` · ⚠ ${abilityName(hit)} lands here`) : '')
  );
}

const REASON: Record<string, () => string> = {
  range: () => t('Fora do alcance', 'Out of range'),
  sight: () => t('Sem linha de visão', 'No line of sight'),
  'no-target': () => t('Nenhum alvo nesta casa', 'No target on this tile'),
  unknown: () => t('Não dá para usar aqui', 'Cannot use here'),
  spent: () => t('Acabou o estoque ou o MP', 'Out of stock or MP'),
  water: () => t('Na água funda só dá para andar ou esperar', 'In deep water you can only move or wait'),
};
const COMMAND_NAME: Record<Command, () => string> = {
  move: () => t('Mover', 'Move'),
  act: () => t('Agir', 'Act'),
  wait: () => t('Esperar', 'Wait'),
  status: () => 'Status',
};
// command row marker: the atlas icon (Move, Wait) or, for the commands without one, a glass orb like the lab kit's
const ORB = new Set<Command>(['act', 'status']);
const marker = (c: Command) => (ORB.has(c) ? el('span', { class: `orb ${c}`, 'aria-hidden': 'true' }) : abilityIcon(c));
// menu name on top of the command menu, the submenu and "Execute?" (the menu's aria-label says it to the screen reader)
const menuHead = (...text: Child[]) => el('div', { class: 'panel-head', 'aria-hidden': 'true' }, ...text);

// bar with label and number (HP, MP, CT), like the ones in FFT's unit panel. `change` marks in stripes the part
// that the strike takes (loss) or the heal adds (gain), like the target bar in Tactics Ogre; the number comes along in the panel
export function gauge(
  cls: string,
  label: string,
  value: number,
  max: number,
  change?: { from: number; to: number; kind: 'loss' | 'gain' },
) {
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * 100);
  return el(
    'div',
    { class: `gauge ${cls}` },
    el('span', { class: 'gauge-label' }, label),
    el(
      'span',
      { class: 'gauge-bar' },
      el('i', { style: `width:${pct(value)}%` }),
      change
        ? el('b', {
            class: `gauge-change ${change.kind}`,
            style: `left:${pct(change.from)}%;width:${pct(change.to) - pct(change.from)}%`,
          })
        : null,
    ),
    el('span', { class: 'gauge-num' }, `${Math.max(0, value)}/${max}`),
  );
}

// Preview of a strike on each target (the one in "Execute?" and the one in the target panel when aiming): same calculation in both places.
export interface Forecast {
  unit: UnitState;
  chance: number; // hit chance % (heal and support do not miss: 100)
  dmg: [number, number] | null;
  heal: [number, number] | null;
  push: number; // extra damage from the push (collision, fall, spikes)
  spikes: boolean;
  after: [number, number]; // life after, lowest and highest
  ally: boolean; // strike that hits someone on the same side as the user
  support: boolean; // support without heal: only the effect
  side: 'front' | 'side' | 'back'; // where the strike hits from (target's direction, Nov 13); "from behind" hits more
}
export function forecast(b: Battle, ability: string, p: Preview): Forecast[] {
  const a = ABILITIES[ability];
  return p.targets.map((tg) => {
    const u = b.state.units.find((x) => x.id === tg.unit)!;
    const max = UNIT_DEFS[u.def].hp;
    const heal: [number, number] | null = tg.healMax ? [tg.healMin, tg.healMax] : null;
    const support = !!a.ally && !heal;
    // push: the extra damage from collision, fall and spikes, to see the combo before confirming (night of Nov 12)
    const shove = a.push && !heal && !support ? simulatePush(b.grid, b.state, u, p.center, b.actor.pos, a.push) : null;
    const push = shove?.dmg ?? 0;
    // the push comes with every hit (without `pushChance`, which only the FFT study uses): it goes into the life after
    const sure = a.pushChance === undefined ? push : 0;
    const after: [number, number] = heal
      ? [Math.min(max, u.hp + heal[0]), Math.min(max, u.hp + heal[1])]
      : support
        ? [u.hp, u.hp]
        : [Math.max(0, u.hp - tg.dmgMax - sure), Math.max(0, u.hp - tg.dmgMin - sure)];
    return {
      unit: u,
      chance: tg.chance,
      dmg: heal || support ? null : [tg.dmgMin, tg.dmgMax],
      heal,
      push,
      spikes: !!shove?.events.some((e) => e.k === 'spike'),
      after,
      ally: !heal && !support && u.team === b.actor.team,
      support,
      side: a.magic || heal || support ? 'front' : tg.side,
    };
  });
}
// "damage 9–12 · push +3", "hit 85% · damage 9–12 · push +3" or "heal 7–10"; and "life 25 → 10–13"
const dmgText = (f: Forecast) =>
  t(`dano ${range(f.dmg!)}`, `damage ${range(f.dmg!)}`) +
  (f.push
    ? t(` · empurrão +${f.push}${f.spikes ? ' (espinhos!)' : ''}`, ` · push +${f.push}${f.spikes ? ' (spikes!)' : ''}`)
    : '');
// a physical strike from the side or behind says where the hit bonus comes from (combat.ts SIDE_BONUS/BACK_BONUS)
const fromText = (f: Forecast) =>
  f.side === 'back'
    ? t(' (pelas costas)', ' (from behind)')
    : f.side === 'side'
      ? t(' (de lado)', ' (from the side)')
      : '';
export const forecastText = (f: Forecast) =>
  f.heal
    ? t(`cura ${range(f.heal)}`, `heals ${range(f.heal)}`)
    : `${t(`acerto ${f.chance}%`, `hit ${f.chance}%`)}${fromText(f)} · ${dmgText(f)}`;
export const hpAfterText = (f: Forecast) => `${t('vida', 'HP')} ${f.unit.hp} → ${range(f.after)}`;

// Preview strips in the Tactics Ogre style (Nov 13, Fernando's request; our design): one arrow strip per target,
// "HP", the big number (−12–15 PTS, or +7–10 on a heal) and the aim with the hit chance; below, the small `strikeInfo` line.
// Up to STRIKES strips: more than that would rise above the panel band and cover the map; the rest becomes "+N targets".
const STRIKES = 3;
// small line of the strip: who, where the strike comes from, push and the life after. Pure for the test
export function strikeInfo(f: Forecast, ability: string): string[] {
  const out = [unitName(f.unit.def)];
  if (f.support) return [...out, abilityDetail(ability)];
  // ↶ and ⇥: the direction advantage (combat.ts SIDE_BONUS/BACK_BONUS), with the word alongside (never just the icon)
  if (f.side === 'back') out.push(t('↶ pelas costas', '↶ from behind'));
  else if (f.side === 'side') out.push(t('⇥ de lado', '⇥ from the side'));
  if (f.push)
    out.push(
      t(`empurrão +${f.push}${f.spikes ? ' (espinhos!)' : ''}`, `push +${f.push}${f.spikes ? ' (spikes!)' : ''}`),
    );
  out.push(hpAfterText(f));
  if (f.ally) out.push(t('ALIADO!', 'ALLY!'));
  return out;
}
// Two-colour strip (Nov 15, the lab kit's strike preview): the action on the panel blue (ability icon and name, the big
// number, the hit chance) and the target on its side's colour (wine for an enemy): name and side, the life bar with the part
// that goes away (or the heal adds) in stripes, and the small `strikeInfo` line. It stands in for the target panel while aiming
function strike(f: Forecast, ability: string) {
  const amount = f.heal ? `+${range(f.heal)}` : f.dmg ? `−${range(f.dmg)}` : null;
  const change =
    f.support || !(f.heal || f.dmg)
      ? undefined
      : f.heal
        ? { from: f.unit.hp, to: f.after[1], kind: 'gain' as const }
        : { from: f.after[0], to: f.unit.hp, kind: 'loss' as const };
  return el(
    'div',
    { class: `strike${f.heal ? ' gain' : ''}${f.ally ? ' ally' : ''}` },
    el(
      'div',
      { class: 'strike-main' },
      abilityIcon(ability),
      el(
        'div',
        {},
        el('span', { class: 'strike-name' }, abilityName(ability)),
        amount
          ? el(
              'span',
              { class: 'strike-row' },
              el('strong', { class: 'strike-pts' }, amount, el('small', {}, 'PTS')),
              el('span', { class: 'strike-hit', title: t('Chance de acerto', 'Chance to hit') }, `⊕ ${f.chance}%`),
            )
          : null,
      ),
    ),
    el(
      'div',
      { class: `strike-target ${f.unit.team}` },
      el(
        'span',
        { class: 'strike-who' },
        unitName(f.unit.def),
        el('span', { class: 'unit-side' }, f.unit.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy')),
      ),
      gauge('hp', t('Vida', 'HP'), f.unit.hp, UNIT_DEFS[f.unit.def].hp, change),
      el('span', { class: 'strike-info' }, strikeInfo(f, ability).slice(1).join(' · ')),
    ),
  );
}
function strikes(fs: Forecast[], ability: string) {
  const rest = fs.slice(STRIKES).map((o) => unitName(o.unit.def) + (o.ally ? t(' (aliado!)', ' (ally!)') : ''));
  return [
    ...fs.slice(0, STRIKES).map((f) => strike(f, ability)),
    rest.length
      ? el(
          'p',
          { class: 'strike-more' },
          t(
            `+${rest.length} ${rest.length === 1 ? 'alvo' : 'alvos'}: `,
            `+${rest.length} ${rest.length === 1 ? 'target' : 'targets'}: `,
          ) + rest.join(', '),
        )
      : null,
  ].filter((x) => x !== null);
}

// Panel beside the character, like FFT's menu: to its right; with no room, to its left; always inside `area` (the part
// of the screen free of the HUD). Centered on the character's height; if it would cover something in `avoid` (the turn list, the target of
// "Execute?"), it moves down or up beside it until clear, as close as possible. `prefer` 'left' tries the left
// first ("Execute?" avoids the target's side). Pure for the test.
export interface Anchor {
  x: number;
  y: number;
  r: number;
} // character's center on screen and its half width, in px
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function placeBeside(
  a: Anchor,
  w: number,
  h: number,
  area: Rect,
  prefer: 'right' | 'left' = 'right',
  avoid: Rect[] = [],
  gap = 12,
) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const xs = { right: a.x + a.r + gap, left: a.x - a.r - gap - w };
  const fits = (s: 'right' | 'left') => xs[s] >= area.left && xs[s] + w <= area.right;
  const sides: ('right' | 'left')[] = prefer === 'right' ? ['right', 'left'] : ['left', 'right'];
  const covers = (l: number, t: number) =>
    avoid.some((o) => l < o.right && l + w > o.left && t < o.bottom && t + h > o.top);
  const mid = a.y - h / 2;
  const tops = [mid, ...avoid.flatMap((o) => [o.bottom + gap, o.top - gap - h])]
    .map((t) => clamp(t, area.top, area.bottom - h))
    .sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
  for (const side of sides.filter(fits)) {
    const top = tops.find((t) => !covers(xs[side], t));
    if (top !== undefined) return { left: xs[side], top, side, free: true };
  }
  // nothing free (narrow screen, character off screen): the side that fits, clamped inside the area
  const side = fits(sides[0]) || !fits(sides[1]) ? sides[0] : sides[1];
  return { left: clamp(xs[side], area.left, area.right - w), top: tops[0], side, free: false };
}

// portrait of the rendered KayKit character (public/chars, scripts/portraits.mjs); the Beacon has no character: a CSS crystal
export function portrait(def: string) {
  const model = modelOf(def);
  // tinted unit (UnitDef.tint, the Acolyte over the mage): the portrait gets the .tinted filter to match the character
  return model
    ? el('img', { class: `portrait${UNIT_DEFS[def]?.tint ? ' tinted' : ''}`, src: `/chars/${model}.webp`, alt: '' })
    : el('span', { class: 'portrait gem', 'aria-hidden': 'true' });
}

// the painted face held on one expression outside the battle (result cards, party, tavern): 64 px, `big` 128, whole
// ratios of the 128 px paint so it stays crisp; a class without a sheet keeps portrait()
export function stillFace(def: string, expr: Expression, big = false) {
  const f = battleFace(def);
  if (!f) return portrait(def);
  const { node, show } = faceSheet(def, f, `still-face${big ? ' big' : ''}`);
  show(frameOf(f, expr));
  return node;
}

// the class line, only for those with their own name (the party, developer menu): "Rogue" under "Lia"
function classText(u: UnitState) {
  const base = classOf(u.def);
  return base && unitName(base) !== unitName(u.def) ? unitName(base) : null;
}

// unit panel (the acting one bottom left, the one under the cursor bottom right, mirrored)
function unitPanel(state: BattleState, u: UnitState, pic: HTMLElement) {
  const def = UNIT_DEFS[u.def];
  const rows = [gauge('hp', t('Vida', 'HP'), u.hp, def.hp)];
  if (u.vars?.mp !== undefined) rows.push(gauge('mp', 'MP', u.vars.mp, def.vars?.mp ?? u.vars.mp));
  if (def.speed > 0) rows.push(gauge('ct', 'CT', Math.min(u.ct, TURN_THRESHOLD), TURN_THRESHOLD));
  const charge = state.charges.find((c) => c.unit === u.id);
  return el(
    'div',
    { class: `panel unit-panel ${u.team}` },
    pic,
    el(
      'div',
      { class: 'unit-body' },
      el(
        'strong',
        { class: 'unit-name' },
        unitName(u.def),
        el('span', { class: 'unit-side' }, u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy')),
      ),
      classText(u) ? el('span', { class: 'unit-class' }, classText(u)) : null,
      ...rows,
      charge
        ? el(
            'p',
            { class: 'unit-note' },
            t(
              `Carregando ${abilityName(charge.ability)} (${charge.ticks} tiques)`,
              `Charging ${abilityName(charge.ability)} (${charge.ticks} ticks)`,
            ),
          )
        : null,
    ),
  );
}

// Turn list: every unit that plays, from the one acting now, through this round and the next (Nov 15, Fernando's
// decisions), with each queued charge where it fires and its ticks left (`ticks`). While aiming (`aim`: the Act map
// and "Execute?", Nov 15) the one acting pays the turn cost of acting, after what it already did, instead of the usual
// projection's cost of moving and acting; with a charge (Nov 13, Fernando's request, like FFT's CT list) the spell goes
// in where it will fire (`at`) and whoever it hits goes in `targets`, to see whether the target acts before it (and
// leaves the tile) or not. A copy of the queue: the state does not change, and cancelling the aim brings the usual list back
export function queueRows(b: Battle, aim: { ability: string; target: Pos } | null) {
  const a = aim ? ABILITIES[aim.ability] : null;
  const me = b.actor.id;
  const preview = a?.charge ? aim : null;
  // the same charge that Battle.act would register (a new charge replaces the previous one of the same unit)
  const charges =
    preview && a?.charge
      ? [
          ...b.state.charges.filter((c) => c.unit !== me),
          {
            unit: me,
            ability: preview.ability,
            target: preview.target,
            follow: a.panel ? null : (unitAt(b.state, preview.target)?.id ?? null),
            ticks: a.charge,
          },
        ]
      : b.state.charges;
  const now = aim ? { moved: b.state.turn.moved, acted: true } : undefined;
  const all = previewOrder({ ...b.state, charges }, QUEUE_CAP, now).map((r): QueueEntry & { ticks?: number } =>
    r.charge ? { ...r, ticks: charges.find((c) => c.unit === r.unit && c.ability === r.charge)?.ticks } : r,
  );
  const at = preview ? all.findIndex((r) => r.unit === me && r.charge === preview.ability) : -1;
  const p = preview ? b.preview(preview.ability, preview.target) : null;
  const targets = new Set(p?.ok ? p.targets.map((tg) => tg.unit) : []);
  return { rows: twoRounds(all), targets, at };
}

export class BattleHud {
  private readonly tile = el('div', { class: 'panel tile-info', 'aria-live': 'off' });
  private readonly queue = el('ol', { class: 'panel queue', 'aria-label': t('Ordem dos turnos', 'Turn order') });
  private fastBtn!: HTMLElement;
  setFast(on: boolean) {
    this.fastBtn.setAttribute('aria-checked', String(on));
  }
  scrollQueue(dir: 1 | -1) {
    const row = this.queue.querySelector<HTMLElement>('.queue-row')?.offsetHeight ?? 0;
    this.queue.scrollBy({ top: dir * pageStep(this.queue.clientHeight, row) });
  }
  // where the list was scrolled before the redraw, and the turn it showed: a new turn scrolls back to NOW on top
  private queueScroll = 0;
  private queueTurn = '';
  private readonly help = el('div', { class: 'panel help', 'aria-live': 'polite' });
  private readonly bannerEl = el('div', { class: 'panel banner', role: 'status', hidden: true });
  private readonly commands = el('div', {
    class: 'panel commands',
    role: 'menu',
    'aria-label': t('Comandos', 'Commands'),
  });
  private readonly abilities = el('div', {
    class: 'panel abilities',
    role: 'menu',
    'aria-label': t('Habilidades', 'Abilities'),
  });
  private readonly confirmBox = el('div', { class: 'panel confirm', role: 'dialog' });
  private readonly active = el('div', { class: 'active-slot' });
  private readonly target = el('div', { class: 'target-slot' });
  private readonly strikesEl = el('div', { class: 'strikes' });
  private readonly root: HTMLElement;

  private readonly toolsMenu = el('div', { class: 'panel tools-menu', role: 'menu', hidden: true });
  private readonly burger = iconButton(
    el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
    t('Menu', 'Menu'),
    () => this.showTools(!!this.toolsMenu.hidden),
    { class: 'icon burger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );
  // closes on click outside or on any key press (Esc also goes back in the game; the action key keeps acting). The
  // key closes even with focus on the menu button, which keeps it after the click
  private readonly closeOutside = (e: Event) => {
    if (e.type === 'keydown' || !(e.target instanceof Node && this.toolsMenu.parentElement?.contains(e.target)))
      this.showTools(false);
  };
  private showTools(open: boolean) {
    this.toolsMenu.hidden = !open;
    this.burger.setAttribute('aria-expanded', String(open));
    for (const ev of ['pointerdown', 'keydown']) {
      if (open) document.addEventListener(ev, this.closeOutside, true);
      else document.removeEventListener(ev, this.closeOutside, true);
    }
  }
  private toolItem(glyph: Child, label: string, key: string, run: () => void, props: Record<string, unknown> = {}) {
    return button(
      'item',
      [
        el('span', { class: 'tool-label' }, el('span', { class: 'tool-glyph', 'aria-hidden': 'true' }, glyph), label),
        key ? hint(key) : null,
      ],
      () => {
        this.showTools(false);
        run();
      },
      { role: 'menuitem', ...props },
    );
  }

  constructor(
    host: HTMLElement,
    private readonly act: HudActions,
  ) {
    this.fastBtn = this.toolItem('»', t('Batalha rápida', 'Fast battle'), '', () => act.fast(), {
      role: 'menuitemcheckbox',
      'aria-checked': 'false',
    });
    this.toolsMenu.append(
      this.toolItem(icon(UI_ICON.undo), t('Desfazer', 'Undo'), 'Z', () => act.undo()),
      this.toolItem('⟲', t('Girar à esquerda', 'Rotate left'), '⇧R', () => act.rotate(-1)),
      this.toolItem('⟳', t('Girar à direita', 'Rotate right'), 'R', () => act.rotate(1)),
      this.toolItem(icon(UI_ICON.recenter), t('Ver o mapa inteiro', 'Show the whole map'), 'F', () => act.recenter()),
      this.toolItem(icon(UI_ICON.pixel), t('Tamanho do pixel', 'Pixel size'), 'V', () => act.pixel()),
      this.fastBtn,
      this.toolItem(icon(UI_ICON.menu), t('Opções e ajuda', 'Options and help'), 'H', () => act.menu()),
    );
    this.root = el(
      'div',
      { class: `hud${KEYS ? ' kbd' : ''}` },
      this.tile,
      this.queue,
      this.help,
      this.bannerEl,
      // a menu button (3 bars) on the HUD panel colour in place of the row of 7 stone buttons (Nov 13, Fernando's request:
      // "crude and inconsistent"); the keys still work and show on each row
      el('div', { class: 'tools' }, this.burger, this.toolsMenu),
      this.commands,
      this.abilities,
      this.confirmBox,
      this.active,
      this.strikesEl,
      this.target,
    );
    host.append(this.root);
  }

  render(v: HudView) {
    const b = v.battle;
    const heroTurn = !b.over && b.actor.team === 'hero';
    const open = heroTurn && !v.busy;
    // `size` is set only while choosing where to move: the square the unit would stand on
    this.tile.textContent = b.over ? '' : cursorInfo(b.grid, b.state, v.cursor, v.hl?.size ?? 1);
    this.faces = [];
    this.expression = v.face;
    this.renderQueue(b, v);
    this.help.textContent = this.helpText(v, heroTurn);
    this.renderCommands(v, open);
    this.renderAbilities(v, open);
    this.renderConfirm(v, open);
    // acting unit: the enemy that is playing (the state may have already passed the turn during the animation)
    const actingUnit = v.acting ? b.state.units.find((u) => u.def === v.acting && u.team === 'enemy') : undefined;
    const me = b.over ? undefined : (actingUnit ?? b.actor);
    this.active.replaceChildren(...(me ? [unitPanel(b.state, me, this.face(me))] : []));
    // the turn list ends a gap above the acting panel, whose height changes with the screen width
    this.queue.style.maxHeight = `calc(100% - 56px - 2 * var(--inset) - ${this.active.offsetHeight}px)`;
    this.anchorQueue(b);
    // unit under the cursor (or the "Execute?" target)
    const at = v.screen.k === 'confirm' ? v.screen.target : v.cursor;
    // unitAt: any tile of the large unit shows its panel
    const found = unitAt(b.state, at);
    // aiming (Act map or "Execute?"): the strips beside the acting panel take the target panel's place, the one for the target
    // under the cursor first. It applies even to someone healing themself (outside aiming, their own panel is not repeated)
    const ability = v.screen.k === 'confirm' ? v.screen.ability : v.screen.k === 'map' ? v.ability : null;
    const fs = open && ability && v.hl?.preview?.ok ? forecast(b, ability, v.hl.preview) : [];
    const main = fs.find((f) => f.unit.id === found?.id) ?? fs[0];
    const other = main ? undefined : found?.id !== me?.id ? found : undefined;
    this.target.replaceChildren(...(other ? [unitPanel(b.state, other, this.face(other))] : []));
    this.strikesEl.replaceChildren(...(main ? strikes([main, ...fs.filter((f) => f !== main)], ability!) : []));
    // size of the panels that move with the character, measured once per draw (each frame's `place` only reads the cache);
    // the strips enter the bottom height so "Execute?" does not land on top of them
    const box = (e: HTMLElement) => ({ w: e.offsetWidth, h: e.offsetHeight });
    this.sizes = {
      commands: box(this.commands),
      abilities: box(this.abilities),
      confirm: box(this.confirmBox),
      bottom: Math.max(this.active.offsetHeight, this.target.offsetHeight, this.strikesEl.offsetHeight),
    };
  }

  // Painted faces (battle-face.ts) in the unit panels and the turn list, drawn with the dialogue box's sheet at the size
  // .battle-face gives; a unit without a sheet keeps its portrait. The expression changes on the battle clock without a
  // redraw: Game calls showFaces every frame, and only a face whose frame changed is moved
  private faces: { u: UnitState; f: Face; show: (n: number) => void; n: number }[] = [];
  private expression: HudView['face'] = () => 'neutral';
  private face(u: UnitState) {
    const f = battleFace(u.def);
    if (!f) return portrait(u.def);
    const { node, show } = faceSheet(u.def, f, 'battle-face portrait');
    const n = frameOf(f, this.expression(u));
    show(n);
    this.faces.push({ u, f, show, n });
    return node;
  }
  showFaces() {
    for (const face of this.faces) {
      const n = frameOf(face.f, this.expression(face.u));
      if (n !== face.n) face.show((face.n = n));
    }
  }

  private sizes = { commands: { w: 0, h: 0 }, abilities: { w: 0, h: 0 }, confirm: { w: 0, h: 0 }, bottom: 0 };
  get menuOpen() {
    return !this.commands.hidden || !this.confirmBox.hidden;
  }

  // Places the menu, submenu or "Execute?" beside the acting character (`a`, in screen px). Called every frame while
  // the menu is open (the camera slides and rotates): only left/top change, and only when the px changes. `target`: the target of
  // "Execute?", which the window does not cover (nor the turn list, which shows where the charge fires)
  place(a: Anchor | null, target: Anchor | null = null) {
    if (!a || !this.menuOpen) return;
    // free: below the help line and the menu button (which stay at the top), above the bottom unit panels
    const area = {
      left: 12,
      top: 72,
      right: this.root.clientWidth - 12,
      bottom: this.root.clientHeight - 24 - this.sizes.bottom,
    };
    const q = this.queue.getBoundingClientRect();
    // the character on screen goes from ~1.5 half widths above the middle (health bar) to ~1.5 below (ring on the ground)
    const avoid = [
      { left: q.left, top: q.top, right: q.right, bottom: q.bottom },
      ...(target
        ? [
            {
              left: target.x - target.r,
              top: target.y - 1.5 * target.r,
              right: target.x + target.r,
              bottom: target.y + 1.5 * target.r,
            },
          ]
        : []),
    ];
    const prefer = target && target.x > a.x ? 'left' : 'right';
    const put = (e: HTMLElement, left: number, top: number) => {
      const l = `${Math.round(left)}px`,
        tp = `${Math.round(top)}px`;
      if (e.style.left !== l) e.style.left = l;
      if (e.style.top !== tp) e.style.top = tp;
    };
    const { commands: c, abilities: s, confirm: f } = this.sizes;
    if (!this.confirmBox.hidden) {
      let p = placeBeside(a, f.w, f.h, area, prefer, avoid);
      // no room clear of both (three strips at 1280x720): keep the turn list clear, the strips already show the target's numbers
      if (!p.free) p = placeBeside(a, f.w, f.h, area, prefer, avoid.slice(0, 1));
      return put(this.confirmBox, p.left, p.top);
    }
    const sub = !this.abilities.hidden;
    // with the submenu open, both decide the side together (otherwise the submenu fell on top of the character); the menu stays on its side
    const gap = 8;
    const p = placeBeside(a, sub ? c.w + gap + s.w : c.w, Math.max(c.h, sub ? s.h : 0), area, 'right', avoid);
    const right = p.side === 'right';
    put(this.commands, right || !sub ? p.left : p.left + s.w + gap, p.top);
    if (!sub) return;
    put(this.abilities, right ? p.left + c.w + gap : p.left, p.top);
    // the submenu opens coming out of the menu: from the left when it is on its right, and vice versa
    this.abilities.classList.toggle('from-right', !right);
  }

  // top line: what to do now (like FFT's help), and the summary of the last action
  private helpText(v: HudView, heroTurn: boolean): string {
    const b = v.battle;
    if (b.over) return b.state.outcome === 'victory' ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat');
    if (v.busy || !heroTurn)
      return v.log || (v.acting ? t(`Vez do inimigo: ${unitName(v.acting)}`, `Enemy turn: ${unitName(v.acting)}`) : '');
    const s = v.screen;
    const say = (pt: string, en: string) => (v.log ? `${v.log} — ` : '') + t(pt, en);
    if (s.k === 'menu')
      return swimming(b)
        ? say(
            `${unitName(b.actor.def)}: na água funda só dá para andar ou esperar.`,
            `${unitName(b.actor.def)}: in deep water you can only move or wait.`,
          )
        : say(`${unitName(b.actor.def)}: escolha um comando.`, `${unitName(b.actor.def)}: pick a command.`);
    if (s.k === 'abilities') {
      const id = abilitiesOf(b)[s.index];
      return id ? `${abilityName(id)}: ${abilityDetail(id)}` : '';
    }
    if (s.k === 'map' && s.command === 'move')
      return v.hl?.tiles.some((m) => m.kind === 'nogo')
        ? t(
            'Mover: não dá para parar aqui; a unidade inteira precisa caber em chão livre e uniforme ao alcance.',
            'Move: cannot stop here; the whole unit must fit on free, even ground in reach.',
          )
        : t('Mover: escolha uma casa marcada.', 'Move: pick a highlighted tile.') + chargeFromText(b, v.cursor);
    if (s.k === 'map') {
      const p = v.hl?.preview;
      return p && !p.ok
        ? REASON[p.reason ?? 'unknown']()
        : t(
            'Escolha o alvo na área laranja (roxo: o tiro bate no caminho).',
            'Pick the target in the orange area (purple: the shot hits something on the way).',
          );
    }
    if (s.k === 'confirm')
      return s.lock
        ? t(
            `${abilityName(s.ability)}: travar no personagem ou na casa?`,
            `${abilityName(s.ability)}: lock on the character or on the tile?`,
          )
        : t(`${abilityName(s.ability)}: executar?`, `${abilityName(s.ability)}: execute?`);
    return t(
      'Para onde olhar? Setas ou clique escolhem; Enter, ou clicar de novo na mesma direção, passa a vez.',
      'Which way to face? Arrows or click choose; Enter, or clicking the same direction again, ends the turn.',
    );
  }

  private renderQueue(b: Battle, v: HudView) {
    const s = v.screen;
    const aim = s.k === 'confirm' ? s : s.k === 'map' && v.ability ? { ability: v.ability, target: v.cursor } : null;
    const { rows, targets, at } = b.over ? { rows: [], targets: new Set<string>(), at: -1 } : queueRows(b, aim);
    // in Until Dawn mode, the title counts the turns left: the same number the rule uses (all turns)
    const left = isSurvival(b.state.scenario) ? turnsLeft(b.state) : null;
    this.queueScroll = this.queue.scrollTop;
    this.queue.replaceChildren(
      el(
        'li',
        { class: 'queue-title', 'aria-hidden': left === null ? 'true' : undefined },
        left === null ? t('Turnos', 'Turns') : t(`Turnos · faltam ${left}`, `Turns · ${left} to dawn`),
        hint('PgUp PgDn'),
      ),
      // a charge row: the caster's face, the ability's icon and name, and the ticks until it goes off
      ...rows.map(({ unit, charge, ticks, round }, i) => {
        const u = b.state.units.find((x) => x.id === unit)!;
        const mark =
          !charge && i > 0 && targets.has(unit) ? el('span', { class: 'queue-target' }, t('◎ alvo', '◎ target')) : null;
        return el(
          'li',
          {
            class: `queue-row ${u.team}${i === 0 ? ' now' : ''}${charge ? ' charge' : ''}${i === at ? ' pending' : ''}`,
          },
          this.face(u),
          charge ? abilityIcon(charge) : null,
          el(
            'span',
            { class: 'queue-text' },
            el(
              'span',
              { class: 'queue-n' },
              charge ? t(`resolve em ${ticks}`, `resolves in ${ticks}`) : i === 0 ? t('AGORA', 'NOW') : String(i),
              mark,
            ),
            el('span', { class: 'queue-name' }, charge ? abilityName(charge) : unitName(u.def)),
          ),
          el('span', { class: 'queue-round', title: t(`Rodada ${round}`, `Round ${round}`) }, String(round)),
        );
      }),
    );
  }

  private anchorQueue(b: Battle) {
    const q = this.queue;
    const turn = `${b.state.turnsPlayed}:${b.state.turn.actor}`;
    const p = q.querySelector<HTMLElement>('.pending');
    const pending = p ? { top: p.offsetTop, height: p.offsetHeight } : null;
    q.scrollTop = anchorScroll(this.queueScroll, q.clientHeight, turn !== this.queueTurn, pending);
    this.queueTurn = turn;
  }

  private renderCommands(v: HudView, open: boolean) {
    const s = v.screen;
    this.commands.hidden = !open || !(s.k === 'menu' || s.k === 'abilities');
    if (this.commands.hidden) return;
    const b = v.battle;
    // with the submenu open, Act stays marked as the picked command (the focus is in the submenu)
    const state = (c: Command, i: number) =>
      s.k === 'menu' ? (i === s.index ? ' focus' : '') : c === 'act' ? ' picked' : '';
    // moved and did not act: Move becomes "Undo move" (Esc also undoes), like Tactics Ogre
    const undo = canUndoMove(b);
    this.commands.replaceChildren(
      menuHead(t('Comandos', 'Commands')),
      ...COMMANDS.map((c, i) =>
        button(
          `item${state(c, i)}`,
          [
            marker(c),
            el(
              'span',
              { class: 'item-label' },
              c === 'move' && undo ? t('Desfazer movimento', 'Undo move') : COMMAND_NAME[c](),
            ),
            c === 'move' && undo ? hint('Esc') : c === 'wait' ? hint('P') : c === 'status' ? hint('C') : null,
          ],
          () => this.act.command(i),
          { role: 'menuitem', disabled: !commandEnabled(b, c) },
        ),
      ),
    );
  }

  private renderAbilities(v: HudView, open: boolean) {
    const s = v.screen;
    this.abilities.hidden = !open || s.k !== 'abilities';
    if (s.k !== 'abilities' || this.abilities.hidden) return;
    const b = v.battle;
    this.abilities.replaceChildren(
      menuHead(t('Habilidades', 'Abilities')),
      ...abilitiesOf(b).map((id, i) => {
        const a = ABILITIES[id];
        const cost = a.cost
          ? `${a.cost[1]} ${a.cost[0] === 'mp' ? 'MP' : t('un.', 'pcs')}`
          : a.charge
            ? t(`${a.charge} tiq.`, `${a.charge} tk`)
            : '';
        return button(
          `item${i === s.index ? ' focus' : ''}`,
          [
            abilityIcon(id),
            el('span', { class: 'item-label' }, abilityName(id)),
            el('span', { class: 'item-cost' }, cost),
          ],
          () => this.act.ability(i),
          { role: 'menuitem', disabled: !abilityEnabled(b, id) },
        );
      }),
    );
  }

  // "Execute?" window: hit and effect on each target, life before → after, and Yes/No
  private renderConfirm(v: HudView, open: boolean) {
    const s = v.screen;
    this.confirmBox.hidden = !open || s.k !== 'confirm';
    if (s.k !== 'confirm' || this.confirmBox.hidden) return;
    const b = v.battle;
    const a = ABILITIES[s.ability];
    const rows = forecast(b, s.ability, b.preview(s.ability, s.target)).map((f) =>
      f.support
        ? el('p', {}, `${unitName(f.unit.def)}: ${abilityDetail(s.ability)}`)
        : el(
            'p',
            {},
            el('strong', {}, unitName(f.unit.def)),
            ` ${forecastText(f)} · ${hpAfterText(f)}${f.ally ? t(' · ALIADO!', ' · ALLY!') : ''}`,
          ),
    );
    if (a.charge) rows.push(el('p', { class: 'unit-note' }, chargeNote(b, s)));
    // the lock step (Nov 15): the same window, its two choices in place of Yes/No
    const choices = s.lock
      ? [
          button(`item${s.lock === 'unit' ? ' focus' : ''}`, [t('No personagem', 'On the character')], () =>
            this.act.lock('unit'),
          ),
          button(`item${s.lock === 'tile' ? ' focus' : ''}`, [t('Na casa', 'On the tile')], () =>
            this.act.lock('tile'),
          ),
        ]
      : [
          button(`item${s.yes ? ' focus' : ''}`, [t('Sim', 'Yes'), hint('Enter')], () => this.act.answer(true)),
          button(`item${s.yes ? '' : ' focus'}`, [t('Não', 'No'), hint('Esc')], () => this.act.answer(false)),
        ];
    this.confirmBox.replaceChildren(
      el(
        'strong',
        { class: 'panel-head' },
        abilityIcon(s.ability),
        s.lock
          ? t(`${abilityName(s.ability)}: travar onde?`, `${abilityName(s.ability)}: lock on?`)
          : t(`${abilityName(s.ability)}: executar?`, `${abilityName(s.ability)}: execute?`),
      ),
      ...rows,
      el('div', { class: 'yes-no' }, ...choices),
    );
  }

  banner(text: string | null) {
    this.bannerEl.hidden = !text;
    this.bannerEl.textContent = text ?? '';
  }

  // height the HUD covers at the bottom (acting unit panel), so the scene centers the map on what is left. Only the acting one: the
  // target's grows with the strike preview and the map jumped each time the cursor passed over a target
  insets() {
    return { top: 0, bottom: this.active.getBoundingClientRect().height };
  }

  dispose() {
    this.showTools(false);
    this.root.remove();
  }
}
