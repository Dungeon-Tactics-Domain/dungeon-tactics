// Texture over the KayKit models (Nov 13, Fernando's request: "the trees and the units lack texture"): the pieces are
// flat-colored (one palette), so a CC0 terrain texture (terrain.ts) comes in as grain, projected along the three axes
// of the model itself. It only shifts the tone around each piece's color, without replacing the color. Applies to the KayKit pieces left over
// on open maps (brick walls, Gariland's crate); painted trees and objects (painted.ts) do not go through here, and
// units get only the shading (strength 0).
import type * as THREE from 'three';

export interface DetailTextures {
  leaves: THREE.Texture;
  dirt: THREE.Texture;
}

// world position and normal (with the instance): the file scale varies from model to model, and measured in the file the
// texture came out so tiny it vanished
const DET_VERT = `#include <begin_vertex>
vec4 dw = vec4(transformed, 1.0); vec3 dnw = objectNormal;
#ifdef USE_INSTANCING
dw = instanceMatrix * dw; dnw = mat3(instanceMatrix) * dnw;
#endif
vDPos = (modelMatrix * dw).xyz; vDN = mat3(modelMatrix) * dnw;`;

// `scale`: texture repeats per meter
export function addDetail(
  sh: THREE.WebGLProgramParametersWithUniforms,
  tex: DetailTextures,
  scale: number,
  strength = 0.75,
) {
  sh.vertexShader = `varying vec3 vDPos; varying vec3 vDN;\n${sh.vertexShader.replace('#include <begin_vertex>', DET_VERT)}`;
  // strength 0 (units and bodies, Nov 13: Fernando found the grain on them "ugly"): only a light shading, the side
  // slightly darker than the top, with no texture at all
  if (!strength) {
    sh.fragmentShader =
      'varying vec3 vDPos; varying vec3 vDN;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= 0.74 + 0.26 * smoothstep(-0.6, 0.9, normalize(vDN).y);',
      );
    return;
  }
  sh.uniforms.tDetLeaf = { value: tex.leaves };
  sh.uniforms.tDetDirt = { value: tex.dirt };
  sh.fragmentShader =
    'uniform sampler2D tDetLeaf; uniform sampler2D tDetDirt; varying vec3 vDPos; varying vec3 vDN;\n' +
    sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
    {
      vec3 dn = abs(normalize(vDN)); dn /= (dn.x + dn.y + dn.z);
      vec3 p = vDPos * ${scale.toFixed(2)};
      vec3 leaf = texture2D(tDetLeaf, p.zy).rgb * dn.x + texture2D(tDetLeaf, p.xy).rgb * dn.z + texture2D(tDetLeaf, p.xz).rgb * dn.y;
      vec3 dirt = texture2D(tDetDirt, p.zy).rgb * dn.x + texture2D(tDetDirt, p.xy).rgb * dn.z + texture2D(tDetDirt, p.xz).rgb * dn.y;
      float green = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
      float lum = dot(mix(dirt, leaf, green), vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb *= mix(1.0, 0.35 + 1.4 * lum, ${strength.toFixed(2)});
      // shading (Nov 13, "objects also need to be shaded"): the downward-facing and side faces darken,
      // like ambient occlusion; without it the KayKit piece looked evenly lit in the dark Ash Wood
      diffuseColor.rgb *= 0.5 + 0.5 * smoothstep(-0.6, 0.9, normalize(vDN).y);
    }`,
    );
}
