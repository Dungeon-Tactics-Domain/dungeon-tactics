import { describe, expect, it } from 'vitest';
import { faceOf, faceSize, mouthFrame } from '../src/client/talk.ts';
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
