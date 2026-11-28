// The battle builder's live map edit as a mode (Fernando, Nov 25: "Pintar com o mouse ao vivo"): M or Debug › Battle
// builder turns it on in a battle Play opened, on a player's turn with nothing moving. The map builder's tool bar shows
// over the battle on the HUD's own 3D layer, and the map builder's own input paints (mapedit/builder-input.ts): a drag
// is one stroke, lit as it grows and applied on release as one edit (live.ts liveStroke); Enter or the pad's A paints at
// the cursor. The command menu, the combat bar, the banner and the hints hide meanwhile; leaving (M, Esc, the pad's Menu,
// the bar's Leave plate, the ✎ screen button or the debug row) gives the battle its input back. The Palette plate opens a list of the
// palette's entries over the help line (Fernando, Nov 25: "Escolher a cor da Paleta ao vivo"), walked by place.
import { PALETTE } from '../../content/map-palette.ts';
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { docFromScenario } from '../../shared/mapedit/doc.ts';
import { liveInput } from '../battle-input.ts';
import { type Act, hintLine, keysText } from '../glyphs.ts';
import { t } from '../i18n.ts';
import { keysShown, onShown } from '../key-hints.ts';
import { keyAction } from '../keyboard.ts';
import { looks3d } from '../looks3d.ts';
import type { Game } from '../main.ts';
import { pickEntry, pickTool } from '../mapedit/builder-actions.ts';
import { type Painter, panel, wireInput } from '../mapedit/builder-input.ts';
import { BuilderUi, type Placed } from '../mapedit/builder-ui.ts';
import { type Cell, liveLayout, pickLayout, placeRows, rowsFit } from '../mapedit/layout.ts';
import { barCells, pages, paintRows } from '../mapedit/panel.ts';
import { tilePictures } from '../mapedit/pic-shots.ts';
import { BAR, type Brush, footprint, type Stroke, strokeMarks, type Tool, wholeOf } from '../mapedit/tools.ts';
import { screenSignal } from '../nav.ts';
import { hidePieces, PIECE_NAMES, type PieceName, pieceHidden } from '../ui-pieces.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import type { Way } from '../ui3d/walk.ts';
import type { Builder3d } from '../window3d/builder3d.ts';
import { liveStroke, liveWhy } from './live.ts';

// the bar's drawing, its own chunk (client CLAUDE.md), asked for as the battle opens so the mode opens drawn
const look = () => import('../window3d/builder3d.ts');
// what the bar covers at the foot, and the menu a click must not reach while the mouse paints
const HIDE: PieceName[] = ['menu', 'bar', 'banner', 'hints'];
// the tool, the brush and the Palette's entry, kept between openings (the wall first: what a live edit tries first)
const kept = { tool: BAR[3].tool('sand'), brush: 1 as Brush, picked: 'sand' };
const PALETTE_SLOT = BAR.findIndex((slot) => slot.id === 'palette');
let mode: LiveMode | null = null;
let home: HTMLElement | null = null; // the battle's host, where the bar's unseen buttons go

// a battle the battle builder opened (entry.ts): M turns the mode on (while on, its own input hears M and leaves)
export function wireLive(g: Game, host: HTMLElement) {
  home = host;
  void look();
  g.hud.setEdit(() => void toggleLive(g));
  addEventListener(
    'keydown',
    (e) => {
      if (mode || e.repeat || document.querySelector('.overlay') || keyAction(e)?.k !== 'live') return;
      e.preventDefault();
      void toggleLive(g);
    },
    { signal: screenSignal() },
  );
}

// on, or off when on; while it cannot open, the battle's effects say why
export async function toggleLive(g: Game) {
  if (mode) return mode.leave();
  const why = liveWhy(g),
    layer = g.hud.layer3d,
    host = home;
  if (why) return looks3d.effects?.announce(t(`Editar o mapa: ${why}.`, `Edit the map: ${why}.`));
  if (!layer || !host) return;
  const { Builder3d } = await look();
  if (!mode && !liveWhy(g)) new LiveMode(g, host, layer, Builder3d);
}

class LiveMode implements Painter {
  tool: Tool = kept.tool;
  brush: Brush = kept.brush;
  picked = kept.picked;
  note = '';
  cursor: Pos;
  hover: Pos | null = null;
  stroke: Stroke | null = null;
  panelWalk = false; // the Palette's list is open: arrows, the d-pad, Enter and A walk and pick in it
  private page = 0; // the list's page (a phone's height pages it)
  private perPage = 2;
  private walk: Placed[] = [];
  readPad?: (now: number, held?: boolean) => void; // builder-input.ts
  readonly ui = new BuilderUi(
    (id) => this.press(id),
    () => {},
  );
  readonly scene;
  private readonly was = PIECE_NAMES.filter(pieceHidden); // a sandbox's hidden pieces, back on leaving
  private readonly ac = new AbortController();
  private readonly screen: Builder3d;

  constructor(
    private readonly g: Game,
    readonly host: HTMLElement,
    private readonly layer: Ui3dLayer,
    Screen: typeof Builder3d,
  ) {
    mode = this;
    this.scene = g.scene;
    this.cursor = wholeOf(g.turn.cursor);
    host.append(this.ui.root);
    // its input is the bar's unseen buttons, hidden with it by the piece's name (layer.ts)
    this.screen = new Screen(layer, this.ui.root);
    this.screen.pics = tilePictures(g.scene);
    hidePieces([...this.was, ...HIDE]);
    const signal = AbortSignal.any([screenSignal(), this.ac.signal]);
    signal.addEventListener('abort', () => this.leave(), { once: true });
    wireInput(this, signal);
    liveInput.on = true;
    liveInput.pad = (now, held) => this.readPad?.(now, held);
    // the size, a finger, a key or a pad change the boxes and what the plates and hints say (as builder.ts)
    const sized = new ResizeObserver(() => {
      layer.fit();
      this.render();
    });
    sized.observe(this.ui.root);
    signal.addEventListener('abort', () => sized.disconnect(), { once: true });
    const again = () => queueMicrotask(() => this.render());
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, again, { signal, capture: true });
    // Tab reaching Leave or a plate: its edge lit once the focus has moved
    for (const ev of ['focusin', 'focusout']) this.ui.root.addEventListener(ev, again, { signal });
    const unhear = onShown(again);
    signal.addEventListener('abort', unhear, { once: true });
    this.note = t('Edição do mapa ligada.', 'Map edit on.');
    this.render();
    this.mark();
  }

  // the battle's map in whole tiles, read again each time: an edit or Restart registers the scenario anew
  get doc() {
    return docFromScenario(SCENARIOS[this.g.battle.state.scenario]);
  }

  applyAt(at: Pos, tool = this.tool) {
    this.paint(tool, footprint(this.doc, at, this.brush));
  }
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (s) this.paint(s.tool, s.cells);
    this.mark();
  }
  // one edit; the battle's update after it lit the turn's marks, so the stroke's go back on
  private paint(tool: Tool, cells: Pos[]) {
    if (!cells.length) return;
    this.note = liveStroke(this.g, tool, cells);
    this.render();
    this.mark();
  }

  mark() {
    const m = strokeMarks(this.doc, this.hover ?? this.cursor, this.brush, this.stroke, this.tool);
    this.scene.setHighlights(m.hl);
    this.scene.setCursor(m.cursor, m.size);
  }

  // the bar's plates, Leave, the Palette list's entries and pages, and the brush; undo has no step here (each edit
  // starts the battle's Undo over)
  press(id: string) {
    if (this.ui.get(id)?.getAttribute('aria-disabled') === 'true') return;
    const [k, i] = id.split(':');
    this.note = '';
    if (k === 'leave') return this.leave();
    if (k === 'bar') {
      // the Palette plate (8, or the pad's X landing on it) opens the list and closes it again; another tool closes it
      const open = Number(i) % BAR.length === PALETTE_SLOT && !this.panelWalk;
      pickTool(this, Number(i));
      if (open) return this.openList();
      if (this.panelWalk) return panel(this, false);
    } else if (k === 'pal') {
      pickEntry(this, i);
      return panel(this, false);
    } else if (k === 'page') this.page = Math.max(0, Math.min(pages(this.perPage) - 1, this.page + Number(i)));
    else if (k === 'brush') this.brush = this.brush === 1 ? 3 : 1;
    else if (k === 'undo' || k === 'redo')
      this.note = t('Cada edição recomeça o Desfazer da batalha.', 'Each edit starts the battle’s Undo over.');
    this.render();
    this.mark();
  }

  // the list opens on the page of the entry picked, with the focus on it
  private openList() {
    this.panelWalk = true;
    this.note = ''; // the help line says what the list wants

    this.render();
    const at = PALETTE.findIndex((e) => e.id === this.picked);
    this.page = Math.max(0, Math.floor(at / Math.max(1, this.perPage)));
    panel(this, true);
  }
  // the d-pad and the arrows in the list: by place over the entries, the page arrows, the bar's plates and Leave
  // (ui3d/walk.ts); opening puts the focus on the entry picked
  walkPanel(way: Way | null) {
    this.render();
    const inside = this.walk.some((p) => this.ui.get(p.cell.id) === document.activeElement);
    if (way && inside) this.ui.walk(this.walk, way);
    else this.ui.get(`pal:${this.picked}`)?.focus();
    this.render();
  }

  render() {
    if (mode !== this) return;
    const { layer } = this,
      page = { w: layer.w, h: layer.h, s: layer.s, inset: layer.inset },
      left = Math.round(this.g.hud.insets().left),
      l = liveLayout(page, left, layer.finger),
      shown = keysShown(),
      cells = barCells({ tool: this.tool, picked: this.picked, shown, finger: layer.finger }),
      // the key that leaves, on its plate (the pad's Menu closes the list first while it is open)
      key = layer.finger || this.panelWalk ? null : keysText(shown === 'keyboard' ? 'live' : 'panel', shown),
      out: Cell = { id: 'leave', text: key ? `${t('Sair', 'Leave')} · ${key}` : t('Sair', 'Leave'), kind: 'button' },
      placed: Placed[] = [...cells.map((cell, i) => ({ cell, box: l.bar[i] })), { cell: out, box: l.leave }];
    let plate = l.note;
    if (this.panelWalk) {
      const pick = pickLayout(page, l, PALETTE.length);
      this.perPage = (rowsFit(pick) - 1) * pick.cols;
      const rows = paintRows({ tool: this.tool, page: this.page, perPage: this.perPage }, pick.cols),
        boxes = placeRows(pick, rows);
      placed.unshift(
        ...rows.flatMap((r, i) => r.cells.flatMap((cell, j) => (boxes[i][j] ? [{ cell, box: boxes[i][j] }] : []))),
      );
      plate = pick.panel;
    }
    this.walk = placed.filter((p) => p.cell.kind !== 'label');
    // the open list reaches the tile line on a tablet (1024x768), and on a phone the screen buttons too: both wrote
    // over it
    const under: PieceName[] = !this.panelWalk ? [] : layer.phone ? ['height', 'tools'] : ['height'];
    hidePieces([...this.was, ...HIDE, ...under]);
    this.scene.setInsets(0, l.bottom, left);
    this.screen.set(
      this.ui.show(
        placed,
        plate,
        { box: l.note, text: this.note || this.help() },
        { box: l.hints, text: layer.finger ? '' : this.hints() },
      ),
    );
  }

  private help() {
    if (this.panelWalk)
      return this.layer.finger
        ? t(
            'Toque num piso para a Paleta; toque na Paleta para fechar.',
            'Tap a floor for the Palette; tap the Palette to close.',
          )
        : t('Escolha o piso que a Paleta pinta.', 'Pick the floor the Palette paints.');
    const brush = this.brush === 3 ? t(' Pincel 3x3.', ' Brush 3x3.') : '';
    return this.layer.finger
      ? t(`Toque ou arraste para pintar.${brush}`, `Tap or drag to paint.${brush}`)
      : t(
          `Esquerdo pinta (arraste), direito põe grama.${brush}`,
          `Left button paints (drag), right one grass.${brush}`,
        );
  }
  // the keys over the bar: M leaves on the keyboard, the pad's Menu (the map builder's panel button) on a pad
  private hints() {
    const shown = keysShown(),
      out = t('sair', 'leave');
    if (this.panelWalk)
      return hintLine(
        shown,
        [
          ['confirm', t('escolher', 'pick')],
          ['cancel', t('fechar a lista', 'close the list')],
        ],
        ' · ',
      );
    return hintLine(
      shown,
      [
        ['confirm', t('pintar no cursor', 'paint at the cursor')],
        ['erase', t('grama', 'grass')],
        ['brush', t('pincel', 'brush')],
        ['top', t('vista de cima', 'top view')],
        ['live', out],
        ...(shown === 'keyboard' ? [] : [['panel', out] as [Act, string]]),
      ],
      ' · ',
    );
  }

  leave() {
    if (mode !== this) return;
    mode = null;
    // the page-wide state first: the next screen must find the battle's input and pieces back
    Object.assign(kept, { tool: this.tool, brush: this.brush, picked: this.picked });
    liveInput.on = false;
    liveInput.pad = undefined;
    hidePieces(this.was);
    this.ui.root.remove();
    // a screen leaving takes the layer and the scene with it
    if (screenSignal().aborted) return;
    this.ac.abort();
    this.screen.dispose();
    // the turn's marks, cursor and the camera's insets back (Game.update)
    this.g.update(this.g.turn.ui);
  }
}
