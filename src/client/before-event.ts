// What plays before each battle event's animation: its sound and the FFT steps (the enemy shows where it is going,
// every strike shows its name in a banner with the hit area marked).
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { dist, samePos, subOf } from '../shared/battle/grid.ts';
import { cellsOf, squareH } from '../shared/battle/pathing.ts';
import type { BattleEvent } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { lookOf } from './fx.ts';
import type { BattleHud } from './hud.ts';
import { abilityName } from './i18n.ts';
import { allTiles, type Highlights } from './interaction.ts';
import { rampLink } from './scene/space.ts';
import type { BattleScene } from './scene.ts';
import { type Sfx, sfx } from './sound.ts';
import { isJump, stepMs, TIMING } from './timing.ts';

// Sound for each event (before its animation): step by step, strike in the air, hit, miss, heal, charge, fall
function sound(e: BattleEvent, battle: Battle, scene: BattleScene) {
  const MELEE = new Set(['slash', 'heavy', 'stab', 'impact', 'spin', 'dash', 'debuff']);
  const BY_EVENT: Partial<Record<BattleEvent['k'], Sfx>> = {
    hit: 'hit',
    bump: 'hit',
    fall: 'hit',
    spike: 'hit',
    miss: 'miss',
    heal: 'heal',
    regen: 'heal',
    charge: 'charge',
    fizzle: 'miss',
    die: 'die',
  };
  if (e.k === 'move') {
    // step at the start of each tile walked; on a jump, the sound goes on landing (same timings as the scene, stepMs)
    const size = UNIT_DEFS[battle.state.units.find((u) => u.id === e.unit)?.def ?? '']?.size ?? 1;
    const h = (i: number) => squareH(battle.grid, e.path[i], size);
    let at = 0;
    for (let i = 1; i < e.path.length; i++) {
      // ramp: walking, at the step pace (the same as scene/unit-moves.ts)
      const dh = rampLink(battle.grid, e.path[i - 1], e.path[i]) ? 0 : h(i) - h(i - 1),
        tiles = dist(e.path[i - 1], e.path[i]) / subOf(battle.grid),
        ms = stepMs(dh, tiles);
      void scene.wait(at + (isJump(dh, tiles) ? ms - TIMING.jumpLand : 0)).then(() => sfx('step'));
      at += ms;
    }
  } else if (e.k === 'attack') {
    const fx = lookOf(e.ability).fx;
    sfx(
      MELEE.has(fx)
        ? 'swing'
        : fx === 'fire' || fx === 'blast'
          ? 'fire'
          : ['heal', 'buff', 'wind'].includes(fx)
            ? 'spell'
            : 'throw',
    );
  } else if (BY_EVENT[e.k]) sfx(BY_EVENT[e.k]!);
}

// FFT steps before each event: the enemy shows where it is going before moving, and every strike shows the ability name
// in a banner at the top with the hit area marked (timings in timing.ts)
export async function beforeEvent(e: BattleEvent, enemy: boolean, battle: Battle, scene: BattleScene, hud: BattleHud) {
  // the enemy's steps play after the cursor shows the destination, along with the walk
  // the strike sound comes out with the gesture, after the name banner (Nov 13, review: it played ~0.9 s earlier)
  if (!(e.k === 'move' && enemy) && e.k !== 'attack') sound(e, battle, scene);
  const show = async (hl: Highlights, ms: number) => {
    scene.setHighlights(hl);
    await scene.wait(ms);
    scene.setHighlights(null);
  };
  if (e.k === 'move' && enemy) {
    const to = e.path.at(-1)!;
    const size = UNIT_DEFS[battle.state.units.find((u) => u.id === e.unit)?.def ?? '']?.size ?? 1;
    scene.setCursor(to, size);
    await show(
      {
        tiles: cellsOf(to, size).map((pos) => ({ pos, kind: 'target' as const })),
        path: e.path.slice(1),
        preview: null,
        size,
      },
      TIMING.enemyDestination,
    ); // without the dot under the walker
    scene.setCursor(null);
    sound(e, battle, scene);
  } else if (e.k === 'attack') {
    const a = ABILITIES[e.ability];
    const me = battle.state.units.find((u) => u.id === e.unit);
    if (me) scene.focusOn(me.pos, e.target);
    const area = [
      e.target,
      ...allTiles(battle).filter((p) => a.radius > 0 && dist(p, e.target) <= a.radius && !samePos(p, e.target)),
    ];
    hud.banner(abilityName(e.ability));
    await show(
      { tiles: area.map((pos, i) => ({ pos, kind: i ? 'area' : 'target' })), path: null, preview: null },
      TIMING.banner,
    );
    sound(e, battle, scene);
  }
}
