// The map builder's palette (Nov 25, map builder grill): every tile kind the game's maps and crawl rooms already use,
// with the terrain the rules read; the height stays the tile's own. Order is the palette's order on screen.
import type { TerrainKind } from '../shared/battle/grid.ts';

export interface PaletteEntry {
  id: string;
  name: [string, string];
  terrain: TerrainKind;
  look?: string;
  depth?: number;
  spikes?: true;
  noStop?: true;
}

// what the right button paints back (spec: "right resets to plain ground")
export const PLAIN_GROUND = 'grass';

export const PALETTE: PaletteEntry[] = [
  // ground
  { id: 'grass', name: ['Grama', 'Grass'], terrain: 'floor', look: 'grass' },
  { id: 'sand', name: ['Areia', 'Sand'], terrain: 'floor', look: 'sand' },
  { id: 'snow', name: ['Neve', 'Snow'], terrain: 'floor', look: 'snow' },
  { id: 'summit', name: ['Cume', 'Summit'], terrain: 'floor', look: 'summit' },
  { id: 'stone', name: ['Pedra', 'Stone'], terrain: 'floor', look: 'stone' },
  { id: 'crypt', name: ['Piso da cripta', 'Crypt floor'], terrain: 'floor', look: 'crypt' },
  { id: 'altar', name: ['Altar', 'Altar'], terrain: 'floor', look: 'altar' },
  { id: 'gold', name: ['Ouro', 'Gold'], terrain: 'floor', look: 'gold' },
  // Beacon Hill draws rock and snowy rock as ground you walk on, apart from the rock walls below
  { id: 'rock_ground', name: ['Chão de rocha', 'Rock ground'], terrain: 'floor', look: 'rock' },
  { id: 'snow_rock_ground', name: ['Chão de rocha nevada', 'Snowy rock ground'], terrain: 'floor', look: 'snow_rock' },
  { id: 'bridge', name: ['Ponte', 'Bridge'], terrain: 'floor', look: 'bridge' },
  // water
  { id: 'water_shallow', name: ['Água rasa', 'Shallow water'], terrain: 'floor', look: 'water', depth: 1 },
  { id: 'water_deep', name: ['Água funda', 'Deep water'], terrain: 'floor', look: 'water', depth: 2 },
  // hazards and low objects
  { id: 'spikes', name: ['Espinhos', 'Spikes'], terrain: 'floor', look: 'spikes', spikes: true },
  { id: 'corpse', name: ['Corpo', 'Corpse'], terrain: 'floor', look: 'corpse', noStop: true },
  { id: 'rubble', name: ['Entulho', 'Rubble'], terrain: 'rubble', look: 'rubble' },
  { id: 'bridge_rubble', name: ['Entulho na ponte', 'Bridge rubble'], terrain: 'rubble', look: 'bridge' },
  // trees
  { id: 'tree', name: ['Árvore', 'Tree'], terrain: 'forest', look: 'tree' },
  { id: 'tree2', name: ['Árvore 2', 'Tree 2'], terrain: 'forest', look: 'tree2' },
  { id: 'tree3', name: ['Árvore 3', 'Tree 3'], terrain: 'forest', look: 'tree3' },
  { id: 'tree4', name: ['Árvore 4', 'Tree 4'], terrain: 'forest', look: 'tree4' },
  { id: 'bare1', name: ['Árvore seca', 'Bare tree'], terrain: 'forest', look: 'bare1' },
  { id: 'bare2', name: ['Árvore seca 2', 'Bare tree 2'], terrain: 'forest', look: 'bare2' },
  // walls and objects
  { id: 'rock', name: ['Rocha', 'Rock'], terrain: 'wall', look: 'rock' },
  { id: 'snow_rock', name: ['Rocha nevada', 'Snowy rock'], terrain: 'wall', look: 'snow_rock' },
  { id: 'boulder', name: ['Pedregulho', 'Boulder'], terrain: 'wall', look: 'boulder' },
  { id: 'brick', name: ['Muro', 'Brick wall'], terrain: 'wall', look: 'brick' },
  { id: 'pillar', name: ['Coluna', 'Pillar'], terrain: 'wall', look: 'pillar' },
  { id: 'crates', name: ['Caixotes', 'Crates'], terrain: 'wall', look: 'crates' },
  { id: 'barrel', name: ['Barril', 'Barrel'], terrain: 'wall', look: 'barrel' },
  { id: 'chest', name: ['Baú', 'Chest'], terrain: 'wall', look: 'chest' },
  // the plain symbols of parseGrid (Skirmish): terrain without a look of its own
  { id: 'plain_floor', name: ['Chão simples', 'Plain floor'], terrain: 'floor' },
  { id: 'plain_forest', name: ['Mata simples', 'Plain forest'], terrain: 'forest' },
  { id: 'plain_wall', name: ['Parede simples', 'Plain wall'], terrain: 'wall' },
];
