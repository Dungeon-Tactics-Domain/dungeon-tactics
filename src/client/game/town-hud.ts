// The town's HUD and the window of a place: the battle HUD's pieces dressed for the town.
import { type Place, TOWN } from '../../content/crawl/town.ts';
import { KEYS } from '../hud.ts';
import { gearButtons } from '../hud-tools.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { looks3d } from '../looks3d.ts';
import { sfx } from '../sound.ts';
import { stickVector } from '../town-pad.ts';
import { openBar, openShop } from '../town-shop.ts';
import { openParty } from '../town-ui.ts';
import { questGate } from './crawl.ts';

// the battle HUD's pieces: the name in the tile info's corner, the prompt as the help line, the gear (Options) and
// ↺ ↻ in the top right corner, as in battle (Fernando, Nov 18 night: no ☰ anywhere); as a .hud it hides while someone
// talks (style.css)
export function townHud(
  prompt: HTMLElement,
  balloon: HTMLElement,
  options: () => void,
  rotate: (dir: 1 | -1) => void,
  pad?: HTMLElement,
) {
  const hud = el(
    'div',
    { class: `hud${KEYS ? ' kbd' : ''}` },
    el('div', { class: 'panel tile-info' }, t(TOWN.name, TOWN.en)),
    prompt,
    balloon,
    gearButtons(options, rotate).root,
    ...(pad ? [pad] : []),
  );
  return hud;
}

// The touch pad's unseen skeleton (town3d/pad3d.ts draws it and seats it, and sets the stick's data-travel): a zone that
// reads the finger on the joystick and a button for the action. The pointer is captured, so the drag goes on outside the
// zone; it ends on lift, on a cancel and when the capture is lost, and `release` ends it from outside (a window opened
// under the thumb: a lost lift would leave the walker walking). `aim` gets the stick's vector, x right and y down
export function townPad(aim: (v: { x: number; y: number }) => void, use: () => void) {
  const stick = el('div', { class: 'pad-stick', 'aria-hidden': 'true' });
  // acts when the finger lifts on it, not on the click: with a thumb already on the stick the browser makes no click of the
  // second finger's tap. Not on the finger going down either: the window it opens would take the lift as a tap. The click
  // after a finger or the mouse is ignored (detail 0 is a key or the screen reader's)
  const act = button('pad-use', [], (e) => (e as MouseEvent).detail === 0 && use(), {
    'aria-disabled': 'true',
    'aria-label': t('Falar ou entrar', 'Talk or go in'),
  });
  let id: number | null = null;
  const set = (x: number, y: number) => {
    stick.dataset.x = x.toFixed(2);
    stick.dataset.y = y.toFixed(2);
    aim({ x, y });
  };
  const follow = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect(),
      v = stickVector(
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2),
        Number(stick.dataset.travel),
      );
    set(v.x, v.y);
  };
  const release = () => {
    if (id === null) return;
    id = null;
    set(0, 0);
  };
  let pressed: number | null = null;
  act.addEventListener(
    'pointerdown',
    (e) => (pressed = e.pointerType !== 'mouse' || e.button === 0 ? e.pointerId : null),
  );
  act.addEventListener('pointercancel', () => (pressed = null));
  act.addEventListener('pointerup', (e) => {
    const r = act.getBoundingClientRect();
    const on = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.pointerId === pressed && on) {
      // the window this opens is under the finger now, and the browser's click of the same tap would land on it (the
      // speech box skips on a click): that one click is eaten
      const eat = (c: Event) => c.stopImmediatePropagation();
      addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', eat, true), 500);
      use();
    }
    pressed = null;
  });
  stick.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    e.preventDefault();
    id = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    follow(e);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === id && follow(e));
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stick.addEventListener(ev, (e) => (e as PointerEvent).pointerId === id && release());
  // a held thumb is a long press: no context menu over the pad
  for (const e of [stick, act]) e.addEventListener('contextmenu', (ev) => ev.preventDefault());
  return { root: el('div', { class: 'town-pad' }, stick, act), use: act, release };
}

// a place's window: the existing ones (Fernando, Nov 15), the gate's quest rows, or what a place without one yet says
export function openPlace(pl: Place) {
  sfx('confirm');
  const name = t(...pl.name);
  if (pl.id === 'gate') return questGate(name);
  if (pl.id === 'guild') return openParty();
  if (pl.id === 'shop') return openShop();
  if (pl.id === 'tavern') return openBar(() => {});
  const says = pl.soon ? t(...pl.soon) : '';
  looks3d.soon?.(name, says); // drawn by town3d/street.ts
}
