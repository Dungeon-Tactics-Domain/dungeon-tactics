// What a battle downloads before it can draw: the unit and block models, the painted pieces of open maps, the shared
// animation pack and the surroundings. Everything starts together and is awaited at the end.
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Grid } from '../../shared/battle/grid.ts';
import type { BattleState } from '../../shared/battle/types.ts';
import { type Ambience, loadAmbience } from '../ambience.ts';
import { kindOf } from '../ambience-moods.ts';
import { modelOf } from '../markers.ts';
import { loadPaint } from '../painted.ts';
import { isPainted, swapProps } from '../props.ts';
import { loadTerrainTextures, type TerrainTextures } from '../terrain.ts';
import { swapTrees } from '../trees.ts';
import { CORPSE_MODELS, lookPieceNames } from './board-looks.ts';

export async function loadBattleAssets(grid: Grid, state: BattleState, all: string[]) {
  const ambience = loadAmbience(grid); // downloads along with the map pieces
  // smooth terrain on open maps (terrain.ts); crypts stay block-based
  const terrainTex = grid.tiles.some((t) => t.look) && kindOf(grid) !== 'crypt' ? loadTerrainTextures() : null;
  // units compressed with meshopt (Nov 13, Fernando's request: the game downloaded 11 MB to open); Three's decoder
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // the map's bodies and a resumed battle's corpses (Units.restoreCorpses) wear these models
  const corpses = grid.tiles.some((t) => t.look === 'corpse') || state.corpses?.length ? CORPSE_MODELS : [];
  const dead = Object.values(state.corpseDefs ?? {}); // the saved corpses wear their own unit's model
  const defs = [
    ...new Set(
      [...[...state.units.map((u) => u.def), ...all, ...dead].map((d) => modelOf(d)), ...corpses].filter(Boolean),
    ),
  ];
  const [top, side, stone, tree, ...loaded] = await Promise.all([
    ...['dirt_with_grass', 'dirt', 'stone'].map((n) => loader.loadAsync(`/models/poc/square/${n}.gltf`)),
    loader.loadAsync('/models/poc/hex/tree_single_A.gltf'), // the tree in the block pack is a cube of leaves
    ...defs.map((d) => loader.loadAsync(`/models/${d}.glb`)),
  ]);
  const models = new Map(defs.map((d, i) => [d, loaded[i]]));
  // only the map that brings a per-tile look downloads these pieces (~630 KB with the textures)
  const names = lookPieceNames(grid);
  // open maps swap trees and props for painted ones below: those get an empty stand-in, not a download
  const looks = new Map(
    await Promise.all(
      names.map(
        async (n) =>
          [
            n,
            terrainTex && isPainted(n) ? new THREE.Group() : (await loader.loadAsync(`/models/${n}.gltf`)).scene,
          ] as const,
      ),
    ),
  );
  // open maps: painted trees built in code (trees.ts), with variations, in place of KayKit's
  if (terrainTex) {
    await loadPaint();
    swapTrees(looks);
    swapProps(looks, true);
  } // and the painted objects (props.ts)
  // extra ability gestures (KayKit Rig_Medium, same bones as the units): scripts/assets/anim-pack.mjs
  const pack = (await loader.loadAsync('/models/animations.glb')).animations;
  return {
    models,
    pieces: { top: top.scene, side: side.scene, stone: stone.scene, tree: tree.scene },
    looks,
    pack,
    terrainTex: (await terrainTex) as TerrainTextures | null,
    ambience: (await ambience) as Ambience,
  };
}
