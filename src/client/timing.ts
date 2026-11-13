// Tempos do fluxo de turno, em ms, todos juntos para ajustar o ritmo num lugar só (pedido do Fernando, 12/11: fluxo e
// tempos parecidos com o Final Fantasy Tactics). Não há fonte de tempo de animação do FFT: os novos são estimativa.
// Especificação e valores anteriores: docs/medicoes/fluxo-fft-2026-11-12.md.
export const TIMING = {
  enemyStart: 450, // antes 600 (12/11, game feel): a câmera já chega em ~0,5 s; somado ao enemyAfter dava 1 s parado entre inimigos
  enemyDestination: 500, // novo: cursor e caminho no destino do inimigo antes de ele andar, para ler para onde vai
  step: 200, // antes 150: uma casa andada; o FFT anda mais devagar e cada passo se lê
  banner: 700, // novo: faixa com o nome da habilidade e a área marcada antes do golpe, nos dois lados
  windup: 380, // do gesto ao impacto (igual a antes)
  projectile: 280, // novo: voo de flecha, faca e bola de fogo até o alvo (pedra e frasco em arco levam 1,4x)
  lunge: 260, // novo: avanço e volta da Investida
  hit: 320, // golpe que acertou, até o próximo evento (igual a antes)
  hpDrain: 300, // novo: barra de vida descendo; cabe dentro do `hit` para o sync do fim não cortar a descida
  crash: 220, // batida e queda (igual a antes)
  push: 140, // uma casa empurrada (igual a antes)
  die: 700, // queda de quem morre (igual a antes)
  float: 1200, // antes 1100: número de dano pula, fica parado para ler e some (o mesmo valor vai no CSS, --float-ms)
  enemyAfter: 250, // antes 400 (12/11): a linha de ajuda já resume o que o inimigo fez
  hitStop: 90, // novo (12/11): tudo para no impacto, o alvo pisca branco; é o que dá peso ao golpe
  shake: 220, // novo: o alvo treme depois da pausa e o tremor vai sumindo
  pop: 240, // novo: pulinho de quem começa a vez
  blink: 80, // novo: cada aceso/apagado de quem morre (3 piscadas, ~0,5 s)
};

// Segurar Enter, Espaço ou A (controle) acelera tudo da batalha (passos, golpes, esperas) 3 vezes; soltar volta ao ritmo
// do FFT. Pedido do Fernando (12/11): batalha mais responsiva sem perder o ritmo de leitura de quem não tem pressa.
// No celular (sem tecla para segurar) o botão ⏩ liga e desliga (`toggle`, escolha do Fernando em 12/11).
export const pace = { key: false, pad: false, toggle: false };
export const FAST = 3;
export const speed = () => (pace.key || pace.pad || pace.toggle ? FAST : 1);
