// Cenários de ESTUDO do Final Fantasy Tactics no nosso motor, para comparar números e começar o balanceamento (pedidos do
// Fernando, 11/11): a 1ª batalha (Cidade Mágica de Gariland) e, no mesmo mapa, um confronto das quatro classes básicas
// seguintes. Não é conteúdo do jogo: só entra por parâmetro (`?cenario=fft-gariland` ou `?cenario=fft-classes`) e pelo
// simulador, com os nossos modelos. Fontes, grau de fidelidade e o que é suposição: docs/game-design/referencia-fft.md.
import { ABILITIES, type AbilityDef } from '../abilities.ts';
import { FACING, type Grid, type TerrainKind } from '../grid.ts';
import { nextRng, rollInt } from '../rng.ts';
import type { Rules } from '../rules.ts';
import { SCENARIOS, type Scenario, type Spawn } from '../scenarios.ts';
import type { UnitState } from '../types.ts';
import { UNIT_DEFS, type UnitDef } from '../units.ts';
import { BRAVE, CLASSES, ESCUTCHEON, FAITH, KNIGHT_GEAR_HP, SKILLS, STARTING_GEAR_HP, WEAPONS, type ClassDef } from './data.ts';
import { CRIT_CHANCE, critXa, faithMagic, fallDamage, hitPercent, magicHitPercent, RAW, sideOf, stat, statBreakBase, weaponDamage, wish } from './formulas.ts';

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
// Tipo de piso de cada casa (surface_type do mesmo arquivo), só para o desenho (12/11): g grama, s piso de pedra, w água
// (canal), o piso de madeira, r telhado, b ponte, c chaminé, x caixa, t árvore. As árvores são as duas casas não pisáveis.
const SURFACE = [
  'ggtgwwwwgg', 'ggsssswggg', 'wwsorowsgg', 'swsrrswstg', 'swwrrsbssw',
  'swssssbssw', 'swcrowwsxs', 'ssrrswwsrr', 'worrowssrr', 'wssoxwssrc',
  'wwwwbwssss', 'wsgggwwwsg', 'rrrggbbsgg', 'rcrxxwwsgg', 'rrroxwwwgg',
];
const LOOK: Record<string, string> = { g: 'grass', s: 'stone', w: 'water', o: 'wood', r: 'roof', b: 'bridge', c: 'chimney', x: 'box', t: 'tree' };
// Rampas (slope_type e slope_height do arquivo): "x,y" → [direção em FACING para onde sobe, níveis que sobe]. As duas
// rampas de canto (Convex) ficam planas. A regra continua usando a altura da casa (a borda de baixo da rampa).
const RAMPS: Record<string, [number, number]> = {
  '8,0': [1, 1], '8,1': [1, 1], '4,2': [0, 2], '9,2': [2, 1], '3,4': [2, 2], '4,4': [2, 2], '3,6': [0, 2], '8,7': [0, 2], '9,7': [0, 2],
  '2,8': [2, 2], '3,8': [2, 2], '8,9': [2, 2], '0,12': [1, 1], '2,12': [3, 1], '5,12': [1, 1], '6,12': [3, 1], '9,12': [0, 1],
  '0,13': [1, 1], '2,13': [3, 1], '8,13': [1, 1], '0,14': [1, 1], '2,14': [3, 1], '8,14': [1, 1],
};

// montado direto (sem `parseGrid`): o formato ASCII só aceita altura de um dígito e a chaminé tem 10
const grid: Grid = {
  width: 10,
  height: 15,
  // 1 "h" do FFT é bem menor que um nível nosso: com 0,5 o rio virava cânion. 0,25 é escolha visual, sem fonte.
  levelHeight: 0.25,
  tiles: HEIGHTS.flatMap((row, y) => row.map((h, x) => {
    const s = SURFACE[y][x], ramp = RAMPS[`${x},${y}`];
    // o canal (Waterway) tem profundidade 1 no arquivo do mapa: água rasa
    return { h, terrain: (s === 't' ? 'wall' : 'floor') as TerrainKind, look: LOOK[s], ...(ramp && { ramp }), ...(s === 'w' && { depth: 1 }) };
  })),
};

// HP e MP brutos são sorteados numa faixa quando a unidade nasce; o estudo usa o meio dela
const mid = ([lo, hi]: readonly [number, number]) => Math.floor((lo + hi) / 2);
// Estoque de poções de cada Químico. SUPOSIÇÃO do estudo (o estoque da batalha não tem fonte): sem limite, a cura
// empatava com o dano e a batalha não acabava (medido em 12/11, ver docs/medicoes/estudo-fft-gariland.md).
export const POTION_STOCK = 4;

// Ficha de combate de cada tipo de unidade do estudo, usada pelas regras abaixo
interface Sheet {
  pa: number;
  ma: number;
  sp: number;
  weapon: (typeof WEAPONS)[keyof typeof WEAPONS];
  cev: number; // evasão de classe
  sev: number; // escudo, físico
  msev: number; // escudo, mágico
  jump: number;
}
// O que cada habilidade faz além dos stats gerais dela
type Spec =
  | { k: 'weapon'; plus: number } // ATTACK (plus 0) e Charge +K
  | { k: 'rolls'; rolls: readonly [number, number] } // dano = PA * (a..b)
  | { k: 'magic' } // dano fixo pela fé, não evita com evasão física
  | { k: 'break'; stat: 'pa' | 'sp'; by: number }
  | { k: 'buff'; stat: 'pa' | 'sp'; by: number }
  | { k: 'wish'; cost: number };
const SHEET: Record<string, Sheet> = {};
const SPEC: Record<string, Spec> = {};
const BUILT: { def: UnitDef; abilities: AbilityDef[] }[] = [];

type Skill = 'stone' | 'dash' | 'accumulate' | 'wish' | 'yell' | 'potion' | 'speed_break' | 'power_break' | 'charge' | 'fire' | 'cure';
interface Extra {
  gearHp?: number;
  shield?: typeof ESCUTCHEON;
}

// Unidade de nível 1 a partir da classe e da arma (BMG 7.1, 7.4 e B.1). Todos homens: o gênero de cada um não tem fonte.
function unit(id: string, name: string, en: string, cls: ClassDef, weaponId: keyof typeof WEAPONS, model: string, skills: Skill[], extra: Extra = {}): void {
  const raw = RAW.male;
  const weapon = WEAPONS[weaponId];
  const sheet: Sheet = { pa: stat(raw.pa, cls.pam), ma: stat(raw.ma, cls.mam), sp: stat(raw.sp, cls.spm), weapon, cev: cls.cev, sev: extra.shield?.physical ?? 0, msev: extra.shield?.magical ?? 0, jump: cls.jump };
  const hp = stat(mid(raw.hp), cls.hpm) + (extra.gearHp ?? STARTING_GEAR_HP);
  const base = { heightRange: false, needsSight: false, radius: 0, heal: [0, 0] as [number, number], damage: [0, 0] as [number, number], push: 0, charge: 0, accuracy: 100 };
  const abilities: AbilityDef[] = [];
  const add = (key: string, a: Partial<AbilityDef> & Pick<AbilityDef, 'name' | 'en' | 'range'>, spec?: Spec) => {
    abilities.push({ ...base, ...a, id: `${id}_${key}` });
    if (spec) SPEC[`${id}_${key}`] = spec;
  };
  const u = { pa: sheet.pa, ma: sheet.ma, sp: sheet.sp, brave: BRAVE };
  // arco longo: 3 a 5 casas (BMG B.1); o ganho de alcance por altura do original não entra (ver a referência)
  const reach: [number, number] = weapon.kind === 'longbow' ? [3, 5] : [1, 1];
  add('attack', { name: 'Atacar', en: 'Attack', range: reach, damage: weaponDamage(weapon.kind, u, weapon.wp) }, { k: 'weapon', plus: 0 });
  const fixed = (n: number): [number, number] => [n, n];
  const magic = faithMagic(sheet.ma, FAITH, FAITH, SKILLS.fire.q); // Fogo e Cura têm o mesmo Q
  const all: Record<Skill, () => void> = {
    stone: () => add('stone', { name: 'Arremessar pedra', en: 'Throw Stone', range: [1, SKILLS.throw_stone.range], damage: [sheet.pa * SKILLS.throw_stone.rolls[0], sheet.pa * SKILLS.throw_stone.rolls[1]], push: 1, pushChance: SKILLS.throw_stone.knockback }, { k: 'rolls', rolls: SKILLS.throw_stone.rolls }),
    dash: () => add('dash', { name: 'Investida', en: 'Dash', range: [1, SKILLS.dash.range], damage: [sheet.pa * SKILLS.dash.rolls[0], sheet.pa * SKILLS.dash.rolls[1]], push: 1, pushChance: SKILLS.dash.knockback }, { k: 'rolls', rolls: SKILLS.dash.rolls }),
    accumulate: () => add('accumulate', { name: 'Acumular', en: 'Accumulate', range: [0, 0], ally: true }, { k: 'buff', stat: 'pa', by: SKILLS.accumulate.pa }),
    yell: () => add('yell', { name: 'Grito', en: 'Yell', range: [0, SKILLS.yell.range], ally: true }, { k: 'buff', stat: 'sp', by: SKILLS.yell.speed }),
    wish: () => add('wish', { name: 'Desejo', en: 'Wish', range: [1, SKILLS.wish.range], heal: fixed(wish(hp)[0]) }, { k: 'wish', cost: wish(hp)[1] }),
    potion: () => add('potion', { name: 'Poção', en: 'Potion', range: [1, SKILLS.potion.range], heal: fixed(SKILLS.potion.heal), cost: ['potions', 1] }),
    speed_break: () => add('speed_break', { name: 'Quebra de velocidade', en: 'Speed Break', range: [1, 1] }, { k: 'break', stat: 'sp', by: SKILLS.speed_break.speed }),
    power_break: () => add('power_break', { name: 'Quebra de força', en: 'Power Break', range: [1, 1] }, { k: 'break', stat: 'pa', by: SKILLS.power_break.pa }),
    // a Carga mira a casa e erra se o alvo sair (BMG 2.2); Fogo e Cura seguem a unidade (o guia não diz: suposição)
    charge: () => SKILLS.charge.forEach(([k, ctr]) => add(`charge${k}`, { name: `Carga +${k}`, en: `Charge +${k}`, range: reach, damage: weaponDamage(weapon.kind, { ...u, pa: u.pa + k, sp: u.sp + k }, weapon.wp), charge: ctr, panel: true }, { k: 'weapon', plus: k })),
    fire: () => add('fire', { name: 'Fogo', en: 'Fire', range: [1, SKILLS.fire.range], radius: 1, damage: fixed(magic), cost: ['mp', SKILLS.fire.mp], charge: SKILLS.fire.ctr, magic: true }, { k: 'magic' }),
    cure: () => add('cure', { name: 'Cura', en: 'Cure', range: [1, SKILLS.cure.range], radius: 1, heal: fixed(magic), cost: ['mp', SKILLS.cure.mp], charge: SKILLS.cure.ctr, magic: true }),
  };
  for (const s of skills) all[s]();
  SHEET[id] = sheet;
  BUILT.push({
    def: {
      id, name, en, hp, speed: sheet.sp, move: cls.move, abilities: abilities.map((a) => a.id), model,
      // janela de status: atributos do FFT; o nome da arma é o do original (o estudo é uso interno)
      info: { pa: sheet.pa, ma: sheet.ma, brave: BRAVE, faith: FAITH, weapon: weaponId.replace('_', ' '), ...(extra.shield && { shield: 'escutcheon' }) },
      // bônus de PA e Speed ganhos na batalha, e o que cada um gasta
      vars: { pa: 0, sp: 0, ...(skills.includes('potion') && { potions: POTION_STOCK }), ...((skills.includes('fire') || skills.includes('cure')) && { mp: stat(mid(raw.mp), cls.mpm) }) },
    },
    abilities,
  });
}

// Habilidades de Basic Skill e Guts (BMG 3.3). Ficaram de fora Heal (só tira Escuridão, Silêncio e Veneno, que o motor
// não tem) e Cheer Up (Brave +5, que com espada só mexe em reações). Quais já estão aprendidas na 1ª batalha não tem fonte.
const SQUIRE: Skill[] = ['stone', 'dash', 'accumulate'];
unit('fft_ramza', 'Ramza', 'Ramza', CLASSES.ramza_squire, 'broad_sword', 'knight', [...SQUIRE, 'wish', 'yell']);
unit('fft_delita', 'Delita', 'Delita', CLASSES.squire, 'broad_sword', 'barbarian', SQUIRE); // ficha de Escudeiro genérico: a dele não tem fonte
unit('fft_squire', 'Escudeiro', 'Squire', CLASSES.squire, 'broad_sword', 'rogue_hooded', SQUIRE);
unit('fft_chemist', 'Químico', 'Chemist', CLASSES.chemist, 'dagger', 'mage', ['potion']);
// As quatro classes seguintes (BMG 7.4), com o equipamento de nível 1 de cada (suposição). Battle Skill só com as duas
// quebras de atributo (as de equipamento pedem equipamento no motor); magia e Carga resolvem na hora (o motor não tem
// ação lenta: é a maior simplificação do cenário).
unit('fft_knight', 'Cavaleiro', 'Knight', CLASSES.knight, 'broad_sword', 'knight', ['speed_break', 'power_break'], { gearHp: KNIGHT_GEAR_HP, shield: ESCUTCHEON });
unit('fft_archer', 'Arqueiro', 'Archer', CLASSES.archer, 'long_bow', 'rogue', ['charge']);
unit('fft_priest', 'Mago Branco', 'Priest', CLASSES.priest, 'oak_staff', 'mage', ['cure']);
unit('fft_wizard', 'Mago Negro', 'Wizard', CLASSES.wizard, 'rod', 'skeleton_mage', ['fire']);

// PA e Speed de agora: o da ficha mais o que a batalha somou ou tirou, nunca abaixo de 1 (o mínimo de BMG 7.1)
const now = (u: UnitState, s: 'pa' | 'sp') => Math.max(1, SHEET[u.def][s] + (u.vars?.[s] ?? 0));
const damage = (actor: UnitState, ability: AbilityDef): [number, number] => {
  const spec = SPEC[ability.id];
  const s = SHEET[actor.def], pa = now(actor, 'pa');
  if (spec?.k === 'weapon') return weaponDamage(s.weapon.kind, { pa: pa + spec.plus, ma: s.ma + spec.plus, sp: now(actor, 'sp') + spec.plus, brave: BRAVE }, s.weapon.wp);
  if (spec?.k === 'rolls') return [pa * spec.rolls[0], pa * spec.rolls[1]];
  return ability.damage;
};

const rules: Rules = {
  facing: true,
  // BMG 1.4: de frente contam a evasão de classe e a do escudo; de lado só a do escudo; pelas costas nenhuma das duas.
  // Investida não pode ser evitada (BMG 3.3); magia só passa pelo escudo mágico; a quebra parte de (PA + 50)%.
  hitChance(_grid, state, actor, ability, target) {
    const spec = SPEC[ability.id], t = SHEET[target.def];
    if (spec?.k === 'rolls' && ability.id.endsWith('_dash')) return 100;
    // quem está carregando fica sem evasão (BMG 6, estado Charging)
    const charging = state.charges.some((c) => c.unit === target.id);
    if (spec?.k === 'magic') return magicHitPercent(100, charging ? 0 : t.msev, 0);
    const side = sideOf(target.pos, FACING[target.facing ?? 0], actor.pos);
    return hitPercent(spec?.k === 'break' ? statBreakBase(now(actor, 'pa')) : 100, charging ? { c: 0, s: 0, a: 0, w: 0 } : { c: t.cev, s: t.sev, a: 0, w: 0 }, side);
  },
  damage,
  // BMG 2.1 e 2.2: ~5% dos ATTACKs (e das Cargas, que valem como ATTACK) são críticos, com XA + (1..XA) - 1.
  // As outras habilidades sorteiam na própria faixa.
  rollDamage(_state, actor, ability, rng) {
    const [lo, hi] = damage(actor, ability);
    const spec = SPEC[ability.id];
    if (spec?.k !== 'weapon') return rollInt(rng, lo, hi);
    let roll: number;
    [roll, rng] = nextRng(rng);
    if (roll * 100 >= CRIT_CHANCE) return [lo, rng];
    const wp = SHEET[actor.def].weapon.wp, xa = lo / wp;
    [roll, rng] = rollInt(rng, 1, xa);
    return [critXa(xa, roll) * wp, rng];
  },
  after(_state, actor, ability, target, events) {
    const spec = SPEC[ability.id];
    if (spec?.k === 'buff' || spec?.k === 'break') target.vars![spec.stat] += spec.by;
    // Desejo: o custo sai da vida de quem usa. O que acontece quando o custo passa da vida que resta não tem fonte:
    // o estudo deixa quem usa com 1 (o motor também não sabe tirar da batalha a unidade da vez).
    if (spec?.k === 'wish') {
      const dmg = Math.min(spec.cost, actor.hp - 1);
      actor.hp -= dmg;
      if (dmg > 0) events.push({ k: 'hit', unit: actor.id, dmg, chance: 100 });
    }
  },
  speed: (u) => now(u, 'sp'),
  jump: (def) => SHEET[def].jump,
  fallDamage: (levels, def) => fallDamage(levels, SHEET[def].jump, UNIT_DEFS[def].hp),
  // vitória: derrotar todos os inimigos (Caves of Narshe). Derrota: todos caídos; "Ramza caído = fim" não tem fonte.
  outcome: (state) => (!state.units.some((u) => u.team === 'enemy') ? 'victory' : !state.units.some((u) => u.team === 'hero') ? 'defeat' : 'ongoing'),
};

const spawn = (id: string, def: string, team: Spawn['team'], x: number, y: number): Spawn => ({ id, def, team, x, y });

// Casas de partida do arquivo do mapa: 4 por lado. Quem ocupa cada uma e a casa da 5ª unidade de cada lado são suposição.
// Inimigos primeiro na lista: no empate de CT o FFT dá a vez aos inimigos (BMG 1.1) e aqui o empate segue a ordem da lista.
export const GARILAND: Scenario = {
  id: 'fft-gariland',
  name: 'Estudo FFT: Gariland',
  en: 'FFT study: Gariland',
  grid,
  rules,
  spawns: [
    spawn('e-squire-1', 'fft_squire', 'enemy', 8, 12),
    spawn('e-squire-2', 'fft_squire', 'enemy', 7, 12),
    spawn('e-squire-3', 'fft_squire', 'enemy', 4, 12),
    spawn('e-squire-4', 'fft_squire', 'enemy', 3, 12),
    spawn('e-chemist', 'fft_chemist', 'enemy', 5, 13),
    spawn('ramza', 'fft_ramza', 'hero', 7, 1),
    spawn('delita', 'fft_delita', 'hero', 6, 2),
    spawn('squire-1', 'fft_squire', 'hero', 8, 1),
    spawn('squire-2', 'fft_squire', 'hero', 5, 1),
    spawn('chemist', 'fft_chemist', 'hero', 3, 1),
  ],
};

// Segundo cenário (12/11): as quatro classes básicas seguintes, uma de cada por lado, no mesmo mapa e nas mesmas casas
// de partida. Não é uma batalha do FFT: é uma bancada para ver Cavaleiro, Arqueiro, Mago Branco e Mago Negro de nível 1.
export const CLASSES_BATTLE: Scenario = {
  id: 'fft-classes',
  name: 'Estudo FFT: classes básicas',
  en: 'FFT study: basic classes',
  grid,
  rules,
  spawns: [
    spawn('e-knight', 'fft_knight', 'enemy', 7, 12),
    spawn('e-archer', 'fft_archer', 'enemy', 8, 12),
    spawn('e-priest', 'fft_priest', 'enemy', 3, 12),
    spawn('e-wizard', 'fft_wizard', 'enemy', 4, 12),
    spawn('knight', 'fft_knight', 'hero', 7, 1),
    spawn('archer', 'fft_archer', 'hero', 8, 1),
    spawn('priest', 'fft_priest', 'hero', 5, 1),
    spawn('wizard', 'fft_wizard', 'hero', 3, 1),
  ],
};

// Põe as unidades, habilidades e os cenários do estudo nas listas do motor. Chamado só por quem pede o estudo (o cliente
// com o parâmetro, o simulador e os testes): sem a chamada, nada do FFT existe para o jogo.
export function registerFftStudy(): void {
  for (const { def, abilities } of BUILT) {
    UNIT_DEFS[def.id] = def;
    for (const a of abilities) ABILITIES[a.id] = a;
  }
  SCENARIOS[GARILAND.id] = GARILAND;
  SCENARIOS[CLASSES_BATTLE.id] = CLASSES_BATTLE;
}
