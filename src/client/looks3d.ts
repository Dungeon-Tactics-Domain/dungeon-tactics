// The 3D screens the rest of the client hands its windows to (Fernando, Nov 18: the interface is only 3D). Each screen
// fills its place as it is built (hud-skin.ts, town3d/screens.ts; both before anything opens, ready-gate.ts) and empties
// it on dispose while it is still its own. Only types from the 3D side, so the game online never fetches it unasked.
import type { Board } from './game/end-screens.ts';
import type { MapView } from './game/expedition-map.ts';
import type { OptionsBoard } from './game/options.ts';
import type { Sheet } from './game/sheets.ts';
import type { Note } from './note.ts';
import type { StatusSheet } from './status-window.ts';
import type { PartyView } from './town-party.ts';

// a floating number on screen: its width in px, moved by its middle, removed when its time is up
export interface NumberMark {
  readonly w: number;
  place(x: number, y: number): void;
  remove(): void;
}

// the effects over the battle (hints3d/effects3d.ts): floating numbers, cursor note, objective banner, confetti, counter
export interface Effects {
  number(text: string, cls: string, px: number): NumberMark;
  note(text: string | null, x: number, y: number): void; // the cursor note with its cursor at x,y; null hides it
  announce(text: string): void;
  confetti(): void;
  fps(node: HTMLElement): void; // the counter's own node, unseen: its text, box and whether it shows
}

export interface Looks3d {
  board: (b: Board) => { close(): void }; // the end of a battle (result3d/)
  options: (b: OptionsBoard) => { close(): void }; // flow3d/options3d.ts
  title: (overlay: HTMLElement) => void; // over the title's window (flow3d/title3d.ts)
  sheet: (overlay: HTMLElement, sheet: Sheet) => void; // over a sheet's window (flow3d/sheet3d.ts)
  status: (s: StatusSheet) => void; // window3d/status3d.ts
  talk: (overlay: HTMLElement) => void; // over the speech box (window3d/talk3d.ts)
  note: (n: Note) => void; // window3d/note3d.ts
  map: (v: MapView) => void; // over the expedition map's window (town3d/map3d.ts)
  effects: Effects;
  // the town's windows (town3d/screens.ts) and its street's: the menu, the gate's quest, a place still to come
  party: (back?: () => void, view?: PartyView) => void;
  shop: (back?: () => void, tab?: 'buy' | 'sell', sel?: string) => void;
  bar: (back: () => void, sel?: string, said?: string) => void;
  menu: (extra?: Node, start?: string) => void; // `start`: the row the cursor opens on
  gate: (name: string) => void;
  soon: (name: string, says: string) => void;
}

// empty only before the page's look lands or after its context is lost (no3d.ts covers the page then)
export const looks3d: Partial<Looks3d> = {};

// a screen takes its place; what it returns empties it, unless another layer's screen took it since
export function fill<K extends keyof Looks3d>(k: K, v: Looks3d[K]): () => void {
  looks3d[k] = v;
  return () => {
    if (looks3d[k] === v) delete looks3d[k];
  };
}
