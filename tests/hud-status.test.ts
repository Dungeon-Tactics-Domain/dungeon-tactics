import { describe, expect, it } from 'vitest';
import { tileInfo, unitStatus } from '../src/client/hud.ts';
import { GARILAND, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Janela de status e informação da casa (12/11, no jeito do FFT): o que aparece para cada unidade e casa
registerFftStudy();

describe('janela de status', () => {
  it('unidade do jogo: lado, vida, CT, velocidade, movimento, salto e habilidades', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const rows = Object.fromEntries(unitStatus(s, 'h-warrior'));
    expect(rows).toMatchObject({ Lado: 'herói', Vida: '42/42', CT: '0/100', Velocidade: '8', Movimento: '4', Salto: '1' });
    expect(rows.Habilidades).toBe('Golpe, Golpe pesado, Escudada, Giro');
    expect(rows.Brave).toBeUndefined();
  });

  it('estudo do FFT: Brave, Fé, arma, bônus ganho e a carga em andamento', () => {
    const s = initialState(GARILAND, 1);
    const ramza = s.units.find((u) => u.id === 'ramza')!;
    ramza.vars!.pa = 1;
    s.charges = [{ unit: 'ramza', ability: 'fft_ramza_dash', target: { x: 7, y: 2 }, follow: null, ticks: 3 }];
    const rows = Object.fromEntries(unitStatus(s, 'ramza'));
    expect(rows).toMatchObject({ Brave: '60', Fé: '60', Arma: 'broad sword', 'Força (PA)': '5 (+1)', Salto: '3', 'Olhando para': 'sul' });
    expect(rows.Carregando).toBe('Investida, sai em 3 tiques');
  });

  it('Químico mostra o estoque de poções', () => {
    const rows = Object.fromEntries(unitStatus(initialState(GARILAND, 1), 'chemist'));
    expect(rows['Poções']).toBe('4');
  });
});

describe('informação da casa', () => {
  it('posição, altura, rampa e piso do mapa', () => {
    expect(tileInfo(GARILAND.grid, { x: 4, y: 2 })).toBe('Casa 4,2 · altura 6 (rampa) · telhado');
    expect(tileInfo(GARILAND.grid, { x: 2, y: 0 })).toBe('Casa 2,0 · altura 5 · árvore · não dá para pisar');
    expect(tileInfo(SCENARIOS.skirmish.grid, { x: 2, y: 1 })).toBe('Casa 2,1 · altura 0 · árvore · não dá para pisar');
  });

  it('água funda e rasa (mesmo desenho) se distinguem pelo texto', () => {
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 3 })).toBe('Casa 0,3 · altura 0 · água · funda: não se atravessa');
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 7 })).toBe('Casa 0,7 · altura 0 · água · rasa: custa 2 de movimento');
  });
});
