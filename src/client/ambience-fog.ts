// The fog of the board surroundings: the shader pieces and the Lambert material that carries them.
import * as THREE from 'three';
import { nearestPixels } from './three-util.ts';

// Surroundings fog, injected into their materials (the board stays sharp: none of this touches the scene's materials).
// By distance from the edge (not from the camera, which rotates and zooms) and with the screen's color from bottom to top, so the distance
// fades into the same background gradient from any angle.
export const FOG_HEAD = `varying vec3 vAmbW; varying vec3 vAmbN; varying float vAmbY; varying float vAmbZ;
uniform vec3 ambLow; uniform vec3 ambHigh; uniform vec2 ambHalf; uniform float ambNear; uniform float ambFar;
uniform float ambMist; uniform float ambCeil; uniform float ambSnow;
`;
const FOG_VERT = `#include <project_vertex>
vec4 ambW = vec4(transformed, 1.0); vec3 ambN = objectNormal;
#ifdef USE_INSTANCING
ambW = instanceMatrix * ambW; ambN = mat3(instanceMatrix) * ambN;
#endif
vAmbW = (modelMatrix * ambW).xyz; vAmbN = normalize(mat3(modelMatrix) * ambN); vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; vAmbZ = -mvPosition.z;`;
const SNOW_FRAG = `#include <map_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), ambSnow * smoothstep(0.45, 0.8, vAmbN.y));`;
const FOG_FRAG = `float ambD = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
float ambF = smoothstep(ambNear, ambFar, ambD);
ambF = max(ambF, ambMist * 0.6 * (1.0 - smoothstep(-1.6, 0.4, vAmbW.y)) * smoothstep(0.5, 5.0, ambD)); // low mist on the ground
ambF = max(ambF, ambCeil * smoothstep(1.2, 4.5, vAmbW.y)); // crypt: the top vanishes into the dark, as if there were a ceiling
// stuck to the camera (30 from the focus, near 0.1; only with the whole map in view, at the bottom edge): fades into the mist instead of
// showing the hollow of the model cut by the front plane (a light ring was left on the 20x20)
if (vAmbZ < 1.5) discard;
ambF = max(ambF, 1.0 - smoothstep(1.5, 5.0, vAmbZ));
gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)), ambF);
#include <tonemapping_fragment>`;

// a surroundings model's material with the fog: `u` holds the fog uniforms (read when the shader compiles), `shade` the
// mood's canopy shade, and `textures` collects the maps the surroundings release on dispose
export function fogMaterial(
  src: THREE.Material | null,
  opts: THREE.MeshLambertMaterialParameters,
  u: Record<string, THREE.IUniform>,
  shade: number,
  textures: THREE.Texture[],
) {
  const s = src as THREE.MeshStandardMaterial | null;
  // KayKit textures are palettes: no mipmap and nearest pixel, as in the scene (prepare)
  if (s?.map && !s.userData.procedural) nearestPixels(s.map);
  if (s?.map) textures.push(s.map);
  // Lambert: cheaper than the models' Standard, and from afar the difference is not visible
  const mat = new THREE.MeshLambertMaterial({
    map: s?.map ?? null,
    color: new THREE.Color(s?.color ?? 0xffffff).multiplyScalar(shade),
    vertexColors: !!s?.vertexColors,
    ...opts,
  });
  mat.customProgramCacheKey = () => 'amb';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = FOG_HEAD + sh.vertexShader.replace('#include <project_vertex>', FOG_VERT);
    sh.fragmentShader =
      FOG_HEAD +
      sh.fragmentShader
        .replace('#include <map_fragment>', SNOW_FRAG)
        .replace('#include <tonemapping_fragment>', FOG_FRAG);
  };
  return mat;
}
