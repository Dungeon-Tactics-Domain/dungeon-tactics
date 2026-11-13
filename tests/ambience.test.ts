import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Ambience, LIMIT, MOODS, kindOf } from '../src/client/ambience.ts';
import { chapterScenario } from '../src/client/campaign.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// distância até a borda do tabuleiro, como em ambience.ts (mapa centrado na origem)
const out = (x: number, z: number, w: number, h: number) => Math.hypot(Math.max(Math.abs(x) - w / 2, 0), Math.max(Math.abs(z) - h / 2, 0));

describe('arredores do tabuleiro', () => {
  it('o clima sai do mapa, também nas fases da campanha (que reaproveitam a grade do mapa base)', () => {
    expect(kindOf(SCENARIOS.ash_wood.grid)).toBe('forest');
    expect(kindOf(SCENARIOS.flooded_crypt.grid)).toBe('crypt');
    expect(kindOf(chapterScenario(5).grid)).toBe('frost');
    expect(kindOf(chapterScenario(1).grid)).toBe('field');
  });

  // a regra que impede os arredores de tapar casa e boneco de qualquer giro da câmera: nada acima de LIMIT(d)
  for (const id of ['ash_wood', 'beacon_hill', 'frost_pass']) {
    it(`nada passa da linha de visão do tabuleiro em ${id}`, () => {
      const grid = SCENARIOS[id].grid;
      const mood = MOODS[kindOf(grid)];
      // modelo de mentira: um cubo de 1 com a base no chão (a cena real usa os glTF do KayKit)
      const box = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial());
      const amb = new Ambience(grid, mood, new Map(mood.props.map((p) => [p.model, box()])));
      let checked = 0;
      const v = new THREE.Vector3(), m = new THREE.Matrix4();
      amb.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh.material as THREE.Material).transparent) return; // névoa e raios são transparentes, não tapam
        if (mesh.name === 'extensao') { // casas de fora: nunca acima da casa da borda mais perto (mesma altura na frente não tapa boneco)
          const step = grid.levelHeight ?? 0.5, ext = mesh as THREE.InstancedMesh;
          for (let i = 0; i < ext.count; i++) {
            ext.getMatrixAt(i, m);
            v.setFromMatrixPosition(m);
            const tx = Math.min(Math.max(Math.floor(v.x + grid.width / 2), 0), grid.width - 1), ty = Math.min(Math.max(Math.floor(v.z + grid.height / 2), 0), grid.height - 1);
            const top = v.y + new THREE.Vector3().setFromMatrixScale(m).y / 2;
            expect(top).toBeLessThanOrEqual((grid.tiles[ty * grid.width + tx].h + 1) * step + 1e-6);
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
