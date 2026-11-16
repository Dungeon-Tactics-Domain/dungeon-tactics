// Performance counter numbers (Fernando's request, Nov 12): frames and average time since the last reading, and Three's
// resources. Pixel art draws the scene more than once per frame: info sums everything and zeroes only at the start of the frame.
import type * as THREE from 'three';

export class PerfCounter {
  private frames = 0;
  private since = performance.now();

  tick() {
    this.frames++;
  }

  read(info: THREE.WebGLInfo) {
    const now = performance.now(),
      ms = now - this.since,
      frames = this.frames;
    this.frames = 0;
    this.since = now;
    return {
      fps: (frames * 1000) / ms,
      ms: frames ? ms / frames : 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }
}
