import { describe, expect, it } from 'vitest';
import { registerHalf } from '../src/shared/battle/half.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Meia casa (13/11): a ficha 2x2 passa por aliado e nunca por inimigo, como a de 1 casa
describe('meia casa: ficha 2x2', () => {
  registerHalf();
  // corredor de 2 casas de largura (y 0 e 1); a ficha sai de x 0 e quer chegar em x 8
  const run = (other: 'hero' | 'enemy') => reachable(flat(10, 2), stateOf([
    { id: 'a', def: 'warrior½', team: 'hero', x: 0, y: 0 },
    { id: 'b', def: 'soldier', team: other, x: 4, y: 1 },
  ]), 'a', 20);
  it('inimigo no corredor barra a passagem', () => {
    expect(run('enemy').has('8,0')).toBe(false);
  });
  it('aliado no corredor deixa passar', () => {
    expect(run('hero').has('8,0')).toBe(true);
  });
});
