// Textura por cima dos modelos KayKit (13/11, pedido do Fernando: "falta textura nas árvores e nos bonecos"): as peças são
// de cor lisa (uma paleta), então uma textura CC0 do terreno (terrain.ts) entra como granulado, projetada pelos três eixos
// do próprio modelo. Só muda o tom em volta da cor de cada peça, sem trocar a cor: o boneco continua reconhecível pelo
// time e pela classe.
import type * as THREE from 'three';

export interface DetailTextures { leaves: THREE.Texture; dirt: THREE.Texture }

// posição e normal no mundo (com a instância, nas árvores): a escala do arquivo varia de modelo para modelo, e medida no
// arquivo a textura saía tão miúda que sumia
const DET_VERT = `#include <begin_vertex>
vec4 dw = vec4(transformed, 1.0); vec3 dnw = objectNormal;
#ifdef USE_INSTANCING
dw = instanceMatrix * dw; dnw = mat3(instanceMatrix) * dnw;
#endif
vDPos = (modelMatrix * dw).xyz; vDN = mat3(modelMatrix) * dnw;`;

// Árvores (`colored`, 13/11, "ainda está sem a textura das árvores"): a foto das folhas some de longe (miúda demais para
// uma copa de ~100 px na tela), então a parte verde ganha tufos desenhados aqui (células de ~18 cm, cada uma com seu tom
// e borda escura, como folhagem) e o resto (tronco), a casca em listras verticais
const TUFT = `float dh1(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec3 dh3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float tuft(vec3 w) {
  vec3 q = w * 5.5, i = floor(q), f = fract(q);
  float md = 9.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)), r = g + dh3(i + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; id = dh1(i + g); }
  }
  return (0.8 + 0.45 * id) * mix(1.12, 0.62, smoothstep(0.08, 0.55, md));
}
`;
const TREE = 'mix(vec3(1.0), vec3(tuft(vDPos) * (0.75 + 0.5 * lum)), green) * mix(1.0, 0.45 + 1.3 * dot(texture2D(tDetDirt, vec2(vDPos.x + vDPos.z, vDPos.y * 0.35) * 1.6).rgb, vec3(0.333)), 1.0 - green)';

// `scale`: repetições da textura por metro
export function addDetail(sh: THREE.WebGLProgramParametersWithUniforms, tex: DetailTextures, scale: number, strength = 0.75, colored = false) {
  sh.uniforms.tDetLeaf = { value: tex.leaves };
  sh.uniforms.tDetDirt = { value: tex.dirt };
  sh.vertexShader = 'varying vec3 vDPos; varying vec3 vDN;\n' + sh.vertexShader.replace('#include <begin_vertex>', DET_VERT);
  const mixed = colored ? TREE : `mix(1.0, 0.35 + 1.4 * lum, ${strength.toFixed(2)})`;
  sh.fragmentShader = 'uniform sampler2D tDetLeaf; uniform sampler2D tDetDirt; varying vec3 vDPos; varying vec3 vDN;\n' + (colored ? TUFT : '') + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec3 dn = abs(normalize(vDN)); dn /= (dn.x + dn.y + dn.z);
      vec3 p = vDPos * ${scale.toFixed(2)};
      vec3 leaf = texture2D(tDetLeaf, p.zy).rgb * dn.x + texture2D(tDetLeaf, p.xy).rgb * dn.z + texture2D(tDetLeaf, p.xz).rgb * dn.y;
      vec3 dirt = texture2D(tDetDirt, p.zy).rgb * dn.x + texture2D(tDetDirt, p.xy).rgb * dn.z + texture2D(tDetDirt, p.xz).rgb * dn.y;
      float green = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
      float lum = dot(mix(dirt, leaf, green), vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb *= ${mixed};
      // sombreado (13/11, "os objetos também precisam ser sombreados"): a face virada para baixo e as de lado escurecem,
      // como oclusão do ambiente; sem isso a peça KayKit parecia acesa por igual no Bosque escuro
      diffuseColor.rgb *= 0.5 + 0.5 * smoothstep(-0.6, 0.9, normalize(vDN).y);
    }`);
}
