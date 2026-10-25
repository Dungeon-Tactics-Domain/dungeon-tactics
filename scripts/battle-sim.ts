import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';

// Uso: node scripts/battle-sim.ts [cenário] [sementes]. Mede a taxa de vitória dos heróis, os turnos e os heróis
// que sobram: o número de unidade/habilidade só muda depois de passar por aqui (spec: balancear por dado).
const [scenarioId = 'skirmish', count = '200'] = process.argv.slice(2);
const scenario = SCENARIOS[scenarioId];
if (!scenario) throw new Error(`cenário desconhecido: ${scenarioId}`);
const n = Number(count);
const runs = Array.from({ length: n }, (_, i) => simulate(scenario, i + 1));
const mean = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((s, r) => s + f(r), 0) / n).toFixed(2);
const wins = runs.filter((r) => r.outcome === 'victory').length;
console.log(`${scenarioId} · ${n} sementes · vitória dos heróis ${((100 * wins) / n).toFixed(1)}% · turnos ${mean((r) => r.turns)} · heróis vivos ${mean((r) => r.heroesAlive)} · inimigos vivos ${mean((r) => r.enemiesAlive)} · timeouts ${runs.filter((r) => r.outcome === 'timeout').length}`);
