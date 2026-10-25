// O que o toque faz na batalha, sem DOM nem Three (testável): modo da barra, casa escolhida esperando o Confirmar e
// unidade em inspeção. A cena e o HUD só desenham o que `highlights` devolve.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Preview } from '../shared/battle/combat.ts';
import { dist, posKey, samePos } from '../shared/battle/grid.ts';
import { footprint, inAbilityRange, lineOfSight, nearestTile, pathTo, reachable, unitAt } from '../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Mode = { k: 'move' } | { k: 'ability'; id: string } | { k: 'idle' };
export interface Ui {
  mode: Mode;
  pending: Pos | null; // casa escolhida; só vira ação no Confirmar (spec: 2º toque escolhe, botão executa)
  inspect: string | null; // unidade tocada para ver vida e ameaça
  invalid: boolean; // o último toque caiu numa casa que não serve: o cartão avisa em vez de ficar mudo
}
export type TileKind = 'actor' | 'move' | 'range' | 'blocked' | 'threat' | 'area' | 'target';
export interface Highlights {
  tiles: { pos: Pos; kind: TileKind }[];
  path: Pos[] | null;
  preview: Preview | null;
}

const selfCentered = (id: string) => ABILITIES[id].range[1] === 0;

// alguma casa com unidade aceita a habilidade daqui e ela pega quem deve (inimigo, ou aliado na cura): uma área
// que só pegaria o aliado ao lado não conta como alvo
function hasTarget(b: Battle, id: string): boolean {
  const heal = ABILITIES[id].heal[1] > 0;
  // qualquer casa da unidade (a grande ocupa 4; só uma delas pode estar no alcance)
  return b.state.units.some((u) => footprint(u).some((p) => b.preview(id, p).targets.some((tg) => {
    const hit = b.state.units.find((x) => x.id === tg.unit)!;
    return heal === (hit.team === b.actor.team);
  })));
}

// sem andar ainda: Mover; já andou: a primeira habilidade que tem alvo daqui (sem alvo, nenhuma: escolher a Facada
// longe de todo mundo só pedia um toque impossível)
export function defaultMode(b: Battle): Mode {
  if (b.over) return { k: 'idle' };
  if (b.reach().size && !b.state.turn.moved) return { k: 'move' }; // já andou: o padrão é agir (o resto do movimento fica para depois)
  const id = !b.state.turn.usedAbility && UNIT_DEFS[b.actor.def].abilities.find((a) => hasTarget(b, a));
  return id ? { k: 'ability', id } : { k: 'idle' };
}

const allowed = (b: Battle, m: Mode) =>
  m.k === 'idle' || (m.k === 'move' ? b.reach().size > 0 : !b.state.turn.usedAbility && UNIT_DEFS[b.actor.def].abilities.includes(m.id));

// habilidade centrada em quem usa já nasce com o alvo marcado: não há casa para escolher
const withMode = (b: Battle, mode: Mode): Ui => ({ mode, pending: mode.k === 'ability' && selfCentered(mode.id) ? b.actor.pos : null, inspect: null, invalid: false });

export const freshUi = (b: Battle): Ui => withMode(b, defaultMode(b));
export const selectMode = (b: Battle, ui: Ui, mode: Mode): Ui => (allowed(b, mode) ? withMode(b, mode) : ui);

export function tapTile(b: Battle, ui: Ui, pos: Pos): Ui {
  const other = unitAt(b.state, pos);
  const mode = ui.mode;
  if (mode.k === 'move' && b.reach().has(posKey(pos))) return { ...ui, pending: pos, inspect: null, invalid: false };
  if (mode.k === 'ability' && !selfCentered(mode.id) && b.preview(mode.id, pos).ok) return { ...ui, pending: pos, inspect: null, invalid: false };
  if (other && other.id !== b.actor.id) return { ...withMode(b, mode), inspect: other.id };
  // tocar no próprio herói limpa a escolha; casa vazia que não serve também, mas avisa
  return { ...withMode(b, mode), invalid: !other && mode.k !== 'idle' };
}

// Cursor do teclado: passar por cima já mostra a prévia (caminho ou % de acerto), como no FFT; Enter executa.
// Casa que não serve só limpa a escolha: aviso a cada passo do cursor seria barulho.
export const hoverTile = (b: Battle, ui: Ui, pos: Pos): Ui => ({ ...tapTile(b, ui, pos), invalid: false });

// Esc: primeiro solta a casa marcada e a inspeção; de novo, volta da habilidade para Mover (se ainda não andou)
export function cancel(b: Battle, ui: Ui): Ui {
  if (ui.pending || ui.inspect) return { ...withMode(b, ui.mode), pending: null };
  if (ui.mode.k === 'ability' && !b.state.turn.moved) return withMode(b, { k: 'move' });
  return ui;
}

export function confirm(b: Battle, ui: Ui): { events: BattleEvent[]; ui: Ui } {
  if (!ui.pending || ui.mode.k === 'idle') return { events: [], ui };
  const events = ui.mode.k === 'move' ? b.move(ui.pending) : b.act(ui.mode.id, ui.pending);
  // quem anda pode cair no contra-ataque (13/11): sem ator, o Ui fica como estava e o jogo passa a vez
  const alive = b.state.units.some((u) => u.id === b.state.turn.actor);
  return { events, ui: events.length && alive ? freshUi(b) : ui };
}

function allTiles(b: Battle): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < b.grid.height; y++) for (let x = 0; x < b.grid.width; x++) out.push({ x, y });
  return out;
}

// O que a unidade pode atingir no próximo turno dela: andar e depois usar qualquer habilidade (sem conferir visão;
// é o "alcance do inimigo" do pilar de puzzle, um aviso largo e não a previsão exata)
function threat(b: Battle, unitId: string): Pos[] {
  const u = b.state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  if (!def.abilities.length) return [];
  const spots = [u.pos, ...[...reachable(b.grid, b.state, unitId).values()].map((s) => s.pos)];
  return allTiles(b).filter((t) => def.abilities.some((a) => spots.some((s) => inAbilityRange(b.grid, ABILITIES[a], s, t))));
}

export function highlights(b: Battle, ui: Ui): Highlights {
  const tiles = new Map<string, { pos: Pos; kind: TileKind }>();
  const mark = (pos: Pos, kind: TileKind) => tiles.set(posKey(pos), { pos, kind });
  let path: Pos[] | null = null;
  let preview: Preview | null = null;
  if (ui.inspect && b.state.units.some((u) => u.id === ui.inspect)) for (const p of threat(b, ui.inspect)) mark(p, 'threat');
  if (ui.mode.k === 'move') {
    const reach = b.reach();
    for (const s of reach.values()) mark(s.pos, 'move');
    if (ui.pending) path = pathTo(reach, ui.pending);
  } else if (ui.mode.k === 'ability') {
    const a = ABILITIES[ui.mode.id];
    const from = b.actor.pos;
    if (!selfCentered(a.id)) {
      for (const t of allTiles(b)) {
        if (!inAbilityRange(b.grid, a, from, t)) continue;
        mark(t, a.needsSight && !lineOfSight(b.grid, from, t) ? 'blocked' : 'range');
      }
    }
    if (ui.pending) {
      preview = b.preview(a.id, ui.pending);
      for (const t of allTiles(b)) if (a.radius > 0 && dist(t, preview.center) <= a.radius && !samePos(t, from)) mark(t, 'area');
    }
  }
  if (ui.pending) mark(ui.pending, 'target');
  if (!b.over) mark(b.actor.pos, 'actor');
  return { tiles: [...tiles.values()], path, preview };
}

// Casas que as cargas na fila vão atingir (noite de 12/11): a magia com carga segue a unidade (follow) e a do Tiro mirado
// fica na casa; a área é o raio da habilidade em volta. A cena pinta de roxo e o HUD diz em texto, para dar tempo de sair.
export function chargeDanger(state: BattleState, width: number, height: number): Map<string, string> {
  const out = new Map<string, string>(); // casa -> habilidade que cai nela
  for (const c of state.charges) {
    // mesma conta da carga ao sair (turn-queue.ts): unidade grande seguida, a casa dela mais perto de quem lança
    const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
    const caster = state.units.find((u) => u.id === c.unit);
    const center = followed ? (caster ? nearestTile(followed, caster.pos) : followed.pos) : c.target;
    const r = ABILITIES[c.ability].radius;
    for (let y = center.y - r; y <= center.y + r; y++)
      for (let x = center.x - r; x <= center.x + r; x++)
        if (x >= 0 && y >= 0 && x < width && y < height && dist({ x, y }, center) <= r) out.set(posKey({ x, y }), c.ability);
  }
  return out;
}
