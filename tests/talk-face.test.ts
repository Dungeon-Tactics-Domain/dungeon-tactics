import { describe, expect, it } from 'vitest';
import FILE from '../public/chars/px/faces.json';
import { faceOf, faceSize, mouthFrame, parseFaces } from '../src/client/talk.ts';

const face = (mouthFrames: unknown, more = {}) => ({
  sheet: 'px/knight.png',
  frames: 8,
  frameSize: 256,
  mouthFrames,
  ...more,
});

describe('mouthFrame', () => {
  it('stays on frame 0 with no mouth frames (still portrait)', () => {
    expect(mouthFrame([], 0)).toBe(0);
    expect(mouthFrame([], 999)).toBe(0);
  });
  it('goes neutral, talk1, talk2, talk1 at 180 ms per frame', () => {
    expect([0, 179, 180, 360, 540, 720, 900].map((ms) => mouthFrame([1, 2], ms))).toEqual([0, 0, 1, 2, 1, 0, 1]);
  });
  it('runs any list up and back from neutral', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => mouthFrame([1, 2, 3], i * 180))).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });
});

describe('faceSize', () => {
  it('shows every frame at a whole ratio near 128 px', () => {
    expect([256, 64, 128, 512, 100, 200].map(faceSize)).toEqual([128, 128, 128, 128, 100, 100]);
  });
});

describe('parseFaces', () => {
  it('reads the shipped file: 7 painted faces talk with [1, 2], the 3 small skeletons with [1, 2, 3]', () => {
    const faces = parseFaces(FILE);
    expect(Object.keys(faces)).toHaveLength(10);
    expect(faces.knight).toMatchObject({ frames: 8, frameSize: 256, mouthFrames: [1, 2] });
    expect(faces.knight.expressions).toMatchObject({ neutral: 0, talk1: 1, talk2: 2, shout: 3, angry: 7 });
    expect(faces.skeleton_minion).toMatchObject({ frames: 4, frameSize: 64, mouthFrames: [1, 2, 3] });
  });
  it('drops bad entries and garbage', () => {
    expect(parseFaces(null)).toEqual({});
    expect(parseFaces('x')).toEqual({});
    const faces = parseFaces({
      ok: face([]),
      outside: face([1, 8]),
      path: face([], { sheet: '../secret.png' }),
      size: face([], { frameSize: 0 }),
      list: face('1,2'),
    });
    expect(Object.keys(faces)).toEqual(['ok']);
  });
  it('keeps only the expressions that point at a frame of the sheet', () => {
    const faces = parseFaces({ a: face([1, 2], { expressions: { shout: 3, lost: 9, text: 'x' } }) });
    expect(faces.a.expressions).toEqual({ shout: 3 });
  });
});

describe('faceOf', () => {
  const faces = parseFaces(FILE);
  it('finds the sheet by the model drawn on the map', () => {
    expect(faceOf('warrior', faces)?.sheet).toBe('px/knight.png');
    expect(faceOf('dark_mage', faces)?.sheet).toBe('px/skeleton_mage.png');
  });
  it('has nothing for a speaker without a sheet, who keeps portrait()', () => {
    expect(faceOf('beacon', faces)).toBeUndefined();
    expect(faceOf('warrior', {})).toBeUndefined();
  });
});
