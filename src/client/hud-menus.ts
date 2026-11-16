// The menus beside the acting unit (commands, the abilities submenu, "Execute?") and the help line on top. Each menu
// sets its own `hidden` before anything else: BattleHud.menuOpen and its size cache read it right after.
import { ABILITIES } from '../shared/battle/abilities.ts';
import { abilityDetail, costText, shortOf, spendNote } from './battle-text.ts';
import { chargeFromText, chargeNote, counterFromText, counterNote } from './charge-lines.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  type Command,
  canUndoMove,
  commandEnabled,
  swimming,
} from './command.ts';
import { forecast, forecastText, hpAfterText } from './forecast.ts';
import type { HudActions, HudView } from './hud.ts';
import { hint } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el } from './icons.ts';

const REASON: Record<string, () => string> = {
  range: () => t('Fora do alcance', 'Out of range'),
  sight: () => t('Sem linha de visão', 'No line of sight'),
  'no-target': () => t('Nenhum alvo nesta casa', 'No target on this tile'),
  unknown: () => t('Não dá para usar aqui', 'Cannot use here'),
  // the grayed ability row already says how much is missing (shortOf); this is the sandbox's and an old save's way here
  spent: () => t('Falta mana, stamina, MP ou estoque', 'Not enough mana, stamina, MP or stock'),
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
// the "Execute?" question, in the help line and on top of its window
const executeText = (id: string) => t(`${abilityName(id)}: executar?`, `${abilityName(id)}: execute?`);

// top line: what to do now (like FFT's help), and the summary of the last action
export function helpText(v: HudView, heroTurn: boolean): string {
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
      : t('Mover: escolha uma casa marcada.', 'Move: pick a highlighted tile.') +
          chargeFromText(b, v.cursor) +
          counterFromText(b, v.cursor);
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
      : executeText(s.ability);
  return t(
    'Para onde olhar? Setas ou clique escolhem; Enter, ou clicar de novo na mesma direção, passa a vez.',
    'Which way to face? Arrows or click choose; Enter, or clicking the same direction again, ends the turn.',
  );
}

export function renderCommands(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  box.hidden = !open || !(s.k === 'menu' || s.k === 'abilities');
  if (box.hidden) return;
  const b = v.battle;
  // with the submenu open, Act stays marked as the picked command (the focus is in the submenu)
  const state = (c: Command, i: number) =>
    s.k === 'menu' ? (i === s.index ? ' focus' : '') : c === 'act' ? ' picked' : '';
  // moved and did not act: Move becomes "Undo move" (Esc also undoes), like Tactics Ogre
  const undo = canUndoMove(b);
  box.replaceChildren(
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
        () => act.command(i),
        { role: 'menuitem', disabled: !commandEnabled(b, c) },
      ),
    ),
  );
}

export function renderAbilities(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  box.hidden = !open || s.k !== 'abilities';
  if (s.k !== 'abilities' || box.hidden) return;
  const b = v.battle;
  box.replaceChildren(
    menuHead(t('Habilidades', 'Abilities')),
    ...abilitiesOf(b).map((id, i) => {
      const a = ABILITIES[id];
      const on = abilityEnabled(b, id);
      // the cost and the charge ticks; grayed out, the row says what is missing (a disabled button says why)
      const cost = on
        ? [costText(a), a.charge ? t(`${a.charge} tiq.`, `${a.charge} tk`) : ''].filter(Boolean).join(' · ')
        : shortOf(b.actor, a);
      return button(
        `item${i === s.index ? ' focus' : ''}`,
        [
          abilityIcon(id),
          el('span', { class: 'item-label' }, abilityName(id)),
          el('span', { class: 'item-cost' }, cost),
        ],
        () => act.ability(i),
        { role: 'menuitem', disabled: !on },
      );
    }),
  );
}

// "Execute?" window: hit and effect on each target, life before → after, and Yes/No
export function renderConfirm(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  box.hidden = !open || s.k !== 'confirm';
  if (s.k !== 'confirm' || box.hidden) return;
  const b = v.battle;
  const a = ABILITIES[s.ability];
  const preview = b.preview(s.ability, s.target);
  const rows = forecast(b, s.ability, preview).map((f) =>
    f.support
      ? el('p', {}, `${unitName(f.unit.def)}: ${abilityDetail(s.ability)}`)
      : el(
          'p',
          {},
          el('strong', {}, unitName(f.unit.def)),
          ` ${forecastText(f)} · ${hpAfterText(f)}${f.ally ? t(' · ALIADO!', ' · ALLY!') : ''}`,
        ),
  );
  if (a.cost) rows.push(el('p', { class: 'unit-note' }, spendNote(b.actor, a)));
  if (a.charge) rows.push(el('p', { class: 'unit-note' }, chargeNote(b, s)));
  const owed = counterNote(b, s.ability, preview);
  if (owed) rows.push(el('p', { class: 'unit-note' }, owed));
  // the lock step (Nov 15): the same window, its two choices in place of Yes/No
  const choices = s.lock
    ? [
        button(`item${s.lock === 'unit' ? ' focus' : ''}`, [t('No personagem', 'On the character')], () =>
          act.lock('unit'),
        ),
        button(`item${s.lock === 'tile' ? ' focus' : ''}`, [t('Na casa', 'On the tile')], () => act.lock('tile')),
      ]
    : [
        button(`item${s.yes ? ' focus' : ''}`, [t('Sim', 'Yes'), hint('Enter')], () => act.answer(true)),
        button(`item${s.yes ? '' : ' focus'}`, [t('Não', 'No'), hint('Esc')], () => act.answer(false)),
      ];
  box.replaceChildren(
    el(
      'strong',
      { class: 'panel-head' },
      abilityIcon(s.ability),
      s.lock
        ? t(`${abilityName(s.ability)}: travar onde?`, `${abilityName(s.ability)}: lock on?`)
        : executeText(s.ability),
    ),
    ...rows,
    el('div', { class: 'yes-no' }, ...choices),
  );
}
