import { describe, expect, it } from 'vitest';
import { installOffer } from '../src/client/install.ts';

// Fernando, Nov 18: the title's "Install the game" line by platform x event x installed
describe('when the title offers to install', () => {
  const base = { installed: false, ios: false, prompt: false };
  it('the browser handed over its event: the line asks the browser', () => {
    expect(installOffer({ ...base, prompt: true })).toBe('prompt');
  });
  it('an iPhone or iPad (no event ever): the line opens the how-to sheet', () => {
    expect(installOffer({ ...base, ios: true })).toBe('help');
  });
  it('a PC (or any browser) with no event: no line', () => {
    expect(installOffer(base)).toBe('none');
  });
  it('installed, whatever the rest says: no line', () => {
    for (const ios of [true, false])
      for (const prompt of [true, false]) expect(installOffer({ installed: true, ios, prompt })).toBe('none');
  });
});
