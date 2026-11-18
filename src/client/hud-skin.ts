// The battle HUD's looks (Fernando, Nov 16; the 3D one is the default since Nov 17): the FFT-style interfaces under comparison,
// piece by piece, each its own chunk the game online never fetches. ui3d/skin-flags.ts reads which look each piece
// takes from the address and from a sandbox spec (?menu=, ?turn=, the ?ui= preset and the older ?menu3d, ?turn3d and
// ?menucss); this file loads them:
//   menu 3d: the command menu in 3D (menu3d/); turn 3d: the turn list in 3D (turn3d/); both draw on one shared WebGL
//   layer (ui3d/). menu css: the command menu as parchment in HTML and CSS (menucss.css). Without a flag the skin is
//   empty and the HUD is the one of always.
import type { Bar3d } from './bar3d/bar3d.ts';
import type { Confirm3d } from './confirm3d/confirm3d.ts';
import type { Hints3d } from './hints3d/hints3d.ts';
import type { HudActions } from './hud.ts';
import type { MenuCss } from './hud-menucss.ts';
import { showLayout } from './layout-mode.ts';
import type { Menu3d } from './menu3d/menu3d.ts';
import type { Result3d } from './result3d/result3d.ts';
import { param } from './store.ts';
import type { QueueBoxes, Turn3d } from './turn3d/turn3d.ts';
import type { Ui3dLayer } from './ui3d/layer.ts';
import { parseLayout } from './ui3d/layout.ts';
import { skinFlags, specFlags } from './ui3d/skin-flags.ts';
import type { Note3d } from './window3d/note3d.ts';
import type { Status3d } from './window3d/status3d.ts';
import type { Talk3d } from './window3d/talk3d.ts';
import type { Tools3d } from './window3d/tools3d.ts';

export interface HudSkin {
  menucss?: (root: HTMLElement, commands: HTMLElement, abilities: HTMLElement, act: HudActions) => MenuCss;
  layer?: (root: HTMLElement, lost: () => void) => Ui3dLayer | undefined; // undefined: no WebGL, the HTML HUD stays
  menu3d?: (layer: Ui3dLayer, act: HudActions) => Menu3d;
  turn3d?: (layer: Ui3dLayer, queue: HTMLElement) => Turn3d;
  bar3d?: (layer: Ui3dLayer, active: HTMLElement) => Bar3d;
  hints3d?: (layer: Ui3dLayer) => Hints3d;
  confirm3d?: (layer: Ui3dLayer, box: HTMLElement) => Confirm3d; // "Execute?" in 3D (confirm3d/)
  result3d?: (layer: Ui3dLayer) => Result3d; // the end of battle in 3D (result3d/)
  flow3d?: ((layer: Ui3dLayer) => unknown)[]; // the screens around the battle in 3D (flow3d/): Options, the title
  tools3d?: (layer: Ui3dLayer, tools: HTMLElement) => Tools3d; // the corner menu in 3D (window3d/)
  status3d?: (layer: Ui3dLayer) => Status3d; // the Status window in 3D (window3d/)
  talk3d?: (layer: Ui3dLayer) => Talk3d; // the speech box and the opening narration in 3D (window3d/)
  note3d?: (layer: Ui3dLayer) => Note3d; // a notice window in 3D (window3d/)
}

// `spec`: a sandbox spec's keys (docs/sandbox.md); the address wins over it
export async function loadSkin(from: object = {}): Promise<HudSkin> {
  const spec = from as Record<string, unknown>;
  if (spec.layout && param('layout') === null) showLayout(parseLayout(spec.layout));
  const flags = skinFlags(param, specFlags(spec));
  const skin: HudSkin = {};
  if (param('guides') === '1') void import('./ui3d/guides.ts').then((m) => m.showGuides());
  if (flags.menu === '3d') {
    const { Menu3d } = await import('./menu3d/menu3d.ts');
    skin.menu3d = (layer, act) => new Menu3d(layer, act);
  } else if (flags.menu === 'css') {
    const [{ MenuCss }] = await Promise.all([import('./hud-menucss.ts'), import('./menucss.css')]);
    skin.menucss = (...parts) => new MenuCss(...parts);
  }
  if (flags.turn === '3d') {
    const { Turn3d } = await import('./turn3d/turn3d.ts');
    skin.turn3d = (layer, queue) => new Turn3d(layer, queue, flags.bar === '3d');
  }
  if (flags.bar === '3d') {
    const { Bar3d } = await import('./bar3d/bar3d.ts');
    skin.bar3d = (layer, active) => new Bar3d(layer, active);
  }
  // the instruction banner, the Height corner and the button hints in 3D (hints3d/): one screen, a part per flag
  const [banner, height, hints] = [flags.banner, flags.height, flags.hints].map((look) => look === '3d');
  if (banner || height || hints) {
    const { Hints3d } = await import('./hints3d/hints3d.ts');
    skin.hints3d = (layer) => new Hints3d(layer, { banner, height, hints });
  }
  if (flags.confirm === '3d') {
    const { Confirm3d } = await import('./confirm3d/confirm3d.ts');
    skin.confirm3d = (layer, box) => new Confirm3d(layer, box);
  }
  if (flags.result === '3d') {
    const { Result3d } = await import('./result3d/result3d.ts');
    skin.result3d = (layer) => new Result3d(layer);
  }
  if (flags.options === '3d') {
    const { Options3d } = await import('./flow3d/options3d.ts');
    (skin.flow3d ??= []).push((layer) => new Options3d(layer));
  }
  if (flags.title === '3d') {
    const { Title3d } = await import('./flow3d/title3d.ts');
    (skin.flow3d ??= []).push((layer) => new Title3d(layer));
  }
  if (flags.sheets === '3d') {
    const { Sheet3d } = await import('./flow3d/sheet3d.ts');
    (skin.flow3d ??= []).push((layer) => new Sheet3d(layer));
  }
  if (flags.dev === '3d') {
    const { Dev3d } = await import('./flow3d/dev3d.ts');
    (skin.flow3d ??= []).push((layer) => new Dev3d(layer));
  }
  if (flags.tools === '3d') {
    const { Tools3d } = await import('./window3d/tools3d.ts');
    skin.tools3d = (layer, tools) => new Tools3d(layer, tools);
  }
  if (flags.status === '3d') {
    const { Status3d } = await import('./window3d/status3d.ts');
    skin.status3d = (layer) => new Status3d(layer);
  }
  if (flags.talk === '3d') {
    const { Talk3d } = await import('./window3d/talk3d.ts');
    skin.talk3d = (layer) => new Talk3d(layer);
  }
  if (flags.note === '3d') {
    const { Note3d } = await import('./window3d/note3d.ts');
    skin.note3d = (layer) => new Note3d(layer);
  }
  if (
    skin.menu3d ||
    skin.turn3d ||
    skin.bar3d ||
    skin.hints3d ||
    skin.confirm3d ||
    skin.result3d ||
    skin.flow3d ||
    skin.tools3d ||
    skin.status3d ||
    skin.talk3d ||
    skin.note3d
  ) {
    const { Ui3dLayer } = await import('./ui3d/layer.ts');
    skin.layer = (root, lost) => {
      try {
        return new Ui3dLayer(root, flags.pixel, lost);
      } catch {
        return undefined; // no WebGL here (old device, blocked): the HTML HUD is all there is
      }
    };
  }
  return skin;
}

// The town's windows, HUD and speech box and the expedition map in 3D (town3d/): its own layer over the town's HUD.
// The chunk lands behind the loading cover (ready-gate.ts) and the town mounts it on its HUD as it builds it, so no
// HTML window opens first; with ?ui=html or the piece's own flag, the HTML windows open
export async function loadTownSkin(): Promise<((root: HTMLElement) => void) | undefined> {
  const flags = skinFlags(param);
  const on = {
    party: flags.party === '3d',
    shop: flags.shop === '3d',
    menu: flags.townmenu === '3d',
    hud: flags.townhud === '3d',
    talk: flags.talk === '3d',
    map: flags.map === '3d',
    note: flags.note === '3d',
  };
  if (!Object.values(on).some(Boolean)) return;
  const { mountTown3d } = await import('./town3d/screens.ts');
  return (root) => mountTown3d(root, on);
}

// The loading screen in 3D (flow3d/loading3d.ts) on a layer of its own over the loading cover (loading.ts);
// undefined with no WebGL: the cover's HTML line is the screen. `lost`: its context went away
export async function loadLoading3d(root: HTMLElement, lost: () => void) {
  const [{ Ui3dLayer }, { Loading3d }] = await Promise.all([
    import('./ui3d/layer.ts'),
    import('./flow3d/loading3d.ts'),
  ]);
  try {
    return new Loading3d(new Ui3dLayer(root, false, lost));
  } catch {
    return undefined;
  }
}

// The turn list's boxes for the 3D list, which draws over them and never reads the DOM itself: each row in the list's
// scroll space, the list in the HUD, its pinned title, its scroll and the list left past its box
// the rows the 3D list draws: the shown ones (with the 3D bar, the acting row is hidden; style.css)
const shownRows = (queue: HTMLElement) =>
  [...queue.querySelectorAll<HTMLElement>('.queue-row')].filter((r) => r.offsetParent);
export function queueBoxes(root: HTMLElement, queue: HTMLElement): QueueBoxes {
  const box = queue.getBoundingClientRect(),
    host = root.getBoundingClientRect();
  return {
    rows: shownRows(queue).map((r) => ({
      x: r.offsetLeft,
      y: r.offsetTop,
      w: r.offsetWidth,
      h: r.offsetHeight,
    })),
    left: box.left - host.left + queue.clientLeft,
    top: box.top - host.top + queue.clientTop,
    height: queue.clientHeight,
    head: queue.querySelector<HTMLElement>('.queue-title')?.offsetHeight ?? 0,
    scroll: queue.scrollTop,
    more: queue.scrollHeight - queue.clientHeight,
  };
}

// The 3D list's input, from the HTML list under it: a scroll or a new size moves the cards, the mouse over a row lifts
// its card
export function wireQueue(root: HTMLElement, queue: HTMLElement, list: Turn3d) {
  const place = () => list.place(queueBoxes(root, queue));
  queue.addEventListener('scroll', place);
  new ResizeObserver(place).observe(queue);
  queue.addEventListener('pointermove', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.queue-row') : null;
    list.hover(row ? shownRows(queue).indexOf(row as HTMLElement) : -1);
  });
  queue.addEventListener('pointerleave', () => list.hover(-1));
}
