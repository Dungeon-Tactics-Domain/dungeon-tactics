// The map builder's screen (Nov 25, docs/game-design/map-builder.md): a page of its own (?mapedit, entry.ts) that shows
// the map being edited on the battle's scene, with the tool bar and the side panel over it (layout A). It holds the
// document and its history; each finished edit redraws the board in place on the new map (BattleScene.setGrid), so the
// view does not move and the edit shows in a frame. Input is builder-input.ts, the panel's buttons builder-actions.ts.
import { halve } from '../../shared/battle/half.ts';
import { initialState } from '../../shared/battle/scenarios.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { blankDoc, clamp, type MapDoc } from '../../shared/mapedit/doc.ts';
import { type History, record, startHistory } from '../../shared/mapedit/history.ts';
import { docToScenario } from '../../shared/mapedit/play.ts';
import { hintLine } from '../glyphs.ts';
import { loadBuilderSkin } from '../hud-skin.ts';
import { t } from '../i18n.ts';
import { keysShown, onShown } from '../key-hints.ts';
import { onLeave, screenSignal } from '../nav.ts';
import { no3d } from '../no3d.ts';
import { type Cover, whenReady } from '../ready-gate.ts';
import { BattleScene } from '../scene.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import { press } from './builder-actions.ts';
import { wireInput } from './builder-input.ts';
import { BuilderUi, type Placed } from './builder-ui.ts';
import { builderLayout, placeRows, rowsFit } from './layout.ts';
import { barCells, footCells, type PanelState, panelRows, type Tab, tabCells } from './panel.ts';
import { tilePictures } from './pic-shots.ts';
import { paletteGrid } from './pics.ts';
import { readDraft, writeDraft } from './play-map.ts';
import { idOf, parseSlots, SLOTS_KEY } from './slots.ts';
import { BAR, type Brush, footprint, heroCorner, type Stroke, strokeMarks, strokeStep, type Tool } from './tools.ts';

type Look = NonNullable<ReturnType<Awaited<ReturnType<typeof loadBuilderSkin>>>>;

// the map drawn as the battle draws it: halved (every battle is, game/boot.ts), with nobody on it
const gridOf = (doc: MapDoc) => halve(docToScenario(doc)).grid;
// with every palette entry's pieces loaded, so no edit waits for a download
function sceneOf(host: HTMLElement, doc: MapDoc) {
  const sc = halve(docToScenario(doc));
  return BattleScene.create(host, sc.grid, initialState(sc, 0), [], paletteGrid());
}

export async function bootBuilder(host: HTMLElement, cover: Cover, stale: () => boolean) {
  setTrack(null);
  const doc = readDraft() ?? blankDoc(12, 12);
  await whenReady(cover, [sceneOf(host, doc), loadBuilderSkin()], ([scene, skin]) => {
    if (stale()) return scene.dispose();
    new Builder(host, doc, scene, skin);
  });
}

export class Builder {
  hist: History<MapDoc>;
  picked = 'sand'; // the Paint panel's entry, the bar's Palette tool
  tool: Tool = BAR[0].tool(this.picked);
  brush: Brush = 1;
  tab: Tab = 'paint';
  page = 0;
  perPage = 2;
  cursor: Pos;
  hover: Pos | null = null; // the mouse's tile
  stroke: Stroke | null = null; // a drag: applied once, at its end (one undo step)
  note = ''; // the help line's message after an action; empty shows the controls
  slots: MapDoc[];
  panelWalk = false; // the pad walks the panel's controls instead of the map's cursor
  readonly ui: BuilderUi;
  private readonly look: Look | undefined;
  private walk: Placed[] = [];
  private redraws = 0; // the host's data-redraws, read by the timing script (docs/game-design/map-builder.md)
  private readonly gone = screenSignal();

  constructor(
    readonly host: HTMLElement,
    doc: MapDoc,
    readonly scene: BattleScene,
    skin: Awaited<ReturnType<typeof loadBuilderSkin>>,
  ) {
    this.hist = startHistory(doc);
    this.cursor = { x: doc.width >> 1, y: doc.height >> 1 };
    this.slots = parseSlots(store.json(SLOTS_KEY));
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
    this.look.screen.pics = tilePictures(scene);
    const sized = new ResizeObserver(() => {
      layer.fit();
      this.render();
    });
    sized.observe(this.ui.root);
    onLeave(() => sized.disconnect());
    for (const ev of ['focusin', 'focusout'])
      this.ui.root.addEventListener(ev, () => queueMicrotask(() => this.render()));
    wireInput(this);
    // a finger, a key or a pad changes what the buttons and the hints say (key-hints.ts, ui3d/layer.ts finger)
    const again = () => queueMicrotask(() => this.render());
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, again, { signal: this.gone, capture: true });
    const unhear = onShown(again);
    onLeave(() => void unhear());
    // no battle clock here: the layer ticks on the page's frames and draws only while something moves
    const tick = (now: number) => {
      if (this.gone.aborted) return;
      layer.frame(now);
      this.readPad?.(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    this.render();
    this.mark();
  }
  readPad?: (now: number) => void; // builder-input.ts

  get doc() {
    return this.hist.present;
  }

  private drop() {
    this.scene.dispose();
    this.look?.layer.dispose();
    this.ui.root.remove();
  }

  // A finished edit: one undo step, the draft saved (a reload or Play reads it) and the scene drawn again; false when
  // nothing changed
  commit(next: MapDoc): boolean {
    const h = record(this.hist, next);
    if (h === this.hist) return false;
    this.show(h);
    return true;
  }
  // a history step taken (an edit, undo or redo)
  show(h: History<MapDoc>) {
    this.hist = h;
    const d = this.doc;
    this.cursor = { x: clamp(this.cursor.x, 0, d.width - 1), y: clamp(this.cursor.y, 0, d.height - 1) };
    writeDraft(d);
    this.redraw();
    this.render();
  }

  // the tool on the brush's tiles around `at` (Enter, a tap, the pad), one undo step
  applyAt(at: Pos, tool = this.tool) {
    this.commit(strokeStep(this.doc, tool, footprint(this.doc, at, this.brush), new Set()));
  }
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (s) this.commit(strokeStep(this.doc, s.tool, s.cells, new Set()));
    this.mark();
  }

  // The board drawn again on the edited map, in place; the marks are built again with it
  private redraw() {
    try {
      this.scene.setGrid(gridOf(this.doc));
      this.mark();
      this.host.dataset.redraws = String(++this.redraws);
    } catch (err) {
      console.error(err);
      this.note = t(
        'Este mapa não pôde ser desenhado: desfaça a última mudança.',
        'This map could not be drawn: undo the last change.',
      );
    }
  }

  // the tiles about to change, lit in the tool's colour (spec), and the cursor over the brush
  mark() {
    const m = strokeMarks(this.doc, this.hover ?? this.cursor, this.brush, this.stroke, this.tool);
    this.scene.setHighlights(m.hl);
    this.scene.setCursor(m.cursor, m.size);
  }

  private panelState(): PanelState {
    const h = this.hist;
    return {
      tab: this.tab,
      doc: this.doc,
      tool: this.tool,
      picked: this.picked,
      page: this.page,
      perPage: this.perPage,
      slots: this.slots.map((s) => s.name),
      playWhy: heroCorner(this.doc) ? null : t('nenhuma casa onde ficar de pé', 'no tile to stand on'),
      canUndo: h.past.length > 0,
      canRedo: h.future.length > 0,
      brush: this.brush,
      shown: keysShown(),
      finger: !!this.look?.layer.finger,
    };
  }

  // the keys over the bar (the bar's own keys are on its buttons)
  private hints() {
    return hintLine(
      keysShown(),
      [
        ['confirm', t('pintar no cursor', 'paint at the cursor')],
        ['erase', t('grama no cursor', 'grass at the cursor')],
        ['brush', t('pincel', 'brush')],
        ['editUndo', t('desfazer', 'undo')],
        ['redo', t('refazer', 'redo')],
        ['top', t('vista de cima', 'top view')],
        ['panel', t('painel', 'panel')],
      ],
      ' · ',
    );
  }
  // the help line until an action leaves its message there
  private help() {
    if (this.look?.layer.finger)
      return t(
        'Toque ou arraste para pintar; dois dedos movem e aproximam o mapa.',
        'Tap or drag to paint; two fingers move and zoom the map.',
      );
    return t(
      'Botão esquerdo pinta (arraste para várias casas); o direito volta à grama; o do meio move o mapa.',
      'The left button paints (drag for several tiles); the right one brings grass back; the middle one moves the map.',
    );
  }

  // Lays out and draws the bar and the panel for the page and the state now
  render() {
    if (!this.look) return;
    const { layer, screen } = this.look,
      l = builderLayout({ w: layer.w, h: layer.h, s: layer.s, inset: layer.inset });
    this.scene.setInsets(l.insets.top, l.insets.bottom, l.insets.left, l.insets.right);
    this.perPage = (rowsFit(l) - 1) * 2;
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

  // the pad in the panel: from the control in focus to the nearest one that way (ui3d/walk.ts)
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
    // a name field: the map's name as it is typed, kept off the undo steps; an empty one keeps the last name
    if ((id === 'name' || id === 'en') && name && !/\p{Cc}/u.test(name)) {
      const d = this.doc,
        next = id === 'name' ? { ...d, name, id: idOf(name) } : { ...d, en: name };
      this.hist = { ...this.hist, present: next };
      writeDraft(next);
    }
    this.render();
  }
}
