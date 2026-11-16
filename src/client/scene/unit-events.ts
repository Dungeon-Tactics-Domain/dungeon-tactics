// Plays a battle's events on the units in sequence (walk, strike, hit, miss, heal, push, charge, death). The rule is
// already applied to the state; this only reads what happened.
import { ABILITIES } from '../../shared/battle/abilities.ts';
import { samePos } from '../../shared/battle/grid.ts';
import type { BattleEvent, BattleState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { lookOf, playFx } from '../fx.ts';
import { numberPx, WEIGHT } from '../hit-weight.ts';
import { t } from '../i18n.ts';
import { TIMING } from '../timing.ts';
import { type Sequence, takeDamage } from './unit-hits.ts';
import { push, walkPath } from './unit-moves.ts';
import { flash, playClip, setBar } from './unit-view.ts';
import type { Units } from './units.ts';

// `before` runs before each event (the game uses it for the banner with the ability name and the enemy's destination)
export async function playEvents(
  u: Units,
  events: BattleEvent[],
  state: BattleState,
  before?: (e: BattleEvent) => Promise<void>,
) {
  const s: Sequence = { striker: null, center: null, magic: false, slowed: false, pushed: new Map() };
  for (const [i, e] of events.entries()) {
    const v = u.views.get(e.unit);
    if (!v) continue;
    await before?.(e);
    if (e.k === 'move') await walkPath(u, v, e.path);
    else if (e.k === 'attack') {
      s.striker = e.unit;
      s.magic = !!ABILITIES[e.ability].magic;
      s.center = e.target;
      s.pushed.clear(); // a bump of this attack must not take an earlier attack's push
      const target = state.units.find((x) => x.pos.x === e.target.x && x.pos.y === e.target.y);
      if (!samePos(u.posOf(v), e.target))
        await u.cam.actionCam(u.posOf(v), e.target, state.units.find((x) => x.id === e.unit)?.team === 'enemy');
      if (ABILITIES[e.ability].range[1] > 0) u.face(v, target?.pos ?? e.target);
      const look = lookOf(e.ability);
      playClip(v, look.clip, true);
      await u.time.wait(TIMING.windup);
      const from = v.holder.position.clone().setY(v.holder.position.y + 0.55);
      const to = u.space.world(e.target).setY(u.space.world(e.target).y + 0.4);
      if (look.fx === 'dash') {
        // charge: advances half a tile and returns, like FFT's quick lunge
        const a = v.holder.position.clone(),
          b = a.clone().lerp(u.space.world(e.target), 0.5);
        await u.time.animate(TIMING.lunge, (k) => v.holder.position.lerpVectors(a, b, Math.sin(Math.PI * k)));
      }
      await playFx(u.scene, u.animate, look.fx, from, to, ABILITIES[e.ability].radius, TIMING.projectile);
      playClip(v, 'Idle'); // the gesture plays once and stuck on the last frame until the unit acted again (Nov 13 review)
    } else if (e.k === 'hit' || e.k === 'bump' || e.k === 'fall' || e.k === 'spike')
      await takeDamage(u, v, events, i, state, s);
    else if (e.k === 'miss') {
      u.float(e.unit, t('Errou', 'Miss'), 'miss');
      // dodge: the target takes a little step back and returns, so the miss shows on the unit and not only in the text
      if (v.body) void u.time.animate(TIMING.hit * 0.8, (k) => (v.body!.position.z = -Math.sin(Math.PI * k) * 0.25));
      await u.time.wait(TIMING.hit);
    } else if (e.k === 'heal') {
      v.hp += e.amount;
      // heal flashes green, without the strike's pause or shake: the same signal, with another meaning
      flash(v, u.time, '#5dff8a', 0.8, TIMING.hit);
      setBar(v, u.time, TIMING.hpDrain);
      u.float(e.unit, `+${e.amount}`, 'heal', numberPx(e.amount, UNIT_DEFS[v.def].hp, false));
      await u.time.wait(TIMING.hit);
    } else if (e.k === 'push') s.pushed.set(e.unit, await push(u, v, e.to));
    else if (e.k === 'charge') {
      // starts charging: the long spell gesture (each ability's own effect comes in the animation block)
      u.face(v, e.target);
      playClip(v, lookOf(e.ability).charge ?? 'Spellcast_Long');
      u.float(e.unit, t('Carregando', 'Charging'), 'miss');
      await u.time.wait(TIMING.hit);
    } else if (e.k === 'fizzle') {
      u.float(e.unit, t('Sem alvo', 'No target'), 'miss');
      await u.time.wait(TIMING.hit);
    } else if (e.k === 'die') {
      // falls and stays down (Nov 13, Fernando's request: "the enemies' bodies must stay on the ground and not vanish"); the
      // sync removes the bar and the ring and darkens the body (fallen)
      playClip(v, 'Death_A', true);
      await u.time.wait(TIMING.die);
      await u.cam.closeUp(null, WEIGHT.zoom, TIMING.closeUpBack); // back from the death close-up, if there was one
    }
  }
}
