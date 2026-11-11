// Cenário de ESTUDO: a 1ª batalha do Final Fantasy Tactics (Cidade Mágica de Gariland) no nosso motor, para comparar
// números e começar o balanceamento (pedido do Fernando, 11/11). Não é conteúdo do jogo: só entra por parâmetro
// (`?cenario=fft-gariland`) e pelo simulador, com os nossos modelos. Fontes, grau de fidelidade e o que é suposição:
// docs/game-design/referencia-fft.md.
import { ABILITIES, type AbilityDef } from '../abilities.ts';
import type { Grid, TerrainKind } from '../grid.ts';
import { nextRng, rollInt } from '../rng.ts';
import type { Rules } from '../rules.ts';
import { SCENARIOS, type Scenario } from '../scenarios.ts';
import { UNIT_DEFS, type UnitDef } from '../units.ts';
import { CLASSES, SKILLS, STARTING_GEAR_HP, WEAPONS, type ClassDef } from './data.ts';
import { CRIT_CHANCE, critXa, fallDamage, hitPercent, RAW, stat, turnCt, weaponDamage } from './formulas.ts';

// Mapa 022 (Magic City Gariland), altura de cada casa em "h" do FFT, lida de github.com/rainbowbismuth/fft-map-json
// (data/MAP022.json). Linha = y de 0 a 14, coluna = x de 0 a 9. As rampas (slope) do original viram degraus.
const HEIGHTS = [
  [2, 2, 5, 2, 0, 0, 0, 0, 2, 3],
  [2, 2, 2, 2, 4, 2, 0, 2, 2, 3],
  [0, 0, 2, 8, 6, 2, 0, 2, 2, 2],
  [2, 0, 2, 8, 8, 2, 0, 2, 5, 2],
  [2, 0, 0, 6, 6, 2, 2, 2, 2, 0],
  [2, 0, 2, 2, 2, 2, 2, 2, 2, 0],
  [2, 0, 8, 6, 2, 0, 0, 2, 4, 5],
  [2, 2, 8, 8, 2, 0, 0, 2, 6, 6],
  [0, 2, 6, 6, 2, 0, 2, 2, 8, 8],
  [0, 2, 3, 5, 4, 0, 2, 2, 6, 8],
  [0, 0, 0, 0, 2, 0, 2, 2, 2, 1],
  [0, 2, 2, 2, 2, 0, 0, 0, 2, 2],
  [7, 8, 7, 2, 2, 2, 2, 2, 2, 2],
  [8, 10, 8, 6, 4, 0, 0, 2, 2, 3],
  [8, 9, 8, 7, 4, 0, 0, 0, 2, 3],
];
// as duas casas não pisáveis do arquivo (árvores), em "x,y"
const TREES = new Set(['2,0', '8,3']);

// montado direto (sem `parseGrid`): o formato ASCII só aceita altura de um dígito e a chaminé tem 10
const grid: Grid = {
  width: 10,
  height: 15,
  // 1 "h" do FFT é bem menor que um nível nosso: com 0,5 o rio virava cânion. 0,25 é escolha visual, sem fonte.
  levelHeight: 0.25,
  tiles: HEIGHTS.flatMap((row, y) => row.map((h, x) => ({ h, terrain: (TREES.has(`${x},${y}`) ? 'wall' : 'floor') as TerrainKind }))),
};

// HP e MP brutos são sorteados numa faixa quando a unidade nasce; o estudo usa o meio dela
const mid = ([lo, hi]: readonly [number, number]) => Math.floor((lo + hi) / 2);

interface Built {
  def: UnitDef;
  abilities: AbilityDef[];
}
const cev: Record<string, number> = {}; // evasão de classe por unidade, para a conta de acerto
const jumps: Record<string, number> = {};
const attacks: Record<string, { xa: number; wp: number }> = {}; // ATTACK por habilidade, para o crítico

// Unidade de nível 1 a partir da classe e da arma (BMG 7.1, 7.4 e B.1). Todos homens: o gênero de cada um não tem fonte.
function unit(id: string, name: string, en: string, cls: ClassDef, weaponId: keyof typeof WEAPONS, model: string, squire: boolean): Built {
  const raw = RAW.male;
  const u = { pa: stat(raw.pa, cls.pam), ma: stat(raw.ma, cls.mam), sp: stat(raw.sp, cls.spm), brave: 60 };
  const weapon = WEAPONS[weaponId];
  const base = { heightRange: false, needsSight: false, radius: 0, heal: [0, 0] as [number, number], damage: [0, 0] as [number, number], push: 0, delay: 0, accuracy: 100 };
  const attack: AbilityDef = { ...base, id: `${id}_attack`, name: 'Atacar', en: 'Attack', range: [1, 1], damage: weaponDamage(weapon.kind, u, weapon.wp) };
  attacks[attack.id] = { xa: attack.damage[0] / weapon.wp, wp: weapon.wp };
  const abilities = squire
    ? [
        attack,
        { ...base, id: `${id}_stone`, name: 'Arremessar pedra', en: 'Throw Stone', range: [1, SKILLS.throw_stone.range] as [number, number],
          damage: [u.pa * SKILLS.throw_stone.rolls[0], u.pa * SKILLS.throw_stone.rolls[1]] as [number, number], push: 1, pushChance: SKILLS.throw_stone.knockback },
        { ...base, id: `${id}_dash`, name: 'Investida', en: 'Dash', range: [1, SKILLS.dash.range] as [number, number],
          damage: [u.pa * SKILLS.dash.rolls[0], u.pa * SKILLS.dash.rolls[1]] as [number, number], push: 1, pushChance: SKILLS.dash.knockback },
      ]
    : [attack, { ...base, id: `${id}_potion`, name: 'Poção', en: 'Potion', range: [1, SKILLS.potion.range] as [number, number], heal: [SKILLS.potion.heal, SKILLS.potion.heal] as [number, number] }];
  cev[id] = cls.cev;
  jumps[id] = cls.jump;
  return {
    def: { id, name, en, hp: stat(mid(raw.hp), cls.hpm) + STARTING_GEAR_HP, speed: u.sp, move: cls.move, abilities: abilities.map((a) => a.id), model },
    abilities,
  };
}

const BUILT = [
  unit('fft_ramza', 'Ramza', 'Ramza', CLASSES.ramza_squire, 'broad_sword', 'knight', true),
  unit('fft_delita', 'Delita', 'Delita', CLASSES.squire, 'broad_sword', 'barbarian', true), // ficha de Escudeiro genérico: a dele não tem fonte
  unit('fft_squire', 'Escudeiro', 'Squire', CLASSES.squire, 'broad_sword', 'rogue_hooded', true),
  unit('fft_chemist', 'Químico', 'Chemist', CLASSES.chemist, 'dagger', 'mage', false),
];

const rules: Rules = {
  // BMG 1.4, sempre "de frente": o motor não tem direção. Sem escudo nem acessório, lado e costas dariam 100%.
  // Investida não pode ser evitada (BMG 3.3); pedra e ATTACK podem.
  hitChance: (_grid, _state, _actor, ability, target) => (ability.id.endsWith('_dash') ? 100 : hitPercent(100, { c: cev[target.def], s: 0, a: 0, w: 0 }, 'front')),
  // BMG 2.1: ~5% dos ATTACKs são críticos, com XA + (1..XA) - 1. As outras habilidades sorteiam na própria faixa.
  rollDamage(_state, _actor, ability, rng) {
    const atk = attacks[ability.id];
    if (!atk) return rollInt(rng, ability.damage[0], ability.damage[1]);
    let roll: number;
    [roll, rng] = nextRng(rng);
    if (roll * 100 >= CRIT_CHANCE) return [ability.damage[0], rng];
    [roll, rng] = rollInt(rng, 1, atk.xa);
    return [critXa(atk.xa, roll) * atk.wp, rng];
  },
  turnCt,
  jump: (def) => jumps[def],
  fallDamage: (levels, def) => fallDamage(levels, jumps[def], UNIT_DEFS[def].hp),
  // vitória: derrotar todos os inimigos (Caves of Narshe). Derrota: todos caídos; "Ramza caído = fim" não tem fonte.
  outcome: (state) => (!state.units.some((u) => u.team === 'enemy') ? 'victory' : !state.units.some((u) => u.team === 'hero') ? 'defeat' : 'ongoing'),
};

// Casas de partida do arquivo do mapa: 4 por lado. Quem ocupa cada uma e a casa da 5ª unidade de cada lado são suposição.
// Inimigos primeiro na lista: no empate de CT o FFT dá a vez aos inimigos (BMG 1.1) e aqui o empate segue a ordem da lista.
export const GARILAND: Scenario = {
  id: 'fft-gariland',
  name: 'Estudo FFT: Gariland',
  en: 'FFT study: Gariland',
  grid,
  rules,
  spawns: [
    { id: 'e-squire-1', def: 'fft_squire', team: 'enemy', x: 8, y: 12 },
    { id: 'e-squire-2', def: 'fft_squire', team: 'enemy', x: 7, y: 12 },
    { id: 'e-squire-3', def: 'fft_squire', team: 'enemy', x: 4, y: 12 },
    { id: 'e-squire-4', def: 'fft_squire', team: 'enemy', x: 3, y: 12 },
    { id: 'e-chemist', def: 'fft_chemist', team: 'enemy', x: 5, y: 13 },
    { id: 'ramza', def: 'fft_ramza', team: 'hero', x: 7, y: 1 },
    { id: 'delita', def: 'fft_delita', team: 'hero', x: 6, y: 2 },
    { id: 'squire-1', def: 'fft_squire', team: 'hero', x: 8, y: 1 },
    { id: 'squire-2', def: 'fft_squire', team: 'hero', x: 5, y: 1 },
    { id: 'chemist', def: 'fft_chemist', team: 'hero', x: 3, y: 1 },
  ],
};

// Põe as unidades, habilidades e o cenário do estudo nas listas do motor. Chamado só por quem pede o estudo (o cliente
// com o parâmetro, o simulador e os testes): sem a chamada, nada do FFT existe para o jogo.
export function registerFftStudy(): void {
  for (const { def, abilities } of BUILT) {
    UNIT_DEFS[def.id] = def;
    for (const a of abilities) ABILITIES[a.id] = a;
  }
  SCENARIOS[GARILAND.id] = GARILAND;
}
