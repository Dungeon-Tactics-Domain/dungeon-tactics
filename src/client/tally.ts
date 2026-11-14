// Battle tally for the highlight at the end (night of Nov 12): damage dealt and enemies downed per unit. Reads the
// events in the order the scene plays them: everything after an "attack" belongs to whoever attacked (hit, crash, fall and push
// spike), until the next "attack". Only counts damage to the other side (a spike at the end of one's own turn is nobody's merit).
// Pure and tested; the Game gathers the events on each animation. Saving and reopening mid-battle resets the tally (it lives only in memory).
import type { BattleEvent, Team } from '../shared/battle/types.ts';

export interface Score {
  dmg: number;
  kills: number;
}
export interface Tally {
  by: string | null;
  scores: Record<string, Score>;
}

export const emptyTally = (): Tally => ({ by: null, scores: {} });

export function addEvents(t: Tally, events: BattleEvent[], team: Record<string, Team>): void {
  // spike with no push right before (from whoever ended their turn on it) is nobody's merit, nor is the death that comes from it;
  // without this it went to whoever attacked last, maybe turns earlier (finding from the Nov 13 review)
  const ownFault = new Set<string>();
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (e.k === 'spike' && !(prev?.k === 'push' && prev.unit === e.unit)) ownFault.add(e.unit);
  });
  for (const e of events) {
    if (e.k === 'attack') t.by = e.unit;
    if ((e.k === 'spike' || e.k === 'die') && ownFault.has(e.unit)) continue;
    if (!t.by || team[e.unit] === undefined || team[e.unit] === team[t.by]) continue;
    const s = (t.scores[t.by] ??= { dmg: 0, kills: 0 });
    if ('dmg' in e) s.dmg += e.dmg;
    if (e.k === 'die') s.kills++;
  }
}

// who on the team did the most: most downed, tie broken by damage; null if nobody on the team scored
export function mvp(t: Tally, team: Record<string, Team>, side: Team): [id: string, s: Score] | null {
  const list = Object.entries(t.scores).filter(([id, s]) => team[id] === side && (s.dmg > 0 || s.kills > 0));
  list.sort(([, a], [, b]) => b.kills - a.kills || b.dmg - a.dmg);
  return list[0] ?? null;
}
