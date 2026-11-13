// Tempos do fluxo de turno, em ms, todos juntos para ajustar o ritmo num lugar só (pedido do Fernando, 12/11: fluxo e
// tempos parecidos com o Final Fantasy Tactics). Não há fonte de tempo de animação do FFT: os novos são estimativa.
// Especificação e valores anteriores: docs/medicoes/fluxo-fft-2026-11-12.md.
// 13/11, pedido do Fernando ("andar lento… animações de pulo bem realistas… game feel mais lento, não quero animações
// rápidas"): o ritmo todo ficou ~40% mais lento que o de 12/11 (valor de antes ao lado), andar é a passo e todo degrau é um
// pulo em 3 partes. Segurar Enter continua acelerando 3 vezes.
export const TIMING = {
  enemyStart: 650, // 450: câmera chega e o jogador vê de quem é a vez
  enemyDestination: 650, // 500: cursor e caminho no destino do inimigo antes de ele andar
  step: 600, // 200: uma casa andada a passo (Walking_A), não correndo
  jumpCrouch: 300, // novo: agacha e toma impulso (Jump_Start) antes de sair do chão
  jumpAir: 450, // novo: voo em arco num degrau de 1 nível (Jump_Idle)...
  jumpPerLevel: 90, // novo: ...e mais isto por nível a mais de altura
  jumpLand: 300, // novo: aterrissa e se recompõe (Jump_Land) antes do próximo passo
  banner: 900, // 700: faixa com o nome da habilidade e a área marcada antes do golpe
  windup: 520, // 380: do gesto ao impacto
  projectile: 420, // 280: voo de flecha, faca e bola de fogo até o alvo (pedra e frasco em arco levam 1,4x)
  lunge: 380, // 260: avanço e volta da Investida
  hit: 480, // 320: golpe que acertou, até o próximo evento
  hpDrain: 450, // 300: barra de vida descendo; cabe dentro do `hit` para o sync do fim não cortar a descida
  crash: 320, // 220: batida e queda
  push: 260, // 140: uma casa empurrada
  die: 1000, // 700: queda de quem morre
  float: 1500, // 1200: número de dano pula, fica parado para ler e some (o mesmo valor vai no CSS, animação pop da .float)
  enemyAfter: 450, // 250: respiro entre um inimigo e o próximo
  hitStop: 110, // 90: tudo para no impacto, o alvo pisca branco; é o que dá peso ao golpe
  shake: 280, // 220: o alvo treme depois da pausa e o tremor vai sumindo
  pop: 320, // 240: pulinho de quem começa a vez
  blink: 110, // 80: cada aceso/apagado de quem morre (3 piscadas)
};

// Duração de um passo do caminho: andar no plano, pulo (agacha, voo, aterrissa) quando muda de altura ou voa um vão.
// `dh` em níveis, `tiles` casas entre as duas pontas (2 no vão). A cena anima com isto e o jogo marca o som dos passos
// com isto, para os dois não se desencontrarem.
export const isJump = (dh: number, tiles = 1) => dh !== 0 || tiles > 1;
export const stepMs = (dh: number, tiles = 1) => (isJump(dh, tiles) ? TIMING.jumpCrouch + jumpAirMs(Math.max(Math.abs(dh), tiles)) + TIMING.jumpLand : TIMING.step);
export const jumpAirMs = (dh: number) => TIMING.jumpAir + TIMING.jumpPerLevel * (Math.abs(dh) - 1);

// Segurar Enter, Espaço ou A (controle) acelera tudo da batalha (passos, golpes, esperas) 3 vezes; soltar volta ao ritmo
// do FFT. Pedido do Fernando (12/11): batalha mais responsiva sem perder o ritmo de leitura de quem não tem pressa.
// No celular (sem tecla para segurar) o botão ⏩ liga e desliga (`toggle`, escolha do Fernando em 12/11).
export const pace = { key: false, pad: false, toggle: false };
export const FAST = 3;
export const speed = () => (pace.key || pace.pad || pace.toggle ? FAST : 1);
