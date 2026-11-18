// Who draws the effects over the battle (Fernando, Nov 18: the whole interface in 3D): the floating numbers, the cursor
// note, the objective banner, the victory confetti and the performance counter. While the 3D screen lives
// (hints3d/effects3d.ts) it takes each of them here; without it (?effects=html, no WebGL, a lost context) each keeps
// its HTML and CSS.

// a floating number on screen: its width in px, moved by its middle, removed when its time is up
export interface NumberMark {
  readonly w: number;
  place(x: number, y: number): void;
  remove(): void;
}

export interface Effects {
  number(text: string, cls: string, px: number): NumberMark;
  note(text: string | null, x: number, y: number): void; // the cursor note with its cursor at x,y; null hides it
  announce(text: string): void;
  confetti(): void;
  fps(node: HTMLElement): void; // the counter's own node, unseen: its text, box and whether it shows
}

let drawn: Effects | undefined;
export const setEffects3d = (fx?: Effects) => void (drawn = fx);
export const effects3d = () => drawn;
