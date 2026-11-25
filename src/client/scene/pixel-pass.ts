// The pixel effect's final pass (Fernando, Nov 24; ported from our pixel splat demo, 08-pixel-splat c0f3030): the scene
// drawn into a low-res target, then one full-screen quad rounds the brightness to N levels with a 4x4 Bayer dither,
// takes the colour from a palette by colour family and upscales with nearest filtering. The 3D interface has its own
// canvas and the HUD is HTML, so neither goes through it. Settings in pixel-fx.ts.
import * as THREE from 'three';
import { lowRes, type PixelFx, type PixelPalette, pixelSize } from '../pixel-fx.ts';

// our own ramps, dark to light (sRGB); the pass picks the family whose hue is closest, then the step by brightness
const RAMPS: Record<Exclude<PixelPalette, 'original'>, string[][]> = {
  warm: [
    ['#17141c', '#3b3540', '#6d6470', '#b3a99c'], // stone
    ['#24130f', '#653620', '#ad6d38', '#f1c47c'], // wood, skin
    ['#260b12', '#6b1a24', '#b8382d', '#f48558'], // red
    ['#0f142b', '#22406f', '#3f7bb5', '#a2d4f0'], // blue
    ['#0e1d14', '#265237', '#508f49', '#acd77a'], // green
    ['#261706', '#7a5212', '#d39c25', '#fff1a3'], // gold
    ['#1b0f27', '#4a2a69', '#8b53a8', '#dcabe8'], // purple
    ['#25252b', '#686675', '#b9b4b6', '#f6f1e5'], // bone, white
  ],
  cold: [
    ['#0b0f17', '#273142', '#55657a', '#9fb1bf'],
    ['#151318', '#45393d', '#86716a', '#cdb9a6'],
    ['#14090f', '#4c1b2b', '#8f3550', '#d9809a'],
    ['#060c1c', '#163059', '#2f6aa3', '#8fd0ec'],
    ['#06140f', '#174235', '#2f7a63', '#88d3b2'],
    ['#13130b', '#4a4a2a', '#8e8d52', '#dcdca0'],
    ['#0f0a1c', '#2f2556', '#5d4f9a', '#b3a8e6'],
    ['#14171d', '#4d5563', '#9aa4b0', '#e8f0f4'],
  ],
};
const RAMP_W = 64; // lookup texture width: x = brightness, y = family
// the life bars and turn numbers over the units: drawn sharp after the pass, or 4 px pixels swallow their digits
export const SHARP_LAYER = 1;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform vec2 uLowRes;
  uniform sampler2D uPalette;
  uniform vec3 uKeys[8];
  uniform int uFamilies;
  uniform float uLevels;
  uniform float uDither;
  varying vec2 vUv;
  float bayer4(vec2 p) {
    ivec2 q = ivec2(mod(p, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[q.x + q.y * 4]) + 0.5) / 16.0;
  }
  vec3 toSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 c = toSRGB(texture2D(tScene, vUv).rgb);
    float maxc = max(max(c.r, c.g), c.b);
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    // one dither cell per big pixel; at 50% the pattern only shows near a level's edge, flat areas stay clean
    float d = (bayer4(floor(vUv * uLowRes)) - 0.5) * uDither;
    float n = max(uLevels - 1.0, 1.0);
    float t = clamp(floor(luma * n + 0.5 + d), 0.0, n) / n;
    // a very dark pixel has no reliable hue: grey
    vec3 hue = mix(vec3(1.0), c / max(maxc, 1e-3), smoothstep(0.03, 0.12, maxc));
    if (uFamilies == 0) { gl_FragColor = vec4(hue * mix(0.1, 1.0, t), 1.0); return; }
    int best = 0; float bd = 1e9;
    for (int i = 0; i < 8; i++) {
      if (i >= uFamilies) break;
      vec3 k = uKeys[i] / max(max(uKeys[i].r, uKeys[i].g), max(uKeys[i].b, 1e-3));
      float dd = dot(hue - k, hue - k);
      if (dd < bd) { bd = dd; best = i; }
    }
    gl_FragColor = vec4(texture2D(uPalette, vec2(t, (float(best) + 0.5) / float(uFamilies))).rgb, 1.0);
  }`;

// the lookup texture of a palette and each family's key colour (its third step), or none for the original colours
function bake(name: PixelPalette): { texture: THREE.DataTexture | null; keys: THREE.Color[] } {
  if (name === 'original') return { texture: null, keys: [] };
  const fams = RAMPS[name];
  const data = new Uint8Array(RAMP_W * fams.length * 4);
  const keys: THREE.Color[] = [];
  const a = new THREE.Color();
  fams.forEach((ramp, row) => {
    const cols = ramp.map((h) => new THREE.Color().setStyle(h, THREE.NoColorSpace));
    for (let x = 0; x < RAMP_W; x++) {
      const t = (x / (RAMP_W - 1)) * (cols.length - 1);
      const i = Math.min(cols.length - 2, Math.floor(t));
      a.copy(cols[i]).lerp(cols[i + 1], t - i);
      data.set([a.r * 255, a.g * 255, a.b * 255, 255], (row * RAMP_W + x) * 4);
    }
    keys.push(cols[2]);
  });
  const texture = new THREE.DataTexture(data, RAMP_W, fams.length);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return { texture, keys };
}

export class PixelPass {
  // half float: the scene stays linear until the pass rounds it, as the demo measured
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: this.target.texture },
      uLowRes: { value: new THREE.Vector2(1, 1) },
      uPalette: { value: null },
      uKeys: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
      uFamilies: { value: 0 },
      uLevels: { value: 5 },
      uDither: { value: 0.5 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fx: PixelFx | null = null;
  private w = 1;
  private h = 1;

  constructor() {
    this.quad.frustumCulled = false;
  }

  set(fx: PixelFx) {
    const u = this.material.uniforms;
    if (fx.palette !== this.fx?.palette) {
      (u.uPalette.value as THREE.DataTexture | null)?.dispose();
      const p = bake(fx.palette);
      u.uPalette.value = p.texture;
      u.uFamilies.value = p.keys.length;
      p.keys.forEach((k, i) => (u.uKeys.value as THREE.Vector3[])[i].set(k.r, k.g, k.b));
    }
    u.uLevels.value = fx.levels;
    u.uDither.value = fx.dither ? fx.strength / 100 : 0;
    this.fx = fx;
    this.resize(this.w, this.h);
  }

  // the screen in CSS px: the pixel size is in CSS px whatever the device's ratio, as the reference draws at ratio 1
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const [lw, lh] = lowRes(pixelSize(this.fx?.size ?? 0, w, h), w, h);
    this.target.setSize(lw, lh);
    (this.material.uniforms.uLowRes.value as THREE.Vector2).set(lw, lh);
  }

  // the target is stretched over the whole canvas, so the camera and picking stay the full screen's; a big pixel may be
  // one device px wider than its neighbour where the screen is not a multiple of the pixel size
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const mask = camera.layers.mask;
    camera.layers.disable(SHARP_LAYER);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quad, this.camera);
    // the sharp layer on top: no clear and no background, so the pass stays under it (they draw with no depth test)
    camera.layers.set(SHARP_LAYER);
    const background = scene.background;
    scene.background = null;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = true;
    scene.background = background;
    camera.layers.mask = mask;
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
    (this.material.uniforms.uPalette.value as THREE.DataTexture | null)?.dispose();
  }
}
