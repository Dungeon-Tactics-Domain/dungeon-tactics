import { registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';

// Usage: node scripts/battle-sim.ts [scenario] [seeds]. Measures the heroes' win rate, the turns and the heroes
// left over: a unit/ability number is optional to check here (balance is decided by playing).
const [scenarioId = 'beacon_hill', count = '200'] = process.argv.slice(2);
registerFftStudy(); // the FFT study scenario (fft-gariland) only exists for whoever asks for it
const scenario = SCENARIOS[scenarioId];
if (!scenario) throw new Error(`cenário desconhecido: ${scenarioId}`);
const n = Number(count);
const runs = Array.from({ length: n }, (_, i) => simulate(scenario, i + 1));
const mean = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((s, r) => s + f(r), 0) / n).toFixed(2);
// damage of the hits that landed: per hit and per turn played (to compare with the FFT reference)
const hits = runs.flatMap((r) => r.events.flatMap((e) => (e.k === 'hit' ? [e.dmg] : [])));
const perHit = (hits.reduce((a, d) => a + d, 0) / hits.length).toFixed(1);
const perTurn = (hits.reduce((a, d) => a + d, 0) / runs.reduce((a, r) => a + r.turns, 0)).toFixed(1);
const wins = runs.filter((r) => r.outcome === 'victory').length;
// Estimate (not measured with people): 15 s per hero turn (read, choose, confirm) and 2.5 s per enemy turn
// (the client pauses add up to 1.3 s, plus the animation). Spec target: an 8 to 12 min battle.
const minutes = mean((r) => (r.heroTurns * 15 + (r.turns - r.heroTurns) * 2.5) / 60);
console.log(
  `${scenarioId} · ${n} sementes · vitória dos heróis ${((100 * wins) / n).toFixed(1)}% · turnos ${mean((r) => r.turns)} (heróis ${mean((r) => r.heroTurns)}) · ~${minutes} min · dano por golpe ${perHit} · dano por turno ${perTurn} · heróis vivos ${mean((r) => r.heroesAlive)} · inimigos vivos ${mean((r) => r.enemiesAlive)} · timeouts ${runs.filter((r) => r.outcome === 'timeout').length}`,
);
