// The loading cover (Fernando, Nov 18): one dark screen over the whole page from the first line of the game's code
// until the interface under it is built and drawn (ready-gate.ts), so no title, HUD or window is seen half made or in
// a look it will not keep. It counts the scene's files (Three's default manager: the total grows as the models name
// their parts, since no loader knows the bytes ahead) as a line and a bar.
//   One look, picked before anything shows: drawn in 3D (flow3d/loading3d.ts) when the interface is the 3D one, with
//   the HTML line and bar unseen under it for the screen reader; with ?ui=html, or where the 3D layer cannot be made
//   (no WebGL), the HTML line and bar are the screen. Until the 3D chunk lands the cover is only dark.
import { DefaultLoadingManager } from 'three';
import { loadLoading3d } from './hud-skin.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { reducedMotion } from './motion.ts';
import { type Cover, loadShare } from './ready-gate.ts';

const FADE_MS = 300;
const IDLE_MS = 5000; // ponytail: a texture or a font that never answers stops holding the cover after this; no retry

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
};

// `hold`: false leaves the moment the interface is built, with no wait and no fade: the sandbox settles the page by
// itself, on a clock its CLI stops (dev/sandbox.ts `idle`)
export function loadingCover(hold = true): Cover {
  const text = (done: number, total: number) =>
    total
      ? t(`Carregando modelos 3D ${done}/${total}`, `Loading 3D models ${done}/${total}`)
      : t('Carregando modelos 3D', 'Loading 3D models');
  const line = el('p', { class: 'loading-line' }, text(0, 0));
  const bar = el('progress', { class: 'loading-bar', max: '1', value: '0' });
  const root = el('div', { class: 'loading-cover', role: 'status' }, line, bar);
  let share = 0,
    busy = false, // the manager has files in flight
    drawn: Awaited<ReturnType<typeof loadLoading3d>>;
  const show = (str: string) => {
    line.textContent = str;
    bar.value = share;
    drawn?.set(share, str);
  };
  DefaultLoadingManager.onStart = () => {
    busy = true;
  };
  DefaultLoadingManager.onLoad = () => {
    busy = false;
  };
  DefaultLoadingManager.onProgress = (_url, done, total) => {
    share = loadShare(share, done);
    show(text(done, total));
  };
  // the keys stay with the cover: the title under it holds the focus before it is seen. The browser's own (F5, Ctrl+R)
  // pass
  const keys = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !/^F\d+$/.test(e.key)) e.preventDefault();
  };
  addEventListener('keydown', keys, true);
  // the hosted faces (style.css @font-face), asked for now: the page under the cover is laid out with them before it
  // is seen. A face that fails keeps the fallback
  const fonts = Promise.all([...document.fonts].map((f) => f.load())).catch(() => {});
  document.body.append(root);
  root.classList.add('loading3d');
  const html = () => {
    drawn?.dispose();
    drawn = undefined;
    root.classList.remove('loading3d');
  };
  void loadLoading3d(root, html).then((made) => {
    if (!root.isConnected) return made?.dispose();
    drawn = made;
    if (made) made.set(share, line.textContent ?? '');
    else html();
  }, html);
  return {
    fail() {
      show(t('Não deu para carregar o jogo. Recarregue a página.', 'The game could not load. Reload the page.'));
    },
    // what was built draws its first frames (the faces' textures are only asked for then), the files it asked for
    // land, and the cover leaves
    async open() {
      if (hold) {
        // ponytail: a face that never answers stops holding the cover too; the page swaps to it when it lands
        await Promise.race([fonts, new Promise((r) => setTimeout(r, IDLE_MS))]);
        await frames(2);
        for (const until = performance.now() + IDLE_MS; busy && performance.now() < until; ) await frames(1);
        share = 1;
        show(line.textContent ?? '');
        await frames(2);
      }
      removeEventListener('keydown', keys, true);
      DefaultLoadingManager.onStart = undefined;
      DefaultLoadingManager.onLoad = DefaultLoadingManager.onProgress = () => {};
      if (hold && !reducedMotion()) {
        root.classList.add('leaving');
        await new Promise((r) => setTimeout(r, FADE_MS));
      }
      drawn?.dispose();
      root.remove();
    },
  };
}
