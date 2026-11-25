import { describe, expect, it, vi } from 'vitest';
import { type OptionsGroup, settings } from '../src/client/game/options-list.ts';
import type { Option } from '../src/client/option-row.ts';
import { pixelFx } from '../src/client/pixel-fx.ts';

vi.stubGlobal('document', { fullscreenEnabled: false }); // the rows are read with no page: no Fullscreen API
let touch = false; // (pointer: coarse): a finger points
vi.stubGlobal('matchMedia', () => ({ matches: touch }));

// Fernando, Nov 18 night: no ☰ menu, so its rows moved into Options; the battle's own rows only show in a battle
const battle = { room: false, busy: false, restart() {}, fast: () => false, setFast() {}, fps() {} };
const names = (g: OptionsGroup) => g.rows.map((r) => ('run' in r ? r.link : r.label));
const group = (o: Parameters<typeof settings>[0], title: string) => settings(o).find((g) => g.title === title)!;

describe('Options rows', () => {
  it('Marks lead Display, Back to title closes Game', () => {
    expect(names(group({ relayout() {}, battle }, 'Imagem'))[0]).toBe('Marcações');
    expect(names(group({ relayout() {}, battle }, 'Jogo')).at(-1)).toBe('Voltar ao título');
  });
  it('Fast battle and the fps counter only in a battle; Screen buttons everywhere', () => {
    const inBattle = [
      ...names(group({ relayout() {}, battle }, 'Jogo')),
      ...names(group({ relayout() {}, battle }, 'Imagem')),
    ];
    const inTown = [...names(group({ relayout() {} }, 'Jogo')), ...names(group({ relayout() {} }, 'Imagem'))];
    for (const row of ['Batalha rápida (3×)', 'Contador de fps']) {
      expect(inBattle).toContain(row);
      expect(inTown).not.toContain(row);
    }
    for (const row of ['Botões na tela', 'Voltar ao título']) expect(inTown).toContain(row);
  });
  // the town's joystick and button (Nov 18): a PC has no pad, so no row for its side
  it('Joystick and button: a row of Game on a touch device only, for the town', () => {
    touch = false;
    expect(names(group({ relayout() {} }, 'Jogo'))).not.toContain('Joystick e botão');
    touch = true;
    expect(names(group({ relayout() {} }, 'Jogo'))).toContain('Joystick e botão');
    touch = false;
  });
  // Nov 24, Fernando: the pixel effect in its own category, with the reference author's numbers as a preset
  it('Pixel effect: a preset writes its values, a value changed by hand shows Your own', () => {
    const rows = group({ relayout() {} }, 'Efeito de pixel').rows as Option[];
    const row = (label: string) => rows.find((r) => r.label === label)!;
    expect(row('Efeito de pixel').text()).toBe('Desligado');
    expect(row('Predefinição').text()).toBe('Nosso');
    row('Predefinição').step(1);
    expect(row('Predefinição').text()).toBe('Referência');
    expect(row('Tamanho do pixel').text()).toBe('Automático');
    expect(pixelFx().on).toBe(false); // a preset never turns the effect on
    row('Tons de brilho').step(1);
    expect(row('Predefinição').text()).toBe('Seu');
    row('Predefinição').step(1);
    expect(row('Predefinição').text()).toBe('Nosso');
    expect(row('Tamanho do pixel').text()).toBe('3');
  });
});
