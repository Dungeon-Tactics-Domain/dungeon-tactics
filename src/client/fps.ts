// Performance counter in the corner of the battle (F3): frame rate, draw calls, triangles and memory of the scene.
import { t } from './i18n.ts';
import { el } from './icons.ts';
import type { BattleScene } from './scene.ts';
import { store } from './store.ts';

// performance counter on (1) or off (0); off by default since Nov 16 (Fernando: it cluttered the screen, mostly on a tablet),
// the menu button and F3 switch it on
const FPS_KEY = 'dt:fps';
export const fpsOn = () => store.get(FPS_KEY) === '1';

// adds the counter to the host and returns its on/off switch, which says the new state
export function fpsCounter(host: HTMLElement, scene: BattleScene): () => boolean {
  const fps = el('div', { class: 'fps', 'aria-hidden': 'true' });
  const show = () => {
    if (fps.hidden) return;
    const s = scene.stats();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    fps.textContent = [
      `${s.fps.toFixed(0)} fps · ${s.ms.toFixed(1)} ms`,
      t(
        `${s.calls} desenhos · ${(s.triangles / 1000).toFixed(1)} mil triângulos`,
        `${s.calls} draw calls · ${(s.triangles / 1000).toFixed(1)}k triangles`,
      ),
      t(`${s.geometries} geometrias · ${s.textures} texturas`, `${s.geometries} geometries · ${s.textures} textures`),
      ...(mem ? [`JS ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB`] : []),
    ].join('\n');
  };
  host.append(fps);
  fps.hidden = !fpsOn();
  // the text changes 2 times per second, not every frame (almost zero cost)
  setInterval(show, 500);
  return () => {
    fps.hidden = !fps.hidden;
    store.set(FPS_KEY, fps.hidden ? '0' : '1');
    show();
    return !fps.hidden;
  };
}
