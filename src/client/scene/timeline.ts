// Everything in the battle runs on the battle clock (`t`), which goes 3 times faster while the speed-up button is held:
// walks, strikes, waits and the action camera all go through animate/wait here, never setTimeout.
import { awayFactor } from '../away.ts';

interface Anim {
  start: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
}

export class Timeline {
  private now = 0; // battle clock in ms (speeds up with speed())
  private readonly anims: Anim[] = [];

  get t(): number {
    return this.now;
  }

  // calls `step` with k from 0 to 1 over `dur` ms of battle time; resolves when it reaches 1
  animate(dur: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ start: this.now, dur, step, done }));
  }

  wait(ms: number): Promise<void> {
    return this.animate(ms, () => {});
  }

  // advances the clock by `ms` of battle time and steps every running animation (once per frame)
  // (the first frame back from the background drops the time it was away: away.ts)
  tick(ms: number) {
    this.now += ms * awayFactor();
    for (const a of [...this.anims]) {
      const k = Math.min(1, (this.now - a.start) / a.dur);
      a.step(k);
      if (k < 1) continue;
      this.anims.splice(this.anims.indexOf(a), 1);
      a.done();
    }
  }
}
