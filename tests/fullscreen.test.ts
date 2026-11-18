import { describe, expect, it } from 'vitest';
import { fullscreenOffer } from '../src/client/fullscreen.ts';

// Fernando, Nov 18: a phone in the browser gets the title's main "Play in fullscreen"; everything else the quiet shortcut
describe('how loudly the title offers fullscreen', () => {
  const base = { api: true, touch: true, installed: false, on: false };
  it('a touch device in the browser, not yet in fullscreen: the main button', () => {
    expect(fullscreenOffer(base)).toBe('main');
  });
  it('a mouse (fine pointer): the quiet shortcut', () => {
    expect(fullscreenOffer({ ...base, touch: false })).toBe('quiet');
  });
  it('installed on the home screen, or already in fullscreen: the quiet shortcut', () => {
    expect(fullscreenOffer({ ...base, installed: true })).toBe('quiet');
    expect(fullscreenOffer({ ...base, on: true })).toBe('quiet');
    expect(fullscreenOffer({ ...base, touch: false, on: true })).toBe('quiet');
  });
  it('no Fullscreen API (an iPhone): nothing, whatever the rest says', () => {
    for (const touch of [true, false])
      for (const installed of [true, false])
        for (const on of [true, false]) expect(fullscreenOffer({ api: false, touch, installed, on })).toBe('none');
  });
});
