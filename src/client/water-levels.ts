// Alturas da água no desenho (13/11), à parte de water.ts para ser pura (sem Three) e testada, como markers.ts.
import { neighbors, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

// quanto a superfície da água funda fica abaixo da rasa, em níveis (só desenho; a regra lê depth). 0,8 desde 13/11, pedido
// do Fernando ("mais profundidade da água perto da ponte"): com 0,45 o rio fundo parecia rente à margem e a ponte quase sem vão
export const DEEP_DROP = 0.8;
export const WADE = 0.45; // quanto o boneco afunda na água rasa, em níveis: água pela cintura (13/11: com 0,3 as pernas quase não apareciam na água transparente; a regra o põe 1 abaixo da margem)
// quanto o boneco afunda na água funda, em níveis abaixo da superfície: nadando, só cabeça e ombros de fora (13/11, a
// funda passou a deixar entrar). O leito dela fica mais alto que os pés, mas some na água escura (opaca 93%)
export const SWIM = 0.75;
const DEEP_BED = 1; // leito da funda, em níveis abaixo da superfície: some na cor escura, só não pode ficar à vista

// Rio sem sobe e desce (13/11, pedido do Fernando: "a água pode descer como uma cachoeira, mas não subir e descer como
// nessa ponte de pedra"): a funda fica DEEP_DROP abaixo da rasa, então um trecho fundo pequeno depois do vau fazia a água
// subir no vau e descer de novo. Cada trecho fundo ligado (pontes separam) que encosta em água rasa e não é o maior do mapa
// fica na altura da rasa; o maior continua baixo e o vau desce para ele como cachoeira. Só desenho: a regra lê depth.
export function raisedDeep(grid: Grid): Set<string> {
  const deep = (p: Pos) => { const t = tileAt(grid, p); return t.look === 'water' && (t.depth ?? 0) >= 2; };
  const seen = new Set<string>(), parts: { tiles: string[]; shallow: boolean }[] = [];
  grid.tiles.forEach((_, i) => {
    const start = { x: i % grid.width, y: Math.floor(i / grid.width) };
    if (!deep(start) || seen.has(posKey(start))) return;
    const part = { tiles: [] as string[], shallow: false }, queue = [start];
    seen.add(posKey(start));
    while (queue.length) {
      const p = queue.pop()!;
      part.tiles.push(posKey(p));
      for (const n of neighbors(grid, p)) {
        const t = tileAt(grid, n);
        if (t.look === 'water' && t.depth === 1) part.shallow = true;
        if (deep(n) && !seen.has(posKey(n))) { seen.add(posKey(n)); queue.push(n); }
      }
    }
    parts.push(part);
  });
  const biggest = Math.max(0, ...parts.map((p) => p.tiles.length));
  const big = parts.find((p) => p.tiles.length === biggest);
  return new Set(parts.filter((p) => p !== big && p.shallow).flatMap((p) => p.tiles));
}

export interface WaterLevel { surface: number; bed: number; deep: boolean; under?: true }

// Altura da superfície e do leito de cada casa de água e de cada ponte com água por baixo. O leito da rasa fica onde
// stand() põe os pés (WADE), para ninguém flutuar nem atravessar o chão.
export function waterLevels(grid: Grid, step: number): Map<string, WaterLevel> {
  const out = new Map<string, WaterLevel>();
  const bed = (surface: number, deep: boolean) => (deep ? Math.max(0.02, surface - DEEP_BED * step) : surface - WADE * step);
  const at = (i: number): Pos => ({ x: i % grid.width, y: Math.floor(i / grid.width) });
  const raised = raisedDeep(grid);
  grid.tiles.forEach((t, i) => {
    if (t.look !== 'water') return;
    const deep = (t.depth ?? 0) >= 2;
    const surface = (t.h + 1 - (deep && !raised.has(posKey(at(i))) ? DEEP_DROP : 0)) * step;
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
  // ponte larga (13/11, a do Bosque passou a 3 casas): a casa do meio só encosta em terra e em outras casas de ponte, e
  // pega a água da ponte vizinha; sem isso o terreno desenhava um quadrado de chão na altura das tábuas
  for (let grew = true; grew;) {
    grew = false;
    grid.tiles.forEach((t, i) => {
      if (t.look !== 'bridge' || out.has(posKey(at(i)))) return;
      const side = neighbors(grid, at(i)).map((q) => out.get(posKey(q))).find((l) => l?.under);
      if (!side) return;
      out.set(posKey(at(i)), { ...side });
      grew = true;
    });
  }
  return out;
}
