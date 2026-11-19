// The Undo and camera buttons on the screen (Fernando, Nov 18 night): on by default where a finger points, off on a PC
// with a mouse, where the keys and the right button already do both; Options turns them on or off for good
// (dt:screen-buttons). The gear that opens Options is always there. The choice is pure and tested.
import { store } from './store.ts';

export const BUTTONS_KEY = 'dt:screen-buttons';

// what was saved: on, off, or nothing picked yet (the device decides)
export const parseButtons = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
// `coarse`: a finger points, (pointer: coarse), as fullscreen.ts asks
export const buttonsOn = (saved: boolean | null, coarse: boolean) => saved ?? coarse;

// The one question "is this a touch device?" (a finger points: `(pointer: coarse)`): the screen buttons' default, the town's
// walk line (never the keys on touch) and the town's joystick all ask it, so they agree
export const touchDevice = () => matchMedia('(pointer: coarse)').matches;

let heard: ((on: boolean) => void) | null = null;

export const screenButtons = () => buttonsOn(parseButtons(store.json(BUTTONS_KEY)), touchDevice());
// the open page's buttons show or hide (one page at a time: the last listener stays)
export function onScreenButtons(show: ((on: boolean) => void) | null) {
  heard = show;
}
export function setScreenButtons(on: boolean) {
  store.set(BUTTONS_KEY, JSON.stringify(on));
  heard?.(on);
}
