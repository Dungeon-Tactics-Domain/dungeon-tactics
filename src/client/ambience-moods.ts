// The moods of the board surroundings (forest, field, crypt, frost, cave), the map each one goes with, and the URL
// switches that pick how the surroundings are drawn.
import type { Grid } from '../shared/battle/grid.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { HALF } from '../shared/battle/units.ts';
import { roomTheme } from '../shared/crawl/generate.ts';
import { param } from './store.ts';

type Kind = 'forest' | 'field' | 'crypt' | 'frost' | 'cave';
export type Pair = [night: string, day: string];
export interface Prop {
  model: string;
  n: number;
  d: [number, number];
  h: [number, number];
}
export interface Mood {
  low: Pair;
  high: Pair; // fog at the bottom and top of the screen (the top one is the "sky": the farthest)
  near: number;
  far: number; // fog by distance from the board edge: starts at near, closes at far
  mist: number;
  ceiling: number;
  snow: number; // animated low mist, darkness up high (crypt ceiling), snow on what faces up
  ground: string;
  rise: number;
  bump: number; // ground color, slope of the surroundings and height of the mounds
  shade: number; // how much light reaches the surroundings (canopy shade): darker than the board, which stays highlighted
  props: Prop[];
  beams: { n: number; color: Pair; power: [night: number, day: number]; tilt: number }; // tilt 1: toward the sun; 0: plumb
  motes: { n: number; color: Pair; size: number; fall: number; add: boolean; top: number };
  walls?: true; // crypt: walls, columns, torches and crystals
  // scene light on top of the phase light: multiplies the sky and the sun and puts the sun at `at` (position, like the scene's)
  light?: { sky: number; sun: number; at: [number, number, number] };
}

const F = 'forest/';
export const M = 'dungeon/';
export const MOODS: Record<Kind, Mood> = {
  // Ash Wood (Nov 13, Fernando's request: "darker... low and directional light, rays between the crowns, dense forest and taller
  // on the 4 sides, closed-forest backdrop"): dark green fog, weak sky and low sun from the side (long shadows)
  forest: {
    low: ['#03070a', '#0c1610'],
    high: ['#0b141a', '#2f4636'],
    near: 2,
    far: 24,
    mist: 0.6,
    ceiling: 0,
    snow: 0,
    ground: '#203a1c',
    rise: 0.22,
    bump: 0.7,
    shade: 0.6,
    props: [
      { model: `${F}Bush_2_A_Color1`, n: 160, d: [0.3, 4], h: [0.4, 1.1] },
      // fuller forest with varied sizes (Nov 13, "fill Ash Wood map with more trees of different sizes")
      { model: `${F}Tree_3_A_Color1`, n: 140, d: [0.4, 3.5], h: [0.9, 1.9] },
      { model: `${F}Tree_1_A_Color1`, n: 120, d: [1, 4], h: [1.8, 3] },
      { model: `${F}Rock_3_A_Color1`, n: 14, d: [0.8, 7], h: [0.4, 1.1] },
      { model: `${F}Rock_1_A_Color1`, n: 10, d: [0.6, 5], h: [0.3, 0.7] },
      { model: `${F}Tree_2_A_Color1`, n: 110, d: [1.5, 7], h: [2.2, 3.5] }, // more forest nearby (Nov 13, Fernando's request: "bigger volume of trees"): the fade wipes out what is far away
      { model: `${F}Tree_1_A_Color1`, n: 110, d: [2.5, 9], h: [3.5, 5] },
      { model: `${F}Tree_3_A_Color1`, n: 80, d: [3, 9], h: [3.5, 4.8] },
      { model: `${F}Tree_2_C_Color1`, n: 70, d: [7, 28], h: [6, 8] },
      { model: `${F}Tree_1_B_Color1`, n: 60, d: [7, 28], h: [6, 8] },
      { model: `${F}Tree_4_B_Color1`, n: 60, d: [8, 28], h: [6.5, 8] },
    ],
    beams: { n: 14, color: ['#8fb0ff', '#ffd79a'], power: [0.1, 0.42], tilt: 1 },
    motes: { n: 360, color: ['#c8ff7a', '#ffe7a3'], size: 0.07, fall: -0.00008, add: true, top: 6 },
    // sky 0.7 (before 0.45): Fernando found Ash Wood "a bit dark" (Nov 13); sun from the side stays, with long shadow
    light: { sky: 0.7, sun: 0.95, at: [-10, 7, 5] },
  },
  field: {
    low: ['#0b0b18', '#7da36a'],
    high: ['#252648', '#b9d3c8'],
    near: 12,
    far: 48,
    mist: 0.06,
    ceiling: 0,
    snow: 0,
    ground: '#5f9a3e',
    rise: 0.12,
    bump: 1.2,
    shade: 0.9,
    props: [
      { model: `${F}Bush_2_A_Color1`, n: 30, d: [0.5, 6], h: [0.4, 0.9] },
      { model: `${F}Rock_3_A_Color1`, n: 16, d: [0.8, 12], h: [0.4, 1.2] },
      { model: `${F}Rock_1_A_Color1`, n: 12, d: [0.6, 8], h: [0.3, 0.7] },
      { model: `${F}Tree_1_A_Color1`, n: 16, d: [5, 22], h: [3, 4.5] },
      { model: `${F}Tree_3_A_Color1`, n: 10, d: [6, 22], h: [3, 4] },
      { model: `${F}Tree_4_A_Color1`, n: 12, d: [9, 30], h: [4, 6] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 160, color: ['#b8c8ff', '#fff3c4'], size: 0.05, fall: -0.00005, add: true, top: 5 },
  },
  crypt: {
    low: ['#04070b', '#071017'],
    high: ['#010203', '#020407'],
    near: 1.5,
    far: 12,
    mist: 0.75,
    ceiling: 1,
    snow: 0,
    ground: '#2a2c33',
    rise: 0,
    bump: 0.15,
    shade: 0.85,
    props: [
      { model: `${M}column`, n: 10, d: [0.8, 4], h: [0.7, 1.4] },
      { model: `${M}pillar`, n: 8, d: [3.5, 5], h: [2.6, 3.3] },
    ],
    beams: { n: 3, color: ['#8fc6ff', '#8fc6ff'], power: [0.07, 0.09], tilt: 0.25 },
    motes: { n: 220, color: ['#ffb070', '#ffb070'], size: 0.045, fall: -0.00012, add: true, top: 4 },
    walls: true,
  },
  // crawl cave (Nov 15, Fernando: the rooms must look like Ash Wood): the crypt's dark and embers over the smooth painted
  // stone, with no crypt walls, so the ground and its rocks go on into the dark around the room
  cave: {
    low: ['#04070b', '#0a0d12'],
    high: ['#010203', '#04060a'],
    near: 1.5,
    far: 14,
    mist: 0.75,
    ceiling: 1,
    snow: 0,
    ground: '#2a2c33',
    rise: 0.3,
    bump: 0.9,
    shade: 0.7,
    props: [
      { model: `${F}Rock_3_A_Color1`, n: 40, d: [0.3, 5], h: [0.6, 1.6] },
      { model: `${F}Rock_1_A_Color1`, n: 30, d: [0.3, 4], h: [0.3, 0.8] },
    ],
    beams: { n: 3, color: ['#8fc6ff', '#8fc6ff'], power: [0.07, 0.09], tilt: 0.25 },
    motes: { n: 220, color: ['#ffb070', '#ffb070'], size: 0.045, fall: -0.00012, add: true, top: 4 },
    light: { sky: 0.55, sun: 0.8, at: [-6, 9, 4] },
  },
  frost: {
    low: ['#060a17', '#8d9db3'],
    high: ['#16234a', '#dde7f1'],
    near: 3,
    far: 26,
    mist: 0.5,
    ceiling: 0,
    snow: 1,
    ground: '#7b8593',
    rise: 0.45,
    bump: 1,
    shade: 0.95,
    props: [
      { model: `${F}Rock_3_A_Color1`, n: 26, d: [0.6, 10], h: [0.5, 1.6] },
      { model: `${F}Rock_1_A_Color1`, n: 14, d: [0.5, 6], h: [0.3, 0.8] },
      { model: `${F}Tree_Bare_1_A_Color1`, n: 12, d: [1, 9], h: [1.5, 2.6] },
      { model: `${F}Tree_Bare_2_A_Color1`, n: 12, d: [1.5, 10], h: [1.8, 3] },
      { model: `${F}Tree_4_A_Color1`, n: 26, d: [5, 24], h: [3, 5] },
      { model: `${F}Tree_4_B_Color1`, n: 26, d: [7, 26], h: [4, 6.5] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 900, color: ['#dfe8ff', '#ffffff'], size: 0.065, fall: 0.0011, add: false, top: 9 },
  },
};
// the map comes from the grid: the developer battle and Until Dawn reuse the base map's Grid, and the base maps are the
// first of SCENARIOS (what is found is the map id, not the cast's)
const KIND: Record<string, Kind> = {
  ash_wood: 'forest',
  flooded_crypt: 'crypt',
  crypt_heart: 'crypt',
  frost_pass: 'frost',
  vauclair: 'forest', // the walkable town (src/content/crawl/town.ts): a clearing in Ash Wood's woods and light
};
// crawl rooms (src/shared/crawl) have a new id per seed: the theme that ends it picks the mood
const ROOM_KIND: Record<string, Kind> = { dungeon: 'cave', forest: 'forest', mountain: 'frost' };
export const kindOf = (grid: Grid): Kind => {
  const id = Object.keys(SCENARIOS).find((k) => SCENARIOS[k].grid === grid) ?? '';
  // half tiles (half.ts): the split map `<id>½` is drawn with the mood of the whole one it came from
  return id.endsWith(HALF)
    ? kindOf(SCENARIOS[id.slice(0, -HALF.length)].grid)
    : (KIND[id] ?? ROOM_KIND[roomTheme(id)] ?? 'field');
};
// ground color that continues each edge tile (the river goes on outside the map, so does Beacon Hill's snow)
export const EDGE: Record<string, string> = {
  water: '#1f4a6e',
  bridge: '#1f4a6e',
  snow: '#c9d2dc',
  snow_rock: '#c9d2dc',
  bare1: '#c9d2dc',
  bare2: '#c9d2dc',
  sand: '#9c8a5a',
  rock: '#6a6d76',
  gold: '#6a6d76',
  summit: '#4a4a52',
};
// fade to black around (Nov 13, Fernando's request, default since then; ?fade=off compares): the surroundings' fog
// turns black from 0.2 to 3.2 tiles from the edge, together with the terrain extension (terrain.ts extTone); the board
// does not get this fog
export const FADE = param('fade') !== 'off';
// map extension: 'texture' (default since Nov 13, "I want the fade to black and the texture") is the smooth terrain from terrain.ts
// continuing outward; ?extension=dark and ?extension=gray are the block-based test versions in ambience.ts; ?extension=none removes
export const EXTEND = param('extension') || 'texture';
export const TEST_RING = 5; // tiles of the block-based test versions
export const DARK_TONE: Record<string, string> = {
  grass: '#3f8a35',
  tree: '#3f8a35',
  tree2: '#3f8a35',
  tree3: '#3f8a35',
  tree4: '#3f8a35',
  sand: '#b39a5e',
  wood: '#8a6a44',
  brick: '#8a5a44',
  rock: '#7a7d86',
  gold: '#7a7d86',
  summit: '#5a5a62',
  stone: '#8a8c92',
  snow: '#dfe6ee',
  snow_rock: '#9aa3ad',
  bare1: '#dfe6ee',
  bare2: '#dfe6ee',
};
export const DARK_FALLBACK = '#6b6f7a'; // crypt floors, altar and the rest: stone
