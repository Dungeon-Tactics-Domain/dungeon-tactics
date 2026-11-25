// Pictures of tiny maps on the battle's own pieces (the map builder's tile pictures, mapedit/pics.ts, Nov 25): each map is
// built as a Board in a scene of its own, lit like the battle, drawn from the battle's angle by the battle's renderer into
// a small target and read back into a canvas, which the 3D interface layer shows (a texture cannot cross from one WebGL
// context to another, and a second context is not allowed)
import * as THREE from 'three';
import type { Grid } from '../../shared/battle/grid.ts';
import { letGoOf } from '../three-util.ts';
import { Board } from './board.ts';
import { SceneLights } from './lights.ts';
import { TileSpace } from './space.ts';

const PITCH = THREE.MathUtils.degToRad(32); // the battle camera's (camera.ts)
const YAW = Math.PI / 4;

// one `px` square canvas per map, transparent round it and cropped to what was drawn; `from` lends the loaded pieces,
// textures and materials
export function shootTiles(
  renderer: THREE.WebGLRenderer,
  from: Board,
  grids: Map<string, Grid>,
  px: number,
): Map<string, HTMLCanvasElement> {
  const big = px * 2; // drawn larger, then cropped to the map's own pixels and scaled down
  const rt = new THREE.WebGLRenderTarget(big, big);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    buf = new Uint8Array(big * big * 4),
    was = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()) },
    alpha = renderer.getClearAlpha(),
    out = new Map<string, HTMLCanvasElement>();
  renderer.setClearColor(0x000000, 0);
  // one scene and one sun for every picture: each sun brings a shadow map of its own
  const scene = new THREE.Scene(),
    lights = new SceneLights(scene);
  for (const [key, grid] of grids) {
    const board = new Board(
      scene,
      new TileSpace(grid),
      from.models,
      from.pieces,
      from.lookPieces,
      from.packClips,
      from.tex,
    );
    const hw = grid.width / 2,
      hh = grid.height / 2,
      top = new THREE.Box3().setFromObject(board.scene).max.y;
    cam.position
      .set(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH))
      .multiplyScalar(30);
    cam.position.y += top / 2;
    cam.lookAt(0, top / 2, 0);
    cam.updateMatrixWorld();
    // the map's box from the ground up framed square: the ground round the map is cut away (clipping below)
    const seen = new THREE.Box2();
    for (const x of [-hw, hw])
      for (const y of [0, top])
        for (const z of [-hh, hh])
          seen.expandByPoint(new THREE.Vector2().copy(new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse)));
    const c = seen.getCenter(new THREE.Vector2()),
      half = Math.max(seen.max.x - seen.min.x, seen.max.y - seen.min.y) / 2;
    Object.assign(cam, { left: c.x - half, right: c.x + half, top: c.y + half, bottom: c.y - half });
    cam.updateProjectionMatrix();
    // the smooth terrain runs on past the map's edge (terrain.ts extension): only the map itself is drawn
    renderer.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), hw + 0.01),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw + 0.01),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), hh + 0.01),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), hh + 0.01),
    ];
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, big, big, buf);
    out.set(key, toCanvas(buf, big, px));
    board.dispose();
    board.scene.removeFromParent();
    letGoOf(board.scene, from.scene); // what the battle's own board still draws with stays
  }
  lights.dispose();
  renderer.clippingPlanes = [];
  renderer.setRenderTarget(was.target);
  renderer.setClearColor(was.color, alpha);
  renderer.shadowMap.needsUpdate = true;
  rt.dispose();
  return out;
}

// The target's rows (bottom up) as a canvas's (top down), cropped to the square round the drawn pixels: a flat tile
// leaves the box's lower half empty, and a tree's crown fills it
function toCanvas(buf: Uint8Array, big: number, px: number) {
  const full = document.createElement('canvas');
  full.width = full.height = big;
  const img = new ImageData(big, big),
    row = big * 4;
  let x0 = big,
    x1 = 0,
    y0 = big,
    y1 = 0;
  for (let y = 0; y < big; y++) {
    img.data.set(buf.subarray((big - 1 - y) * row, (big - y) * row), y * row);
    for (let x = 0; x < big; x++)
      if (img.data[y * row + x * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  }
  full.getContext('2d')!.putImageData(img, 0, 0);
  const side = Math.max(x1 - x0, y1 - y0, 1) * 1.08,
    cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, (x0 + x1 - side) / 2, (y0 + y1 - side) / 2, side, side, 0, 0, px, px);
  return cv;
}
