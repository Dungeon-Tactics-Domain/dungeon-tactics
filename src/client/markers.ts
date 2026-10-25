// Altura dos marcadores em volta de cada unidade, em metros a partir do topo da casa. Puro para o teste conferir a
// ordem (chão < boneco < barra de vida < seta do cursor), que a cena só aplica.
export const UNIT_HEIGHT = { default: 0.85, brute: 1.05 }; // o Bruto é maior para ler de longe que ele bate forte
export const unitHeight = (def: string) => (def === 'brute' ? UNIT_HEIGHT.brute : UNIT_HEIGHT.default);

export const MARKER = {
  frameY: 0.04, // rente à casa, acima das marcações (0,02) e do caminho (0,03)
  // com o teste de profundidade ligado o boneco cobre a moldura; desligado, ela era desenhada por cima do herói (bug de 25/10)
  frameDepthTest: true,
  barY: 1.15,
  barHalf: 0.06, // meia altura da barra (0,12)
  arrowY: 1.5, // acima da barra de vida: em 1,05 ficava na altura da cabeça e tapava o rosto
  arrowBob: 0.08, // balanço da seta para cima e para baixo
  arrowHalf: 0.15, // meia altura do cone (0,3)
};
