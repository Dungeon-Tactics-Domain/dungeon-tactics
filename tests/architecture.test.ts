/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// The rules' side (src/shared, src/content) must stay free of the browser and of nondeterminism: saves, undo and the
// simulator depend on it. These tests read the source text, so a new file is checked without anyone remembering.
const sources = import.meta.glob<string>('../src/{shared,content}/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// comments may name what is forbidden (the CLAUDE.md rules do), so only code is searched
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = Object.entries(sources);

describe('architecture', () => {
  it('finds the rules-side sources it is meant to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('keeps src/shared and src/content from importing src/client', () => {
    const offenders = files.filter(([, text]) => /from\s+['"][^'"]*\/client\//.test(code(text))).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('keeps randomness and clocks out of src/shared and src/content', () => {
    const offenders = files
      .filter(([, text]) => /Math\.random|Date\.now|new Date\(|performance\.now/.test(code(text)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
