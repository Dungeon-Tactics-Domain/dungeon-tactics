// The command menu beside the acting unit and the help line on top. The menu sets its own `hidden` before anything else:
// BattleHud.menuOpen and its size cache read it right after.
import type { Battle } from '../shared/battle/battle.ts';
import { screenAction } from './act-marks.ts';
import { commandName, itemDetail, itemName } from './battle-text.ts';
import { chargeFromText, counterFromText } from './charge-lines.ts';
import { type Command, cancelStep, commandEnabled, commandIndex, menuRows, type Screen, swimming } from './command.ts';
import type { HudActions, HudView } from './hud.ts';
import { hint, KEYS } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el } from './icons.ts';

// command row marker: the atlas icon (Move, Wait) or, for the commands without one, a glass orb like the lab kit's
const ORB = new Set<Command>(['act', 'status']);
const marker = (c: Command) => (ORB.has(c) ? el('span', { class: `orb ${c}`, 'aria-hidden': 'true' }) : abilityIcon(c));
// menu name on top of the command menu (the menu's aria-label says it to the screen reader)
const menuHead = (...text: Child[]) => el('div', { class: 'panel-head', 'aria-hidden': 'true' }, ...text);

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
// of the reference's 30 px serif, measured in Chrome); the log before it, an action's detail and the charge and counter
// notes after it still wrap
export function helpText(v: HudView, heroTurn: boolean, touch = !KEYS): string {
  const b = v.battle;
  if (b.over) return b.state.outcome === 'victory' ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat');
  if (v.busy || !heroTurn)
    return v.log || (v.acting ? t(`Vez do inimigo: ${unitName(v.acting)}`, `Enemy turn: ${unitName(v.acting)}`) : '');
  const s = v.screen;
  const say = (pt: string, en: string) => (v.log ? `${v.log} — ` : '') + t(pt, en);
  // another unit's painted range (unit-peek.ts), then the menu shut by a tap on an empty tile (menu-state.ts)
  const seen = v.range && b.state.units.find((u) => u.id === v.range);
  if (seen)
    return touch
      ? t(`Alcance: ${unitName(seen.def)}. Toque para fechar.`, `Range: ${unitName(seen.def)}. Tap to close.`)
      : t(`Alcance: ${unitName(seen.def)}. Esc fecha.`, `Range: ${unitName(seen.def)}. Esc closes.`);
  if (v.closed)
    return touch
      ? t('Menu: toque no herói ou na ficha.', 'Menu: tap the hero or the sheet.')
      : t('Menu: confirme ou clique no herói.', 'Menu: confirm or click the hero.');
  if (s.k === 'menu')
    return swimming(b)
      ? say('Água funda: só andar ou esperar.', 'Deep water: only move or wait.')
      : say(`${unitName(b.actor.def)}: o que fazer?`, `${unitName(b.actor.def)}: what now?`);
  if (s.k === 'aim')
    return touch
      ? t('Área: toque onde mirar; de novo, segue.', 'Area: tap where to aim; again to go on.')
      : t('Área: escolha onde mirar e confirme.', 'Area: pick where to aim and confirm.');
  if (s.k === 'acts' || s.k === 'group') return t('Agir: escolha e confirme.', 'Act: pick and confirm.');
  if (s.k === 'targets' || s.k === 'actions' || s.k === 'spot') return actHelp(b, s, touch);
  const tap = touch ? tapState(v) : null;
  if (s.k === 'map')
    return v.hl?.tiles.some((m) => m.kind === 'nogo')
      ? t('Não cabe aqui: precisa de chão plano.', 'Won’t fit: needs free, level ground.')
      : (tap === 'marked'
          ? t('Mover: toque de novo para confirmar.', 'Move: tap the tile again to confirm.')
          : tap === 'invalid'
            ? t('Mover: toque numa casa marcada.', 'Move: tap a highlighted tile.')
            : t('Mover: escolha a casa e confirme.', 'Move: pick a tile and confirm.')) +
          chargeFromText(b, v.cursor) +
          counterFromText(b, v.cursor);
  return touch
    ? t('Toque um lado; de novo, passa a vez.', 'Face which way? Tap a side twice.')
    : t('Para onde olhar? Escolha e confirme.', 'Which way to face? Pick and confirm.');
}

// The Agir primeiro screens: what to pick on each, the focused action's detail (an item's heal, mana and effect), and on
// the tile choice what the item gives from there or where a charge locks
function actHelp(b: Battle, s: Extract<Screen, { k: 'targets' | 'actions' | 'spot' }>, touch: boolean): string {
  if (s.k === 'targets')
    return touch
      ? t('Alvo: toque no alvo ou na lista.', 'Target: tap the unit or the list.')
      : t('Alvo: escolha quem e confirme.', 'Target: pick who and confirm.');
  const a = screenAction(b, s);
  if (!a) return '';
  const name = a.k === 'item' ? itemName(a.id) : abilityName(a.id);
  // an ability's detail is on its sheet beside the list; the long line repeated it in tiny text on a phone (Nov 19)
  if (s.k === 'actions')
    return a.k === 'item'
      ? `${name}: ${itemDetail(a.id)}`
      : touch
        ? t(`${name}: toque de novo para seguir.`, `${name}: tap again to go on.`)
        : t(`${name}: confirme para seguir.`, `${name}: confirm to go on.`);
  if (s.lock) return t(`${name}: travar onde?`, `${name}: lock on?`);
  if (s.slot) return t(`${name}: qual ação?`, `${name}: which action?`);
  const spot = a.spots[s.index];
  if (a.k === 'item' && spot) {
    const got = [spot.heal ? t(`cura ${spot.heal}`, `heals ${spot.heal}`) : '', spot.mana ? `+${spot.mana} mana` : ''];
    const what = got.filter(Boolean).join(', ') || itemDetail(a.id);
    return `${name}: ${what}`;
  }
  return touch
    ? t('Casa: toque de novo para agir.', 'Tile: tap it again to act.')
    : t('Casa: escolha de onde e confirme.', 'Tile: pick where from and confirm.');
}

// the Back button's name for what it does now; hidden with nothing to go back to
// Undo on the screen (Fernando, Nov 18, for the fingers: until then it sat only inside the corner menu): live on the
// hero's turn whenever the rules have a step to take back (Battle.canUndo), the same as the Z key; faded otherwise
export const undoShown = (b: Battle, open: boolean) => open && b.canUndo;

// Back leaves a screen; where Back would undo the move (the menu after moving), the Undo button beside it already does
export function renderBack(btn: HTMLElement, v: HudView, open: boolean) {
  btn.hidden = backKind(v.battle, v.screen, open) !== 'back';
}

export function renderCommands(box: HTMLElement, v: HudView, open: boolean, act: HudActions) {
  const s = v.screen;
  box.hidden = !open || s.k !== 'menu';
  if (s.k !== 'menu' || box.hidden) return;
  const b = v.battle;
  // after a move "Undo move" shows under Move (Esc also undoes), like Tactics Ogre
  box.replaceChildren(
    menuHead(t('Comandos', 'Commands')),
    ...menuRows(b).map((c) =>
      button(
        `item${commandIndex(c) === s.index ? ' focus' : ''}`,
        [
          marker(c),
          el('span', { class: 'item-label' }, commandName(c)),
          c === 'undo' ? hint('cancel') : c === 'wait' ? hint('wait') : c === 'status' ? hint('status') : null,
        ],
        () => act.command(commandIndex(c)),
        { role: 'menuitem', disabled: !commandEnabled(b, c) },
      ),
    ),
  );
}
