// Entry point (index.html): opens the town or builds the battle the address asks for, its scene and its Game, all of it
// behind the loading cover until everything landed (ready-gate.ts). The whole game is this one page (nav.ts): a change
// of screen lets the screen in view go and runs the same path on the new address, with no reload.
import { Battle } from '../shared/battle/battle.ts';
import { syncInert } from './dialog.ts';
import { keepFullscreen } from './fullscreen.ts';
import { newBattle, selectBattle } from './game/boot.ts';
import { titleScreen } from './game/title.ts';
import { bootTown } from './game/town.ts';
import { loadSkin } from './hud-skin.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { watchInstall } from './install.ts';
import { loadingCover } from './loading.ts';
import { looks3d } from './looks3d.ts';
import { Game, LOCAL } from './main.ts';
import { leaveScreen, onLeave, onNavigate } from './nav.ts';
import { type Cover, whenReady } from './ready-gate.ts';
import { rotateNote } from './rotate-note.ts';
import { BattleScene } from './scene.ts';
import { setTrack, sfx } from './sound.ts';
import { param, store } from './store.ts';
import { isSurvival, survivalGoal } from './survival.ts';

const host = document.getElementById('app')!;
let covering: Cover | null = null; // the cover while a screen is built: a screen asked for under it keeps the same one
let asked = 0; // counts the screens asked for: one that lands after another was asked for is let go, never mounted

// `search`: the address of the screen to change to (nav.ts navigate); none: the one the page opened with
async function boot(search?: string) {
  const mine = ++asked;
  const stale = () => mine !== asked;
  if (search !== undefined) history.replaceState(null, '', search || location.pathname);
  // before anything else shows; the sandbox settles its own page, so there the cover leaves as soon as it is built
  const up = (covering ??= loadingCover(param('sandbox') === null));
  const cover: Cover = {
    fail: () => void (stale() || up.fail()),
    async open() {
      if (stale()) return;
      covering = null;
      await up.open();
    },
  };
  // under the cover, the screen in view goes: its scene, 3D layer, listeners and timers (nav.ts onLeave), then the
  // windows it left open, each through its own close so its keys go with it (dialog.ts)
  leaveScreen();
  for (const o of document.querySelectorAll('.overlay')) o.dispatchEvent(new Event('close'));
  for (const o of document.querySelectorAll('.overlay, .talk-overlay')) o.remove();
  host.replaceChildren();
  syncInert();
  // ?mapedit: the map builder (Nov 25, mapedit/builder.ts), a chunk of its own: a tool, not the game
  if (param('mapedit') !== null) return (await import('./mapedit/builder.ts')).bootBuilder(host, cover, stale);
  // ?battleedit: the battle builder (Nov 25, battleedit/builder.ts), its own chunk too
  if (param('battleedit') !== null)
    return (await import('./battleedit/builder.ts')).bootBattleBuilder(host, cover, stale);
  // ?home: the walkable town (or, with ?home=expedition, the expedition map over it) instead of a battle
  if (param('home') !== null) return bootTown(host, cover, stale);
  const sel = await selectBattle();
  if (!sel || stale()) return; // went home instead: the cover stays until that screen comes
  // a battle plays its own track, whatever the screen before it played (a new page started silent); the title, its own
  setTrack(sel.title ? 'title' : null);
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
  // nothing of the interface before everything landed (Fernando, Nov 18: the HTML title and HUD showed first and
  // changed into the 3D ones; the title of Nov 16, opened before the models, left with that). The title opens after
  // the Game: the HUD's layer is there, so the 3D title takes its window as it opens
  const models = scenario.spawns.map((s) => s.def);
  await whenReady(
    cover,
    [BattleScene.create(host, battle.grid, battle.state, models, sel.also), loadSkin(staged?.spec)],
    ([scene, skin]) => {
      if (stale()) return scene.dispose();
      onLeave(() => scene.dispose());
      const game = new Game(battle, scene, host, run, skin);
      sandbox?.install(game, scene);
      if (sel.title) titleScreen();
    },
  );
  // by the battle in play, not the address: a crawl room opened with ?scenario=survival is not one
  if (isSurvival(scenario.id) && !saved && !sandbox && !stale()) announce(survivalGoal(t));
}

// Large banner in the middle of the screen for 2 s (Until Dawn's goal at the start); disappears by itself and does not take clicks
function announce(text: string) {
  sfx('confirm');
  const box = el('div', { class: 'announce', role: 'status' }, text);
  document.body.append(box);
  looks3d.effects?.announce(text); // drawn on the 3D layer; the node stays, unseen, for the screen reader (effects3d.css)
  setTimeout(() => box.remove(), 2200);
}

rotateNote(); // "turn the phone" over every screen (mobile-ux), cover included
watchInstall(); // before the first screen: the browser's install event comes once and is kept for the title
keepFullscreen(); // fullscreen from before a real reload (the language) comes back with this page's first gesture
onNavigate((search) => void boot(search));
void boot();
