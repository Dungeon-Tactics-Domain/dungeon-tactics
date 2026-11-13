// Músicas do jogo (13/11, pedido do Fernando: "pegue pacote de músicas grátis para esse tipo de RPG e use elas em vez
// das que você criou"): arquivos .ogg de faixas CC0 do OpenGameArt em public/music/, em laço. Autores, links e licença
// em public/CREDITS.txt e docs/ASSETS.md. Quem toca é o sound.ts; aqui ficam só o arquivo e o ganho de cada faixa.
//
// Ganho por faixa (medido em 13/11 com o volumedetect do ffmpeg, média de cada arquivo): as faixas novas têm volumes
// bem diferentes (título -12,9 dB, estrada -15,6, mapa -17,0, neve e chefe -17,8, cripta -18,7). O alvo é o da música da
// batalha avulsa, -17,3 dB, que já estava no nível certo; o HTMLAudioElement não passa de 1, então quem estava mais alto
// desce (título -4,4 dB, estrada -1,7 dB) e quem estava mais baixo fica em 1 (cripta fica 1,4 dB abaixo, neve e chefe 0,6).
// O arquivo do mapa já tem +2,2 dB gravados na conversão (limitador a 0,95) para chegar ao alvo sem passar de 1.
export const TRACKS = {
  title: { file: 'titulo.ogg', gain: 0.6 },
  world: { file: 'mapa.ogg', gain: 0.97 },
  road: { file: 'estrada.ogg', gain: 0.82 },
  crypt: { file: 'cripta.ogg', gain: 1 },
  snow: { file: 'neve.ogg', gain: 1 },
  boss: { file: 'chefe.ogg', gain: 1 },
  // batalha avulsa (sem fase da campanha): o mesmo arquivo de antes
  battle: { file: 'battle.mp3', gain: 1 },
} satisfies Record<string, { file: string; gain: number }>;
export type SongId = keyof typeof TRACKS;
export const trackUrl = (id: SongId) => `/music/${TRACKS[id].file}`;
