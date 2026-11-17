// The menus beside the acting unit (commands, the abilities submenu, "Execute?") and the help line on top. Each menu
// sets its own `hidden` before anything else: BattleHud.menuOpen and its size cache read it right after.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { abilityDetail, abilityNote, abilityPages, commandName, spendNote } from './battle-text.ts';
import { chargeFromText, chargeNote, counterFromText, counterNote } from './charge-lines.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  type Command,
  cancelStep,
  canUndoMove,
  commandEnabled,
  PAGES,
  type Screen,
  swimming,
} from './command.ts';
import { forecast, forecastText, hpAfterText } from './forecast.ts';
import type { HudActions, HudView } from './hud.ts';
import { hint, KEYS } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el } from './icons.ts';

const REASON: Record<string, () => string> = {
  range: () => t('Fora do alcance', 'Out of range'),
  sight: () => t('Sem linha de visão', 'No line of sight'),
  'no-target': () => t('Nenhum alvo nesta casa', 'No target on this tile'),
  unknown: () => t('Não dá para usar aqui', 'Cannot use here'),
  // the grayed ability row already says how much is missing (shortOf); this is the sandbox's and an old save's way here
  spent: () => t('Falta mana, stamina, MP ou estoque', 'Not enough mana, stamina, MP or stock'),
  water: () => t('Água funda: só andar ou esperar', 'Deep water: only move or wait'),
};
// command row marker: the atlas icon (Move, Wait) or, for the commands without one, a glass orb like the lab kit's
const ORB = new Set<Command>(['act', 'status']);
const marker = (c: Command) => (ORB.has(c) ? el('span', { class: `orb ${c}`, 'aria-hidden': 'true' }) : abilityIcon(c));
// menu name on top of the command menu, the submenu and "Execute?" (the menu's aria-label says it to the screen reader)
const menuHead = (...text: Child[]) => el('div', { class: 'panel-head', 'aria-hidden': 'true' }, ...text);
// the "Execute?" question, in the help line and on top of its window
const executeText = (id: string) => t(`${abilityName(id)}: executar?`, `${abilityName(id)}: execute?`);

// The on-screen Back button (Nov 16: a tablet has no Esc, B or right button, and the Move and Act maps had no way out):
// what it does now, the same as Esc. null hides it: nothing to go back to
export function backKind(b: Battle, s: Screen, open: boolean): 'back' | 'undo' | null {
  const to = open ? cancelStep(b, s) : null;
  return to === 'undo' ? 'undo' : to ? 'back' : null;
}

// What a finger's tap left on the map (Nov 16: the 1st tap only marks, the 2nd confirms, and nothing said so). 'marked': a
// tile is chosen, tapping it again confirms; 'invalid': the tap landed on a tile that does not work (`Ui.invalid`, which
// a tap on a unit to inspect it and a cursor step from the gamepad never set)
function tapState(v: HudView): 'marked' | 'invalid' | null {
  if (v.hl?.tiles.some((m) => m.kind === 'target')) return 'marked';
  return v.hl?.invalid ? 'invalid' : null;
}

// top line: what to do now (like FFT's help), and the summary of the last action. `touch`: no keyboard or mouse, so the
// map screens say what a tap does. Each instruction fits one line of the 3D banner (Fernando, Nov 16, as on FFT: 520 px
// of the reference's 30 px serif, measured in Chrome); the log before it, a submenu's detail and the charge and counter
// notes after it still wrap
export function helpText(v: HudView, heroTurn: boolean, touch = !KEYS): string {
  const b = v.battle;
  if (b.over) return b.state.outcome === 'victory' ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat');
  if (v.busy || !heroTurn)
    return v.log || (v.acting ? t(`Vez do inimigo: ${unitName(v.acting)}`, `Enemy turn: ${unitName(v.acting)}`) : '');
  const s = v.screen;
  const say = (pt: string, en: string) => (v.log ? `${v.log} — ` : '') + t(pt, en);
  if (s.k === 'menu')
    return swimming(b)
      ? say('Água funda: só andar ou esperar.', 'Deep water: only move or wait.')
      : say(`${unitName(b.actor.def)}: o que fazer?`, `${unitName(b.actor.def)}: what now?`);
  if (s.k === 'abilities') {
    const id = abilitiesOf(b)[s.index];
    return id ? `${abilityName(id)}: ${abilityDetail(id)}` : '';
  }
  const tap = touch && s.k === 'map' ? tapState(v) : null;
  if (s.k === 'map' && s.command === 'move')
    return v.hl?.tiles.some((m) => m.kind === 'nogo')
      ? t('Não cabe aqui: precisa de chão plano.', 'Won’t fit: needs free, level ground.')
      : (tap === 'marked'
          ? t('Mover: toque de novo para confirmar.', 'Move: tap the tile again to confirm.')
          : tap === 'invalid'
            ? t('Mover: toque numa casa marcada.', 'Move: tap a highlighted tile.')
            : t('Mover: escolha a casa e confirme.', 'Move: pick a tile and confirm.')) +
          chargeFromText(b, v.cursor) +
          counterFromText(b, v.cursor);
  if (s.k === 'map') {
    const p = v.hl?.preview;
    return p && !p.ok
      ? REASON[p.reason ?? 'unknown']()
      : tap === 'marked'
        ? t('Toque de novo para confirmar.', 'Tap again to confirm.')
        : tap === 'invalid'
          ? t('Toque dentro da área laranja.', 'Tap inside the orange area.')
          : t('Alvo: área laranja. Roxo: bloqueado.', 'Target: orange area. Purple: blocked.');
  }
  if (s.k === 'confirm')
    return s.lock
      ? t(`${abilityName(s.ability)}: travar onde?`, `${abilityName(s.ability)}: lock where?`)
      : executeText(s.ability);
  return touch
    ? t('Toque um lado; de novo, passa a vez.', 'Face which way? Tap a side twice.')
    : t('Para onde olhar? Escolha e confirme.', 'Which way to face? Pick and confirm.');
}

// the Back button's name for what it does now; hidden with nothing to go back to
export function renderBack(btn: HTMLElement, v: HudView, open: boolean) {
  const kind = backKind(v.battle, v.screen, open);
  btn.hidden = !kind;
  if (kind) btn.title = btn.ariaLabel = kind === 'undo' ? t('Desfazer movimento', 'Undo move') : t('Voltar', 'Back');
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
          el('span', { class: 'item-label' }, commandName(c, undo)),
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
      const cost = abilityNote(b.actor, a, on);
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

const PAGE_NAME = [() => t('Descrição', 'Description'), () => t('Efeitos', 'Effects'), () => t('Custo', 'Cost')];
// ?menucss: the FFT ability sheet over the submenu: the unit's name, the big icon and the ability's name, and one of the
// three pages of its facts (abilityPages), turned with left and right or its arrows
export function renderSheet(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  const id = s.k === 'abilities' ? abilitiesOf(v.battle)[s.index] : undefined;
  box.hidden = !open || !id;
  if (s.k !== 'abilities' || !id || box.hidden) return;
  const page = s.page ?? 0;
  const lines = abilityPages(id)[page];
  const turn = (dir: 1 | -1, glyph: string, name: string) =>
    button('page-turn', glyph, () => act.page(dir), { title: name, 'aria-label': name });
  box.replaceChildren(
    el(
      'div',
      { class: 'panel-head' },
      el('span', { class: 'diamond', 'aria-hidden': 'true' }),
      unitName(v.battle.actor.def),
    ),
    el(
      'div',
      { class: 'sheet-title' },
      el('span', { class: 'big-icon' }, abilityIcon(id)),
      el('strong', { class: 'sheet-name' }, abilityName(id)),
    ),
    el('div', { class: 'sheet-band' }, PAGE_NAME[page]()),
    el(
      'div',
      { class: 'sheet-body' },
      ...(lines.length ? lines : [t('nada além do básico', 'nothing beyond the basics')]).map((l) => el('p', {}, l)),
    ),
    el(
      'div',
      { class: 'sheet-foot' },
      turn(-1, '‹', t('Página anterior', 'Previous page')),
      el('span', { class: 'sheet-page' }, `${page + 1} / ${PAGES}`),
      turn(1, '›', t('Próxima página', 'Next page')),
      hint('← →'),
    ),
  );
}

// What "Execute?" says besides the strike's numbers, for the HTML window and the 3D one (confirm3d/): its title, the notes
// (what it spends, the charge, a counter owed) and its two choices with the one in focus. On the preview the focus stays
// on Confirm (Enter runs it, Esc goes back, nothing to toggle); the lock step (Nov 15) puts its two choices in their place
export type ConfirmPick = 'yes' | 'no' | 'unit' | 'tile';
export interface ConfirmParts {
  title: string;
  notes: string[];
  choices: { label: string; focus: boolean; pick: ConfirmPick; key?: string }[];
}
export function confirmParts(b: Battle, s: Extract<Screen, { k: 'confirm' }>): ConfirmParts {
  const a = ABILITIES[s.ability];
  const notes: string[] = [];
  if (a.cost) notes.push(spendNote(b.actor, a));
  if (a.charge) notes.push(chargeNote(b, s));
  const owed = counterNote(b, s.ability, b.preview(s.ability, s.target));
  if (owed) notes.push(owed);
  return s.lock
    ? {
        title: t(`${abilityName(s.ability)}: travar onde?`, `${abilityName(s.ability)}: lock on?`),
        notes,
        choices: [
          { label: t('No personagem', 'On the character'), focus: s.lock === 'unit', pick: 'unit' },
          { label: t('Na casa', 'On the tile'), focus: s.lock === 'tile', pick: 'tile' },
        ],
      }
    : {
        title: executeText(s.ability),
        notes,
        choices: [
          { label: t('Confirmar', 'Confirm'), focus: true, pick: 'yes', key: 'Enter' },
          { label: t('Voltar', 'Back'), focus: false, pick: 'no', key: 'Esc' },
        ],
      };
}
// a choice's click: the lock step picks where, the preview answers
export const runPick = (act: HudActions, pick: ConfirmPick) =>
  pick === 'unit' || pick === 'tile' ? act.lock(pick) : act.answer(pick === 'yes');

// "Execute?" window, the strike preview: hit and effect on each target, life before → after, then confirmParts
export function renderConfirm(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  box.hidden = !open || s.k !== 'confirm';
  if (s.k !== 'confirm' || box.hidden) return;
  const b = v.battle;
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
  const parts = confirmParts(b, s);
  box.replaceChildren(
    el('strong', { class: 'panel-head' }, abilityIcon(s.ability), parts.title),
    ...rows,
    ...parts.notes.map((n) => el('p', { class: 'unit-note' }, n)),
    el(
      'div',
      { class: 'yes-no' },
      ...parts.choices.map((c) =>
        button(`item${c.focus ? ' focus' : ''}`, [c.label, c.key ? hint(c.key) : null], () => runPick(act, c.pick)),
      ),
    ),
  );
}
