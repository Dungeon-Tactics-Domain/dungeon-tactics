import { describe, expect, it } from 'vitest';
import { talkLayout } from '../src/client/window3d/talk-layout.ts';

// The 3D speech box's own layout (Nov 18: the 3D pieces stop measuring the HTML). Each row is what the browser measured
// on the unseen HTML box in the town the day before the numbers moved to talk-layout.ts: a short sentence, a long one
// and the narrator's under the place's strip, then the opening narration (long and short), on six pages (540x900
// crosses the phone's 560 px). [name, page w, h, dark, lines of text, box, text (x, y, w; the narration's x is its
// middle), the name's plaque, the strip, Skip, the hint (right end, or middle in the narration; and its middle's y)].
type Four = [number, number, number, number];
type Row = [
  string,
  number,
  number,
  0 | 1,
  number,
  Four,
  [number, number, number],
  Four | null,
  Four | null,
  Four,
  [number, number],
];
// biome-ignore format: one measured case per line
const MEASURED: Row[] = [
  ["talk-short-1920x1080",1920,1080,0,1,[410,832,1100,168],[574,852,894],[422,796,83.359,40],[852.453,736,215.094,44],[1853.531,1012,50.469,44],[1468,981.203]],
  ["talk-long-1920x1080",1920,1080,0,4,[410,832,1100,168],[574,852,894],[422,796,83.359,40],[852.453,736,215.094,44],[1853.531,1012,50.469,44],[1468,981.203]],
  ["talk-narrator-1920x1080",1920,1080,0,1,[410,868,1100,132],[426,888,1042],null,[852.453,772,215.094,44],[1853.531,1012,50.469,44],[1468,981.203]],
  ["dark-long-1920x1080",1920,1080,1,4,[410,452,1100,168],[960,452,0],null,null,[1845.531,1012,50.469,44],[960.001,639.203]],
  ["dark-short-1920x1080",1920,1080,1,1,[410,485.594,1100,100.797],[959.992,485.594,0],null,null,[1845.531,1012,50.469,44],[960.001,605.594]],
  ["talk-short-3440x1440",3440,1440,0,1,[1170,1192,1100,168],[1334,1212,894],[1182,1156,83.359,40],[1612.453,1096,215.094,44],[3373.531,1372,50.469,44],[2228,1341.203]],
  ["talk-long-3440x1440",3440,1440,0,4,[1170,1192,1100,168],[1334,1212,894],[1182,1156,83.359,40],[1612.453,1096,215.094,44],[3373.531,1372,50.469,44],[2228,1341.203]],
  ["talk-narrator-3440x1440",3440,1440,0,1,[1170,1228,1100,132],[1186,1248,1042],null,[1612.453,1132,215.094,44],[3373.531,1372,50.469,44],[2228,1341.203]],
  ["dark-long-3440x1440",3440,1440,1,4,[1170,632,1100,168],[1720,632,0],null,null,[3365.531,1372,50.469,44],[1720.001,819.203]],
  ["dark-short-3440x1440",3440,1440,1,1,[1170,665.594,1100,100.797],[1719.992,665.594,0],null,null,[3365.531,1372,50.469,44],[1720.001,785.594]],
  ["talk-short-1280x720",1280,720,0,1,[90,472,1100,168],[254,492,894],[102,436,83.359,40],[532.453,376,215.094,44],[1213.531,652,50.469,44],[1148,621.203]],
  ["talk-long-1280x720",1280,720,0,4,[90,472,1100,168],[254,492,894],[102,436,83.359,40],[532.453,376,215.094,44],[1213.531,652,50.469,44],[1148,621.203]],
  ["talk-narrator-1280x720",1280,720,0,1,[90,508,1100,132],[106,528,1042],null,[532.453,412,215.094,44],[1213.531,652,50.469,44],[1148,621.203]],
  ["dark-long-1280x720",1280,720,1,4,[90,272,1100,168],[640,272,0],null,null,[1205.531,652,50.469,44],[640.001,459.203]],
  ["dark-short-1280x720",1280,720,1,1,[90,305.594,1100,100.797],[639.992,305.594,0],null,null,[1205.531,652,50.469,44],[640.001,425.594]],
  ["talk-short-844x390",844,390,0,1,[16,142,812,168],[180,162,606],[28,106,83.359,40],[314.453,46,215.094,44],[777.531,322,50.469,44],[786,291.203]],
  ["talk-long-844x390",844,390,0,5,[16,112.047,812,197.953],[180,132.047,606],[28,76.047,83.359,40],[314.453,16.047,215.094,44],[777.531,322,50.469,44],[786,291.203]],
  ["talk-narrator-844x390",844,390,0,1,[16,178,812,132],[32,198,754],null,[314.453,82,215.094,44],[777.531,322,50.469,44],[786,291.203]],
  ["dark-long-844x390",844,390,1,5,[16,86,812,210],[422,86,0],null,null,[769.531,322,50.469,44],[422.001,315.203]],
  ["dark-short-844x390",844,390,1,1,[16,140.594,812,100.797],[421.992,140.594,0],null,null,[769.531,322,50.469,44],[422.001,260.594]],
  ["talk-short-1600x560",1600,560,0,1,[250,312,1100,168],[414,332,894],[262,276,83.359,40],[692.453,216,215.094,44],[1533.531,492,50.469,44],[1308,461.203]],
  ["talk-long-1600x560",1600,560,0,4,[250,312,1100,168],[414,332,894],[262,276,83.359,40],[692.453,216,215.094,44],[1533.531,492,50.469,44],[1308,461.203]],
  ["talk-narrator-1600x560",1600,560,0,1,[250,348,1100,132],[266,368,1042],null,[692.453,252,215.094,44],[1533.531,492,50.469,44],[1308,461.203]],
  ["dark-long-1600x560",1600,560,1,4,[250,192,1100,168],[800,192,0],null,null,[1525.531,492,50.469,44],[800.001,379.203]],
  ["dark-short-1600x560",1600,560,1,1,[250,225.594,1100,100.797],[799.992,225.594,0],null,null,[1525.531,492,50.469,44],[800.001,345.594]],
  ["talk-short-540x900",540,900,0,1,[16,675.609,508,144.391],[114,695.609,368],[28,639.609,83.359,40],[162.453,579.609,215.094,44],[473.531,832,50.469,44],[482,801.203]],
  ["talk-long-540x900",540,900,0,8,[16,502.875,508,317.125],[114,522.875,368],[28,466.875,83.359,40],[162.453,406.875,215.094,44],[473.531,832,50.469,44],[482,801.203]],
  ["talk-narrator-540x900",540,900,0,1,[16,675.609,508,144.391],[32,695.609,450],null,[162.453,579.609,215.094,44],[473.531,832,50.469,44],[482,801.203]],
  ["dark-long-540x900",540,900,1,8,[16,278,508,336],[270,278,0],null,null,[465.531,832,50.469,44],[270.001,633.203]],
  ["dark-short-540x900",540,900,1,1,[16,395.594,508,100.797],[269.992,395.594,0],null,null,[465.531,832,50.469,44],[270.001,515.594]],
];
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.02);

describe('3D speech box: the layout without the DOM', () => {
  for (const [name, pageW, pageH, dark, lines, box, text, plaque, strip, skip, keys] of MEASURED)
    it(`lands where the browser put the HTML box: ${name}`, () => {
      const l = talkLayout({
        pageW,
        pageH,
        safe: NONE,
        dark: !!dark,
        face: !!plaque,
        // the words' widths, as the HTML held them: its plaques less their padding and frame
        name: plaque ? plaque[2] - 40 : 0,
        title: strip ? strip[2] - 60 : 0,
        skip: skip[2] - 16,
        lines: () => lines,
      });
      const four = (b: { x: number; y: number; w: number; h: number } | undefined, want: Four) => {
        expect(b).toBeDefined();
        [b!.x, b!.y, b!.w, b!.h].forEach((v, i) => near(v, want[i]));
      };
      four(l.box, box);
      near(dark ? l.text.x + l.text.w / 2 : l.text.x, text[0]);
      near(l.text.y, text[1]);
      if (!dark) near(l.text.w, text[2]);
      if (plaque) four(l.name, plaque);
      else expect(l.name).toBeUndefined();
      if (strip) four(l.title, strip);
      else expect(l.title).toBeUndefined();
      four(l.skip, skip);
      near(l.keys.x, keys[0]);
      near(l.keys.y, keys[1]);
    });

  const spec = { pageW: 1920, pageH: 1080, safe: NONE, dark: false, face: true, name: 50, title: 0, skip: 30 };
  it('grows up from the foot with the lines typed so far, and asks for them at the words width and size', () => {
    const asked: number[][] = [];
    const at = (n: number) =>
      talkLayout({
        ...spec,
        lines: (w, size) => {
          asked.push([w, size]);
          return n;
        },
      }).box;
    expect(at(1)).toEqual(at(4)); // the face is taller than four lines
    expect(at(6).h).toBeGreaterThan(at(4).h);
    expect(at(6).y + at(6).h).toBe(at(1).y + at(1).h);
    expect(asked[0]).toEqual([894, 24]);
  });
  it('keeps clear of the notch and the home bar', () => {
    const safe = { top: 0, right: 0, bottom: 34, left: 59 },
      l = talkLayout({ ...spec, pageW: 844, pageH: 390, safe, lines: () => 1 });
    expect(l.box.x).toBe(59);
    expect(l.skip.y + l.skip.h).toBe(390 - 24 - 34);
  });
  it('never makes Skip smaller than a finger', () => {
    expect(talkLayout({ ...spec, skip: 5, lines: () => 1 }).skip.w).toBe(44);
  });
});
