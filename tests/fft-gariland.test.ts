import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { GARILAND, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { tileAt, TERRAIN } from '../src/shared/battle/grid.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Cenário de estudo: a 1ª batalha do FFT no nosso motor (pedido do Fernando, 11/11). Fontes em docs/game-design/referencia-fft.md
registerFftStudy();

describe('FFT Gariland: mapa (fft-map-json, MAP022)', () => {
  const g = GARILAND.grid;

  it('tem 10 x 15 casas com as alturas do arquivo', () => {
    expect([g.width, g.height]).toEqual([10, 15]);
    expect(tileAt(g, { x: 1, y: 13 }).h).toBe(10); // a chaminé, casa mais alta
    expect(tileAt(g, { x: 3, y: 2 }).h).toBe(8);
    expect(tileAt(g, { x: 6, y: 0 }).h).toBe(0); // o rio
  });

  it('piso de cada casa com as contagens do arquivo (surface_type) e 23 rampas; só desenho (12/11)', () => {
    const count: Record<string, number> = {};
    for (const t of g.tiles) count[t.look!] = (count[t.look!] ?? 0) + 1;
    expect(count).toEqual({ grass: 25, stone: 42, water: 38, roof: 23, wood: 7, bridge: 5, box: 5, chimney: 3, tree: 2 });
    expect(g.tiles.filter((t) => t.ramp).length).toBe(23);
    expect(tileAt(g, { x: 4, y: 2 }).ramp).toEqual([0, 2]); // telhado sobe para +y até a cumeeira de altura 8
  });

  it('só as duas árvores não são pisáveis', () => {
    const blocked = g.tiles.flatMap((t, i) => (TERRAIN[t.terrain].walkable ? [] : [`${i % g.width},${Math.floor(i / g.width)}`]));
    expect(blocked).toEqual(['2,0', '8,3']);
  });
});

describe('FFT Gariland: unidades de nível 1 (BMG 7.1 e 7.4)', () => {
  it('vida = stat da classe + 13 do equipamento de recruta', () => {
    expect(UNIT_DEFS.fft_squire.hp).toBe(43); // [507 903 * 100 / 1 638 400] = 30 (a faixa dá 30 ou 31), + 13
    expect(UNIT_DEFS.fft_chemist.hp).toBe(37); // [507 903 * 80 / 1 638 400] = 24, + 13
    expect(UNIT_DEFS.fft_ramza.hp).toBe(51); // [507 903 * 125 / 1 638 400] = 38, + 13
  });

  it('Speed 6 para todos; Move 4 (Escudeiro) e 3 (Químico)', () => {
    for (const id of ['fft_squire', 'fft_chemist', 'fft_ramza']) expect(UNIT_DEFS[id].speed, id).toBe(6);
    expect([UNIT_DEFS.fft_squire.move, UNIT_DEFS.fft_chemist.move]).toEqual([4, 3]);
  });

  it('dano do ataque: Broad Sword PA * 4, Dagger [(PA + Sp) / 2] * 3', () => {
    expect(ABILITIES.fft_squire_attack.damage).toEqual([16, 16]);
    expect(ABILITIES.fft_ramza_attack.damage).toEqual([20, 20]);
    expect(ABILITIES.fft_chemist_attack.damage).toEqual([12, 12]);
  });

  it('Arremessar pedra PA * (1..2) a 4 casas, Investida PA * (1..4), os dois empurram em 50%; Poção cura 30 a 4 casas', () => {
    expect(ABILITIES.fft_squire_stone).toMatchObject({ damage: [4, 8], range: [1, 4], push: 1, pushChance: 50 });
    expect(ABILITIES.fft_squire_dash).toMatchObject({ damage: [4, 16], range: [1, 1], push: 1, pushChance: 50 });
    expect(ABILITIES.fft_chemist_potion).toMatchObject({ heal: [30, 30], range: [1, 4] });
  });
});

describe('FFT Gariland: regras no motor', () => {
  const b = () => Battle.start(GARILAND, 1);
  const put = (battle: Battle, id: string, x: number, y: number) => { battle.state.units.find((u) => u.id === id)!.pos = { x, y }; };

  it('5 de cada lado: Ramza, Delita e 3 cadetes contra 4 Escudeiros e 1 Químico', () => {
    const defs = (team: string) => GARILAND.spawns.filter((s) => s.team === team).map((s) => s.def).sort();
    expect(defs('hero')).toEqual(['fft_chemist', 'fft_delita', 'fft_ramza', 'fft_squire', 'fft_squire']);
    expect(defs('enemy')).toEqual(['fft_chemist', 'fft_squire', 'fft_squire', 'fft_squire', 'fft_squire']);
  });

  it('acerto de frente = 100 menos a evasão de classe do alvo: 95% no Escudeiro, 90% no Ramza; Investida não é evitada', () => {
    const battle = b();
    put(battle, 'ramza', 2, 5);
    put(battle, 'e-squire-1', 3, 5);
    battle.state.turn.actor = 'ramza';
    // um de frente para o outro (12/11: o estudo ganhou direção; antes o acerto era sempre o de frente)
    battle.state.units.find((u) => u.id === 'ramza')!.facing = 1;
    battle.state.units.find((u) => u.id === 'e-squire-1')!.facing = 3;
    expect(previewAbility(battle.grid, battle.state, 'ramza', 'fft_ramza_attack', { x: 3, y: 5 }).targets[0].chance).toBe(95);
    expect(previewAbility(battle.grid, battle.state, 'ramza', 'fft_ramza_dash', { x: 3, y: 5 }).targets[0].chance).toBe(100);
    expect(previewAbility(battle.grid, battle.state, 'e-squire-1', 'fft_squire_attack', { x: 2, y: 5 }).targets[0].chance).toBe(90);
  });

  it('Jump 3: sobe 3 de altura num passo, não 4', () => {
    const battle = b();
    put(battle, 'ramza', 4, 9); // altura 4; ao lado (3,9) tem 5, (4,8) tem 2 e (3,8) tem 6
    const reach = reachable(battle.grid, battle.state, 'ramza');
    expect(reach.has('3,9')).toBe(true);
    put(battle, 'ramza', 4, 7); // altura 2; (3,7) tem 8
    expect(reachable(battle.grid, battle.state, 'ramza').get('3,7')?.cost ?? 99).toBeGreaterThan(1);
  });

  it('CT: quem só passa a vez fica com 42 dos 102 (custo 60)', () => {
    const battle = b();
    const actor = battle.actor;
    expect(actor.ct).toBe(102); // Speed 6: 17 tiques
    battle.endTurn();
    expect(battle.state.units.find((u) => u.id === actor.id)!.ct).toBeGreaterThanOrEqual(42);
  });

  it('vitória ao derrotar todos os inimigos; sem alvo a proteger não é derrota', () => {
    const battle = b();
    expect(battle.state.outcome).toBe('ongoing');
    battle.state.units = battle.state.units.filter((u) => u.team === 'hero');
    battle.endTurn();
    expect(battle.state.outcome).toBe('victory');
  });

  it('fica na lista de cenários e a IA termina a batalha', () => {
    expect(SCENARIOS['fft-gariland']).toBe(GARILAND);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(simulate(GARILAND, seed, 300).outcome).not.toBe('timeout');
  });

  it('salvar e carregar devolve a mesma batalha', () => {
    const battle = b();
    expect(Battle.load(battle.save())?.state).toEqual(battle.state);
  });
});
