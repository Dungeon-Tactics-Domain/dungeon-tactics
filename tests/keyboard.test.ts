import { describe, expect, it } from 'vitest';
import { cycleUnit, gridStep, keyAction } from '../src/client/keyboard.ts';
import { cancel, freshUi, hoverTile, selectMode } from '../src/client/interaction.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

const key = (k: string, extra: Partial<KeyboardEvent> = {}) => keyAction({ key: k, code: '', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...extra });

describe('teclas do jogo', () => {
  it('WASD e setas movem o cursor nas quatro direções da tela', () => {
    expect(key('w')).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('ArrowUp')).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('a')).toEqual({ k: 'cursor', dir: 'left' });
    expect(key('S')).toEqual({ k: 'cursor', dir: 'down' }); // Caps Lock não muda nada
    expect(key('ArrowRight')).toEqual({ k: 'cursor', dir: 'right' });
  });

  it('confirmar, cancelar, ciclar, barra e atalhos', () => {
    expect(key('Enter')).toEqual({ k: 'confirm' });
    expect(key(' ')).toEqual({ k: 'confirm' });
    expect(key('Escape')).toEqual({ k: 'cancel' });
    expect(key('Backspace')).toEqual({ k: 'cancel' });
    expect(key('Tab')).toEqual({ k: 'cycle', dir: 1 });
    expect(key('Tab', { shiftKey: true })).toEqual({ k: 'cycle', dir: -1 });
    expect(key('3')).toEqual({ k: 'slot', index: 2 });
    expect(key('z')).toEqual({ k: 'undo' });
    expect(key('p')).toEqual({ k: 'wait' });
    expect(key('r')).toEqual({ k: 'rotate', dir: 1 });
    expect(key('R', { shiftKey: true })).toEqual({ k: 'rotate', dir: -1 });
    expect(key('i')).toEqual({ k: 'info' });
    expect(key('v')).toEqual({ k: 'pixel' });
    expect(key('q')).toEqual({ k: 'zoom', factor: 1.15 });
    expect(key('e')).toEqual({ k: 'zoom', factor: 1 / 1.15 });
    expect(key('f')).toEqual({ k: 'recenter' });
    expect(key('h')).toEqual({ k: 'help' });
  });

  it('atalho do navegador (Ctrl, Alt, Cmd) e tecla desconhecida ficam com o navegador', () => {
    expect(key('r', { ctrlKey: true })).toBeNull();
    expect(key('w', { metaKey: true })).toBeNull();
    expect(key('x')).toBeNull();
    expect(key('6')).toBeNull();
  });
});

describe('cursor segue a câmera', () => {
  // câmera inicial (π/4): o mapa aparece em losango; cima na tela é o eixo -y da grade
  const START = Math.PI / 4;
  it('na câmera inicial cada direção é um eixo diferente da grade', () => {
    expect(gridStep('up', START)).toEqual({ x: 0, y: -1 });
    expect(gridStep('right', START)).toEqual({ x: 1, y: 0 });
    expect(gridStep('down', START)).toEqual({ x: 0, y: 1 });
    expect(gridStep('left', START)).toEqual({ x: -1, y: 0 });
  });

  it('girar a câmera 90° gira as direções junto (W continua sendo cima na tela)', () => {
    const turned = START + Math.PI / 2;
    expect(gridStep('up', turned)).toEqual({ x: -1, y: 0 });
    expect(gridStep('right', turned)).toEqual({ x: 0, y: -1 });
    // quatro giros voltam ao começo
    expect(gridStep('up', START + 2 * Math.PI)).toEqual(gridStep('up', START));
  });
});

describe('cursor na batalha', () => {
  const at = (x: number, y = 0) => ({ x, y });
  const scene = () => new Battle(flat(8, 3), stateOf([
    { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
    { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
    { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 1 },
  ], HIT_SEED));

  it('passar o cursor sobre uma casa marca a prévia, sem aviso de casa inválida', () => {
    const b = scene();
    expect(hoverTile(b, freshUi(b), at(2, 1)).pending).toEqual(at(2, 1));
    const far = hoverTile(b, freshUi(b), at(7, 2));
    expect(far.pending).toBeNull();
    expect(far.invalid).toBe(false);
  });

  it('cancelar tira a casa marcada; de novo, volta da habilidade para Mover', () => {
    const b = scene();
    const ui = hoverTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), at(4, 1));
    const once = cancel(b, ui);
    expect(once.pending).toBeNull();
    expect(once.mode).toEqual({ k: 'ability', id: 'shot' });
    expect(cancel(b, once).mode).toEqual({ k: 'move' });
  });

  it('Tab passa pelas unidades vivas em ordem e dá a volta', () => {
    const b = scene();
    expect(cycleUnit(b.state, at(0, 1), 1)).toEqual(at(0, 0));
    expect(cycleUnit(b.state, at(4, 1), 1)).toEqual(at(0, 1));
    expect(cycleUnit(b.state, at(0, 1), -1)).toEqual(at(4, 1));
    expect(cycleUnit(b.state, at(7, 2), 1)).toEqual(at(0, 1)); // cursor numa casa vazia: começa da primeira
  });
});
