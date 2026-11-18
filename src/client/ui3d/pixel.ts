// The pixel filter of the 3D UI kit (?pixel=1 or a spec's `uiPixel`; Fernando, Nov 16: low-poly icons with a pixel
// filter that can be switched on): the size of its blocks (pure, tested) and the shader that reads the small icon
// target block by block (layer.ts builds the material). No DOM or Three here.

// Side of the filter's blocks in device pixels: a 40 px icon of the 1080p layout becomes a 16 px sprite, the size of a
// classic menu icon. Never under 2, or the filter would show nothing
export const pixelBlock = (scale: number, dpr: number) => Math.max(2, Math.round(2.5 * scale * dpr));

// The icon target laid over the panels: each colour is cut to a short palette with a 2x2 dither and every sprite gets a
// 1-block dark outline, the way a hand-drawn menu icon has
export const PIXEL_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform vec2 uTexel;
void main() {
  vec4 c = texture2D(uMap, vUv);
  vec2 cell = floor(vUv / uTexel);
  float near = max(
    max(texture2D(uMap, vUv + vec2(uTexel.x, 0.0)).a, texture2D(uMap, vUv - vec2(uTexel.x, 0.0)).a),
    max(texture2D(uMap, vUv + vec2(0.0, uTexel.y)).a, texture2D(uMap, vUv - vec2(0.0, uTexel.y)).a));
  float dither = (mod(cell.x, 2.0) + 2.0 * mod(cell.x + cell.y, 2.0)) / 4.0 - 0.375;
  vec3 cut = floor(c.rgb * 6.0 + 0.5 + dither * 0.3) / 6.0;
  gl_FragColor = c.a > 0.5 ? vec4(cut, 1.0) : vec4(vec3(0.16, 0.13, 0.09) * 0.9, 0.9) * step(0.5, near);
}`;
