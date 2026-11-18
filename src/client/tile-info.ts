// The tile line under the cursor (FFT corner): position, height, floor, water, spikes and a charge about to land there.
// Pure for the test.
import { COMBAT } from '../shared/battle/combat.ts';
import { type Grid, inBounds, posKey, standH, TERRAIN, tileAt } from '../shared/battle/grid.ts';
import { cellsOf } from '../shared/battle/pathing.ts';
import type { BattleState, Pos } from '../shared/battle/types.ts';
import { abilityName, t } from './i18n.ts';
import { chargeDanger } from './interaction.ts';

// Info on the tile under the cursor (FFT corner): position, height and floor type
const LOOK_NAME: Record<string, () => string> = {
  grass: () => t('grama', 'grass'),
  stone: () => t('pedra', 'stone'),
  water: () => t('água', 'water'),
  bridge: () => t('ponte', 'bridge'),
  tree: () => t('árvore', 'tree'),
  // Beacon Hill and Flooded Crypt (Nov 12)
  rock: () => t('rocha', 'rock'),
  summit: () => t('topo de rocha', 'rock top'),
  sand: () => t('areia', 'sand'),
  gold: () => t('veio de ouro', 'gold vein'),
  brick: () => t('muro de tijolo', 'brick wall'),
  snow: () => t('neve', 'snow'),
  snow_rock: () => t('rocha com neve', 'snowy rock'),
  tree2: () => t('árvore', 'tree'),
  tree3: () => t('árvore', 'tree'),
  tree4: () => t('árvore', 'tree'),
  bare1: () => t('árvore seca', 'bare tree'),
  bare2: () => t('árvore seca', 'bare tree'),
  crypt: () => t('piso de pedra', 'stone floor'),
  altar: () => t('altar', 'altar'),
  pillar: () => t('coluna', 'pillar'),
  crates: () => t('caixotes', 'crates'),
  barrel: () => t('barril', 'barrel'),
  chest: () => t('baú', 'chest'),
  rubble: () => t('entulho', 'rubble'),
  spikes: () => t('armadilha de espinhos', 'spike trap'),
  boulder: () => t('rochedo', 'boulder'),
  corpse: () => t('corpo', 'body'),
};
const TERRAIN_NAME: Record<string, () => string> = {
  floor: () => t('chão', 'ground'),
  forest: () => t('árvore', 'tree'),
  rubble: () => t('entulho (cobertura)', 'rubble (cover)'),
  wall: () => t('muro', 'wall'),
};
// The height the tile line and the reference's "Height" corner show: in shallow water the height one stands at counts
// (the one Jump compares), not the surface's
export function tileHeight(grid: Grid, p: Pos): number {
  const tile = tileAt(grid, p);
  return tile.depth === 1 ? standH(tile) : tile.h;
}

// The tile's three coordinates by name (Fernando, Nov 18: "X 16 · Y 20 · Z 1 · grama"): X and Y the cell, as every
// Pos; Z its height, the same number as the Height corner (tileHeight)
export function tileInfo(grid: Grid, p: Pos): string {
  const tile = tileAt(grid, p);
  const kind = tile.look ? (LOOK_NAME[tile.look]?.() ?? tile.look) : TERRAIN_NAME[tile.terrain]();
  // shallow and deep water share the same drawing: the tile text is what says which is which (found looking at the Crypt Heart)
  const blocked =
    (TERRAIN[tile.terrain].walkable ? '' : t(' · não dá para pisar', ' · not walkable')) +
    ((tile.depth ?? 0) >= 2
      ? t(' · funda: não se age nela', ' · deep: no actions inside')
      : tile.depth === 1
        ? t(' · rasa', ' · shallow')
        : '') +
    (tile.spikes
      ? t(
          ` · espinhos: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez ou ser empurrado aqui`,
          ` · spikes: −${COMBAT.SPIKE_DAMAGE} when ending a turn or pushed here`,
        )
      : '');
  const at = `X ${p.x} · Y ${p.y} · Z ${tileHeight(grid, p)}`;
  return t(
    `${at}${tile.ramp ? ' (rampa)' : ''} · ${kind}${blocked}`,
    `${at}${tile.ramp ? ' (slope)' : ''} · ${kind}${blocked}`,
  );
}

// The tile line under the cursor. `size` > 1 (a token choosing where to stop): its whole square counts, because a charge hits
// a token on any of its cells (combat.ts inArea over the footprint) and spikes hurt on any cell at the turn's end (battle.ts)
export function cursorInfo(grid: Grid, state: BattleState, p: Pos, size = 1): string {
  const square = cellsOf(p, size).filter((c) => inBounds(grid, c));
  const danger = chargeDanger(grid, state);
  const hit = square.map((c) => danger.get(posKey(c))).find((a) => a);
  const spikes = !tileAt(grid, p).spikes && square.some((c) => tileAt(grid, c).spikes);
  return (
    tileInfo(grid, p) +
    (spikes
      ? t(
          ` · espinhos sob a unidade: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez aqui`,
          ` · spikes under the unit: −${COMBAT.SPIKE_DAMAGE} when ending a turn here`,
        )
      : '') +
    (hit ? t(` · ⚠ ${abilityName(hit)} vai cair aqui`, ` · ⚠ ${abilityName(hit)} lands here`) : '')
  );
}
