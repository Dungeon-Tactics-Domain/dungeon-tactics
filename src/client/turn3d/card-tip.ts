// The name, life and CT of the turn list's card under the mouse (turn3d.ts), beside it on a dark plate (Fernando,
// Nov 18: the last HTML plate over the 3D list, drawn now in the result's dark tokens like the other plates). The text
// is queue-view.ts' `tip`; turn3d.ts says where its left end and middle go, every frame.
import { colors, label, rgba } from '../flow3d/draw.ts';
import { Part } from '../hints3d/hints3d.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';

export class CardTip {
  private readonly part = new Part();
  private readonly color;
  readonly group = this.part.group;

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
  }

  // `str`: what to say, or null; `x`: its left end; `y`: its middle; page px. Built again only when the words change
  show(str: string | null, x: number, y: number) {
    const part = this.part;
    part.want = str ? 1 : 0;
    if (!str) return;
    part.group.position.set(Math.round(x), -Math.round(y), 0);
    const key = JSON.stringify([str, this.layer.dpr, this.layer.s]);
    if (key === part.key) return;
    part.clear();
    part.key = key;
    const c = this.color,
      m = label(this.layer, 1, str, 16, c.text), // the game's 16 px, as the HTML tip's --fs-sm
      w = m.scale.x + 20,
      h = m.scale.y + 8;
    part.box(0, -h / 2, w, h, 6, rgba(c.plate, 0.96), rgba(c.line, 0.9));
    part.text(m, w / 2, 0);
    for (const o of part.group.children) o.renderOrder += 10; // over the hovered card (3) and its lines
  }

  frame(e: number) {
    return this.part.fade(e);
  }

  dispose() {
    this.part.clear();
    this.group.removeFromParent();
  }
}
