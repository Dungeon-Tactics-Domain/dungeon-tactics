// The 3D windows the street opens, at work (?townmenu=3d; screens.ts mounts them): the town menu, the gate's quest and
// a place still to come, each the loop its HTML window runs (game/crawl.ts townMenu and questGate, game/town-hud.ts
// openPlace) over the same rules. A 3D window covers the page, so it closes before anything else opens and the menu
// comes back, on the row that opened it, when that closes.
import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { TOWN } from '../../content/crawl/town.ts';
import { descentGold } from '../../shared/crawl/expedition.ts';
import { depart, liveExpedition, toTitle, toTown, townMenu } from '../game/crawl.ts';
import { expeditionScreen, floorOf } from '../game/expedition-map.ts';
import { GROUP_MAX } from '../group.ts';
import { t } from '../i18n.ts';
import { keysShown } from '../key-hints.ts';
import { loadChest } from '../sheet-lines.ts';
import { openParty } from '../town-party.ts';
import { openBar, openShop } from '../town-shop.ts';
import { loadGroup, town3d } from '../town-ui.ts';
import { type Dir, neighbour, type Page } from './page.ts';
import { gatePage, menuPage, type Quest, soonPage } from './street-view.ts';
import type { Town3d, Window3d } from './town3d.ts';

// An arrow (or the d-pad, as the arrow it stands for: dialog.ts padDialog) goes to the button on that side of the one
// in focus; with none there the cursor stays. `side`: what left and right do on a row with a value
function walk(e: KeyboardEvent, page: Page, at: string, go: (id: string) => void, side?: () => boolean) {
  const dir = e.key.startsWith('Arrow') ? (e.key.slice(5).toLowerCase() as Dir) : undefined;
  if (!dir) return;
  e.preventDefault();
  if ((dir === 'left' || dir === 'right') && side?.()) return;
  const to = neighbour(page.hits, at, dir);
  if (to) go(to);
}

const ARM_MS = 5000; // as the HTML rows' 2nd tap (dialog.ts secondTap)

// The quest's rows: Continue opens the map, New expedition over a live one asks a 2nd press, disarmed when the cursor
// leaves it or after ARM_MS. `leave` closes the window first
function quest(leave: () => void, redraw: () => void) {
  let armed = false,
    timer = 0;
  const disarm = () => {
    clearTimeout(timer);
    if (!armed) return;
    armed = false;
    redraw();
  };
  return {
    state: (): Quest => {
      const live = liveExpedition();
      return { live: live ? { floor: floorOf(live), gold: descentGold(live) } : undefined, armed };
    },
    focus: (id: string) => {
      if (id !== 'quest:new') disarm();
    },
    // true when the row was one of the quest's
    pick(id: string) {
      const live = liveExpedition();
      if (id === 'quest:continue' && live) {
        leave();
        expeditionScreen(live);
      } else if (id === 'quest:new') {
        if (live && !armed) {
          armed = true;
          timer = window.setTimeout(disarm, ARM_MS);
          redraw();
        } else {
          clearTimeout(timer);
          leave();
          depart();
        }
      } else return false;
      return true;
    },
  };
}

export function streetWindows(ui: Town3d) {
  const gold = () => loadChest().gold;

  // `extra`: the town's own switches (game/town.ts), each a choice() of two buttons that this menu reads and presses
  const menu = (extra?: Node, start = ''): boolean => {
    const choices = [...((extra as ParentNode | undefined)?.querySelectorAll<HTMLElement>('.choice') ?? [])];
    const page = (at: string) =>
      menuPage({
        name: t(TOWN.name, TOWN.en),
        gold: gold(),
        party: [loadGroup().members.length, GROUP_MAX],
        quest: q.state(),
        keys: keysShown(),
        switches: choices.map((c) => ({
          label: c.querySelector('.choice-label')?.textContent ?? '',
          value: c.querySelector('[aria-pressed="true"]')?.textContent ?? '',
        })),
        at,
      });
    let shown: Page;
    const draw = (focus?: string) => win.set((shown = page(focus ?? win.at())), focus);
    const flip = (id: string) => {
      if (!id.startsWith('sw:')) return false;
      choices[Number(id.slice(3))]?.querySelector<HTMLElement>('[aria-pressed="false"]')?.click();
      draw();
      return true;
    };
    const q = quest(
      () => win.close(),
      () => draw(),
    );
    const beside = (id: string, open: (back: () => void) => void) => {
      win.close();
      // through the hook: with the drawing gone (a lost context, a page shrunk) the HTML menu comes back instead
      open(() => {
        if (!town3d.menu?.(extra, id)) townMenu(extra);
      });
    };
    const win: Window3d = ui.window({
      name: t(TOWN.name, TOWN.en),
      byPlace: true,
      // on a switch, left and right change its value
      key: (e) => walk(e, shown, win.at(), draw, () => flip(win.at())),
      focus: (id) => {
        q.focus(id);
        draw();
      },
      pick: (id) => {
        if (q.pick(id)) return;
        if (id === 'open:shop') beside(id, (back) => openShop(back));
        else if (id === 'open:bar') beside(id, (back) => openBar(back));
        else if (id === 'open:party') beside(id, (back) => openParty(back));
        else if (id === 'street') win.close();
        else if (id === 'title') {
          win.close();
          toTitle();
        } else flip(id);
      },
    });
    draw(start);
    return true;
  };

  // a place's window: the gate with the quest's rows, or (with `says`) a place still to come
  const place = (name: string, says?: string): boolean => {
    let shown: Page;
    const draw = (focus?: string) => {
      const at = focus ?? win.at();
      shown =
        says === undefined
          ? gatePage({ name, gold: gold(), floors: CRAWL_RUN.floors, quest: q.state(), at })
          : soonPage({ name, gold: gold(), says });
      win.set(shown, focus);
    };
    const q = quest(
      () => win.close(),
      () => draw(),
    );
    const win: Window3d = ui.window({
      name,
      onBack: toTown,
      byPlace: true,
      key: (e) => walk(e, shown, win.at(), draw),
      focus: (id) => {
        q.focus(id);
        draw();
      },
      pick: (id) => {
        if (q.pick(id)) return;
        win.close();
        toTown();
      },
    });
    draw('');
    return true;
  };

  return { menu, gate: (name: string) => place(name), soon: place };
}
