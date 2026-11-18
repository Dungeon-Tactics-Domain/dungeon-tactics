// One row of the 3D Options (options3d.ts), drawn from its own top left the way FFT: The Ivalice Chronicles draws its
// settings: the name, then a choice in a box between two arrows, a bar with its number, or a switch beside its word.
import { NONE, type Part, type Quad, type Rgba } from '../hints3d/hints3d.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { type Colors, lift, put, rgba, solid } from './draw.ts';
import { type OptionsLayout, REF } from './options-layout.ts';
import type { RowView } from './options-view.ts';

const ON = '#4daf7c'; // a switch turned on, the green of the Height number
const OFF: Rgba = [0.42, 0.39, 0.33, 1];

// `label`: the screen's text, at its scale
export function drawRow(
  p: Part,
  v: RowView,
  L: OptionsLayout,
  layer: Ui3dLayer,
  c: Colors,
  label: (str: string, size: number, hex: string) => Quad,
) {
  const { paper, ink } = layer.theme,
    s = L.s,
    w = L.list.w;
  const mid = L.rowH / 2,
    left = w - L.value + L.arrow, // the value between the two arrows
    right = w - L.arrow;
  put(p, label(v.label, REF.size.label, c.text), L.inset, mid, 'left', w - L.value - L.inset - 12 * s);
  const arrow = (str: string, x: number) => put(p, label(str, REF.size.label, c.soft), x, mid, 'centre');
  if (v.kind === 'link') {
    arrow('▸', right + L.arrow / 2);
    return lift(p, 40);
  }
  // a switch has no arrows, as the reference: a tap anywhere on it turns it
  if (v.kind !== 'toggle') {
    arrow('‹', left - L.arrow / 2);
    arrow('›', right + L.arrow / 2);
  }
  if (v.kind === 'pick') {
    const h = REF.box * s;
    p.box(left, mid - h / 2, right - left, h, 6 * s, solid(paper), rgba(ink, 0.8));
    put(p, label(v.text, REF.size.value, ink), (left + right) / 2, mid, 'centre', right - left - 16 * s);
  } else if (v.kind === 'bar') {
    const pad = (REF.knob / 2) * s,
      x = left + L.number + pad,
      tw = right - pad - x,
      th = REF.track * s,
      k = REF.knob * s;
    put(p, label(v.text, REF.size.value, c.text), left + L.number - 8 * s, mid, 'right');
    p.box(x, mid - th / 2, tw, th, th / 2, rgba(c.plate), rgba(c.line, 0.9));
    if (v.fill > 0) p.box(x, mid - th / 2, tw * v.fill, th, th / 2, rgba(c.text));
    p.box(x + tw * v.fill - k / 2, mid - k / 2, k, k, k / 2, solid(paper), rgba(ink, 0.8));
  } else {
    const tw = REF.toggle.w * s,
      th = REF.toggle.h * s,
      k = th - 8 * s,
      x = right - tw;
    put(p, label(v.text, REF.size.value, v.on ? c.text : c.soft), x - 14 * s, mid, 'right');
    p.box(x, mid - th / 2, tw, th, th / 2, v.on ? rgba(ON) : OFF, rgba(c.line, 0.9));
    p.box(v.on ? x + tw - k - 4 * s : x + 4 * s, mid - k / 2, k, k, k / 2, solid(paper), NONE);
  }
  lift(p, 40);
}
