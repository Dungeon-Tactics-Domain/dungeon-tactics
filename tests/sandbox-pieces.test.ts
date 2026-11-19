import { describe, expect, it } from 'vitest';
import { hiddenPieces, PANELS, parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { hidePieces, onHidden, PIECE_NAMES, pieceHidden } from '../src/client/ui-pieces.ts';

// The sandbox hides the 3D layer's pieces by the name each registers (ui-pieces.ts), with no selector of an HTML panel
describe('sandbox hide by piece name', () => {
  it('takes the names from before the 3D interface, a piece by its own name, and both together', () => {
    expect(parseSpec({ hide: ['queue', 'fps', 'turn', 'height', 'guides', 'marks'] }).problems).toEqual([]);
    expect(hiddenPieces(['queue', 'menu', 'units'])).toEqual(['turn', 'menu', 'bar']);
    expect(hiddenPieces(['height', 'hints', 'marks'])).toEqual(['height', 'hints']);
    expect(hiddenPieces(['menu', 'menu', 'banner'])).toEqual(['menu', 'banner']); // each once
    expect(hiddenPieces(['fps', 'tile', 'marks'])).toEqual([]); // no piece of the layer yet
    expect(parseSpec({ hide: ['sidebar'] }).problems).toEqual([expect.stringContaining('hide entries must be among')]);
  });

  it('hides every piece with "all", the drawing guides only by their own name', () => {
    expect(hiddenPieces(['all'])).toEqual(PIECE_NAMES.filter((n) => n !== 'guides'));
    expect(hiddenPieces(['all', 'guides'])).toEqual([...PIECE_NAMES]);
  });

  it('stands every old name for pieces that exist', () => {
    for (const [panel, pieces] of Object.entries(PANELS))
      for (const piece of pieces) expect(PIECE_NAMES, panel).toContain(piece);
  });

  it('tells the layer what is hidden now: the whole list each time, until it stops listening', () => {
    let told = 0;
    const stop = onHidden(() => told++);
    hidePieces(['turn', 'bar']);
    expect([pieceHidden('turn'), pieceHidden('bar'), pieceHidden('menu')]).toEqual([true, true, false]);
    hidePieces(['menu']);
    expect([pieceHidden('turn'), pieceHidden('menu')]).toEqual([false, true]);
    hidePieces(['menu']); // the same list again: nobody draws again
    expect(told).toBe(2);
    stop();
    hidePieces([]);
    expect(pieceHidden('menu')).toBe(false);
    expect(told).toBe(2);
  });
});

// Fernando, Nov 18: the whole interface is 3D; a spec's keys for the HTML and CSS looks are gone
describe('old look keys of a spec', () => {
  it('fail a spec, and every bench scene is a valid one', () => {
    expect(parseSpec({ ui: 'html', menucss: true }).problems).toEqual(['unknown key "ui"', 'unknown key "menucss"']);
    const scenes = import.meta.glob<object>('../scripts/sandbox/bench/*.json', { import: 'default', eager: true });
    expect(Object.keys(scenes).length).toBeGreaterThan(40);
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
  });
});
