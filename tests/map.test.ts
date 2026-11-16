/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import map from '../MAPA.md?raw';

// MAPA.md is the code map agents read first; a source file missing from it is a file nobody will find
const sources = Object.keys(import.meta.glob('../src/**/*.ts'));

describe('MAPA.md', () => {
  it('lists every .ts file of src/', () => {
    const missing = sources.map((path) => path.slice(3)).filter((path) => !map.includes(`\`${path}\``));
    expect(sources.length).toBeGreaterThan(90);
    expect(missing).toEqual([]);
  });
});
