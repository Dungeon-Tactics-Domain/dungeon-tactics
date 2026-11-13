import { describe, expect, it } from 'vitest';
import { abilityEnabled, canUndoMove, commandEnabled, startScreen, stepIndex } from '../src/client/command.ts';
import { emptyMemory, padActions } from '../src/client/gamepad.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Interface no jeito do FFT (12/11): menu de comandos e controle
const duel = () => new Battle(flat(6, 6), stateOf([
  { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
  { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
  { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
]));

describe('menu de comandos', () => {
  it('começa em Mover; depois de andar, em Agir; depois de andar e agir, em Esperar', () => {
    const b = duel();
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 });
    b.move({ x: 2, y: 2 });
    expect(startScreen(b)).toEqual({ k: 'menu', index: 1 });
    b.act('strike', { x: 2, y: 1 });
    expect(commandEnabled(b, 'act')).toBe(false);
    // sobrou movimento (13/11, movimento em partes): volta em Mover
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 });
  });

  // 13/11, pedido do Fernando, como no Tactics Ogre: depois de andar e antes de agir, Mover vira "Desfazer movimento"
  it('andou e não agiu: Mover desfaz o movimento (de graça), sem o cursor do menu cair nele', () => {
    const b = duel();
    expect(canUndoMove(b)).toBe(false);
    b.move({ x: 2, y: 2 });
    expect(canUndoMove(b)).toBe(true);
    expect(commandEnabled(b, 'move')).toBe(true);
    expect(startScreen(b)).toEqual({ k: 'menu', index: 1 }); // o 2º Enter depois de andar não desfaz sem querer
    const undos = b.undosLeft;
    expect(b.undo()).toBe(true);
    expect(b.actor.pos).toEqual({ x: 1, y: 1 });
    expect(b.undosLeft).toBe(undos);
    expect(canUndoMove(b)).toBe(false);
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 }); // de volta ao menu de antes de andar
  });

  it('depois de agir não oferece mais desfazer o movimento (antes ou depois de andar)', () => {
    const moved = duel();
    moved.move({ x: 2, y: 2 });
    moved.act('strike', { x: 2, y: 1 });
    expect(canUndoMove(moved)).toBe(false);
    expect(commandEnabled(moved, 'move')).toBe(moved.reach().size > 0); // só anda de novo se sobrou movimento
    const acted = duel();
    acted.act('strike', { x: 2, y: 1 });
    acted.move({ x: 1, y: 2 });
    expect(canUndoMove(acted)).toBe(false);
  });

  it('subir e descer pula o que está apagado e dá a volta', () => {
    expect(stepIndex(1, 1, [false, true, true, true])).toBe(2);
    expect(stepIndex(3, 1, [false, true, true, true])).toBe(1);
    expect(stepIndex(1, -1, [false, true, true, true])).toBe(3);
  });

  it('habilidade sem estoque fica apagada', () => {
    const b = duel();
    expect(abilityEnabled(b, 'strike')).toBe(true);
  });
});

describe('controle', () => {
  const pad = (buttons: number[], axes: number[] = [0, 0]) => ({ buttons: Array.from({ length: 16 }, (_, i) => buttons.includes(i)), axes });

  it('A confirma e B cancela só ao apertar, não enquanto segura', () => {
    const mem = emptyMemory();
    expect(padActions(pad([0]), mem, 0)).toEqual([{ k: 'confirm' }]);
    expect(padActions(pad([0]), mem, 50)).toEqual([]);
    expect(padActions(pad([]), mem, 100)).toEqual([]);
    expect(padActions(pad([1]), mem, 150)).toEqual([{ k: 'cancel' }]);
  });

  it('direcional e analógico movem o cursor e repetem segurando (300 ms, depois a cada 120 ms)', () => {
    const mem = emptyMemory();
    expect(padActions(pad([12]), mem, 0)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([12]), mem, 200)).toEqual([]);
    expect(padActions(pad([12]), mem, 310)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([12]), mem, 380)).toEqual([]);
    expect(padActions(pad([12]), mem, 440)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([], [0.9, 0.1]), emptyMemory(), 0)).toEqual([{ k: 'cursor', dir: 'right' }]);
    expect(padActions(pad([], [0.3, 0.2]), emptyMemory(), 0)).toEqual([]); // zona morta
  });

  it('ombros giram a câmera, Start abre o menu, Back desfaz', () => {
    const mem = emptyMemory();
    expect(padActions(pad([4, 9]), mem, 0)).toEqual([{ k: 'rotate', dir: -1 }, { k: 'help' }]);
    expect(padActions(pad([8]), emptyMemory(), 0)).toEqual([{ k: 'undo' }]);
  });
});
