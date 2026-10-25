// Sorteio com semente (mulberry32) sem closure: o estado é um número que mora no BattleState,
// então salvar, clonar e simular a mesma batalha dão a mesma sequência.
export function nextRng(state: number): [value: number, next: number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

// inteiro entre min e max, os dois incluídos
export function rollInt(state: number, min: number, max: number): [value: number, next: number] {
  const [v, next] = nextRng(state);
  return [min + Math.floor(v * (max - min + 1)), next];
}
