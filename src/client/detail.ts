// Textura por cima dos modelos KayKit (13/11, pedido do Fernando: "falta textura nas árvores e nos bonecos"): as peças são
// de cor lisa (uma paleta), então uma textura CC0 do terreno (terrain.ts) entra como granulado, projetada pelos três eixos
// do próprio modelo. Só muda o tom em volta da cor de cada peça, sem trocar a cor. Vale para as peças KayKit que sobraram
// nos mapas abertos (muros de tijolo, caixa de Gariland); árvores e objetos pintados (painted.ts) não passam por aqui, e
// os bonecos levam só o sombreado (força 0).
import type * as THREE from 'three';

export interface DetailTextures { leaves: THREE.Texture; dirt: THREE.Texture }

// posição e normal no mundo (com a instância): a escala do arquivo varia de modelo para modelo, e medida no arquivo a
// textura saía tão miúda que sumia
const DET_VERT = `#include <begin_vertex>
vec4 dw = vec4(transformed, 1.0); vec3 dnw = objectNormal;
#ifdef USE_INSTANCING
dw = instanceMatrix * dw; dnw = mat3(instanceMatrix) * dnw;
#endif
vDPos = (modelMatrix * dw).xyz; vDN = mat3(modelMatrix) * dnw;`;

// `scale`: repetições da textura por metro
export function addDetail(sh: THREE.WebGLProgramParametersWithUniforms, tex: DetailTextures, scale: number, strength = 0.75) {
  sh.vertexShader = 'varying vec3 vDPos; varying vec3 vDN;\n' + sh.vertexShader.replace('#include <begin_vertex>', DET_VERT);
  // força 0 (bonecos e corpos, 13/11: o Fernando achou o granulado em cima deles "zoado"): só um sombreado leve, o lado
  // um pouco mais escuro que o alto, sem textura nenhuma
  if (!strength) {
    sh.fragmentShader = 'varying vec3 vDPos; varying vec3 vDN;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 0.74 + 0.26 * smoothstep(-0.6, 0.9, normalize(vDN).y);');
    return;
  }
  sh.uniforms.tDetLeaf = { value: tex.leaves };
  sh.uniforms.tDetDirt = { value: tex.dirt };
  sh.fragmentShader = 'uniform sampler2D tDetLeaf; uniform sampler2D tDetDirt; varying vec3 vDPos; varying vec3 vDN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec3 dn = abs(normalize(vDN)); dn /= (dn.x + dn.y + dn.z);
      vec3 p = vDPos * ${scale.toFixed(2)};
      vec3 leaf = texture2D(tDetLeaf, p.zy).rgb * dn.x + texture2D(tDetLeaf, p.xy).rgb * dn.z + texture2D(tDetLeaf, p.xz).rgb * dn.y;
      vec3 dirt = texture2D(tDetDirt, p.zy).rgb * dn.x + texture2D(tDetDirt, p.xy).rgb * dn.z + texture2D(tDetDirt, p.xz).rgb * dn.y;
      float green = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
      float lum = dot(mix(dirt, leaf, green), vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb *= mix(1.0, 0.35 + 1.4 * lum, ${strength.toFixed(2)});
      // sombreado (13/11, "os objetos também precisam ser sombreados"): a face virada para baixo e as de lado escurecem,
      // como oclusão do ambiente; sem isso a peça KayKit parecia acesa por igual no Bosque escuro
      diffuseColor.rgb *= 0.5 + 0.5 * smoothstep(-0.6, 0.9, normalize(vDN).y);
    }`);
}
