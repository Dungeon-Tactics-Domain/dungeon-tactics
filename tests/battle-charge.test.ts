import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { resolveAbility } from '../src/shared/battle/combat.ts';
import { CLASSES_BATTLE, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { previewOrder } from '../src/shared/battle/turn-queue.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { chargeDanger } from '../src/client/interaction.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Ações com carga (12/11, regras de turno do FFT em todos os mapas): declarada no turno, sai depois de N tiques
// (BMG 1.1 e A.2). Desde a decisão de 12/11 ("Como no FFT") só magias e Tiro mirado carregam: Explosão 4 e segue a unidade,
// Tiro mirado 4 e mira a casa; golpe físico sai na hora.
const grid = flat(8, 8);
const duel = (attacker: string, x = 3, y = 3) => new Battle(grid, stateOf([
  { id: 'a', def: attacker, team: 'hero', x, y },
  { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 3 },
  { id: 'c', def: 'soldier', team: 'enemy', x: 7, y: 7 },
  { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 7 }, // sem o alvo a proteger o jogo dá derrota na hora
], HIT_SEED));
// passa turnos (sem agir) até a carga sair; devolve todos os eventos
function untilResolved(b: Battle): BattleEvent[] {
  const all: BattleEvent[] = [];
  for (let i = 0; i < 12 && b.state.charges.length; i++) all.push(...b.endTurn());
  return all;
}

describe('ações com carga', () => {
  it('a área da carga acende onde vai cair e segue a unidade (chargeDanger, aviso para sair da área)', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    const area = [...chargeDanger(b.state, 8, 8).keys()].sort();
    expect(area).toEqual(['3,3', '4,2', '4,3', '4,4', '5,3'].sort());
    const moved = { ...b.state, units: b.state.units.map((u) => (u.id === 'b' ? { ...u, pos: { x: 6, y: 6 } } : u)) };
    expect(chargeDanger(moved, 8, 8).has('6,6')).toBe(true);
    expect(chargeDanger(moved, 8, 8).has('4,3')).toBe(false);
  });

  it('declarar não acerta na hora: entra na fila e sai depois, com o golpe', () => {
    const b = duel('mage', 1, 3);
    const hp = b.state.units[1].hp;
    expect(b.act('blast', { x: 4, y: 3 }).map((e) => e.k)).toEqual(['charge']);
    expect(b.state.units[1].hp).toBe(hp);
    expect(b.state.charges).toEqual([{ unit: 'a', ability: 'blast', target: { x: 4, y: 3 }, follow: 'b', ticks: 4 }]);
    expect(previewOrder(b.state, 8).some((e) => e.charge === 'blast')).toBe(true);
    const out = untilResolved(b);
    expect(out[0]).toMatchObject({ k: 'attack', unit: 'a', ability: 'blast' });
    expect(b.state.charges).toEqual([]);
  });

  it('golpe físico sai na hora; carregam só as magias, o Tiro mirado e o Salto do Lanceiro (12/11 e 13/11)', () => {
    const charged = Object.values(ABILITIES).filter((a) => a.charge > 0 && !a.id.startsWith('fft_')).map((a) => a.id).sort();
    expect(charged).toEqual(['aimed_shot', 'blast', 'gust', 'heal', 'lance_jump', 'shadow_wave']);
    expect(Object.values(ABILITIES).filter((a) => a.charge > 0 && !a.magic && !a.panel)).toEqual([]);
    expect(duel('warrior').act('heavy_strike', { x: 4, y: 3 })[0].k).toBe('attack');
  });

  it('Tiro mirado mira a casa: o alvo que sai dela faz a carga não achar ninguém', () => {
    const b = duel('archer', 1, 3);
    b.act('aimed_shot', { x: 4, y: 3 });
    b.state.units[1].pos = { x: 4, y: 5 };
    expect(untilResolved(b)).toContainEqual({ k: 'fizzle', unit: 'a', ability: 'aimed_shot' });
  });

  it('Explosão segue a unidade que estava na casa', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    b.state.units[1].pos = { x: 4, y: 4 };
    const out = untilResolved(b);
    expect(out[0]).toMatchObject({ k: 'attack', target: { x: 4, y: 4 } });
  });

  it('anda depois de declarar e a carga continua (13/11, pedido do Fernando: "pode se mover para jogar ela mais longe")', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    expect(b.reach().size).toBeGreaterThan(0);
    b.move({ x: 1, y: 4 });
    expect(b.state.charges.length).toBe(1);
  });

  it('quem está carregando leva 50% a mais de ataque físico, não de magia (BMG 6, Charging)', () => {
    const b = duel('warrior');
    b.state.charges = [{ unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 3 }];
    const [lo, hi] = ABILITIES.strike.damage;
    expect(b.preview('strike', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: Math.floor(lo * 1.5), dmgMax: Math.floor(hi * 1.5) });
    const m = duel('mage', 2, 3);
    m.state.charges = [{ unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 3 }];
    expect(m.preview('firebolt', { x: 4, y: 3 }).targets[0]).toMatchObject({ dmgMin: ABILITIES.firebolt.damage[0], dmgMax: ABILITIES.firebolt.damage[1] });
  });

  it('o turno da IA traz os eventos das cargas que saem antes do próximo turno', () => {
    const b = duel('mage', 1, 3);
    b.act('blast', { x: 4, y: 3 });
    const all: BattleEvent[] = [...b.endTurn()];
    for (let i = 0; i < 6 && !all.some((e) => e.k === 'attack' && e.ability === 'blast'); i++) all.push(...playAiTurn(b));
    expect(all.some((e) => e.k === 'attack' && e.ability === 'blast')).toBe(true);
  });

  it('quem morre perde a carga; a carga que seguia quem morreu passa a mirar a casa dele (achado na vitrine, 12/11)', () => {
    const b = duel('warrior');
    b.state.charges = [
      { unit: 'a', ability: 'heavy_strike', target: { x: 4, y: 3 }, follow: 'b', ticks: 3 },
      { unit: 'b', ability: 'strike', target: { x: 3, y: 3 }, follow: null, ticks: 2 },
    ];
    b.state.units[1].hp = 1;
    resolveAbility(b.grid, b.state, 'a', 'strike', { x: 4, y: 3 });
    expect(b.state.units.some((u) => u.id === 'b')).toBe(false);
    expect(b.state.charges).toEqual([{ unit: 'a', ability: 'heavy_strike', target: { x: 4, y: 3 }, follow: null, ticks: 3 }]);
    expect(() => previewOrder(b.state, 8)).not.toThrow();
  });

  it('salvar e carregar guarda as cargas; carga com tique fora do limite é recusada', () => {
    const b = Battle.start(SCENARIOS.skirmish, 1);
    b.state.charges = [{ unit: b.actor.id, ability: UNIT_DEFS[b.actor.def].abilities[0], target: { x: 2, y: 2 }, follow: null, ticks: 3 }];
    expect(Battle.load(b.save())?.state.charges).toEqual(b.state.charges);
    const raw = JSON.parse(b.save());
    raw.state.charges[0].ticks = 500;
    expect(Battle.load(JSON.stringify(raw))).toBeNull();
  });
});

describe('cargas no estudo do FFT (BMG 2.2, 3.3)', () => {
  registerFftStudy();
  it('Fogo carrega 4 tiques e gasta o MP uma vez só, quando começa', () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    const wizard = b.state.units.find((u) => u.id === 'wizard')!;
    const knight = b.state.units.find((u) => u.id === 'e-knight')!;
    wizard.pos = { x: 5, y: 5 };
    knight.pos = { x: 5, y: 7 };
    b.state.turn = { actor: 'wizard', moved: false, usedAbility: null };
    b.act('fft_wizard_fire', { x: 5, y: 7 });
    expect(wizard.vars!.mp).toBe(11);
    expect(b.state.charges[0].ticks).toBe(4);
    untilResolved(b);
    expect(b.state.units.find((u) => u.id === 'wizard')?.vars!.mp).toBe(11);
  });
});
