import { describe, expect, it } from 'vitest';
import { shortBy, sideWindows } from '../src/client/town-ui.ts';

describe('town windows', () => {
  it('the menu closes every window beside it, never itself', () => {
    const menu = { id: 'menu' };
    const shop = { id: 'shop' };
    const sheet = { id: 'sheet' };
    expect(sideWindows([menu, shop, sheet], menu)).toEqual([shop, sheet]);
    expect(sideWindows([menu], menu)).toEqual([]);
  });

  it("the Shop row says how much gold is missing under a turned-off button, and nothing when it's enough", () => {
    expect(shortBy(20, 120)).toBe('faltam 100 de ouro');
    expect(shortBy(120, 120)).toBe('');
    expect(shortBy(200, 120)).toBe('');
  });
});
