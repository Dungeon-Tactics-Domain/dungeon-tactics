// The battle's sky and sun, and the Until Dawn light ramp; split out of scene.ts when it reached the 400-line limit
import * as THREE from 'three';
import type { Ambience } from '../ambience.ts';

export class SceneLights {
  private readonly sky = new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.6);

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.sky);
    const sun = this.sun;
    sun.position.set(-6, 12, 4);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
  }

  // Light of the Until Dawn mode (survival.ts): k = 0 is moonlit night (blue and weak), k = 1 is the rising sun (warm, at
  // normal strength). The player sees the end coming without reading the number; the other maps never call it and stay on the usual light.
  setDaylight(k: number, ambience: Ambience | null) {
    const mix = (night: string, day: string) => new THREE.Color(night).lerp(new THREE.Color(day), k);
    this.sky.color.copy(mix('#7d8fd8', '#ffe2c0'));
    this.sky.groundColor.copy(mix('#141226', '#3a3050'));
    this.sky.intensity = 0.55 + 0.6 * k;
    this.sun.color.copy(mix('#a9bcff', '#ffcf9a'));
    this.sun.intensity = 0.45 + 1.15 * k;
    (this.scene.background as THREE.Color).copy(mix('#0a0c1c', '#3b2638'));
    ambience?.setDaylight(k); // last: the surroundings fog rules the background color
  }
}
