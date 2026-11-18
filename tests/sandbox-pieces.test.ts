import { describe, expect, it } from 'vitest';
import { dropOld, hiddenPieces, OLD_KEYS, PANELS, parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { hidePieces, onHidden, PIECE_NAMES, pieceHidden } from '../src/client/ui-pieces.ts';

// The sandbox hides the 3D layer's pieces by the name each registers (ui-pieces.ts), with no selector of an HTML panel
describe('sandbox hide by piece name', () => {
  it('takes the names from before the 3D interface, a piece by its own name, and both together', () => {
    expect(parseSpec({ hide: ['queue', 'fps', 'turn', 'height', 'guides', 'marks'] }).problems).toEqual([]);
    expect(hiddenPieces(['queue', 'menu', 'units'])).toEqual(['turn', 'menu', 'confirm', 'bar']);
    expect(hiddenPieces(['height', 'hints', 'marks'])).toEqual(['height', 'hints']);
    expect(hiddenPieces(['menu', 'confirm', 'banner'])).toEqual(['menu', 'confirm', 'banner']); // each once
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

// Fernando, Nov 18: the whole interface is 3D. A spec's keys for the HTML and CSS looks still parse, then are left out
describe('old look keys of a spec', () => {
  it('still checks them, so an old spec opens and a typo in one is still named', () => {
    expect(
      parseSpec({ ui: 'html', menu: 'css', turn: '3d', menu3d: 'pixel', turn3d: true, menucss: true }).problems,
    ).toEqual([]);
    expect(parseSpec({ menu: 'paper' }).problems).toEqual(['menu must be one of html, css, 3d']);
  });

  it('leaves them out of what the page uses and names them for the console', () => {
    const spec = { scenario: 'ash_wood', screen: 'menu', ui: 'html', bar: '3d', menucss: true, uiPixel: true } as const;
    expect(dropOld(spec)).toEqual({
      spec: { scenario: 'ash_wood', screen: 'menu', uiPixel: true },
      dropped: ['ui', 'bar', 'menucss'],
    });
    expect(dropOld({ scenario: 'ash_wood', layout: 'frame' }).dropped).toEqual([]);
  });

  it('every bench scene opens with the old keys dropped, and the pixel ones keep the filter by uiPixel', () => {
    const scenes = import.meta.glob<Record<string, unknown>>('../scripts/sandbox/bench/*.json', {
      import: 'default',
      eager: true,
    });
    expect(Object.keys(scenes).length).toBeGreaterThan(50);
    for (const [path, raw] of Object.entries(scenes)) {
      if (path.endsWith('ui-pecas.json')) continue; // the labs' table of pieces, not a scene
      const { spec, problems } = parseSpec(raw);
      expect(problems, path).toEqual([]);
      const kept = dropOld(spec).spec;
      for (const k of OLD_KEYS) expect(kept, path).not.toHaveProperty(k);
      expect(parseSpec(kept).problems, path).toEqual([]);
      if (raw.menu3d === 'pixel') expect(kept.uiPixel, path).toBe(true);
    }
  });
});
