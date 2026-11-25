import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { keepsHeadScale, parseHeadScale } from '../src/client/scene/head-scale.ts';

// Fernando, Nov 25: a smaller head on the KayKit figures as a sample of the 4-heads style, from the debug panel
describe('head scale sample', () => {
  it('reads back only a number between 0.55 and 1', () => {
    expect(parseHeadScale(0.7)).toBe(0.7);
    for (const bad of [0.2, 1.5, '0.7', null, Number.NaN]) expect(parseHeadScale(bad)).toBe(1);
  });
  it("drops only the head bone's scale track, which would undo the scale every frame", () => {
    const track = (name: string) => new THREE.VectorKeyframeTrack(name, [0], [1, 1, 1]);
    expect(keepsHeadScale(track('head.scale'))).toBe(false);
    expect(keepsHeadScale(track('head.quaternion'))).toBe(true);
    expect(keepsHeadScale(track('Knight_Head.scale'))).toBe(true);
  });
});
