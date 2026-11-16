// The water's look: the GLSL of the surface (depth bands, bank foam, foam collar, shine, wave light) and of the waterfalls,
// and the two materials that inject it. Both read the same wave field texture and clock, which water.ts owns.
import * as THREE from 'three';
import { AMP, FIELD } from './water-field.ts';

const SWELL = 0.008; // m of constant sway (sum of 3 sines ≈ ±2.5 × this)
export const BODIES = 8; // units in the water with a foam collar
// colors (sRGB; they become linear in the uniform): three depth bands, almost white foam
export const COLOR = {
  shallow: '#3aa6c4',
  mid: '#1f6fa3',
  deep: '#173d72',
  foam: '#eaf8ff',
  side: '#2a6ea3',
  drop: '#e8f8ff',
};
const ALPHA = { shallow: 0.42, mid: 0.72, deep: 0.93 };

// wave height at world (x, z): physics field (texture) + sway; used by the surface and by the top of the waterfall,
// so both rise together
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform sampler2D uField;
uniform vec2 uMap; // map width and height, in tiles
float fieldH(vec2 p) { return (texture2D(uField, (p + 0.5 * uMap) / uMap).r - 0.5) * ${(2 * AMP).toFixed(3)}; }
float swellH(vec2 p) { return ${SWELL.toFixed(4)} * (sin(p.x * 2.1 + uTime * 1.3) + sin(p.y * 1.7 - uTime * 1.1) + 0.5 * sin((p.x - p.y) * 3.3 + uTime * 2.0)); }
vec2 swellD(vec2 p) {
  float c = 0.5 * 3.3 * cos((p.x - p.y) * 3.3 + uTime * 2.0);
  return ${SWELL.toFixed(4)} * vec2(2.1 * cos(p.x * 2.1 + uTime * 1.3) + c, 1.7 * cos(p.y * 1.7 - uTime * 1.1) - c);
}
`;
const VERT_HEAD = /* glsl */ `
${WAVE_GLSL}
attribute vec2 aLocal;
attribute vec4 aEdge;
attribute vec4 aCorner;
attribute float aDepth;
attribute vec2 aFlow;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const VERT_BODY = /* glsl */ `
vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
// the sway moves with the current; still outside the river
transformed.y += fieldH(vWaterXZ) + swellH(vWaterXZ - aFlow * uTime);
vLocal = aLocal;
vEdge = aEdge;
vCorner = aCorner;
vDepth = aDepth;
vFlow = aFlow;
`;
const FRAG_HEAD = /* glsl */ `
${WAVE_GLSL}
uniform vec4 uBodies[${BODIES}];
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeepColor;
uniform vec3 uFoam;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const FRAG_COLOR = /* glsl */ `
vec2 pf = vWaterXZ - vFlow * uTime; // point dragged by the current (the drawing flows with the water)
float hw = fieldH(vWaterXZ);
const float CELL = ${(1 / FIELD).toFixed(4)};
vec2 slope = vec2(fieldH(vWaterXZ + vec2(CELL, 0.0)) - fieldH(vWaterXZ - vec2(CELL, 0.0)),
                  fieldH(vWaterXZ + vec2(0.0, CELL)) - fieldH(vWaterXZ - vec2(0.0, CELL))) / (2.0 * CELL) + swellD(pf);
// foam collar around the legs of whoever is in the water, trembling slightly
float collar = 0.0;
for (int i = 0; i < ${BODIES}; i++) {
  vec4 b = uBodies[i];
  if (b.z <= 0.0) continue;
  float d = length(vWaterXZ - b.xy);
  collar = max(collar, step(abs(d - 0.25 - 0.025 * sin(uTime * 5.0 + b.w)), 0.04));
}
// bank foam: distance to the side (or corner) with land, waving slowly and growing when the wave arrives
float e = 1.0;
e = min(e, mix(1.0, vLocal.y, vEdge.x));
e = min(e, mix(1.0, 1.0 - vLocal.x, vEdge.y));
e = min(e, mix(1.0, 1.0 - vLocal.y, vEdge.z));
e = min(e, mix(1.0, vLocal.x, vEdge.w));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, vLocal.y)), vCorner.x));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, 1.0 - vLocal.y)), vCorner.y));
e = min(e, mix(1.0, length(vec2(vLocal.x, 1.0 - vLocal.y)), vCorner.z));
e = min(e, mix(1.0, length(vLocal), vCorner.w));
e += 0.035 * sin(uTime * 1.6 + (vWaterXZ.x + vWaterXZ.y) * 7.0) - 2.0 * max(hw, 0.0);
// steps instead of a gradient (painted style; in pixel art the gradient turns into speckle)
float foam = max(step(e, 0.08), 0.35 * step(e, 0.15));
// depth bands with the edge waving, like brushstrokes: shallow (the bed shows), medium, deep
float dq = vDepth + 0.05 * sin(pf.x * 5.0 + pf.y * 3.0) + 0.6 * hw;
float midB = step(0.42, dq), deepB = step(0.78, dq);
vec3 waterCol = mix(mix(uShallow, uMid, midB), uDeepColor, deepB);
float alpha = mix(mix(${ALPHA.shallow.toFixed(2)}, ${ALPHA.mid.toFixed(2)}, midB), ${ALPHA.deep.toFixed(2)}, deepB);
// moving shine: little light dots; in the river, threads stretched along the water
vec2 q = pf * 4.0;
float c = sin(q.x + uTime * 0.8) + sin(q.y * 1.3 - uTime * 0.6) + sin((q.x + q.y) * 0.7 + uTime * 1.1);
float glint = step(2.45, c) * (1.0 - 0.6 * deepB);
float fl = length(vFlow);
if (fl > 0.0) {
  vec2 fd = vFlow / fl, side = vec2(-fd.y, fd.x);
  float lane = fract(dot(pf, fd) * 0.9 + 0.35 * sin(dot(vWaterXZ, side) * 6.0));
  glint = max(glint, step(0.93, lane) * step(0.2, fract(dot(vWaterXZ, side) * 3.0 + 0.5 * sin(dot(pf, fd) * 2.0))));
}
// light crest and dark trough: the physics wave reads like paint, not depending only on light
// (low thresholds: a wave worth seeing is 1 to 3 cm; with a 2 cm threshold it only showed up in the first instant)
float crest = 0.35 * step(0.007, hw) + 0.5 * step(0.022, hw);
float trough = step(hw, -0.007) + step(hw, -0.025);
waterCol *= 1.0 - 0.18 * trough;
waterCol = mix(waterCol, uFoam, 0.4 * glint);
float white = max(max(foam, collar), crest);
diffuseColor.rgb = mix(waterCol, uFoam, white);
diffuseColor.a = max(alpha + 0.15 * glint + 0.08 * trough, 0.92 * white);
`;
const FRAG_NORMAL = /* glsl */ `
// sun light and shine follow the wave slope (field + sway)
// (×2.5: from above and in pixel art the real slope of a few cm barely changes the light)
normal = normalize((viewMatrix * vec4(normalize(vec3(-2.5 * slope.x, 1.0, -2.5 * slope.y)), 0.0)).xyz);
`;

// uniforms both materials share (clock, field texture, map size); a fresh set per compiled program
type Shared = () => Record<string, THREE.IUniform>;

// Phong (lit): the per-phase light (setDaylight) and the units' shadow work on the water with no extra code
export function surfaceMaterial(shared: Shared, bodies: THREE.Vector4[]) {
  // weak, narrow sun shine: white (the first value) made the whole river white with the camera facing the sun
  const mat = new THREE.MeshPhongMaterial({
    transparent: true,
    depthWrite: false,
    specular: '#2a3a44',
    shininess: 90,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared(), {
      uBodies: { value: bodies },
      uShallow: { value: new THREE.Color(COLOR.shallow) },
      uMid: { value: new THREE.Color(COLOR.mid) },
      uDeepColor: { value: new THREE.Color(COLOR.deep) },
      uFoam: { value: new THREE.Color(COLOR.foam) },
    });
    shader.vertexShader =
      VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader =
      FRAG_HEAD +
      shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAG_NORMAL}`);
  };
  mat.customProgramCacheKey = () => 'water-volume';
  return mat;
}

// waterfall: threads of foam that run down and foam at the foot, where it hits; the map-edge cut darkens toward the bottom. The top
// rises and falls with the surface (same field), otherwise a gap opened when the wave reached the edge
export function fallMaterial(shared: Shared) {
  const mat = new THREE.MeshLambertMaterial({
    color: COLOR.side,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared());
    sh.vertexShader =
      `${WAVE_GLSL}\nattribute float aFall;\nvarying float vFall;\n` +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFall = aFall;
        vec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;
        transformed.y += step(0.999, uv.y) * (fieldH(wxz) + swellH(wxz));`,
      );
    sh.fragmentShader =
      'uniform float uTime;\nvarying float vFall;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // vertical threads: each with its own phase and strength (drawn by column)
        float col = floor(vUv.x * 14.0), rnd = fract(sin(col * 12.9898) * 43758.5453);
        float streak = fract(vUv.y * 2.0 + uTime * (1.2 + 0.8 * rnd) + rnd);
        float fallFoam = step(0.72, streak) * (0.35 + 0.45 * rnd) + step(0.82, 1.0 - vUv.y) * 0.75 + step(0.94, vUv.y) * 0.5;
        // volume cut: light at the surface line, darkening toward the bottom, in 3 bands like the surface
        vec3 cut = mix(vec3(0.09, 0.24, 0.45), diffuseColor.rgb, step(0.5, vUv.y)) * (1.0 + 0.6 * step(0.92, vUv.y));
        float foam = clamp(fallFoam, 0.0, 1.0) * vFall;
        diffuseColor.rgb = mix(mix(cut, diffuseColor.rgb * 1.15, vFall), vec3(0.92, 0.97, 1.0), foam);
        diffuseColor.a = max(mix(0.85, 0.7, vFall), foam);`,
      );
  };
  mat.customProgramCacheKey = () => 'water-waterfall';
  return mat;
}
