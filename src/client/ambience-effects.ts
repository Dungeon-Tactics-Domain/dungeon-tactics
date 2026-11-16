// What moves in the air around the board: torch and crystal glows, the low mist, the light rays and the particles.
import * as THREE from 'three';
import { FOG_HEAD, skipNormalPass } from './ambience-fog.ts';
import type { Mood, Pair } from './ambience-moods.ts';

const SUN = new THREE.Vector3(6, -12, -4).normalize(); // the light ray comes from where the scene's sun comes from (sun.position -6, 12, 4)

// Ambience builds it after swapping its fog uniforms: the rays share the swapped ambHalf, ambNear and ambFar, so they
// vanish with the fog. Everything goes into the Ambience root, in the order the build calls come.
export class AirEffects {
  private readonly beams: { mesh: THREE.Mesh; top: THREE.Vector3; dir: THREE.Vector3; w: number; len: number }[] = [];
  private readonly glows: { mesh: THREE.Mesh; size: number; seed: number; light?: THREE.PointLight }[] = [];
  private readonly beamU;
  private readonly moteU;

  constructor(
    private readonly root: THREE.Group,
    private readonly u: Record<string, THREE.IUniform>,
    private readonly mood: Mood,
    private readonly hw: number,
    private readonly hh: number,
    private readonly height: (x: number, z: number) => number,
    private readonly textures: THREE.Texture[],
  ) {
    this.beamU = {
      uColor: { value: new THREE.Color() },
      uPower: { value: 0 },
      uTime: u.uTime,
      ambHalf: u.ambHalf,
      ambNear: u.ambNear,
      ambFar: u.ambFar,
    };
    this.moteU = { uColor: { value: new THREE.Color() }, uTime: u.uTime, uScale: { value: 1 } };
  }

  private glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private glowTex: THREE.Texture | null = null;
  // flame or crystal glow: plane facing the camera, additive, flickering per frame
  glow(p: THREE.Vector3, color: string, size: number, seed: number, light?: THREE.PointLight) {
    this.glowTex ??= this.glowTexture();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.copy(p);
    skipNormalPass(mesh);
    this.root.add(mesh);
    this.glows.push({ mesh, size, seed: seed * 100, light });
  }

  // Low mist: a wide plane a little above the ground, with noise that moves slowly; vanishes over the board
  buildMist() {
    if (!this.mood.mist) return;
    const size = Math.max(this.hw, this.hh) * 2 + 60;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec3 vAmbW; varying float vAmbY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vAmbW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; }',
      fragmentShader: `${FOG_HEAD} uniform float uTime;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float d = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
          float k = n(vAmbW.xz * 0.16 + vec2(uTime * 0.00004, uTime * 0.000025)) * 0.6 + n(vAmbW.xz * 0.42 - vec2(uTime * 0.00007, 0.0)) * 0.4;
          float a = ambMist * smoothstep(0.3, 3.0, d) * smoothstep(0.3, 0.85, k);
          gl_FragColor = vec4(mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)) * 1.15, a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    mesh.position.y = -0.35;
    mesh.renderOrder = 1; // after the ground and the models, which are opaque
    skipNormalPass(mesh);
    this.root.add(mesh);
  }

  // Light rays (god rays): long strips in the sun's direction, additive, always sideways to the camera (they rotate around
  // their own axis per frame); some fall on the board, weak enough not to hide the tiles
  buildBeams(rand: () => number) {
    const b = this.mood.beams;
    if (!b.n) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.beamU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader:
        'varying vec2 vUv; varying vec2 vBeam; varying vec3 vBW; attribute vec2 beam; void main() { vUv = uv; vBeam = beam; vBW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uTime; uniform vec2 ambHalf; uniform float ambNear; uniform float ambFar; varying vec2 vUv; varying vec2 vBeam; varying vec3 vBW;
        void main() {
          float across = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 1.6);
          float along = (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.12, vUv.y);
          float dust = 0.7 + 0.3 * sin(vUv.y * 22.0 + uTime * 0.0011 + vBeam.x) * sin(vUv.x * 9.0 - uTime * 0.0006);
          float breathe = 0.55 + 0.45 * sin(uTime * 0.0004 + vBeam.x);
          // vanishes together with the fog: with the fade to black, the ray outside the map drew a light streak in the dark (Beacon Hill)
          float fade = 1.0 - smoothstep(ambNear, ambFar, length(max(abs(vBW.xz) - ambHalf, 0.0)));
          gl_FragColor = vec4(uColor * uPower * vBeam.y * across * along * dust * breathe * fade, 1.0);
        }`,
    });
    const sun = this.mood.light ? new THREE.Vector3(...this.mood.light.at).negate().normalize() : SUN;
    const dir = sun
      .clone()
      .lerp(new THREE.Vector3(0, -1, 0), 1 - b.tilt)
      .normalize();
    for (let i = 0; i < b.n; i++) {
      // one third falls on the board, at 35% strength (the tile and the unit below stay legible); the rest in the surrounding forest
      const onBoard = i % 3 === 0;
      const g = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
      g.setAttribute(
        'beam',
        new THREE.Float32BufferAttribute(new Array(4).fill([rand() * 100, onBoard ? 0.35 : 1]).flat(), 2),
      );
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      skipNormalPass(mesh);
      const r = onBoard ? 0 : 1 + rand() * 7;
      const a = rand() * Math.PI * 2;
      const x = onBoard ? (rand() - 0.5) * this.hw * 1.6 : Math.cos(a) * (this.hw + r),
        z = onBoard ? (rand() - 0.5) * this.hh * 1.6 : Math.sin(a) * (this.hh + r);
      const foot = new THREE.Vector3(x, onBoard ? 0.5 : this.height(x, z), z);
      const len = 13 + rand() * 4;
      this.beams.push({
        mesh,
        top: foot.clone().addScaledVector(dir, -len),
        dir,
        w: (onBoard ? 0.7 : 1) * (0.8 + rand() * 1.6),
        len,
      });
      this.root.add(mesh);
    }
  }

  // Particles in the air (pollen, fireflies, flakes, ashes): points in a box around the board, moved only in the shader
  buildMotes(rand: () => number) {
    const m = this.mood.motes;
    const box = [this.hw + 5, m.top / 2, this.hh + 5];
    const seed = new Float32Array(m.n * 4).map(() => rand());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(m.n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); // the position comes from the shader: never cull by volume
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.moteU,
        uBox: { value: new THREE.Vector3(...box) },
        uSize: { value: m.size },
        uFall: { value: m.fall },
        uAlpha: { value: m.add ? 0.9 : 0.85 },
      },
      transparent: true,
      depthWrite: false,
      blending: m.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed; uniform vec3 uBox; uniform float uTime; uniform float uSize; uniform float uScale; uniform float uFall; varying float vA;
        void main() {
          vec3 p = (seed.xyz * 2.0 - 1.0) * uBox;
          p.y = mod(seed.y * uBox.y * 2.0 - uTime * uFall * (0.6 + seed.w), uBox.y * 2.0) - 0.5;
          p.x += sin(uTime * 0.0006 + seed.w * 40.0) * 0.5;
          p.z += cos(uTime * 0.00045 + seed.w * 23.0) * 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max(1.0, uSize * uScale * (0.6 + seed.w * 0.8));
          vA = 0.55 + 0.45 * sin(uTime * 0.0025 + seed.w * 60.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(uColor, uAlpha * vA * (1.0 - r * 1.6)); }`,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    // size in tiles, not pixels: the same with and without pixel art (pixel art draws on a smaller screen)
    points.onBeforeRender = (r, scene, cam, geo) => {
      geo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
      const o = cam as THREE.OrthographicCamera;
      this.moteU.uScale.value = (r.getRenderTarget()?.height ?? r.domElement.height) / (o.top - o.bottom);
    };
    points.renderOrder = 2;
    this.root.add(points);
  }

  // the phase light (Ambience.setDaylight): `mix` blends a night and day pair at it
  setDaylight(k: number, mix: (pair: Pair, out: THREE.Color) => void) {
    const m = this.mood;
    mix(m.beams.color, this.beamU.uColor.value);
    mix(m.motes.color, this.moteU.uColor.value);
    this.beamU.uPower.value = THREE.MathUtils.lerp(m.beams.power[0], m.beams.power[1], k * k);
  }

  private readonly fwd = new THREE.Vector3();
  update(ms: number, camera: THREE.Camera) {
    this.u.uTime.value = ms;
    camera.getWorldDirection(this.fwd);
    const side = new THREE.Vector3(),
      face = new THREE.Vector3(),
      up = new THREE.Vector3();
    for (const b of this.beams) {
      // the strip sits on the ray's axis and sideways to the camera: from any rotation it looks like a volume of light
      side.crossVectors(b.dir, this.fwd).normalize();
      up.copy(b.dir).negate();
      face.crossVectors(side, up);
      b.mesh.matrix
        .makeBasis(side, up, face)
        .scale(new THREE.Vector3(b.w, b.len, 1))
        .setPosition(b.top);
    }
    for (const g of this.glows) {
      g.mesh.quaternion.copy(camera.quaternion);
      // flame flicker: two out-of-phase waves, no draw (the battle clock speeds up along with it)
      const f = 0.85 + 0.1 * Math.sin(ms * 0.013 + g.seed) + 0.05 * Math.sin(ms * 0.031 + g.seed * 2);
      g.mesh.scale.setScalar(g.size * f);
      if (g.light) g.light.intensity = 7 * f;
    }
  }
}
