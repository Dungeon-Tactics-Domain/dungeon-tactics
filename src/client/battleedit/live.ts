// Editing the map mid-battle (grill, Nov 25; Fernando: "so pode enquanto nao tiver movimento sendo feito... enquanto
// tiver no turno do jogador"): the map builder's tool on the tiles under the battle's cursor, then the board drawn again
// in place (BattleScene.setGrid, then sync for the units) and the battle going on from the same turn. Whoever stood
// where nobody may stop now goes to the nearest free tile (shared editLive); the battle's Undo starts over.
import { Battle } from '../../shared/battle/battle.ts';
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { docFromScenario } from '../../shared/mapedit/doc.ts';
import { canEditLive, editLive } from '../../shared/mapedit/live.ts';
import { startScreen } from '../command.ts';
import { t, unitName } from '../i18n.ts';
import { freshUi } from '../interaction.ts';
import { looks3d } from '../looks3d.ts';
import type { Game } from '../main.ts';
import { BAR, type Brush, footprint, strokeStep, wholeOf } from '../mapedit/tools.ts';
import { readDraft, writeDraft } from './play.ts';

// why the map cannot be edited now; null when it can
export function liveWhy(g: Game): string | null {
  const s = g.battle.state;
  return canEditLive(s, SCENARIOS[s.scenario], g.busy) ? null : t('espere a sua vez', 'wait for your turn');
}

// The tool (the map builder's bar, by index) on the brush's tiles around the cursor; what happened, as a line of text
export function liveEdit(g: Game, tool: number, brush: Brush): string {
  const why = liveWhy(g);
  if (why) return why;
  const state = g.battle.state,
    sc = SCENARIOS[state.scenario], // the very scenario the battle was built from (Restart reads it too)
    map = docFromScenario(sc),
    at = wholeOf(g.turn.cursor),
    next = strokeStep(map, BAR[tool].tool('sand'), footprint(map, at, brush), new Set());
  if (JSON.stringify(next) === JSON.stringify(map)) return t('Nada mudou nessa casa.', 'Nothing changed on that tile.');
  const res = editLive(state, sc, next);
  if (!res)
    return t('Alguém ficaria sem casa livre: nada mudou.', 'Someone would have no free tile left: nothing changed.');
  // the battle's own scenario object, the one Restart reads, takes the edited map and stays the registered one, so the
  // next edit starts from it too (editLive registered a copy)
  sc.grid = res.grid;
  SCENARIOS[sc.id] = sc;
  g.battle = new Battle(res.grid, res.state);
  g.scene.setGrid(res.grid);
  g.scene.sync(res.state);
  // a reload opens the draft: it gets the edited map and keeps every unit, so each own sheet the save names is
  // registered again (a unit whose start is now a wall still starts there: Restart is a known limit)
  const draft = readDraft();
  if (draft) writeDraft({ ...draft, doc: { ...draft.doc, map: next } });
  g.save();
  g.turn.screen = startScreen(g.battle);
  g.update(freshUi(g.battle));
  const moved = res.moved.map((m) => unitName(res.state.units.find((u) => u.id === m.unit)?.def ?? '')).join(', ');
  const text = moved
    ? t(
        `Mapa editado; foram para a casa livre mais perto: ${moved}.`,
        `Map edited; moved to the nearest free tile: ${moved}.`,
      )
    : t('Mapa editado. O Desfazer recomeça daqui.', 'Map edited. Undo starts again from here.');
  looks3d.effects?.announce(text);
  return text;
}
