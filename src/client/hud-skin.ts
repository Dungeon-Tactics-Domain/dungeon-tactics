// The interface's 3D pieces (Fernando, Nov 18: the interface is only 3D), each its own chunk, loaded here behind the
// loading cover (ready-gate.ts): the battle's on one shared WebGL layer over the HUD (ui3d/), the town's on its own.
import type { Bar3d } from './bar3d/bar3d.ts';
import type { Confirm3d } from './confirm3d/confirm3d.ts';
import type { Hints3d } from './hints3d/hints3d.ts';
import type { HudActions } from './hud.ts';
import { showLayout } from './layout-mode.ts';
import type { Menu3d } from './menu3d/menu3d.ts';
import { param } from './store.ts';
import type { Turn3d } from './turn3d/turn3d.ts';
import type { Ui3dLayer } from './ui3d/layer.ts';
import { parseLayout } from './ui3d/layout.ts';
import type { Tools3d } from './window3d/tools3d.ts';

export interface HudSkin {
  layer: (root: HTMLElement, lost: () => void) => Ui3dLayer | undefined; // undefined: no WebGL here
  menu3d: (layer: Ui3dLayer, act: HudActions) => Menu3d;
  turn3d: (layer: Ui3dLayer, queue: HTMLElement) => Turn3d;
  bar3d: (layer: Ui3dLayer, active: HTMLElement) => Bar3d;
  hints3d: (layer: Ui3dLayer) => Hints3d;
  confirm3d: (layer: Ui3dLayer, box: HTMLElement) => Confirm3d; // "Execute?" (confirm3d/)
  tools3d: (layer: Ui3dLayer, tools: HTMLElement) => Tools3d; // the corner menu (window3d/)
  // the screens that take their window by themselves: the end of battle, Options, the title, its sheets, the
  // developer menu, Status, the effects over the battle, the speech box and the notices
  screens: ((layer: Ui3dLayer) => unknown)[];
}

// `spec`: a sandbox spec's keys (docs/sandbox.md); the address wins over it
export async function loadSkin(from: object = {}): Promise<HudSkin> {
  const spec = from as Record<string, unknown>;
  if (spec.layout && param('layout') === null) showLayout(parseLayout(spec.layout));
  // ?pixel=1 (or the spec's uiPixel): the 3D pieces through the pixel filter
  const p = param('pixel');
  const pixel = p !== null ? p !== '0' && p !== 'false' : spec.uiPixel === true;
  const [
    { Menu3d },
    { Turn3d },
    { Bar3d },
    { Hints3d },
    { Confirm3d },
    { Result3d },
    { Options3d },
    { Title3d },
    { Sheet3d },
    { Dev3d },
    { Tools3d },
    { Status3d },
    { Effects3d },
    { Talk3d },
    { Note3d },
    { Ui3dLayer },
  ] = await Promise.all([
    import('./menu3d/menu3d.ts'),
    import('./turn3d/turn3d.ts'),
    import('./bar3d/bar3d.ts'),
    import('./hints3d/hints3d.ts'),
    import('./confirm3d/confirm3d.ts'),
    import('./result3d/result3d.ts'),
    import('./flow3d/options3d.ts'),
    import('./flow3d/title3d.ts'),
    import('./flow3d/sheet3d.ts'),
    import('./flow3d/dev3d.ts'),
    import('./window3d/tools3d.ts'),
    import('./window3d/status3d.ts'),
    import('./hints3d/effects3d.ts'),
    import('./window3d/talk3d.ts'),
    import('./window3d/note3d.ts'),
    import('./ui3d/layer.ts'),
  ]);
  return {
    layer: (root, lost) => {
      try {
        return new Ui3dLayer(root, pixel, lost);
      } catch {
        return undefined; // no WebGL here (old device, blocked)
      }
    },
    menu3d: (layer, act) => new Menu3d(layer, act),
    turn3d: (layer, queue) => new Turn3d(layer, queue, true),
    bar3d: (layer, active) => new Bar3d(layer, active),
    hints3d: (layer) => new Hints3d(layer, { banner: true, height: true, hints: true }),
    confirm3d: (layer, box) => new Confirm3d(layer, box),
    tools3d: (layer, tools) => new Tools3d(layer, tools),
    screens: [Result3d, Options3d, Title3d, Sheet3d, Dev3d, Status3d, Effects3d, Talk3d, Note3d].map(
      (Screen) => (layer: Ui3dLayer) => new Screen(layer),
    ),
  };
}

// The town's windows, HUD and speech box and the expedition map (town3d/): its own layer over the town's HUD. The chunk
// lands behind the loading cover (ready-gate.ts) and the town mounts it on its HUD as it builds it
export async function loadTownSkin(): Promise<(root: HTMLElement) => void> {
  const { mountTown3d } = await import('./town3d/screens.ts');
  return mountTown3d;
}

// The loading screen in 3D (flow3d/loading3d.ts) on a layer of its own over the loading cover (loading.ts);
// undefined with no WebGL. `lost`: its context went away
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
