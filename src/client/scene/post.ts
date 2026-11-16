// The pixel art chain of the scene: the outline strengths and the reduced palette, and the options that switch them.
import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { PixelSettings } from '../pixel-settings.ts';

export const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // outline from the approved POC

// Reduced palette: each channel in a few steps, after the sRGB conversion (steps equal to the eye). 6 levels
// recall the SNES's 15 bits without becoming a poster; the option exists for Fernando to compare.
export const PALETTE_SHADER = {
  uniforms: { tDiffuse: { value: null }, levels: { value: 6 } },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(floor(c.rgb * levels + 0.5) / levels, c.a); }',
};

export function applyPixel(
  p: PixelSettings,
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer,
  renderPass: RenderPass,
  pixelPass: RenderPixelatedPass,
  palettePass: ShaderPass,
) {
  const on = p.size > 0;
  renderPass.enabled = !on;
  pixelPass.enabled = on;
  if (on) pixelPass.setPixelSize(p.size);
  pixelPass.depthEdgeStrength = p.outline ? EDGES.depthEdgeStrength : 0;
  pixelPass.normalEdgeStrength = p.outline ? EDGES.normalEdgeStrength : 0;
  palettePass.enabled = p.palette;
  // pixel art draws at 1x even on a 3x screen (the blocks are already bigger than the device pixel and the phone is grateful);
  // without it, screen sharpness up to 2x
  const ratio = on ? 1 : Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
}
