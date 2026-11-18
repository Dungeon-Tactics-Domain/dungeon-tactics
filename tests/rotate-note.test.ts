/// <reference types="vite/client" />
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import note from '../src/client/rotate-note.ts?raw';
import { rotateLayout } from '../src/client/ui3d/rotate-layout.ts';

const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

// The turn-the-phone notice (Nov 18): the HTML one (style.css) and the 3D one (matchMedia) answer the same question
describe('turn-the-phone notice', () => {
  it('asks the style sheet and the 3D layer the same query', () => {
    const query = note.match(/export const ROTATE = '([^']+)'/)?.[1];
    expect(query).toBe('(pointer: coarse) and (max-width: 600px) and (orientation: portrait)');
    expect(css).toContain(`@media ${query} {\n  .rotate-note {`);
  });
  it('stands in the middle of an upright phone, 16 px from its edges, the phone over the words', () => {
    const L = rotateLayout(390, 844, () => 2);
    expect(L.plate).toEqual({ x: 16, y: (844 - 154) / 2, w: 358, h: 24 + 34 + 8 + 64 + 24 });
    expect(L.phone).toEqual({ x: 16 + (358 - 51) / 2, y: L.plate.y + 24, w: 51, h: 34 });
    expect(L.text).toEqual({ x: 40, y: L.phone.y + 34 + 8, w: 310 });
  });
  it('is never wider than 20em of its 24 px text', () => {
    const L = rotateLayout(600, 900, () => 1);
    expect(L.plate.w).toBe(480);
    expect(L.plate.x).toBe(60);
  });
});
