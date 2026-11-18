// Pure side of the 3D developer menu (dev3d.ts; Fernando, Nov 18: the whole interface in 3D, forms too): the cast
// (dev-roster.ts) as the list of fields the screen shows, what an edit makes of the cast, and where the page's parts
// sit. The same rules as the HTML menu (dev-menu.ts): the map cuts what does not fit its starting tiles, a new class
// restarts the numbers and keeps a name of the player's own, Move and Jump show in half tiles, the 1st ability marked
// is the basic attack. One unit is open at a time: a closed one is a single row, so the list stays short enough to
// walk with a d-pad. No DOM, no Three; tested in tests/dev3d.test.ts.
import { SUB } from '../../shared/battle/half.ts';
import { MAX_JUMP } from '../../shared/battle/pathing.ts';
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import {
  DEV_MAPS,
  type DevSetup,
  type DevUnit,
  defaultSetup,
  devAbilities,
  devClasses,
  LIMITS,
  parseSetup,
  problems,
  slotsOf,
  unitFrom,
} from '../dev-roster.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { cycle } from '../option-row.ts';
import { clampNumber, type Field, type Metrics, metrics, TAP } from '../ui3d/field.ts';
import { type Box, SCREEN } from '../ui3d/layout.ts';

export interface DevUi {
  open?: string; // the unit whose fields show: 'h0', 'e2'
  msg?: string; // what the last import said
}

export const MAX_ABILITIES = 8; // parseSetup refuses a cast with more: the 9th is not marked, so the save never breaks
// the editable numbers: the sheet's key, its name, and the step on screen (half tiles for Move and Jump, Nov 15)
const NUMS = [
  ['hp', 'Vida', 'HP', 1],
  ['speed', 'Velocidade', 'Speed', 1],
  ['move', 'Movimento', 'Move', SUB],
  ['jump', 'Salto', 'Jump', SUB],
] as const;
// each side: the tag of its fields' ids, its list in the cast, its name and the class a new unit starts as
const TEAMS = [
  ['h', 'heroes', 'hero', 'Heróis', 'Heroes', 'warrior'],
  ['e', 'enemies', 'enemy', 'Inimigos', 'Enemies', 'soldier'],
] as const;

const maps = () => DEV_MAPS.filter((m) => SCENARIOS[m]);
const jumpOf = (u: DevUnit) => u.jump ?? UNIT_DEFS[u.base].jump ?? MAX_JUMP;
const ownName = (u: DevUnit) => u.name !== UNIT_DEFS[u.base].name;

// The form, top to bottom: the map and what stops the battle, the commands, each side's units, the cast as JSON
export function devFields(setup: DevSetup, ui: DevUi = {}): Field[] {
  const slots = slotsOf(setup.map),
    issues = problems(setup, t);
  const out: Field[] = [
    { kind: 'pick', id: 'map', label: t('Mapa', 'Map'), text: t(SCENARIOS[setup.map].name, SCENARIOS[setup.map].en) },
    {
      kind: 'note',
      id: 'goal',
      label: slots.objective.length
        ? t('Objetivo: derrote os inimigos e proteja o Farol.', 'Goal: defeat the enemies and protect the Beacon.')
        : t(
            'Sem Farol neste mapa: vence quem derrotar o outro lado.',
            'No Beacon on this map: whoever defeats the other side wins.',
          ),
    },
    ...issues.map((label, i): Field => ({ kind: 'note', id: `issue${i}`, label, warn: true })),
    ...(ui.msg ? [{ kind: 'note', id: 'msg', label: ui.msg } as Field] : []),
    {
      kind: 'button',
      id: 'start',
      main: true,
      off: issues.length > 0,
      label: issues.length
        ? t('Começar: resolva os avisos', 'Start: fix the notes')
        : t('Começar batalha', 'Start battle'),
    },
    { kind: 'button', id: 'export', label: t('Exportar arquivo', 'Export file') },
    { kind: 'button', id: 'import', label: t('Importar arquivo', 'Import file') },
    { kind: 'button', id: 'reset', label: t('Restaurar padrão do mapa', 'Restore map default') },
    { kind: 'button', id: 'back', label: t('Voltar', 'Back') },
  ];
  for (const [tag, key, side, pt, en] of TEAMS) {
    const list = setup[key],
      room = slots[side].length;
    out.push({ kind: 'head', id: tag, label: `${t(pt, en)} · ${list.length}/${room}` });
    list.forEach((u, i) => {
      const id = `${tag}${i}`,
        open = ui.open === id;
      const who = ownName(u) ? `${u.name} · ${unitName(u.base)}` : unitName(u.base);
      out.push({ kind: 'button', id, fold: open, label: `${i + 1}. ${who}` });
      if (!open) return;
      out.push(
        { kind: 'pick', id: `${id}.base`, label: t('Classe', 'Class'), text: unitName(u.base) },
        { kind: 'text', id: `${id}.name`, label: t('Nome', 'Name'), value: u.name, max: 24 },
        ...NUMS.map(([k, npt, nen, step]): Field => {
          const [lo, hi] = LIMITS[k];
          const value = (k === 'jump' ? jumpOf(u) : u[k]) * step;
          return { kind: 'number', id: `${id}.${k}`, label: t(npt, nen), value, min: lo * step, max: hi * step, step };
        }),
        {
          kind: 'note',
          id: `${id}.skills`,
          label: t(
            `Habilidades (${u.abilities.length} de ${MAX_ABILITIES}): o número é a ordem no menu, a 1ª é o ataque básico.`,
            `Abilities (${u.abilities.length} of ${MAX_ABILITIES}): the number is the menu's order, the 1st is the basic attack.`,
          ),
        },
        ...devAbilities().map((a): Field => {
          const at = u.abilities.indexOf(a);
          const label = at < 0 ? abilityName(a) : `${at + 1}. ${abilityName(a)}`;
          return { kind: 'check', id: `${id}.a.${a}`, label, on: at >= 0 };
        }),
        { kind: 'button', id: `${id}.del`, label: t(`Tirar ${u.name}`, `Remove ${u.name}`) },
      );
    });
    const full = list.length >= room;
    out.push({
      kind: 'button',
      id: `${tag}+`,
      off: full,
      label: full ? t('Sem casa de partida livre', 'No free starting tile') : t('+ Adicionar', '+ Add'),
    });
  }
  out.push(
    { kind: 'head', id: 'json-head', label: t('Elenco em JSON', 'Cast as JSON') },
    {
      kind: 'note',
      id: 'json-note',
      label: t(
        'Cole ou edite e saia do campo para importar; o texto é o mesmo do arquivo exportado.',
        'Paste or edit and leave the field to import; the text is the same as the exported file.',
      ),
    },
    { kind: 'area', id: 'json', label: t('Elenco em JSON', 'Cast as JSON'), value: devJson(setup), rows: 8 },
  );
  return out;
}

export const devJson = (setup: DevSetup) => JSON.stringify(setup, null, 2);
// Trust boundary: text typed, pasted or read from a file. Only the known format passes (parseSetup)
export function readSetup(text: string): DevSetup | null {
  try {
    return parseSetup(JSON.parse(text));
  } catch {
    return null;
  }
}

// A step (an arrow, a press), a typed text or a mark
export type Change = -1 | 1 | string | boolean;

// The cast after an edit of the field `id`; the same cast for an id or a change it does not know
export function devEdit(setup: DevSetup, id: string, c: Change): DevSetup {
  if (id === 'map' && typeof c === 'number') {
    // switching maps keeps the parties and only cuts what doesn't fit the new map's starting tiles
    const map = cycle(maps(), setup.map, c),
      s = slotsOf(map);
    return { map, heroes: setup.heroes.slice(0, s.hero.length), enemies: setup.enemies.slice(0, s.enemy.length) };
  }
  if (id === 'reset') return defaultSetup(setup.map);
  const [, tag, add, n, , rest] = /^([he])(?:(\+)|(\d+)(\.(.+))?)$/.exec(id) ?? [];
  const team = TEAMS.find((x) => x[0] === tag);
  if (!team) return setup;
  const [, key, side, , , first] = team,
    list = setup[key];
  if (add)
    return list.length < slotsOf(setup.map)[side].length ? { ...setup, [key]: [...list, unitFrom(first)] } : setup;
  const i = Number(n),
    u = list[i];
  if (!u || !rest) return setup;
  if (rest === 'del') return { ...setup, [key]: list.filter((_, at) => at !== i) };
  const put = (patch: Partial<DevUnit>): DevSetup => ({
    ...setup,
    [key]: list.map((x, at) => (at === i ? { ...x, ...patch } : x)),
  });
  if (rest === 'base' && typeof c === 'number') {
    // changing the class restarts the numbers and abilities from the class's (the name stays, if it was changed)
    const base = cycle(devClasses(), u.base, c);
    return put(unitFrom(base, ownName(u) ? u.name : UNIT_DEFS[base].name));
  }
  if (rest === 'name' && typeof c === 'string') return put({ name: c.trim().slice(0, 24) || UNIT_DEFS[u.base].name });
  const num = NUMS.find(([k]) => k === rest);
  if (num && typeof c !== 'boolean') {
    // out of limits goes back to the nearest: the saved JSON never becomes invalid
    const [k, , , step] = num,
      [min, max] = LIMITS[k],
      now = k === 'jump' ? jumpOf(u) : u[k];
    return put({ [k]: clampNumber({ min, max, step: 1 }, typeof c === 'number' ? now + c : Number(c) / step) });
  }
  if (rest.startsWith('a.') && typeof c === 'boolean') {
    const a = rest.slice(2),
      has = u.abilities.includes(a);
    if (!devAbilities().includes(a) || c === has || (c && u.abilities.length >= MAX_ABILITIES)) return setup;
    // the list order is the ability menu's; the 1st checked is the basic attack
    return put({ abilities: c ? [...u.abilities, a] : u.abilities.filter((x) => x !== a) });
  }
  return setup;
}

// Where the page's parts sit: the name over its hairline, the parchment with the scrolling column inside it, the line
// of keys at the foot. Fluid, not the 16:9 frame: a phone on its side (844x390) gets the same screen with less of the
// list in view, so nothing falls back to the HTML window for want of room
export interface DevLayout {
  s: number;
  title: { x: number; y: number }; // middle
  rule: Box;
  panel: Box; // the parchment
  list: Box; // the scrolling window inside it
  foot: { x: number; y: number; w: number }; // the keys: middle, and the room they have
  hand: number; // the glove's size
  m: Metrics;
}
export function devLayout(w: number, h: number): DevLayout {
  const s = Math.min(w / SCREEN.w, h / SCREEN.h);
  const head = Math.max(40, 150 * s),
    foot = Math.max(30, 76 * s),
    hand = Math.max(26, 62 * s),
    edge = Math.max(8, 18 * s);
  const pw = Math.min(w - 2 * (hand + 8), Math.max(1260 * s, 760)),
    panel = { x: (w - pw) / 2, y: head, w: pw, h: h - head - foot - edge };
  const px = Math.max(TAP / 2, 44 * s),
    py = Math.max(10, 30 * s);
  const list = { x: panel.x + px, y: panel.y + py, w: panel.w - 2 * px, h: panel.h - 2 * py };
  return {
    s,
    title: { x: w / 2, y: head * 0.46 },
    rule: { x: w / 2 - 570 * s, y: head - Math.max(10, 26 * s), w: 1140 * s, h: Math.max(1, 2 * s) },
    panel,
    list,
    foot: { x: w / 2, y: h - foot / 2 - edge / 2, w: w - 32 },
    hand,
    m: metrics(list.w, s),
  };
}
