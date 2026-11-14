import { HALF, baseDef } from '../shared/battle/half.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

// Altura dos marcadores em volta de cada unidade, em metros a partir do topo da casa. Puro para o teste conferir a
// ordem (chão < boneco < barra de vida < seta do cursor), que a cena só aplica.
export const UNIT_HEIGHT = { default: 0.85, brute: 1.05, colossus: 2 }; // o Bruto é maior para ler de longe que ele bate forte; o Colosso ocupa 2x2
// pelo modelo, não pelo id: o Bruto da campanha e do menu de desenvolvedor tem ficha própria (camp1-e0…) e saía pequeno
// meia casa (half.ts): a ficha ½ tem o dobro do tamanho da original, porque cada casa virou 2x2
export const unitHeight = (def: string): number => (def.endsWith(HALF) ? 2 * unitHeight(baseDef(def)) : (UNIT_DEFS[def]?.size ?? 1) > 1 ? UNIT_HEIGHT.colossus : modelOf(def) === MODEL.brute ? UNIT_HEIGHT.brute : UNIT_HEIGHT.default);

// altura da barra de vida (e da coroa) de cada unidade: a padrão ou, para quem é mais alto que ela (o Colosso), logo acima da cabeça
export const barYOf = (def: string) => Math.max(MARKER.barY, unitHeight(def) + 0.3);

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

// modelo KayKit de cada unidade (public/models/<id>.glb e o retrato public/chars/<id>.webp); o Bruto usa o bárbaro (não há
// esqueleto grande); o Arqueiro usa o `ranger` (a Ladina de vinho, sem facas e com arco: scripts/assets/ranger.mjs). A unidade do
// estudo traz o modelo na própria ficha. A cena e o HUD (retratos) usam o mesmo mapa.
const MODEL: Record<string, string> = {
  warrior: 'knight', archer: 'ranger', mage: 'mage', rogue: 'rogue_hooded',
  soldier: 'skeleton_warrior', skeleton_archer: 'skeleton_rogue', dark_mage: 'skeleton_mage', brute: 'barbarian',
  minion: 'skeleton_minion', colossus: 'skeleton_warrior', lancer: 'barbarian', // Lanceiro: o bárbaro até ter boneco próprio com lança
   acolyte: 'mage', veil_knight: 'knight', // Acólito e Cavaleiro do Véu: bonecos com brilho próprio (UnitDef.tint)
};
export const modelOf = (def: string): string => MODEL[baseDef(def)] ?? UNIT_DEFS[def].model ?? ''; // '' = sem modelo (o Farol)
