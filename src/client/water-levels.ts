// Alturas da água no desenho (13/11), à parte de water.ts para ser pura (sem Three) e testada, como markers.ts.
import { neighbors, posKey, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

export const DEEP_DROP = 0.45; // quanto a superfície da água funda fica abaixo da rasa, em níveis (só desenho; a regra lê depth)
export const WADE = 0.3; // quanto o boneco afunda na água rasa, em níveis: anda com a água nas canelas (a regra o põe 1 abaixo da margem)
const DEEP_BED = 1; // leito da funda, em níveis abaixo da superfície: some na cor escura, só não pode ficar à vista

export interface WaterLevel { surface: number; bed: number; deep: boolean; under?: true }

// Altura da superfície e do leito de cada casa de água e de cada ponte com água por baixo. O leito da rasa fica onde
// stand() põe os pés (WADE), para ninguém flutuar nem atravessar o chão.
export function waterLevels(grid: Grid, step: number): Map<string, WaterLevel> {
  const out = new Map<string, WaterLevel>();
  const bed = (surface: number, deep: boolean) => (deep ? Math.max(0.02, surface - DEEP_BED * step) : surface - WADE * step);
  const at = (i: number): Pos => ({ x: i % grid.width, y: Math.floor(i / grid.width) });
  grid.tiles.forEach((t, i) => {
    if (t.look !== 'water') return;
    const deep = (t.depth ?? 0) >= 2;
    const surface = (t.h + 1 - (deep ? DEEP_DROP : 0)) * step;
    out.set(posKey(at(i)), { surface, bed: bed(surface, deep), deep });
  });
  // ponte: a água passa por baixo na altura das vizinhas. Com a tábua rente à água (Cripta Alagada) não há vão e fica de fora
  grid.tiles.forEach((t, i) => {
    if (t.look !== 'bridge') return;
    const near = neighbors(grid, at(i)).map((q) => out.get(posKey(q))).filter((l): l is WaterLevel => !!l && !l.under);
    if (!near.length) return;
    const surface = Math.min(...near.map((l) => l.surface));
    if (surface > t.h * step - 0.01) return; // a tábua ocupa de h a h+1 nível
    const deep = near.some((l) => l.deep);
    out.set(posKey(at(i)), { surface, bed: bed(surface, deep), deep, under: true });
  });
  return out;
}
