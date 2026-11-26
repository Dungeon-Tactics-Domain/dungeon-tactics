// What each control of the map builder does (Nov 25, spec "Screen"): the tabs, the bar's tools, the palette's pages,
// Relief's auto-ramps, Map's size and edges, File's slots, export, import, Play and leaving, and the foot's brush,
// undo, redo and camera. Each edit goes through Builder.commit: one undo step.

import { PALETTE } from '../../content/map-palette.ts';
import { blankDoc, type MapDoc } from '../../shared/mapedit/doc.ts';
import { autoRamps } from '../../shared/mapedit/edit.ts';
import { toJson, toTs } from '../../shared/mapedit/export.ts';
import { redo, undo } from '../../shared/mapedit/history.ts';
import { parseMapDoc } from '../../shared/mapedit/parse.ts';
import { type Edge, growEdge, resize } from '../../shared/mapedit/size.ts';
import { battleOnMap } from '../battleedit/play.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import { navigate } from '../nav.ts';
import { store } from '../store.ts';
import type { Builder } from './builder.ts';
import type { Painter } from './builder-input.ts';
import { pages, type Tab } from './panel.ts';
import { play } from './play-map.ts';
import { SLOTS_KEY, withSlot } from './slots.ts';
import { BAR, unknownLook } from './tools.ts';

export function pickTool(b: Pick<Painter, 'tool' | 'picked' | 'note'>, i: number) {
  const slot = BAR[(i + BAR.length) % BAR.length];
  b.tool = slot.tool(b.picked);
  b.note = t(`Ferramenta: ${t(...slot.name)}.`, `Tool: ${t(...slot.name)}.`);
}

// a palette entry (the Paint panel's row, the live edit's list): the Palette tool paints it from now on
export function pickEntry(b: Pick<Painter, 'tool' | 'picked' | 'note'>, id: string) {
  b.picked = id;
  b.tool = { k: 'paint', entry: id };
  const e = PALETTE.find((p) => p.id === id);
  if (e)
    b.note = t(
      `Pinta: ${t(...e.name)} (a Paleta da barra volta a ela).`,
      `Paints: ${t(...e.name)} (the bar’s Palette brings it back).`,
    );
}

export function press(b: Builder, id: string) {
  const [k, a = '', c = ''] = id.split(':'),
    d = b.doc;
  b.note = '';
  if (k === 'tab') b.tab = a as Tab;
  else if (k === 'bar') pickTool(b, Number(a));
  else if (k === 'pal') pickEntry(b, a);
  else if (k === 'page') b.page = Math.max(0, Math.min(pages(b.perPage) - 1, b.page + Number(a)));
  else if (k === 'auto')
    b.note = b.commit(autoRamps(d))
      ? t(
          'Cada degrau de 1 nível virou rampa; apague as que não quer com a Rampa.',
          'Every one-level step became a ramp; erase the unwanted ones with the Ramp.',
        )
      : t('Nenhum degrau de 1 nível sem rampa.', 'No one-level step without a ramp.');
  else if (k === 'w') b.commit(resize(d, d.width + Number(a), d.height));
  else if (k === 'h') b.commit(resize(d, d.width, d.height + Number(a)));
  else if (k === 'edge') b.commit(growEdge(d, a as Edge, Number(c) as 1 | -1));
  else if (k === 'clear') b.commit({ ...blankDoc(d.width, d.height, d.id, d.name), en: d.en });
  else if (k === 'save') save(b);
  else if (k === 'slot') {
    const doc = b.slots.find((s) => s.name === a);
    if (doc && b.commit(doc)) b.note = t(`Aberto: ${doc.name}.`, `Opened: ${doc.en}.`);
  } else if (k === 'json' || k === 'ts') exportMap(b, k);
  else if (k === 'import') importMap(b);
  else if (k === 'play') play(d);
  else if (k === 'battle') battleOnMap(d);
  else if (k === 'leave') navigate('');
  else foot(b, k);
}

function foot(b: Builder, k: string) {
  const s = b.scene;
  if (k === 'brush') b.brush = b.brush === 1 ? 3 : 1;
  else if (k === 'undo') b.show(undo(b.hist));
  else if (k === 'redo') b.show(redo(b.hist));
  else if (k === 'rotL') s.rotate(-1);
  else if (k === 'rotR') s.rotate(1);
  else if (k === 'top') void s.top.toggle();
  else if (k === 'zoomOut') s.zoom(1.15);
  else if (k === 'zoomIn') s.zoom(1 / 1.15);
}

function save(b: Builder) {
  b.slots = withSlot(b.slots, b.doc);
  store.set(SLOTS_KEY, JSON.stringify(b.slots));
  b.note = store.saved(SLOTS_KEY)
    ? t(`Salvo neste navegador como “${b.doc.name}”.`, `Saved in this browser as “${b.doc.name}”.`)
    : t(
        'O navegador não guardou: o espaço está cheio ou bloqueado.',
        'The browser did not keep it: storage is full or blocked.',
      );
}

// JSON or .ts (spec): a download and the clipboard, and the text in the paste box, where it can be read and copied
function exportMap(b: Builder, kind: 'json' | 'ts') {
  const text = kind === 'json' ? toJson(b.doc) : toTs(b.doc),
    name = kind === 'json' ? `${b.doc.id}.json` : `${b.doc.id.replace(/_/g, '-')}.ts`;
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/plain' }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const box = b.ui.get('paste') as HTMLTextAreaElement | undefined;
  if (box) box.value = text;
  b.note = t(`Baixado: ${name}.`, `Downloaded: ${name}.`);
  // the clipboard can refuse (no focus, a headless browser): the download and the paste box still hold the text
  navigator.clipboard?.writeText(text).then(
    () => tell(b, t(`Baixado e copiado: ${name}.`, `Downloaded and copied: ${name}.`)),
    () =>
      tell(
        b,
        t(
          `Baixado: ${name}. A área de transferência recusou a cópia.`,
          `Downloaded: ${name}. The clipboard refused the copy.`,
        ),
      ),
  );
}

function importMap(b: Builder) {
  const box = b.ui.get('paste') as HTMLTextAreaElement | undefined;
  let raw: unknown = null;
  try {
    raw = JSON.parse(box?.value ?? '');
  } catch {
    raw = null;
  }
  const doc: MapDoc | null = parseMapDoc(raw);
  if (!doc) {
    b.note = t('Não é um mapa do construtor: cole o JSON exportado.', 'Not a builder map: paste an exported JSON.');
    return;
  }
  // a look the game cannot draw would leave the scene unbuilt: refused here, at the paste
  const odd = unknownLook(doc);
  if (odd) {
    b.note = t(`Um piso que o jogo não desenha: "${odd}".`, `A look the game does not draw: "${odd}".`);
    return;
  }
  b.commit(doc);
  b.note = t(
    `Importado: ${doc.name} (${doc.width}x${doc.height}).`,
    `Imported: ${doc.en} (${doc.width}x${doc.height}).`,
  );
}

function tell(b: Builder, note: string) {
  b.note = note;
  b.render();
}
