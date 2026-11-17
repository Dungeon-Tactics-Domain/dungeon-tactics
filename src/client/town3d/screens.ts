// The town's 3D windows at work (hud-skin.ts loads this for the town): the layer over the town's HUD, and for each
// window (Shop, Tavern, Party) the loop the HTML one runs: read the saved game, show its page (shop-view.ts,
// party-view.ts), run the pressed button through the same rules (chest.ts, group.ts), save and show again. While
// mounted, the town's openers hand their windows over (town-ui.ts `town3d`); a page too small for the drawing, a
// browser without WebGL or a lost context leave the HTML windows as they are.
import type { Slot } from '../../shared/battle/equipment.ts';
import { buy, CHEST_KEY, EQUIP_KEY, equip, sell } from '../chest.ts';
import { changeClass, dismiss, type Job, recruit, toggleDeploy } from '../group.ts';
import { t } from '../i18n.ts';
import { loadChest, loadEquip } from '../sheet-lines.ts';
import { sfx } from '../sound.ts';
import { store } from '../store.ts';
import { openParty, type PartyView } from '../town-party.ts';
import { openBar, openShop } from '../town-shop.ts';
import { loadGroup, saveGroup, town3d } from '../town-ui.ts';
import { Ui3dLayer } from '../ui3d/layer.ts';
import { MIN_SCALE, SCREEN } from '../ui3d/layout.ts';
import { Map3d } from './map3d.ts';
import type { Page } from './page.ts';
import { PAGES, partyPage } from './party-view.ts';
import { barPage, type ShopTab, shopPage } from './shop-view.ts';
import { Town3d } from './town3d.ts';

const save = (key: string, v: unknown) => store.set(key, JSON.stringify(v));
// the row a list is on: the one asked for while the page still has it, else its first
const rowOf = (page: Page, sel: string) =>
  page.hits.some((h) => h.id === `row:${sel}`)
    ? sel
    : (page.hits.find((h) => h.id.startsWith('row:'))?.id.slice(4) ?? '');

export function mountTown3d(root: HTMLElement, on: { party: boolean; shop: boolean; map?: boolean }) {
  let again: (() => void) | undefined; // the open window as its HTML one, should the drawing go away
  let layer: Ui3dLayer;
  const lost = () => {
    town3d.shop = town3d.bar = town3d.party = undefined;
    on.map = false;
    layer.dispose(); // with the screen and its window
    again?.();
  };
  try {
    layer = new Ui3dLayer(root, false, lost);
  } catch {
    return; // no WebGL here: the HTML windows are all there is
  }
  const ui = new Town3d(layer);
  if (on.map) new Map3d(layer); // the expedition map draws over its own window, which it takes by itself (map3d.ts)
  // the town has no battle clock: the layer ticks on the page's own frames, and draws only while a window moves
  const tick = (now: number) => {
    if (!town3d.shop && !town3d.party && !on.map) return;
    layer.frame(now);
    requestAnimationFrame(tick);
  };
  // the drawing is the 1920x1080 reference scaled to the page: under MIN_SCALE its text no longer fits its panels
  const fits = () => Math.min(innerWidth / SCREEN.w, innerHeight / SCREEN.h) >= MIN_SCALE;

  // Shop: focusing a row shows it in the box, pressing it moves the cursor to the box's action, so nothing is bought by
  // the first press; after a purchase or a sale the cursor is back on the row
  const shop = (back?: () => void, tab: ShopTab = 'buy', sel = '') => {
    if (!fits()) return false;
    const draw = (focus?: string) => {
      const state = { chest: loadChest(), eq: loadEquip(), group: loadGroup() };
      sel = rowOf(shopPage(state, tab, sel), sel);
      win.set(shopPage(state, tab, sel), focus);
    };
    const win = ui.window({
      name: t('Loja', 'Shop'),
      onBack: back,
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
    again = () => openShop(back, tab, sel);
    draw(sel ? `row:${sel}` : '');
    return true;
  };

  // Tavern: the same counter; a recruit costs gold and says who joined
  const bar = (back: () => void, sel = '', said = '') => {
    if (!fits()) return false;
    const draw = (focus?: string) => {
      const g = loadGroup();
      sel = rowOf(barPage(0, g, sel), sel);
      win.set(barPage(loadChest().gold, g, sel, said), focus);
    };
    const win = ui.window({
      name: t('Taverna', 'Tavern'),
      onBack: back,
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
    again = () => openBar(back, sel, said);
    draw(sel ? `row:${sel}` : '');
    return true;
  };

  // Party: a member's pages. Hit ids: `who:<member>`, `tab:<page>`, `deploy`, `fire`, `slot:<slot>`, `off` (take the
  // open slot's piece off), `row:<item>` (equip it) and `job:<class>`. Dismiss asks a 2nd press, disarmed when the
  // cursor leaves it
  const party = (back?: () => void, view: PartyView = {}) => {
    if (!fits()) return false;
    let { id, page = 'status', slot = 'main' } = view;
    let armed = false;
    const draw = (focus?: string) => {
      const p = partyPage({ group: loadGroup(), eq: loadEquip(), chest: loadChest() }, { id, page, slot, armed });
      id = p.id;
      win.set(p.page, focus === '' ? `who:${id}` : focus); // it opens on the picked member's row
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
      // left and right turn the pages wherever the cursor is (FFT's paging)
      key: (e) => {
        const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        turn(dir);
      },
      focus: (at) => {
        if (!armed || at === 'fire') return;
        armed = false;
        draw();
      },
      pick: (at) => {
        const [kind, arg] = at.split(':');
        if (kind === 'who' || kind === 'tab' || kind === 'slot') {
          if (kind === 'who') id = arg;
          else if (kind === 'tab') page = arg as typeof page;
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
            armed = false;
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
    again = () => openParty(back, { id, page, slot });
    draw('');
    return true;
  };

  if (on.shop) Object.assign(town3d, { shop, bar });
  if (on.party) town3d.party = party;
  requestAnimationFrame(tick);
}
