import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Ambience, kindOf, LIMIT, MOODS } from '../src/client/ambience.ts';
import { buildDevScenario, unitFrom } from '../src/client/dev-roster.ts';
import { extH } from '../src/client/terrain.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// distance to the board edge, as in ambience.ts (map centered on the origin)
const out = (x: number, z: number, w: number, h: number) =>
  Math.hypot(Math.max(Math.abs(x) - w / 2, 0), Math.max(Math.abs(z) - h / 2, 0));

describe('board surroundings', () => {
  it('weather comes from the map, also in developer battles (which reuse the base map grid)', () => {
    expect(kindOf(SCENARIOS.ash_wood.grid)).toBe('forest');
    expect(kindOf(SCENARIOS.flooded_crypt.grid)).toBe('crypt');
    const cast = (map: string) =>
      buildDevScenario({ map, heroes: [unitFrom('warrior')], enemies: [unitFrom('brute')] });
    expect(kindOf(cast('frost_pass').grid)).toBe('frost');
    expect(kindOf(cast('beacon_hill').grid)).toBe('field');
  });

  // the rule that keeps the surroundings from hiding tiles and units at any camera angle: nothing above LIMIT(d)
  for (const id of ['ash_wood', 'beacon_hill', 'frost_pass']) {
    it(`nothing crosses the board's line of sight in ${id}`, () => {
      const grid = SCENARIOS[id].grid;
      const mood = MOODS[kindOf(grid)];
      // fake model: a 1-unit cube with its base on the ground (the real scene uses the KayKit glTFs)
      const box = () =>
        new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial());
      const amb = new Ambience(grid, mood, new Map(mood.props.map((p) => [p.model, box()])));
      let checked = 0;
      const v = new THREE.Vector3(),
        m = new THREE.Matrix4();
      amb.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh.material as THREE.Material).transparent) return; // fog and rays are transparent, they don't block
        if (mesh.name === 'extension') {
          // outer tiles: never above the nearest edge tile (same height in front doesn't hide a unit)
          const step = grid.levelHeight ?? 0.5,
            ext = mesh as THREE.InstancedMesh;
          for (let i = 0; i < ext.count; i++) {
            ext.getMatrixAt(i, m);
            v.setFromMatrixPosition(m);
            const ci = Math.floor(v.x + grid.width / 2),
              cj = Math.floor(v.z + grid.height / 2);
            const ring = Math.max(-ci, -cj, ci - grid.width + 1, cj - grid.height + 1);
            const top = v.y + new THREE.Vector3().setFromMatrixScale(m).y / 2;
            expect(top).toBeLessThanOrEqual((extH(grid, ci, cj, ring) + 1) * step + 1e-6); // the lowest tile nearby: the camera looks diagonally
          }
          return;
        }
        const pos = mesh.geometry.getAttribute('position');
        const n = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
        for (let i = 0; i < n; i++) {
          if (n > 1 || (mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).getMatrixAt(i, m);
          else m.identity();
          for (let j = 0; j < pos.count; j++) {
            v.fromBufferAttribute(pos, j).applyMatrix4(m);
            expect(v.y).toBeLessThanOrEqual(LIMIT(out(v.x, v.z, grid.width, grid.height)) + 1e-6);
            checked++;
          }
        }
      });
      expect(checked).toBeGreaterThan(1000);
      amb.dispose();
    });
  }
});
