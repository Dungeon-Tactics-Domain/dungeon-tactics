// The map builder's tile pictures (pics.ts says which), rendered once per page on the scene's own pieces
// (BattleScene.shoot) and kept: reopening the builder or changing the map does not render them again
import type { BattleScene } from '../scene.ts';
import { PIC_KEYS, picGrid } from './pics.ts';

const PX = 128; // the bar's picture is about 48 px, drawn at up to 2x
let shots: Map<string, HTMLCanvasElement> | null = null;

export const tilePictures = (scene: BattleScene) =>
  (shots ??= scene.shoot(new Map(PIC_KEYS.map((k) => [k, picGrid(k)])), PX));
