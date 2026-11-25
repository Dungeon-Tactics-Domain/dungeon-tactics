// The battle builder's Sheet and Battle tabs (grill, Nov 25), each in three pages: the unit's numbers, equipment and
// abilities; the battle's map, rules (objective and who plays each side) and each side's bag. Pure and tested.
import { CONSUMABLES } from '../../content/items.ts';
import { ITEMS, SLOTS } from '../../shared/battle/equipment.ts';
import { SUB } from '../../shared/battle/half.ts';
import type { Team } from '../../shared/battle/types.ts';
import { isObjective } from '../../shared/battle/units.ts';
import { LIMITS, type MapUnit } from '../../shared/mapedit/battle.ts';
import { objectiveKind } from '../../shared/mapedit/setup.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import type { Cell, Row } from '../mapedit/layout.ts';
import { slotName } from '../sheet-lines.ts';
import { type BattlePanel, button, label, sideName } from './panel.ts';
import { abilitiesOf, classValue, NUMBERS, type NumberKey, numberOf } from './sheet-edit.ts';
import { DEPTHS, SEEDS } from './sources.ts';

const subRow = (names: string[], on: number): Row => ({
  cells: names.map((n, i) => button(`sub:${i}`, n, { on: i === on })),
});
// a number with its − and +, each off at its limit
const stepper = (id: string, name: string, value: string, atLo: boolean, atHi: boolean, grow = 2): Row => ({
  cells: [
    label(`${id}Name`, name, grow),
    button(`${id}:-1`, '−', { off: atLo }),
    label(`${id}Value`, value),
    button(`${id}:1`, '+', { off: atHi }),
  ],
});

const NUMBER_NAMES: Record<NumberKey, () => string> = {
  hp: () => t('Vida', 'Life'),
  speed: () => t('Velocidade', 'Speed'),
  // the half-tile number the game spends (client CLAUDE.md: sheet value x SUB)
  move: () => t('Movimento (meias casas)', 'Move (half tiles)'),
  jump: () => t('Salto (meias casas)', 'Jump (half tiles)'),
  ct: () => t('CT inicial', 'Starting CT'),
};
const FACING_NAMES = ['↓', '→', '↑', '←']; // FACING order (grid.ts), as the map's own arrows

export const unitTitle = (u: MapUnit) => `${u.name ?? unitName(u.def)} · ${unitName(u.def)} · ${sideName(u.team)}`;

export function sheetRows(s: BattlePanel): Row[] {
  const u = s.unit;
  // no unit picked: every unit on the map as a button, two a row, so the keys and the pad reach each one too
  if (!u) {
    const rows: Row[] = [{ cells: [label('none', t('Escolha uma unidade:', 'Pick a unit:'))] }];
    for (let i = 0; i < s.doc.units.length; i += 2)
      rows.push({
        cells: s.doc.units
          .slice(i, i + 2)
          .map((x) => button(`pick:${x.id}`, `${x.name ?? unitName(x.def)} · ${sideName(x.team)}`)),
      });
    return rows;
  }
  const head: Row[] = [{ cells: [button('pick:-1', '◀'), label('who', unitTitle(u), 5), button('pick:1', '▶')] }];
  // the Beacon is the objective: a sheet of its own would lose its id, and it never turns (sheet.ts parseSheet)
  if (isObjective(u.def))
    return [...head, { cells: [label('beacon', t('O Farol não tem ficha.', 'The Beacon has no sheet.'))] }];
  head.push(subRow([t('Números', 'Numbers'), t('Equipamento', 'Equipment'), t('Habilidades', 'Abilities')], s.sub));
  if (s.sub === 1) return [...head, ...gearRows(u)];
  if (s.sub === 2) return [...head, ...abilityRows(u, s.adding)];
  return [...head, ...numberRows(u)];
}

function numberRows(u: MapUnit): Row[] {
  const rows: Row[] = [
    {
      cells: [
        label('unameLabel', t('Nome', 'Name')),
        { id: 'uname', text: u.name ?? unitName(u.def), kind: 'input', grow: 4 },
      ],
    },
  ];
  for (const k of NUMBERS) {
    const v = numberOf(u, k),
      [lo, hi] = LIMITS[k],
      half = k === 'move' || k === 'jump',
      own = k === 'ct' ? v !== undefined : v !== classValue(u.def, k);
    rows.push(
      stepper(
        `num:${k}`,
        `${NUMBER_NAMES[k]()}${own ? ' •' : ''}`,
        v === undefined ? '—' : String(half ? v * SUB : v),
        k === 'ct' ? v === undefined : (v ?? 0) <= lo,
        (v ?? 0) >= hi,
      ),
    );
  }
  rows.push({
    cells: [
      label('faceName', t('Olha para', 'Faces'), 2),
      button('face:-1', '↺'),
      label('faceValue', FACING_NAMES[u.facing]),
      button('face:1', '↻'),
    ],
  });
  rows.push({ cells: [button('reset', t('Voltar à ficha da classe', 'Back to the class’s sheet'))] });
  return rows;
}

function gearRows(u: MapUnit): Row[] {
  return SLOTS.map((slot) => {
    const id = u.items?.[slot];
    return {
      cells: [
        label(`gear:${slot}Name`, slotName(slot), 2),
        button(`gear:${slot}:-1`, '◀'),
        label(`gear:${slot}Value`, id ? t(ITEMS[id].name, ITEMS[id].en) : '—', 3),
        button(`gear:${slot}:1`, '▶'),
      ],
    };
  });
}

// two abilities a row, each a button that takes it away (never the last one); then the one to add
function abilityRows(u: MapUnit, adding: string | null): Row[] {
  const list = abilitiesOf(u),
    rows: Row[] = [];
  for (let i = 0; i < list.length; i += 2)
    rows.push({
      cells: list.slice(i, i + 2).map((id, k) =>
        button(
          `drop:${i + k}`,
          list.length > 1
            ? `${abilityName(id)} ✕`
            : t(`${abilityName(id)} (a única)`, `${abilityName(id)} (the only one)`),
          {
            off: list.length < 2,
          },
        ),
      ),
    });
  rows.push({
    cells: [
      button('add:-1', '◀', { off: !adding }),
      label('addValue', adding ? abilityName(adding) : t('nenhuma a mais', 'none left'), 3),
      button('add:1', '▶', { off: !adding }),
      button('addAbility', '+', { off: !adding || list.length >= 8 }),
    ],
  });
  return rows;
}

const OBJECTIVE_NAMES: Record<ReturnType<typeof objectiveKind>, () => string> = {
  default: () => t('O do mapa', 'The map’s'),
  defeat_all: () => t('Derrotar todos', 'Defeat all'),
  beacon: () => t('Proteger o Farol', 'Protect the Beacon'),
  survive: () => t('Sobreviver', 'Survive'),
};

export function battleRows(s: BattlePanel): Row[] {
  const head = subRow([t('Mapa', 'Map'), t('Regras', 'Rules'), t('Bolsas', 'Bags')], s.sub);
  if (s.sub === 1) return [head, ...ruleRows(s)];
  if (s.sub === 2) return [head, ...bagRows(s)];
  return [
    head,
    { cells: [label('mapNow', t(`Mapa: ${s.doc.map.name}`, `Map: ${s.doc.map.en}`))] },
    { cells: [button('src:-1', '◀'), label('srcValue', s.source, 4), button('src:1', '▶')] },
    { cells: [button('useMap', t('Usar este mapa', 'Use this map'))] },
    { cells: [label('roomTitle', t('Sala de expedição', 'Expedition room'))] },
    {
      cells: [
        label('seedName', t('Semente', 'Seed'), 2),
        button('seed:-1', '−', { off: s.seed <= SEEDS[0] }),
        label('seedValue', String(s.seed), 2),
        button('seed:1', '+', { off: s.seed >= SEEDS[1] }),
        button('seed:new', t('Nova', 'New')),
      ],
    },
    stepper('depth', t('Profundidade', 'Depth'), String(s.depth), s.depth <= DEPTHS[0], s.depth >= DEPTHS[1]),
    { cells: [button('useRoom', t('Usar a sala (mapa e monstros)', 'Use the room (map and monsters)'))] },
  ];
}

function ruleRows(s: BattlePanel): Row[] {
  const kind = objectiveKind(s.doc),
    o = s.doc.objective,
    side = (team: Team): Row => {
      const c = s.doc.control?.[team] ?? (team === 'hero' ? 'player' : 'ai');
      return {
        cells: [
          label(`ctl:${team}Name`, team === 'hero' ? t('Heróis', 'Heroes') : t('Inimigos', 'Enemies'), 2),
          button(`ctl:${team}:player`, t('Jogador', 'Player'), { on: c === 'player' }),
          button(`ctl:${team}:ai`, t('IA', 'AI'), { on: c === 'ai' }),
        ],
      };
    };
  const rows: Row[] = [
    {
      cells: [
        label('objName', t('Objetivo', 'Objective'), 2),
        button('obj:-1', '◀'),
        label('objValue', OBJECTIVE_NAMES[kind](), 3),
        button('obj:1', '▶'),
      ],
    },
  ];
  if (o?.kind === 'survive')
    rows.push(
      stepper('turns', t('Turnos', 'Turns'), String(o.turns), o.turns <= LIMITS.turns[0], o.turns >= LIMITS.turns[1]),
    );
  rows.push(side('hero'), side('enemy'));
  return rows;
}

function bagRows(s: BattlePanel): Row[] {
  const bag = s.doc.bags?.[s.bagSide] ?? {};
  const sides: Cell[] = (['hero', 'enemy'] as const).map((team) =>
    button(`bagSide:${team}`, team === 'hero' ? t('Heróis', 'Heroes') : t('Inimigos', 'Enemies'), {
      on: team === s.bagSide,
    }),
  );
  return [
    { cells: sides },
    ...CONSUMABLES.map((c) =>
      stepper(`bag:${c.id}`, t(c.name, c.en), String(bag[c.id] ?? 0), !bag[c.id], (bag[c.id] ?? 0) >= 99, 3),
    ),
  ];
}
