import { describe, expect, it } from 'vitest';
import atlas from '../public/ui/fft/atlas-32.json';
import { ATLAS_COLUMNS, atlasCell } from '../src/client/icons.ts';
import { ABILITY_LIST } from '../src/content/abilities.ts';

// the approved atlas lists its cells by the Portuguese name ("Explosão" -> "explosao"); a wrong order would show the wrong
// picture with no error, so every ability is checked against the copied .json
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ /g, '-');
const nameAt = (cell: [number, number]) => atlas.icones[cell[1] * ATLAS_COLUMNS + cell[0]];

describe('ability icon atlas', () => {
  it('has the layout of the copied atlas', () => {
    expect(atlas.celula).toBe(32);
    expect(atlas.colunas).toBe(ATLAS_COLUMNS);
  });

  // Nov 21's Shove, Throw sand and Focus still wait for their pictures: until then they show the symbol (icons.ts)
  const WAITING = ['shove', 'sand', 'focus'];
  it('gives every game ability the cell with its own picture', () => {
    for (const a of ABILITY_LIST.filter((x) => !WAITING.includes(x.id))) {
      const cell = atlasCell(a.id);
      expect(cell, a.id).not.toBeNull();
      expect(nameAt(cell!), a.id).toBe(slug(a.name));
    }
  });

  it('gives the Move and Wait commands their cells', () => {
    expect(nameAt(atlasCell('move')!)).toBe('mover');
    expect(nameAt(atlasCell('wait')!)).toBe('esperar');
  });

  it('has no cell for an unknown id, so the symbol fallback shows', () => {
    for (const id of ['', 'act', 'status', 'fft_attack', 'nope']) expect(atlasCell(id)).toBeNull();
  });
});
