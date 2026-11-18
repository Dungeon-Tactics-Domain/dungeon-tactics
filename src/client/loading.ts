// The loading cover (Fernando, Nov 18): one dark screen over the whole page from the first line of the game's code
// until the interface under it is built and drawn (ready-gate.ts), so no title, HUD or window is seen half made or in
// a look it will not keep. It says one line, "Loading the game", over a bar filled by the files landed (loadShare: no
// count, since the total grows from 42 to 95 as the models name their parts; review of Nov 18). A load that fails
// says so with a Reload button: a phone in full screen has no F5.
//   Drawn in 3D (flow3d/loading3d.ts), with the HTML line, bar and button unseen under it for the screen reader, the
//   button over the drawn one. Until the 3D chunk lands the cover is only dark; with no WebGL, or its context lost, the
//   page is the warning (no3d.ts). Only a chunk that never lands leaves the HTML line as the screen.
//   index.html's own line, the same words, is the screen while the code downloads and until the 3D line draws.
import { DefaultLoadingManager } from 'three';
import { loadLoading3d } from './hud-skin.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { reducedMotion } from './motion.ts';
import { no3d } from './no3d.ts';
import { type Cover, IDLE_MS, loadShare, stillLoading } from './ready-gate.ts';

const FADE_MS = 300;

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
};

// `hold`: false leaves the moment the interface is built, with no wait and no fade: the sandbox settles the page by
// itself, on a clock its CLI stops (dev/sandbox.ts `idle`)
export function loadingCover(hold = true): Cover {
  const loading = t('Carregando o jogo…', 'Loading the game…');
  // the cover's one live region, said as the cover comes, on a failure and at the end; never on each file (it was ~95)
  const line = el('p', { class: 'loading-line', role: 'status' });
  const bar = el('progress', { class: 'loading-bar', max: '1', value: '0', 'aria-label': loading });
  const reload = el(
    'button',
    { type: 'button', hidden: true, onclick: () => location.reload() },
    t('Recarregar', 'Reload'),
  );
  // the result's dark veil, not the theme's blue --bg: index.html's line has it too, so nothing changes colour
  const root = el('div', { class: 'loading-cover', style: 'background: var(--ui3d-result-veil)' }, line, bar, reload);
  let share = 0,
    said = loading,
    busy = false, // the manager has files in flight
    lastFile = 0, // when the last file landed (performance.now)
    drawn: Awaited<ReturnType<typeof loadLoading3d>>;
  const draw = () => drawn?.set(share, said, reload.hidden ? undefined : reload);
  const say = (str: string) => {
    said = line.textContent = str;
    draw();
  };
  DefaultLoadingManager.onStart = () => {
    busy = true;
  };
  DefaultLoadingManager.onLoad = () => {
    busy = false;
  };
  DefaultLoadingManager.onProgress = (_url, done) => {
    lastFile = performance.now();
    share = loadShare(share, done);
    bar.value = share;
    draw();
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
  // index.html's line stays over the cover until the 3D one draws (the chunk takes about a second on a slow phone, a
  // blank screen otherwise) or the cover has something else to say
  const unveil = () => document.getElementById('preload')?.remove();
  // a live region only speaks of a change after it is on the page
  requestAnimationFrame(() => {
    if (!line.textContent) line.textContent = said;
  });
  root.classList.add('loading3d');
  const html = () => {
    drawn?.dispose();
    drawn = undefined;
    root.classList.remove('loading3d');
  };
  void loadLoading3d(root, no3d)
    .then((made) => {
      // a failure before the chunk landed already shows in HTML: it stays so
      if (!root.isConnected || !root.classList.contains('loading3d')) return made?.dispose();
      drawn = made;
      if (made) draw();
      else no3d();
    }, html)
    .finally(unveil);
  return {
    fail() {
      // the keys go to the button now: nothing was built under the cover
      removeEventListener('keydown', keys, true);
      unveil();
      if (!drawn) html(); // the 3D line is not there yet: the failure is not left on a blank screen until it comes
      bar.hidden = true;
      reload.hidden = false;
      say(
        t(
          'Não deu para carregar o jogo. Confira a conexão e tente de novo.',
          'The game could not load. Check your connection and try again.',
        ),
      );
      reload.focus();
    },
    // what was built draws its first frames (the faces' textures are only asked for then), the files it asked for
    // land, and the cover leaves
    async open() {
      if (hold) {
        // ponytail: a face that never answers stops holding the cover too; the page swaps to it when it lands
        await Promise.race([fonts, new Promise((r) => setTimeout(r, IDLE_MS))]);
        await frames(2);
        lastFile = performance.now();
        while (stillLoading(busy, lastFile, performance.now())) await frames(1);
        share = bar.value = 1;
        say(t('Jogo carregado', 'Game loaded'));
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
      unveil();
      root.remove();
    },
  };
}
