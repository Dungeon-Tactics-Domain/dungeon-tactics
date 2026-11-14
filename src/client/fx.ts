// Gesture and effect of each ability (Nov 12, Fernando's request: animations with the same role as FFT's). Each row gives the
// unit's clip (KayKit; the Rig_Medium pack ones come from public/models/animations.glb) and the effect, made only of simple
// Three shapes (nothing copied from the original game). The scene calls `playFx` on impact and `chargeAura` while charging.
import * as THREE from 'three';

export type FxKind =
  | 'slash'
  | 'heavy'
  | 'stab'
  | 'arrow'
  | 'knife'
  | 'rock'
  | 'flask'
  | 'fire'
  | 'blast'
  | 'wind'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'impact'
  | 'spin'
  | 'dash';
export interface AbilityLook {
  clip: string; // gesture when acting (or when releasing the charge)
  charge?: string; // looping gesture while charging
  fx: FxKind;
}

const MAGIC_CHARGE = 'Ranged_Magic_Spellcasting',
  BOW_CHARGE = 'Ranged_Bow_Aiming_Idle';
// key: game ability id, or the end of the study id (fft_<unit>_<ability>), or the whole study id
const LOOKS: Record<string, AbilityLook> = {
  strike: { clip: 'Melee_1H_Attack_Chop', fx: 'slash' },
  heavy_strike: { clip: 'Melee_2H_Attack_Chop', fx: 'heavy' },
  shield_bash: { clip: 'Melee_Block_Attack', fx: 'impact' },
  spin: { clip: '2H_Melee_Attack_Spin', fx: 'spin' },
  shot: { clip: 'Ranged_Bow_Release', fx: 'arrow' },
  aimed_shot: { clip: 'Ranged_Bow_Release', charge: BOW_CHARGE, fx: 'arrow' },
  knock_shot: { clip: 'Ranged_Bow_Release', fx: 'arrow' },
  dagger: { clip: 'Melee_1H_Attack_Stab', fx: 'stab' },
  firebolt: { clip: 'Ranged_Magic_Shoot', fx: 'fire' },
  blast: { clip: 'Ranged_Magic_Raise', charge: MAGIC_CHARGE, fx: 'blast' },
  shadow_wave: { clip: 'Ranged_Magic_Raise', charge: MAGIC_CHARGE, fx: 'blast' }, // Explosion effect: it is what draws the whole area
  gust: { clip: 'Ranged_Magic_Shoot', charge: MAGIC_CHARGE, fx: 'wind' },
  heal: { clip: 'Ranged_Magic_Raise', charge: MAGIC_CHARGE, fx: 'heal' },
  stab: { clip: 'Melee_1H_Attack_Stab', fx: 'stab' },
  throwing_knife: { clip: 'Throw', fx: 'knife' },
  trip: { clip: 'Unarmed_Melee_Attack_Kick', fx: 'impact' },
  deathblow: { clip: 'Melee_1H_Attack_Slice_Diagonal', fx: 'heavy' },
  cleave: { clip: 'Melee_2H_Attack_Chop', fx: 'heavy' },
  slam: { clip: 'Melee_Unarmed_Attack_Punch_A', fx: 'impact' },
  lance: { clip: 'Melee_1H_Attack_Stab', fx: 'stab' },
  sweep: { clip: '2H_Melee_Attack_Spin', fx: 'impact' },
  lance_jump: { clip: 'Melee_2H_Attack_Chop', charge: 'Jump_Idle', fx: 'heavy' }, // charges "in the air" and lands with the strike
  // FFT study
  attack: { clip: 'Melee_1H_Attack_Chop', fx: 'slash' },
  fft_archer_attack: { clip: 'Ranged_Bow_Release', fx: 'arrow' },
  fft_chemist_attack: { clip: 'Melee_1H_Attack_Stab', fx: 'stab' },
  stone: { clip: 'Throw', fx: 'rock' },
  dash: { clip: 'Dodge_Forward', fx: 'dash' },
  accumulate: { clip: 'Cheer', fx: 'buff' },
  yell: { clip: 'Cheer', fx: 'buff' },
  wish: { clip: 'Ranged_Magic_Raise', fx: 'heal' },
  potion: { clip: 'Throw', fx: 'flask' },
  speed_break: { clip: 'Melee_1H_Attack_Chop', fx: 'debuff' },
  power_break: { clip: 'Melee_1H_Attack_Chop', fx: 'debuff' },
  charge1: { clip: 'Ranged_Bow_Release', charge: BOW_CHARGE, fx: 'arrow' },
  charge2: { clip: 'Ranged_Bow_Release', charge: BOW_CHARGE, fx: 'arrow' },
  fire: { clip: 'Ranged_Magic_Shoot', charge: MAGIC_CHARGE, fx: 'blast' },
  cure: { clip: 'Ranged_Magic_Raise', charge: MAGIC_CHARGE, fx: 'heal' },
};
// '½': half-tile ability (half.ts) uses the original's gesture
export const lookOf = (id: string): AbilityLook => {
  const b = id.replace(/½$/, '');
  return LOOKS[b] ?? LOOKS[b.split('_').slice(2).join('_')] ?? LOOKS.strike;
};

// effect colors: light, not theme paint (the HUD follows the :root variables; this is inside the 3D scene)
const COLOR: Record<FxKind, string> = {
  slash: '#ffffff',
  heavy: '#ffe08a',
  stab: '#e8f4ff',
  arrow: '#f2e3c4',
  knife: '#d8e2ec',
  rock: '#8a7e70',
  flask: '#7fe0ff',
  fire: '#ff7a2a',
  blast: '#ff9a3c',
  wind: '#cfefff',
  heal: '#7dffa8',
  buff: '#ffd34a',
  debuff: '#b07dff',
  impact: '#d6c7a8',
  spin: '#ffffff',
  dash: '#d6c7a8',
};

export type Tween = (ms: number, step: (k: number) => void) => Promise<void>;

const glow = (color: string, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

function spawn(scene: THREE.Scene, mesh: THREE.Object3D) {
  scene.add(mesh);
  return () => {
    scene.remove(mesh);
    // piece with several parts (the arrow and the knife): releases each one
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  };
}

// Little bits (cubes, like pixels; 0.11 per side to read from the top camera) that rise, fall or splash from `at`
async function bits(
  scene: THREE.Scene,
  tween: Tween,
  at: THREE.Vector3,
  color: string,
  mode: 'up' | 'down' | 'burst',
  spread: number,
  ms: number,
) {
  const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const list = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(geo, glow(color));
    const a = (i / 14) * Math.PI * 2;
    const r = spread * (0.3 + ((i * 37) % 10) / 14);
    const start = at.clone().add(new THREE.Vector3(Math.cos(a) * r, mode === 'down' ? 1 : 0, Math.sin(a) * r));
    scene.add(m);
    return { m, start, a, delay: (i % 5) / 10 };
  });
  await tween(ms, (k) => {
    for (const b of list) {
      const t = Math.max(0, Math.min(1, (k - b.delay * 0.5) / 0.6));
      const p = b.start.clone();
      if (mode === 'up') p.y += t * 1.1;
      else if (mode === 'down') p.y -= t * 0.9;
      else p.add(new THREE.Vector3(Math.cos(b.a) * t * 0.5, Math.sin(Math.PI * t) * 0.5, Math.sin(b.a) * t * 0.5));
      b.m.position.copy(p);
      (b.m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
  });
  for (const b of list) {
    scene.remove(b.m);
    (b.m.material as THREE.Material).dispose();
  }
  geo.dispose();
}

// ring that opens on the ground (explosion, wind, spin)
async function ring(scene: THREE.Scene, tween: Tween, at: THREE.Vector3, color: string, radius: number, ms: number) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2), glow(color));
  m.position.copy(at);
  const done = spawn(scene, m);
  await tween(ms, (k) => {
    m.scale.setScalar(0.2 + k * radius);
    (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  });
  done();
}

// slash arc on the target
async function arc(
  scene: THREE.Scene,
  tween: Tween,
  at: THREE.Vector3,
  from: THREE.Vector3,
  color: string,
  size: number,
  ms: number,
) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.5 * size, 0.06 * size, 3, 14, Math.PI * 0.9), glow(color));
  m.position.copy(at);
  m.lookAt(from);
  const done = spawn(scene, m);
  await tween(ms, (k) => {
    m.rotation.z = -1.2 + k * 2.4;
    (m.material as THREE.MeshBasicMaterial).opacity = 1 - k * k;
  });
  done();
}

// projectile from `from` to `to`, straight or arced (rock and flask rise as in a throw)
// `spin`: turns per second around its own axis (the knife spins in the air; the arrow does not)
async function fly(
  scene: THREE.Scene,
  tween: Tween,
  from: THREE.Vector3,
  to: THREE.Vector3,
  geo: THREE.BufferGeometry | THREE.Object3D,
  color: string,
  height: number,
  ms: number,
  spin = 0,
) {
  const m = geo instanceof THREE.Object3D ? geo : new THREE.Mesh(geo, glow(color, 1));
  const done = spawn(scene, m);
  await tween(ms, (k) => {
    m.position.lerpVectors(from, to, k).y += Math.sin(Math.PI * k) * height;
    m.lookAt(to);
    if (spin) m.rotateX(k * (ms / 1000) * spin * Math.PI * 2);
  });
  done();
}

// Real arrow and knife in the air (Nov 13, Fernando's request: "the thrown knife must be a knife projectile, and the arrow
// an arrow projectile"): simple pieces pointing to +z (lookAt aims at the target)
function arrowModel(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6a44' }),
    iron = new THREE.MeshLambertMaterial({ color: '#c9d2da' }),
    feather = new THREE.MeshLambertMaterial({ color: '#e8e1cf', side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5).rotateX(Math.PI / 2), wood));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.35), iron));
  for (const turn of [0, Math.PI / 2])
    g.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.14)
          .rotateY(Math.PI / 2)
          .rotateZ(turn)
          .translate(0, 0, -0.26),
        feather,
      ),
    );
  return g;
}
function knifeModel(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Shape([new THREE.Vector2(-0.025, 0), new THREE.Vector2(0.025, 0), new THREE.Vector2(0, 0.2)]);
  g.add(
    new THREE.Mesh(
      new THREE.ShapeGeometry(blade).rotateX(-Math.PI / 2).translate(0, 0, 0.02),
      new THREE.MeshLambertMaterial({ color: '#dfe6ec', side: THREE.DoubleSide }),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.02, 0.02).translate(0, 0, 0.01),
      new THREE.MeshLambertMaterial({ color: '#b08a3a' }),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0, -0.045),
      new THREE.MeshLambertMaterial({ color: '#5a3d24' }),
    ),
  );
  return g;
}

// Ability effect from the gesture to the impact (waits for the projectile to arrive); what comes after the impact does not hold up the queue
export async function playFx(
  scene: THREE.Scene,
  tween: Tween,
  kind: FxKind,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  travel: number,
) {
  const c = COLOR[kind];
  const after = (p: Promise<void>) => void p;
  switch (kind) {
    case 'slash':
    case 'stab':
      return arc(scene, tween, to, from, c, kind === 'stab' ? 0.7 : 1, 220);
    case 'heavy':
      after(bits(scene, tween, to, '#ffffff', 'burst', 0.2, 400));
      return arc(scene, tween, to, from, c, 1.6, 300);
    case 'impact':
    case 'dash':
      return bits(scene, tween, to, c, 'burst', 0.25, 380);
    case 'spin':
      return ring(scene, tween, from, c, 1.6, 300);
    case 'arrow':
      return fly(scene, tween, from, to, arrowModel(), c, 0.15, travel);
    case 'knife':
      return fly(scene, tween, from, to, knifeModel(), c, 0.1, travel, 3);
    case 'rock':
      await fly(scene, tween, from, to, new THREE.DodecahedronGeometry(0.12), c, 1.1, travel * 1.4);
      return after(bits(scene, tween, to, c, 'burst', 0.2, 320));
    case 'flask':
      await fly(scene, tween, from, to, new THREE.CylinderGeometry(0.06, 0.08, 0.18, 6), c, 1.1, travel * 1.4);
      return after(bits(scene, tween, to, '#7dffa8', 'up', 0.3, 700));
    case 'fire':
      await fly(scene, tween, from, to, new THREE.IcosahedronGeometry(0.22), c, 0.3, travel);
      return after(ring(scene, tween, to, c, 1, 280));
    case 'blast':
      after(bits(scene, tween, to, '#ffd08a', 'burst', 0.4 + radius * 0.5, 500));
      return ring(scene, tween, to, c, 1.2 + radius * 1.6, 380);
    case 'wind':
      return ring(scene, tween, to, c, 1.4, 320);
    case 'heal':
      return bits(scene, tween, to, c, 'up', 0.3 + radius * 0.6, 650);
    case 'buff':
      return bits(scene, tween, to, c, 'up', 0.35, 650);
    case 'debuff':
      after(arc(scene, tween, to, from, '#ffffff', 0.8, 220));
      return bits(scene, tween, to, c, 'down', 0.3, 600);
  }
}

// Aura on the ground of whoever is charging (like the glow of a caster in FFT): stays until the charge goes off or is undone
export function chargeAura(magic: boolean): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 6).rotateX(-Math.PI / 2),
    glow(magic ? '#7fc4ff' : '#ffb347', 0.85),
  );
  m.position.y = 0.06;
  m.onBeforeRender = () => {
    m.rotation.y += 0.04;
    m.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.08);
  };
  return m;
}
