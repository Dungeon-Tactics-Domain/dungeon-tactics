import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveScreen, navigate, onLeave, onNavigate, screenSignal } from '../src/client/nav.ts';

afterEach(() => vi.unstubAllGlobals());

describe('nav', () => {
  it('with no page mounted, a navigation only changes the address', () => {
    const location = { search: '' };
    vi.stubGlobal('location', location);
    navigate('?home');
    expect(location.search).toBe('?home');
  });

  it('hands the address to the mounted page, which changes screen with no reload', () => {
    const location = { search: '' };
    vi.stubGlobal('location', location);
    const asked: string[] = [];
    onNavigate((search) => asked.push(search));
    navigate('?room=3');
    navigate('');
    expect(asked).toEqual(['?room=3', '']);
    expect(location.search).toBe('');
  });

  it('lets go of what the screen in view holds, once, and starts the next screen clean', () => {
    const signal = screenSignal();
    const left = vi.fn();
    onLeave(left);
    leaveScreen();
    expect(signal.aborted).toBe(true);
    expect(left).toHaveBeenCalledTimes(1);
    expect(screenSignal().aborted).toBe(false);
    leaveScreen();
    expect(left).toHaveBeenCalledTimes(1);
  });
});
