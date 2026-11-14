// World map flow (world.ts and world-ui.ts): on a new game the intro and the protagonist creation first, then the map, where
// a battle point opens its stage and a story point plays its conversation. Named world-screen.ts because world.ts (rules) and
// world-ui.ts (the map window) already exist.
import { CAMPAIGN_KEY, chapterId, parseProgress } from '../campaign.ts';
import { createHero } from '../create-ui.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { HERO_KEY } from '../hero.ts';
import { t } from '../i18n.ts';
import { setTrack } from '../sound.ts';
import { param, store } from '../store.ts';
import { talk } from '../talk.ts';
import { afterNode, INTRO, parseWorld, partyFor, WORLD, WORLD_KEY } from '../world.ts';
import { openParty, openWorld } from '../world-ui.ts';
import { savedGroup, savedHero } from './boot.ts';
import { credits } from './title.ts';

// Gamepad on the intro and creation (before the map, which has its own): A presses the focused button or becomes Enter, the
// d-pad becomes arrows and B becomes Esc, through the same translator as the battle. Returns the function that stops the loop.
function padToKeys(): () => void {
  let on = true;
  const mem = emptyMemory();
  const key = (k: string) => dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k }));
  const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const;
  const poll = () => {
    if (!on) return;
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    for (const a of padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      mem,
      performance.now(),
    )) {
      const focused = document.activeElement;
      if (a.k === 'confirm') focused instanceof HTMLButtonElement ? focused.click() : key('Enter');
      else if (a.k === 'cancel') key('Escape');
      else if (a.k === 'cursor') key(ARROW[a.dir]);
    }
  };
  requestAnimationFrame(poll);
  return () => {
    on = false;
  };
}

// World map (world.ts and world-ui.ts): a battle point opens the stage (replaying starts from zero); a story point plays the
// conversation right there and unlocks the next. The stage only opens by URL if already unlocked (boot), hence the map unlocks first.
export async function worldScreen(host: HTMLElement) {
  // new game (no saved hero): the story intro and the protagonist creation before the map
  let hero = savedHero();
  if (!hero) {
    setTrack('title');
    const stopPad = padToKeys();
    await talk(INTRO, { dark: true });
    hero = await createHero(host);
    stopPad();
    store.set(HERO_KEY, JSON.stringify(hero));
  }
  setTrack('world');
  let done = parseWorld(store.get(WORLD_KEY));
  const enter = async (i: number) => {
    const node = WORLD[i];
    if (node.chapter !== undefined) {
      store.set(CAMPAIGN_KEY, String(Math.max(parseProgress(store.get(CAMPAIGN_KEY)), node.chapter)));
      if (i < done) store.set(`dt:battle:${chapterId(node.chapter)}`, '');
      location.search = `?stage=${node.chapter}`;
      return;
    }
    await talk(node.scene!, { title: t(node.name[0], node.name[1]), hero });
    // 1st time on the epilogue: the journey is over, the credits close the campaign (revisiting the epilogue later does not repeat)
    const finale = i === WORLD.length - 1 && i >= done;
    done = afterNode(i, done);
    // on the end credits, Back only closes: the map is already open underneath (the title on top of it had no battle behind)
    store.set(WORLD_KEY, String(done));
    view = view.refresh(done, i);
    // credits after refreshing the map (Nov 13, review): before, the refresh pulled focus to Enter behind the credits and
    // an Enter reopened the epilogue on top
    if (finale) credits(() => undefined);
  };
  let view = openWorld(host, {
    done,
    hero: hero.cls,
    enter,
    back: () => {
      location.search = '';
    },
    party: () => openParty(partyFor(done, hero, savedGroup()).chapter, hero),
    from: Number(param('from') ?? -1),
  });
}
