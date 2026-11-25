// The battle builder's screen (grill, Nov 25; docs/game-design/map-builder.md "Battle builder"): a page of its own
// (?battleedit, entry.ts) that shows the battle being built on the battle's scene, with the map builder's tool bar,
// side panel and 3D look (mapedit/layout.ts, builder-ui.ts, window3d/builder3d.ts). It holds the battle document and
// its history; each edit draws the units again in place (BattleScene.sync), and another map opens the page again so
// the scene loads its pieces. Input is input.ts, the panel's buttons actions.ts.
import { halve } from '../../shared/battle/half.ts';
import { initialState } from '../../shared/battle/scenarios.ts';
import type { Pos, Team } from '../../shared/battle/types.ts';
import { type BattleDoc, blankBattle, sizeOf, spawnsOf } from '../../shared/mapedit/battle.ts';
import { blankDoc, clamp } from '../../shared/mapedit/doc.ts';
import { type History, record, startHistory } from '../../shared/mapedit/history.ts';
import { docToScenario } from '../../shared/mapedit/play.ts';
import { sound } from '../../shared/mapedit/setup.ts';
import { square } from '../../shared/mapedit/units.ts';
import { hintLine } from '../glyphs.ts';
import { loadBuilderSkin } from '../hud-skin.ts';
import { t } from '../i18n.ts';
import { keysShown, onShown } from '../key-hints.ts';
import { BuilderUi, type Placed } from '../mapedit/builder-ui.ts';
import { builderLayout, placeRows, rowsFit } from '../mapedit/layout.ts';
import { paletteGrid } from '../mapedit/pics.ts';
import { SLOTS_KEY as MAP_SLOTS } from '../mapedit/slots.ts';
import { halfCells } from '../mapedit/tools.ts';
import { navigate, onLeave, screenSignal } from '../nav.ts';
import { no3d } from '../no3d.ts';
import { type Cover, whenReady } from '../ready-gate.ts';
import { BattleScene } from '../scene.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import { press } from './actions.ts';
import { wireInput } from './input.ts';
import { type BattlePanel, barCells, CLASSES, footCells, panelRows, type Tab, type Tool, tabCells } from './panel.ts';
import { BUILDER, playWhy, readDraft, readSlots, writeDraft } from './play.ts';
import { missingAbilities } from './sheet-edit.ts';
import type { Slot } from './slots.ts';
import { mapSources, type Source } from './sources.ts';

type Look = NonNullable<ReturnType<Awaited<ReturnType<typeof loadBuilderSkin>>>>;

// the battle drawn as it would start, halved like every battle, each unit as its class (its own sheet shows on the panel)
const stateOf = (doc: BattleDoc) => {
  const sc = halve(docToScenario(doc.map, spawnsOf(doc)));
  return { sc, state: initialState(sc, 0) };
};

export async function bootBattleBuilder(host: HTMLElement, cover: Cover, stale: () => boolean) {
  setTrack(null);
  const slot = readDraft() ?? { name: t('Nova batalha', 'New battle'), doc: blankBattle(blankDoc(12, 12)) };
  const { sc, state } = stateOf(slot.doc);
  // every class's model and every palette entry's pieces load up front, so placing a unit never waits for a download
  const scene = BattleScene.create(host, sc.grid, state, CLASSES, paletteGrid());
  await whenReady(cover, [scene, loadBuilderSkin()], ([s, skin]) => {
    if (stale()) return s.dispose();
    new BattleBuilder(host, slot, s, skin);
  });
}

export class BattleBuilder {
  hist: History<BattleDoc>;
  name: string;
  tool: Tool = 'hero';
  cls = CLASSES[0];
  tab: Tab = 'units';
  sub = 0;
  page = 0;
  perPage = 2;
  cursor: Pos;
  hover: Pos | null = null;
  sel: string | null = null; // the unit whose sheet the panel shows
  note = '';
  slots: Slot[];
  sources: Source[];
  source: string;
  seed = 1;
  depth = 1;
  bagSide: Team = 'hero';
  adding: string | null = null;
  panelWalk = false;
  readonly ui: BuilderUi;
  private readonly look: Look | undefined;
  private walk: Placed[] = [];
  private readonly gone = screenSignal();

  constructor(
    readonly host: HTMLElement,
    slot: Slot,
    readonly scene: BattleScene,
    skin: Awaited<ReturnType<typeof loadBuilderSkin>>,
  ) {
    this.hist = startHistory(slot.doc);
    this.name = slot.name;
    this.cursor = { x: slot.doc.map.width >> 1, y: slot.doc.map.height >> 1 };
    this.slots = readSlots();
    this.sources = mapSources(store.json(MAP_SLOTS));
    this.source = this.sources.find((s) => s.map.id === slot.doc.map.id)?.key ?? this.sources[0].key;
    this.ui = new BuilderUi(
      (id) => this.press(id),
      (id, text) => this.typed(id, text),
    );
    host.append(this.ui.root);
    onLeave(() => this.drop());
    this.look = skin(this.ui.root, () => {
      this.drop();
      no3d();
    });
    if (!this.look) {
      no3d();
      return;
    }
    const { layer } = this.look;
    const sized = new ResizeObserver(() => {
      layer.fit();
      this.render();
    });
    sized.observe(this.ui.root);
    onLeave(() => sized.disconnect());
    for (const ev of ['focusin', 'focusout'])
      this.ui.root.addEventListener(ev, () => queueMicrotask(() => this.render()));
    wireInput(this);
    const again = () => queueMicrotask(() => this.render());
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, again, { signal: this.gone, capture: true });
    const unhear = onShown(again);
    onLeave(() => void unhear());
    const tick = (now: number) => {
      if (this.gone.aborted) return;
      layer.frame(now);
      this.readPad?.(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    scene.resetView(); // the whole map, so every unit placed is in view (the battle's camera opens close on one unit)
    this.render();
    this.mark();
  }
  readPad?: (now: number) => void; // input.ts

  get doc() {
    return this.hist.present;
  }
  get unit() {
    return this.doc.units.find((u) => u.id === this.sel) ?? null;
  }

  private drop() {
    this.scene.dispose();
    this.look?.layer.dispose();
    this.ui.root.remove();
  }

  // An edit: one undo step and the draft saved; refused (with a word why) when a reload could not read it back
  commit(next: BattleDoc): boolean {
    if (next === this.doc) return false;
    if (!sound(next)) {
      this.note = t('Essa mudança não poderia ser salva.', 'That change could not be saved.');
      return false;
    }
    this.show(record(this.hist, next));
    return true;
  }
  // a history step taken (an edit, undo or redo); another map opens the page again, so its pieces load
  show(h: History<BattleDoc>) {
    const was = this.doc;
    this.hist = h;
    const d = this.doc;
    writeDraft({ name: this.name, doc: d });
    if (JSON.stringify(was.map) !== JSON.stringify(d.map)) return navigate(BUILDER);
    this.cursor = { x: clamp(this.cursor.x, 0, d.map.width - 1), y: clamp(this.cursor.y, 0, d.map.height - 1) };
    if (!this.unit) this.sel = null;
    this.redraw(was);
    this.render();
    this.mark();
  }

  // The units drawn again where the document says; one whose class changed under the same id is made again
  private redraw(was: BattleDoc) {
    const { state } = stateOf(this.doc);
    const before = new Map(was.units.map((u) => [u.id, u.def]));
    const kept = state.units.filter(
      (u) => !before.has(u.id) || before.get(u.id) === this.doc.units.find((d) => d.id === u.id)?.def,
    );
    if (kept.length !== state.units.length) this.scene.sync({ ...state, units: kept }, false);
    this.scene.sync(state, false);
  }

  // the picked unit lit, and the cursor over the tile (or the unit) it is on
  mark() {
    const at = this.hover ?? this.cursor,
      u = this.unit;
    this.scene.setHighlights({
      tiles: u
        ? square(u, sizeOf(u.def))
            .flatMap(halfCells)
            .map((pos) => ({ pos, kind: 'actor' as const }))
        : [],
      path: null,
      preview: null,
    });
    this.scene.setCursor(halfCells(at)[0], 2);
  }

  private panelState(): BattlePanel {
    const h = this.hist,
      u = this.unit;
    if (u && (!this.adding || !missingAbilities(u).includes(this.adding))) this.adding = missingAbilities(u)[0] ?? null;
    return {
      tab: this.tab,
      sub: this.sub,
      doc: this.doc,
      unit: u,
      cls: this.cls,
      tool: this.tool,
      page: this.page,
      perPage: this.perPage,
      name: this.name,
      slots: this.slots.map((s) => s.name),
      playWhy: playWhy(this.doc),
      canUndo: h.past.length > 0,
      canRedo: h.future.length > 0,
      shown: keysShown(),
      finger: !!this.look?.layer.finger,
      source: this.sources.find((s) => s.key === this.source)?.label ?? '',
      seed: this.seed,
      depth: this.depth,
      bagSide: this.bagSide,
      adding: this.adding,
    };
  }

  private hints() {
    return hintLine(
      keysShown(),
      [
        ['confirm', t('usar a ferramenta', 'use the tool')],
        ['erase', t('remover', 'remove')],
        ['brush', t('próxima classe', 'next class')],
        ['editUndo', t('desfazer', 'undo')],
        ['redo', t('refazer', 'redo')],
        ['top', t('vista de cima', 'top view')],
        ['panel', t('painel', 'panel')],
      ],
      ' · ',
    );
  }
  private help() {
    if (this.look?.layer.finger)
      return t(
        'Toque numa casa para usar a ferramenta; dois dedos movem e aproximam o mapa.',
        'Tap a tile to use the tool; two fingers move and zoom the map.',
      );
    return t(
      'Botão esquerdo usa a ferramenta; o direito remove a unidade; o do meio move o mapa.',
      'The left button uses the tool; the right one removes the unit; the middle one moves the map.',
    );
  }

  // Lays out and draws the bar and the panel for the page and the state now
  render() {
    if (!this.look) return;
    const { layer, screen } = this.look,
      l = builderLayout({ w: layer.w, h: layer.h, s: layer.s, inset: layer.inset });
    this.scene.setInsets(l.insets.top, l.insets.bottom, l.insets.left, l.insets.right);
    this.perPage = (rowsFit(l) - 2) * 2;
    const st = this.panelState(),
      rows = panelRows(st),
      boxes = placeRows(l, rows),
      placed: Placed[] = [
        ...tabCells(this.tab).map((cell, i) => ({ cell, box: l.tabs[i] })),
        ...rows.flatMap((r, i) => r.cells.flatMap((cell, j) => (boxes[i][j] ? [{ cell, box: boxes[i][j] }] : []))),
        ...footCells(st).flatMap((row, i) => row.map((cell, j) => ({ cell, box: l.foot[i][j] }))),
        ...barCells(st).map((cell, i) => ({ cell, box: l.bar[i] })),
      ];
    this.walk = placed.filter((p) => p.cell.kind !== 'label');
    screen.set(
      this.ui.show(
        placed,
        l.panel,
        { box: l.note, text: this.note || this.help() },
        { box: l.hints, text: layer.finger ? '' : this.hints() },
      ),
    );
  }

  walkPanel(way: Way | null) {
    const at = this.walk.findIndex((p) => this.ui.get(p.cell.id) === document.activeElement);
    const next =
      way && at >= 0
        ? neighbour(
            this.walk.map((p) => p.box),
            at,
            way,
          )
        : Math.max(0, at);
    this.ui.get(this.walk[next]?.cell.id ?? '')?.focus();
    this.render();
  }

  press(id: string) {
    if (this.ui.get(id)?.getAttribute('aria-disabled') === 'true') return;
    press(this, id);
    this.render();
    this.mark();
  }

  private typed(id: string, text: string) {
    const name = text.trim();
    // the slot's name as it is typed, kept off the undo steps; an empty one keeps the last name
    if (id === 'name' && name && !/\p{Cc}/u.test(name)) {
      this.name = name.slice(0, 40);
      writeDraft({ name: this.name, doc: this.doc });
    } else if (id === 'uname') press(this, `uname:${text}`);
    this.render();
  }
}
