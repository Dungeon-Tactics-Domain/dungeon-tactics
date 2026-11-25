// The town's 3D windows at work (hud-skin.ts loads this for the town): the layer over the town's HUD, the HUD itself
// (hud3d.ts), the speech box (window3d/talk3d.ts), the street's windows (street.ts) and, for each window of a building (Shop,
// Tavern, Party), the loop of the window: read the saved game, show its page (shop-view.ts,
// party-view.ts), run the pressed button through the same rules (chest.ts, group.ts), save and show again. While
// mounted, the town's openers hand their windows over (looks3d.ts); a browser without WebGL or a lost context shows
// the warning (no3d.ts).
import type { Slot } from '../../shared/battle/equipment.ts';
import { buy, CHEST_KEY, EQUIP_KEY, equip, sell } from '../chest.ts';
import { Options3d } from '../flow3d/options3d.ts';
import { Sheet3d } from '../flow3d/sheet3d.ts';
import { changeClass, dismiss, type Job, recruit, toggleDeploy } from '../group.ts';
import { Effects3d } from '../hints3d/effects3d.ts';
import { t } from '../i18n.ts';
import { fill } from '../looks3d.ts';
import { no3d } from '../no3d.ts';
import { loadChest, loadEquip } from '../sheet-lines.ts';
import { sfx } from '../sound.ts';
import { store } from '../store.ts';
import type { PartyView } from '../town-party.ts';
import { loadGroup, saveGroup } from '../town-ui.ts';
import { Ui3dLayer } from '../ui3d/layer.ts';
import { Note3d } from '../window3d/note3d.ts';
import { Talk3d } from '../window3d/talk3d.ts';
import { Tools3d } from '../window3d/tools3d.ts';
import { TownHud3d } from './hud3d.ts';
import { Map3d } from './map3d.ts';
import { Pad3d } from './pad3d.ts';
import type { Hit, Page } from './page.ts';
import { PAGES, partyPage } from './party-view.ts';
import { barPage, type ShopTab, shopPage } from './shop-view.ts';
import { streetWindows } from './street.ts';
import { Town3d } from './town3d.ts';

const save = (key: string, v: unknown) => store.set(key, JSON.stringify(v));
// the row a list is on: the one asked for while the page still has it, else its first
const rowOf = (page: Page, sel: string) =>
  page.hits.some((h) => h.id === `row:${sel}`)
    ? sel
    : (page.hits.find((h) => h.id.startsWith('row:'))?.id.slice(4) ?? '');

export function mountTown3d(root: HTMLElement) {
  let layer: Ui3dLayer;
  let live = true;
  const unfill: (() => void)[] = []; // the windows below are no screens of the layer: they leave its places themselves
  // no WebGL here or the context lost: the warning, never the HTML windows under the drawing
  // the town's screen left (nav.ts): the layer, its frames and the windows' places go with it
  const drop = () => {
    live = false;
    for (const u of unfill) u();
    layer.dispose();
  };
  const lost = () => {
    drop();
    no3d();
  };
  try {
    layer = new Ui3dLayer(root, lost);
  } catch {
    no3d();
    return;
  }
  const ui = new Town3d(layer);
  new Map3d(layer); // the expedition map draws over its own window, which it takes by itself (map3d.ts)
  // the town has no battle clock: the layer ticks on the page's own frames, and draws only while a window moves
  const tick = (now: number) => {
    if (!live) return;
    layer.frame(now);
    requestAnimationFrame(tick);
  };

  // Shop: focusing a row shows it in the box, pressing it moves the cursor to the box's action, so nothing is bought by
  // the first press; after a purchase or a sale the cursor is back on the row
  const shop = (back?: () => void, tab: ShopTab = 'buy', sel = '') => {
    const draw = (focus?: string) => {
      const state = { chest: loadChest(), eq: loadEquip(), group: loadGroup() };
      sel = rowOf(shopPage(state, tab, sel), sel);
      win.set(shopPage(state, tab, sel), focus);
    };
    const win = ui.window({
      name: t('Loja', 'Shop'),
      onBack: back,
      byPlace: true, // commands down the left, the list beside them: the arrows go by where each is
      focus: (id) => {
        if (!id.startsWith('row:') || id.slice(4) === sel) return;
        sel = id.slice(4);
        draw();
      },
      pick: (id) => {
        if (id === 'cmd:leave') {
          win.close();
          back?.();
        } else if (id.startsWith('cmd:')) {
          tab = id.slice(4) as ShopTab;
          sel = '';
          draw('');
        } else if (id.startsWith('row:')) {
          draw('act');
          if (win.at() !== 'act') sfx('cancel'); // its action is off: the box says why
        } else {
          const chest = tab === 'buy' ? buy(loadChest(), sel) : sell(loadChest(), sel);
          if (!chest) return sfx('cancel');
          save(CHEST_KEY, chest);
          sfx('confirm');
          draw(`row:${sel}`);
        }
      },
    });
    draw(sel ? `row:${sel}` : '');
    return true;
  };

  // Tavern: the same counter; a recruit costs gold and says who joined
  const bar = (back: () => void, sel = '', said = '') => {
    const draw = (focus?: string) => {
      const g = loadGroup();
      sel = rowOf(barPage(0, g, sel), sel);
      win.set(barPage(loadChest().gold, g, sel, said), focus);
    };
    const win = ui.window({
      name: t('Taverna', 'Tavern'),
      onBack: back,
      byPlace: true,
      focus: (id) => {
        if (!id.startsWith('row:') || id.slice(4) === sel) return;
        sel = id.slice(4);
        said = '';
        draw();
      },
      pick: (id) => {
        if (id === 'cmd:leave') {
          win.close();
          back();
        } else if (id === 'cmd:recruit') draw('');
        else if (id.startsWith('row:')) {
          draw('act');
          if (win.at() !== 'act') sfx('cancel');
        } else {
          const r = recruit(loadGroup(), loadChest(), sel as Job);
          if (!r) return sfx('cancel');
          saveGroup(r.group);
          save(CHEST_KEY, r.chest);
          sfx('confirm');
          const name = r.group.members.at(-1)!.name;
          said = t(`${name} entrou no grupo.`, `${name} joined the party.`);
          draw(`row:${sel}`);
        }
      },
    });
    draw(sel ? `row:${sel}` : '');
    return true;
  };

  // Party: a member's pages. Hit ids: `who:<member>`, `tab:<page>`, `deploy`, `fire`, `slot:<slot>`, `off` (take the
  // open slot's piece off), `row:<item>` (equip it) and `job:<class>`. Dismiss asks a 2nd press, disarmed when the
  // cursor leaves it. The arrows (Fernando, Nov 17): on the roster up and down choose the member and left and right
  // turn the pages; Enter goes into the member's page, where the four walk its buttons by where they are seen, and
  // Esc comes back to the roster. `inside` follows the cursor, so a click or a touch on the page goes in as well
  const party = (back?: () => void, view: PartyView = {}) => {
    let { id, page = 'status', slot = 'main' } = view;
    let armed = false,
      inside = false,
      hits: Hit[] = [];
    // `focus` '': where the arrows start, the picked member's row or, inside, the page's picked button or its first
    const draw = (focus?: string): void => {
      const at = { id, page, slot, armed, inside };
      const p = partyPage({ group: loadGroup(), eq: loadEquip(), chest: loadChest() }, at);
      id = p.id;
      hits = p.page.hits;
      const walks = hits.filter((h) => !h.out && !h.off);
      if (inside && !walks.length) {
        inside = false; // a page with no button to walk (Abilities): the arrows stay on the roster
        draw(focus);
        return;
      }
      win.set(p.page, focus === '' ? (walks.find((h) => h.picked) ?? walks[0])?.id : focus);
    };
    const turn = (dir: number) => {
      page = PAGES[(PAGES.indexOf(page) + dir + PAGES.length) % PAGES.length];
      draw(win.at().startsWith('tab:') ? `tab:${page}` : undefined);
    };
    const done = (ok: boolean, focus?: string) => {
      sfx(ok ? 'confirm' : 'cancel');
      if (ok) draw(focus);
    };
    const win = ui.window({
      name: t('Grupo', 'Party'),
      onBack: back,
      byPlace: true,
      leave: () => {
        if (!inside) return false;
        inside = false;
        sfx('cancel');
        draw('');
        return true;
      },
      key: (e) => {
        if (!e.key.startsWith('Arrow')) return;
        // the cursor on a button the arrows do not walk (a plaque clicked): back to where they do
        if (hits.find((h) => h.id === win.at())?.out !== false) {
          e.preventDefault();
          return draw('');
        }
        // on the roster left and right turn the pages (FFT's paging); the rest is the window's walk by place
        const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (inside || !dir) return;
        e.preventDefault();
        turn(dir);
      },
      focus: (at) => {
        // the cursor on a member's row shows that member; on the page it is inside, on the roster it is not
        const [kind, arg] = at.split(':');
        const was = `${id} ${inside}`;
        if (kind === 'who') id = arg;
        if (kind !== 'tab') inside = kind !== 'who';
        if (was === `${id} ${inside}` && (!armed || at === 'fire')) return;
        if (at !== 'fire') armed = false;
        draw();
      },
      pick: (at) => {
        const [kind, arg] = at.split(':');
        if (kind === 'who') {
          inside = true; // Enter on a member: into the page
          draw('');
          return sfx(inside ? 'confirm' : 'cancel');
        }
        if (kind === 'tab' || kind === 'slot') {
          if (kind === 'tab') page = arg as typeof page;
          else slot = arg as Slot;
          return draw();
        }
        const g = loadGroup(),
          eq = loadEquip(),
          chest = loadChest();
        if (kind === 'deploy') {
          const r = toggleDeploy(g, id!);
          if (r) saveGroup(r);
          return done(!!r);
        }
        if (kind === 'fire') {
          if (!armed) {
            armed = true;
            return draw();
          }
          const r = dismiss(g, eq, chest, id!);
          if (r) {
            saveGroup(r.group);
            save(EQUIP_KEY, r.eq);
            save(CHEST_KEY, r.chest);
            armed = inside = false; // the member is gone: back on the roster
            id = undefined;
          }
          return done(!!r, '');
        }
        if (kind === 'job') {
          if (arg !== g.members.find((m) => m.id === id)?.cls) saveGroup(changeClass(g, id!, arg as Job));
          return done(true);
        }
        // off: the open slot's piece back to the chest; row: a chest piece on
        const r = equip(chest, eq, id!, slot, kind === 'row' ? arg : null);
        if (r) {
          save(CHEST_KEY, r.chest);
          save(EQUIP_KEY, r.eq);
        }
        done(!!r, `slot:${slot}`);
      },
    });
    draw('');
    return true;
  };

  const street = streetWindows(ui);
  unfill.push(
    fill('shop', shop),
    fill('bar', bar),
    fill('party', party),
    fill('menu', street.menu),
    fill('gate', street.gate),
    fill('soon', street.soon),
  );
  new TownHud3d(layer, root);
  // the gear and ↺ ↻, as in battle, and what the gear opens: Options and its Help sheets
  new Tools3d(layer, root.querySelector<HTMLElement>('.tools')!, 'row');
  const pad = root.querySelector<HTMLElement>('.town-pad'); // a touch device's joystick and button
  if (pad) new Pad3d(layer, pad);
  for (const Screen of [Options3d, Sheet3d]) new Screen(layer);
  new Talk3d(layer); // at any size: it draws over the HTML box's own boxes
  new Note3d(layer); // takes each notice window by itself (note.ts)
  new Effects3d(layer); // the effects over the page (looks3d.ts `effects`), as in a battle
  requestAnimationFrame(tick);
  return drop;
}
