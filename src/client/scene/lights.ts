// The battle's sky and sun, and the Until Dawn light ramp; split out of scene.ts when it reached the 400-line limit
import * as THREE from 'three';
import type { Ambience } from '../ambience.ts';

export class SceneLights {
  private readonly sky = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private k: number | null = null; // the last phase light; null: the usual one (base)

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.sky);
    const sun = this.sun;
    this.base();
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
  }

  // Light of the Until Dawn mode (survival.ts): k = 0 is moonlit night (blue and weak), k = 1 is the rising sun (warm, at
  // normal strength). The player sees the end coming without reading the number; the other maps never call it and stay on the usual light.
  setDaylight(k: number, ambience: Ambience | null) {
    this.k = k;
    const mix = (night: string, day: string) => new THREE.Color(night).lerp(new THREE.Color(day), k);
    this.sky.color.copy(mix('#7d8fd8', '#ffe2c0'));
    this.sky.groundColor.copy(mix('#141226', '#3a3050'));
    this.sky.intensity = 0.55 + 0.6 * k;
    this.sun.color.copy(mix('#a9bcff', '#ffcf9a'));
    this.sun.intensity = 0.45 + 1.15 * k;
    (this.scene.background as THREE.Color).copy(mix('#0a0c1c', '#3b2638'));
    ambience?.setDaylight(k); // last: the surroundings fog rules the background color
  }

  // the sun's shadow map, which the renderer made and nothing else frees (the tile pictures' lights, scene/tile-shot.ts)
  dispose() {
    this.sun.shadow.dispose();
  }

  private base() {
    this.sky.color.set('#fff1d6');
    this.sky.groundColor.set('#3a3050');
    this.sky.intensity = 1.15;
    this.sun.color.set('#ffffff');
    this.sun.intensity = 1.6;
    this.sun.position.set(-6, 12, 4);
  }

  // New surroundings (BattleScene.setGrid): they multiply the light as they mount, so it goes back to the scene's own
  // first, and the phase light is laid again after
  remount(ambience: Ambience) {
    if (this.k === null) this.base();
    ambience.mount(this.scene);
    if (this.k !== null) this.setDaylight(this.k, ambience);
  }
}
