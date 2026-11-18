import { describe, expect, it } from 'vitest';
import { charMs, faceOf, faceSize, mouthFrame } from '../src/client/talk.ts';
import { faceFit, hop } from '../src/client/window3d/talk-face.ts';
import FACES from '../src/content/faces.json';

const TALK = [1, 2]; // the painted sheets' mouthFrames

describe('mouthFrame: the frame the dialogue box shows', () => {
  it('opens at the first instant of a line and goes talk1, talk2, talk1, neutral every 180 ms', () => {
    expect([0, 179, 180, 360, 540, 720].map((ms) => mouthFrame(TALK, ms))).toEqual([1, 1, 2, 1, 0, 1]);
  });
  it('shows the mouth open even for a line that types in under one frame', () => {
    expect(mouthFrame(TALK, 40)).not.toBe(0);
  });
  it('runs any list up and back, then rests one frame on neutral', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => mouthFrame([1, 2, 3], i * 180))).toEqual([1, 2, 3, 2, 1, 0, 1]);
  });
  it('goes back to neutral once the sentence stops typing: typed out, completed by a click, Esc or Instant', () => {
    for (const ms of [0, 180, 360]) expect(mouthFrame(TALK, ms, false)).toBe(0);
  });
  it('stays still with no mouth frames, which is what reduced motion passes', () => {
    for (const ms of [0, 180, 999]) expect(mouthFrame([], ms)).toBe(0);
  });
});

describe('faceSize', () => {
  it('shows every frame at a whole ratio near 128 px', () => {
    expect([128, 64, 256, 512, 100, 200].map(faceSize)).toEqual([128, 128, 128, 128, 100, 100]);
  });
});

describe('faces.json', () => {
  const faces = Object.entries(FACES);
  it('describes 10 WebP sheets, with every frame number inside the sheet', () => {
    expect(faces).toHaveLength(10);
    for (const [id, f] of faces) {
      expect(f.sheet, id).toBe(`px/${id}.webp`);
      const frames = [...f.mouthFrames, ...Object.values('expressions' in f ? f.expressions : {})];
      for (const n of frames) expect(n >= 0 && n < f.frames, `${id} frame ${n}`).toBe(true);
    }
  });
  it('ships the painted faces at 128 px with talk1 and talk2, and the small skeletons at 64 px', () => {
    expect(FACES.knight).toMatchObject({ frames: 8, frameSize: 128, mouthFrames: TALK });
    expect(FACES.knight.expressions).toMatchObject({ neutral: 0, talk1: 1, talk2: 2, shout: 3, angry: 7 });
    expect(FACES.skeleton_minion).toMatchObject({ frames: 4, frameSize: 64, mouthFrames: [1, 2, 3] });
  });
});

describe('faceOf', () => {
  it('finds the sheet by the model drawn on the map', () => {
    expect(faceOf('warrior')?.sheet).toBe('px/knight.webp');
    expect(faceOf('dark_mage')?.sheet).toBe('px/skeleton_mage.webp');
  });
  it('has nothing for a speaker without a sheet, who keeps portrait()', () => {
    expect(faceOf('beacon')).toBeUndefined();
    expect(faceOf('warrior', {})).toBeUndefined();
  });
});

describe('charMs: the pause between two letters of a sentence', () => {
  it('types slower on Normal than on Fast, and not at all on Instant', () => {
    expect(charMs('normal', false)).toBeGreaterThan(charMs('fast', false));
    expect(charMs('fast', false)).toBeGreaterThan(0);
    expect(charMs('instant', false)).toBe(0);
  });
  it('shows the whole sentence at once under Reduce motion, whatever the speed', () => {
    for (const speed of ['normal', 'fast', 'instant'] as const) expect(charMs(speed, true)).toBe(0);
  });
});

// The 3D speech box's face (Nov 18): where the picture sits in its frame and the hop of a new speaker, as the HTML face
describe('3D speech box face', () => {
  it('fills the 132 px frame less its 2 px border, and a phone half that', () => {
    expect(faceFit({ x: 106, y: 492, w: 132, h: 132 }, true)).toEqual({ x: 108, y: 494, w: 128, h: 128 });
    expect(faceFit({ x: 32, y: 100, w: 66, h: 66 }, true)).toEqual({ x: 33, y: 101, w: 64, h: 64 });
  });
  it('stands the rendered portrait at 3:4 on the frame left, as .talk-face .portrait (99x132)', () => {
    expect(faceFit({ x: 0, y: 0, w: 132, h: 132 }, false)).toEqual({ x: 0, y: 0, w: 99, h: 132 });
  });
  it('hops from 6 px low, 92 % and 40 % seen to rest in 220 ms, and stays at rest after', () => {
    expect(hop(0)).toEqual({ dy: 6, scale: 0.92, alpha: 0.4 });
    for (const ms of [220, 1000]) expect(hop(ms)).toEqual({ dy: 0, scale: 1, alpha: 1 });
    const mid = hop(110);
    expect(mid.dy).toBeGreaterThan(0);
    expect(mid.dy).toBeLessThan(3);
  });
});
