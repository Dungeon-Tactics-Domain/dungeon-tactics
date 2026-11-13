// Menu de comandos no jeito do FFT (pedido do Fernando, 12/11: "recrie a interface do mesmo jeito da do final fantasy
// tactics"): Mover · Agir · Esperar · Status, com o submenu das habilidades em Agir. Puro (sem DOM): o que cada tela do
// turno mostra e o que vem depois de cada tecla. O Game executa; o HUD só desenha.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Command = 'move' | 'act' | 'wait' | 'status';
export const COMMANDS: Command[] = ['move', 'act', 'wait', 'status'];

// Telas do turno do herói, na ordem do FFT: menu → (submenu de Agir) → mapa (escolher casa) → "Executar?" → menu.
// Esperar leva à escolha de direção (todo mapa desde 13/11).
export type Screen =
  | { k: 'menu'; index: number }
  | { k: 'abilities'; index: number }
  | { k: 'map'; command: 'move' | 'act' }
  | { k: 'confirm'; ability: string; target: Pos; yes: boolean }
  | { k: 'facing' };

// Andou e ainda não agiu: a linha Mover vira "Desfazer movimento" e o Esc no menu desfaz (13/11, pedido do Fernando,
// como no Tactics Ogre). Andar não sorteia nada, então desfazer é de graça; depois de agir, só o Z (que gasta um desfazer)
export const canUndoMove = (b: Battle) => b.state.turn.moved && !b.state.turn.usedAbility && b.canUndo;

export function commandEnabled(b: Battle, c: Command): boolean {
  if (c === 'move') return b.reach().size > 0 || canUndoMove(b);
  if (c === 'act') return !b.state.turn.usedAbility;
  return true;
}

// habilidade que dá para escolher agora: sem estoque ou MP fica apagada, como no FFT
export function abilityEnabled(b: Battle, id: string): boolean {
  const cost = ABILITIES[id].cost;
  return !cost || (b.actor.vars?.[cost[0]] ?? 0) >= cost[1];
}
export const abilitiesOf = (b: Battle) => UNIT_DEFS[b.actor.def].abilities;

// onde o cursor do menu começa: Mover se ainda dá para andar, senão Agir, senão Esperar. O "Desfazer movimento" não
// pega o cursor: o 2º Enter depois de andar desfaria o passo sem querer
export function startScreen(b: Battle): Screen {
  return { k: 'menu', index: b.reach().size ? 0 : commandEnabled(b, 'act') ? 1 : 2 };
}

// sobe ou desce no menu pulando o que está apagado, dando a volta como no FFT
export function stepIndex(index: number, dir: 1 | -1, enabled: boolean[]): number {
  for (let k = 1; k <= enabled.length; k++) {
    const i = (index + dir * k + enabled.length * k) % enabled.length;
    if (enabled[i]) return i;
  }
  return index;
}
