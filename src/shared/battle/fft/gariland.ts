// Final Fantasy Tactics STUDY scenarios on our engine, to compare numbers and start balancing (Fernando's requests,
// Nov 11): the 1st battle (Magic City of Gariland) and, on the same map, a clash of the next four basic classes.
// It is not game content: it only comes in by parameter (`?cenario=fft-gariland` or `?cenario=fft-classes`) and through the
// simulator, with our models. Sources, degree of fidelity and what is an assumption: docs/game-design/referencia-fft.md.
import { ABILITIES, type AbilityDef } from '../abilities.ts';
import { FACING, type Grid, type TerrainKind } from '../grid.ts';
import { nextRng, rollInt } from '../rng.ts';
import type { Rules } from '../rules.ts';
import { SCENARIOS, type Scenario, type Spawn } from '../scenarios.ts';
import type { UnitState } from '../types.ts';
import { UNIT_DEFS, type UnitDef } from '../units.ts';
import {
  BRAVE,
  CLASSES,
  ESCUTCHEON,
  FAITH,
  KNIGHT_GEAR_HP,
  SKILLS,
  STARTING_GEAR_HP,
  WEAPONS,
  type ClassDef,
} from './data.ts';
import {
  CRIT_CHANCE,
  critXa,
  faithMagic,
  fallDamage,
  hitPercent,
  magicHitPercent,
  RAW,
  sideOf,
  stat,
  statBreakBase,
  weaponDamage,
  wish,
} from './formulas.ts';

// Map 022 (Magic City Gariland), height of each tile in FFT "h", read from github.com/rainbowbismuth/fft-map-json
// (data/MAP022.json). Row = y from 0 to 14, column = x from 0 to 9. The original's ramps (slope) become steps.
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
// Floor type of each tile (surface_type from the same file), only for the drawing (Nov 12): g grass, s stone floor, w water
// (canal), o wooden floor, r roof, b bridge, c chimney, x box, t tree. The trees are the two non-walkable tiles.
const SURFACE = [
  'ggtgwwwwgg',
  'ggsssswggg',
  'wwsorowsgg',
  'swsrrswstg',
  'swwrrsbssw',
  'swssssbssw',
  'swcrowwsxs',
  'ssrrswwsrr',
  'worrowssrr',
  'wssoxwssrc',
  'wwwwbwssss',
  'wsgggwwwsg',
  'rrrggbbsgg',
  'rcrxxwwsgg',
  'rrroxwwwgg',
];
const LOOK: Record<string, string> = {
  g: 'grass',
  s: 'stone',
  w: 'water',
  o: 'wood',
  r: 'roof',
  b: 'bridge',
  c: 'chimney',
  x: 'box',
  t: 'tree',
};
// Ramps (slope_type and slope_height from the file): "x,y" → [direction in FACING it rises toward, levels it rises]. The two
// corner ramps (Convex) stay flat. The rule still uses the tile height (the ramp's lower edge).
const RAMPS: Record<string, [number, number]> = {
  '8,0': [1, 1],
  '8,1': [1, 1],
  '4,2': [0, 2],
  '9,2': [2, 1],
  '3,4': [2, 2],
  '4,4': [2, 2],
  '3,6': [0, 2],
  '8,7': [0, 2],
  '9,7': [0, 2],
  '2,8': [2, 2],
  '3,8': [2, 2],
  '8,9': [2, 2],
  '0,12': [1, 1],
  '2,12': [3, 1],
  '5,12': [1, 1],
  '6,12': [3, 1],
  '9,12': [0, 1],
  '0,13': [1, 1],
  '2,13': [3, 1],
  '8,13': [1, 1],
  '0,14': [1, 1],
  '2,14': [3, 1],
  '8,14': [1, 1],
};

// built directly (without `parseGrid`): the ASCII format only accepts a one-digit height and the chimney has 10
const grid: Grid = {
  width: 10,
  height: 15,
  // 1 FFT "h" is much smaller than one of our levels: with 0.5 the river became a canyon. 0.25 is a visual choice, without a source.
  levelHeight: 0.25,
  tiles: HEIGHTS.flatMap((row, y) =>
    row.map((h, x) => {
      const s = SURFACE[y][x],
        ramp = RAMPS[`${x},${y}`];
      // the canal (Waterway) has depth 1 in the map file: shallow water
      return {
        h,
        terrain: (s === 't' ? 'wall' : 'floor') as TerrainKind,
        look: LOOK[s],
        ...(ramp && { ramp }),
        ...(s === 'w' && { depth: 1 }),
      };
    }),
  ),
};

// Raw HP and MP are rolled within a range when the unit spawns; the study uses the middle of it
const mid = ([lo, hi]: readonly [number, number]) => Math.floor((lo + hi) / 2);
// Potion stock of each Chemist. ASSUMPTION of the study (the battle stock has no source): without a limit, healing
// matched the damage and the battle never ended (measured on Nov 12, see docs/medicoes/estudo-fft-gariland.md).
export const POTION_STOCK = 4;

// Combat sheet of each unit type in the study, used by the rules below
interface Sheet {
  pa: number;
  ma: number;
  sp: number;
  weapon: (typeof WEAPONS)[keyof typeof WEAPONS];
  cev: number; // class evasion
  sev: number; // shield, physical
  msev: number; // shield, magical
  jump: number;
}
// What each ability does beyond its general stats
type Spec =
  | { k: 'weapon'; plus: number } // ATTACK (plus 0) and Charge +K
  | { k: 'rolls'; rolls: readonly [number, number] } // damage = PA * (a..b)
  | { k: 'magic' } // fixed damage by faith, not evaded by physical evasion
  | { k: 'break'; stat: 'pa' | 'sp'; by: number }
  | { k: 'buff'; stat: 'pa' | 'sp'; by: number }
  | { k: 'wish'; cost: number };
const SHEET: Record<string, Sheet> = {};
const SPEC: Record<string, Spec> = {};
const BUILT: { def: UnitDef; abilities: AbilityDef[] }[] = [];

type Skill =
  | 'stone'
  | 'dash'
  | 'accumulate'
  | 'wish'
  | 'yell'
  | 'potion'
  | 'speed_break'
  | 'power_break'
  | 'charge'
  | 'fire'
  | 'cure';
interface Extra {
  gearHp?: number;
  shield?: typeof ESCUTCHEON;
}

// Level 1 unit from the class and the weapon (BMG 7.1, 7.4 and B.1). All male: each one's gender has no source.
function unit(
  id: string,
  name: string,
  en: string,
  cls: ClassDef,
  weaponId: keyof typeof WEAPONS,
  model: string,
  skills: Skill[],
  extra: Extra = {},
): void {
  const raw = RAW.male;
  const weapon = WEAPONS[weaponId];
  const sheet: Sheet = {
    pa: stat(raw.pa, cls.pam),
    ma: stat(raw.ma, cls.mam),
    sp: stat(raw.sp, cls.spm),
    weapon,
    cev: cls.cev,
    sev: extra.shield?.physical ?? 0,
    msev: extra.shield?.magical ?? 0,
    jump: cls.jump,
  };
  const hp = stat(mid(raw.hp), cls.hpm) + (extra.gearHp ?? STARTING_GEAR_HP);
  const base = {
    heightRange: false,
    needsSight: false,
    radius: 0,
    heal: [0, 0] as [number, number],
    damage: [0, 0] as [number, number],
    push: 0,
    charge: 0,
    accuracy: 100,
  };
  const abilities: AbilityDef[] = [];
  const add = (key: string, a: Partial<AbilityDef> & Pick<AbilityDef, 'name' | 'en' | 'range'>, spec?: Spec) => {
    abilities.push({ ...base, ...a, id: `${id}_${key}` });
    if (spec) SPEC[`${id}_${key}`] = spec;
  };
  const u = { pa: sheet.pa, ma: sheet.ma, sp: sheet.sp, brave: BRAVE };
  // longbow: 3 to 5 tiles (BMG B.1); the original's range gain from height does not apply (see the reference)
  const reach: [number, number] = weapon.kind === 'longbow' ? [3, 5] : [1, 1];
  add(
    'attack',
    { name: 'Atacar', en: 'Attack', range: reach, damage: weaponDamage(weapon.kind, u, weapon.wp) },
    { k: 'weapon', plus: 0 },
  );
  const fixed = (n: number): [number, number] => [n, n];
  const magic = faithMagic(sheet.ma, FAITH, FAITH, SKILLS.fire.q); // Fire and Cure have the same Q
  const all: Record<Skill, () => void> = {
    stone: () =>
      add(
        'stone',
        {
          name: 'Arremessar pedra',
          en: 'Throw Stone',
          range: [1, SKILLS.throw_stone.range],
          damage: [sheet.pa * SKILLS.throw_stone.rolls[0], sheet.pa * SKILLS.throw_stone.rolls[1]],
          push: 1,
          pushChance: SKILLS.throw_stone.knockback,
        },
        { k: 'rolls', rolls: SKILLS.throw_stone.rolls },
      ),
    dash: () =>
      add(
        'dash',
        {
          name: 'Investida',
          en: 'Dash',
          range: [1, SKILLS.dash.range],
          damage: [sheet.pa * SKILLS.dash.rolls[0], sheet.pa * SKILLS.dash.rolls[1]],
          push: 1,
          pushChance: SKILLS.dash.knockback,
        },
        { k: 'rolls', rolls: SKILLS.dash.rolls },
      ),
    accumulate: () =>
      add(
        'accumulate',
        { name: 'Acumular', en: 'Accumulate', range: [0, 0], ally: true },
        { k: 'buff', stat: 'pa', by: SKILLS.accumulate.pa },
      ),
    yell: () =>
      add(
        'yell',
        { name: 'Grito', en: 'Yell', range: [0, SKILLS.yell.range], ally: true },
        { k: 'buff', stat: 'sp', by: SKILLS.yell.speed },
      ),
    wish: () =>
      add(
        'wish',
        { name: 'Desejo', en: 'Wish', range: [1, SKILLS.wish.range], heal: fixed(wish(hp)[0]) },
        { k: 'wish', cost: wish(hp)[1] },
      ),
    potion: () =>
      add('potion', {
        name: 'Poção',
        en: 'Potion',
        range: [1, SKILLS.potion.range],
        heal: fixed(SKILLS.potion.heal),
        cost: ['potions', 1],
      }),
    speed_break: () =>
      add(
        'speed_break',
        { name: 'Quebra de velocidade', en: 'Speed Break', range: [1, 1] },
        { k: 'break', stat: 'sp', by: SKILLS.speed_break.speed },
      ),
    power_break: () =>
      add(
        'power_break',
        { name: 'Quebra de força', en: 'Power Break', range: [1, 1] },
        { k: 'break', stat: 'pa', by: SKILLS.power_break.pa },
      ),
    // the Charge aims at the tile and misses if the target leaves (BMG 2.2); Fire and Cure follow the unit (the guide does not say: assumption)
    charge: () =>
      SKILLS.charge.forEach(([k, ctr]) =>
        add(
          `charge${k}`,
          {
            name: `Carga +${k}`,
            en: `Charge +${k}`,
            range: reach,
            damage: weaponDamage(weapon.kind, { ...u, pa: u.pa + k, sp: u.sp + k }, weapon.wp),
            charge: ctr,
            panel: true,
          },
          { k: 'weapon', plus: k },
        ),
      ),
    fire: () =>
      add(
        'fire',
        {
          name: 'Fogo',
          en: 'Fire',
          range: [1, SKILLS.fire.range],
          radius: 1,
          damage: fixed(magic),
          cost: ['mp', SKILLS.fire.mp],
          charge: SKILLS.fire.ctr,
          magic: true,
        },
        { k: 'magic' },
      ),
    cure: () =>
      add('cure', {
        name: 'Cura',
        en: 'Cure',
        range: [1, SKILLS.cure.range],
        radius: 1,
        heal: fixed(magic),
        cost: ['mp', SKILLS.cure.mp],
        charge: SKILLS.cure.ctr,
        magic: true,
      }),
  };
  for (const s of skills) all[s]();
  SHEET[id] = sheet;
  BUILT.push({
    def: {
      id,
      name,
      en,
      hp,
      speed: sheet.sp,
      move: cls.move,
      abilities: abilities.map((a) => a.id),
      model,
      // status window: FFT attributes; the weapon name is the original's (the study is internal use)
      info: {
        pa: sheet.pa,
        ma: sheet.ma,
        brave: BRAVE,
        faith: FAITH,
        weapon: weaponId.replace('_', ' '),
        ...(extra.shield && { shield: 'escutcheon' }),
      },
      // PA and Speed bonuses gained in battle, and what each one spends
      vars: {
        pa: 0,
        sp: 0,
        ...(skills.includes('potion') && { potions: POTION_STOCK }),
        ...((skills.includes('fire') || skills.includes('cure')) && { mp: stat(mid(raw.mp), cls.mpm) }),
      },
    },
    abilities,
  });
}

// Basic Skill and Guts abilities (BMG 3.3). Left out: Heal (it only removes Darkness, Silence and Poison, which the engine
// does not have) and Cheer Up (Brave +5, which with a sword only affects reactions). Which ones are already learned in the 1st battle has no source.
const SQUIRE: Skill[] = ['stone', 'dash', 'accumulate'];
unit('fft_ramza', 'Ramza', 'Ramza', CLASSES.ramza_squire, 'broad_sword', 'knight', [...SQUIRE, 'wish', 'yell']);
unit('fft_delita', 'Delita', 'Delita', CLASSES.squire, 'broad_sword', 'barbarian', SQUIRE); // generic Squire sheet: his has no source
unit('fft_squire', 'Escudeiro', 'Squire', CLASSES.squire, 'broad_sword', 'rogue_hooded', SQUIRE);
unit('fft_chemist', 'Químico', 'Chemist', CLASSES.chemist, 'dagger', 'mage', ['potion']);
// The next four classes (BMG 7.4), with each one's level 1 equipment (assumption). Battle Skill only with the two
// stat breaks (the equipment ones need equipment in the engine); magic and Charge resolve immediately (the engine has no
// slow action: it is the scenario's biggest simplification).
unit('fft_knight', 'Cavaleiro', 'Knight', CLASSES.knight, 'broad_sword', 'knight', ['speed_break', 'power_break'], {
  gearHp: KNIGHT_GEAR_HP,
  shield: ESCUTCHEON,
});
unit('fft_archer', 'Arqueiro', 'Archer', CLASSES.archer, 'long_bow', 'rogue', ['charge']);
unit('fft_priest', 'Mago Branco', 'Priest', CLASSES.priest, 'oak_staff', 'mage', ['cure']);
unit('fft_wizard', 'Mago Negro', 'Wizard', CLASSES.wizard, 'rod', 'skeleton_mage', ['fire']);

// Current PA and Speed: the sheet's plus what the battle added or removed, never below 1 (the BMG 7.1 minimum)
const now = (u: UnitState, s: 'pa' | 'sp') => Math.max(1, SHEET[u.def][s] + (u.vars?.[s] ?? 0));
const damage = (actor: UnitState, ability: AbilityDef): [number, number] => {
  const spec = SPEC[ability.id];
  const s = SHEET[actor.def],
    pa = now(actor, 'pa');
  if (spec?.k === 'weapon')
    return weaponDamage(
      s.weapon.kind,
      { pa: pa + spec.plus, ma: s.ma + spec.plus, sp: now(actor, 'sp') + spec.plus, brave: BRAVE },
      s.weapon.wp,
    );
  if (spec?.k === 'rolls') return [pa * spec.rolls[0], pa * spec.rolls[1]];
  return ability.damage;
};

const rules: Rules = {
  facing: true,
  // BMG 1.4: from the front the class and shield evasion count; from the side only the shield's; from behind neither.
  // Dash cannot be evaded (BMG 3.3); magic only goes through the magic shield; the break starts from (PA + 50)%.
  hitChance(_grid, state, actor, ability, target) {
    const spec = SPEC[ability.id],
      t = SHEET[target.def];
    if (spec?.k === 'rolls' && ability.id.endsWith('_dash')) return 100;
    // whoever is charging has no evasion (BMG 6, Charging status)
    const charging = state.charges.some((c) => c.unit === target.id);
    if (spec?.k === 'magic') return magicHitPercent(100, charging ? 0 : t.msev, 0);
    const side = sideOf(target.pos, FACING[target.facing ?? 0], actor.pos);
    return hitPercent(
      spec?.k === 'break' ? statBreakBase(now(actor, 'pa')) : 100,
      charging ? { c: 0, s: 0, a: 0, w: 0 } : { c: t.cev, s: t.sev, a: 0, w: 0 },
      side,
    );
  },
  damage,
  // BMG 2.1 and 2.2: ~5% of ATTACKs (and Charges, which count as ATTACK) are critical, with XA + (1..XA) - 1.
  // The other abilities roll within their own range.
  rollDamage(_state, actor, ability, rng) {
    const [lo, hi] = damage(actor, ability);
    const spec = SPEC[ability.id];
    if (spec?.k !== 'weapon') return rollInt(rng, lo, hi);
    let roll: number;
    [roll, rng] = nextRng(rng);
    if (roll * 100 >= CRIT_CHANCE) return [lo, rng];
    const wp = SHEET[actor.def].weapon.wp,
      xa = lo / wp;
    [roll, rng] = rollInt(rng, 1, xa);
    return [critXa(xa, roll) * wp, rng];
  },
  after(_state, actor, ability, target, events) {
    const spec = SPEC[ability.id];
    if (spec?.k === 'buff' || spec?.k === 'break') target.vars![spec.stat] += spec.by;
    // Wish: the cost comes out of the user's life. What happens when the cost exceeds the remaining life has no source:
    // the study leaves the user at 1 (the engine also does not know how to remove the current unit from the battle).
    if (spec?.k === 'wish') {
      const dmg = Math.min(spec.cost, actor.hp - 1);
      actor.hp -= dmg;
      if (dmg > 0) events.push({ k: 'hit', unit: actor.id, dmg, chance: 100 });
    }
  },
  speed: (u) => now(u, 'sp'),
  jump: (def) => SHEET[def].jump,
  fallDamage: (levels, def) => fallDamage(levels, SHEET[def].jump, UNIT_DEFS[def].hp),
  // victory: defeat all enemies (Caves of Narshe). Defeat: everyone down; "Ramza down = end" has no source.
  outcome: (state) =>
    !state.units.some((u) => u.team === 'enemy')
      ? 'victory'
      : !state.units.some((u) => u.team === 'hero')
        ? 'defeat'
        : 'ongoing',
};

const spawn = (id: string, def: string, team: Spawn['team'], x: number, y: number): Spawn => ({ id, def, team, x, y });

// Starting tiles from the map file: 4 per side. Who occupies each one and the tile of each side's 5th unit are an assumption.
// Enemies first in the list: on a CT tie FFT gives the turn to the enemies (BMG 1.1) and here the tie follows the list order.
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

// Second scenario (Nov 12): the next four basic classes, one of each per side, on the same map and the same starting
// tiles. It is not an FFT battle: it is a bench to see level 1 Knight, Archer, White Mage and Black Mage.
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

// Puts the study's units, abilities and scenarios into the engine's lists. Called only by whoever asks for the study (the client
// with the parameter, the simulator and the tests): without the call, nothing from FFT exists for the game.
export function registerFftStudy(): void {
  for (const { def, abilities } of BUILT) {
    UNIT_DEFS[def.id] = def;
    for (const a of abilities) ABILITIES[a.id] = a;
  }
  SCENARIOS[GARILAND.id] = GARILAND;
  SCENARIOS[CLASSES_BATTLE.id] = CLASSES_BATTLE;
}
