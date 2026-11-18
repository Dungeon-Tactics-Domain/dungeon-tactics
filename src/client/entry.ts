// Entry point (index.html): opens the town or builds the battle the address asks for, its scene and its Game, all of it
// behind the loading cover until everything landed (ready-gate.ts).
import { Battle } from '../shared/battle/battle.ts';
import { keepFullscreen } from './fullscreen.ts';
import { newBattle, selectBattle } from './game/boot.ts';
import { titleScreen } from './game/title.ts';
import { bootTown } from './game/town.ts';
import { loadSkin } from './hud-skin.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { loadingCover } from './loading.ts';
import { looks3d } from './looks3d.ts';
import { Game, LOCAL } from './main.ts';
import { PIXEL_KEY, parsePixel } from './pixel-settings.ts';
import { whenReady } from './ready-gate.ts';
import { rotateNote } from './rotate-note.ts';
import { BattleScene } from './scene.ts';
import { sfx } from './sound.ts';
import { param, store } from './store.ts';
import { isSurvival, survivalGoal } from './survival.ts';

async function boot() {
  const host = document.getElementById('app')!;
  // before anything else shows; the sandbox settles its own page, so there the cover leaves as soon as it is built
  const cover = loadingCover(param('sandbox') === null);
  rotateNote(); // "turn the phone" over every screen (mobile-ux), cover included
  keepFullscreen(); // fullscreen chosen on another screen comes back with this page's first gesture
  // ?home: the walkable town (or, with ?home=expedition, the expedition map over it) instead of a battle
  if (param('home') !== null) return bootTown(host, cover);
  const sel = await selectBattle();
  if (!sel) return; // went home instead: the cover stays until that page comes
  // localhost ?sandbox=<spec>: a battle staged for screenshots (docs/sandbox.md); its own chunk, never fetched online
  const sandbox = LOCAL && param('sandbox') !== null ? await import('./dev/sandbox.ts') : null;
  const staged = await sandbox?.stage(sel.scenario);
  // its own save key: acting in a staged battle must not overwrite the real one
  const run = staged ? { ...sel, scenario: staged.scenario, saveKey: 'dt:battle:sandbox' } : sel;
  const { scenario } = run;
  // a save of another scenario (a whole-tile one, from before the half tiles of Nov 14) starts the battle over
  const loaded = staged ? null : Battle.load(store.get(sel.saveKey) ?? '');
  const saved = loaded?.state.scenario === scenario.id;
  const battle = staged?.battle ?? (saved ? loaded : newBattle(scenario, run.room));
  // a room is saved from its first frame, so leaving it before any action still counts as leaving (crawl.ts leftRoom)
  if (run.room && !saved) store.set(run.saveKey, battle.save());
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  // nothing of the interface before everything landed (Fernando, Nov 18: the HTML title and HUD showed first and
  // changed into the 3D ones; the title of Nov 16, opened before the models, left with that). The title opens after
  // the Game: the HUD's layer is there, so the 3D title takes its window as it opens
  const models = scenario.spawns.map((s) => s.def);
  await whenReady(
    cover,
    [BattleScene.create(host, battle.grid, battle.state, pixel, models), loadSkin(staged?.spec)],
    ([scene, skin]) => {
      const game = new Game(battle, scene, host, pixel, run, skin);
      sandbox?.install(game, scene);
      if (sel.title) titleScreen();
    },
  );
  // by the battle in play, not the address: a crawl room opened with ?scenario=survival is not one
  if (isSurvival(scenario.id) && !saved && !sandbox) announce(survivalGoal(t));
}

// Large banner in the middle of the screen for 2 s (Until Dawn's goal at the start); disappears by itself and does not take clicks
function announce(text: string) {
  sfx('confirm');
  const box = el('div', { class: 'announce', role: 'status' }, text);
  document.body.append(box);
  looks3d.effects?.announce(text); // drawn on the 3D layer; the node stays, unseen, for the screen reader (effects3d.css)
  setTimeout(() => box.remove(), 2200);
}

void boot();
