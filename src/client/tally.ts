// Battle tally for the highlight at the end (night of Nov 12): damage dealt and enemies downed per unit. Reads the
// events in the order the scene plays them: everything after an "attack" belongs to whoever attacked (hit, crash, fall and push
// spike), until the next "attack". Only counts damage to the other side (a spike at the end of one's own turn is nobody's merit).
// Pure and tested; the Game gathers the events on each animation. Saving and reopening mid-battle resets the tally (it lives only in memory).
import type { BattleEvent, Team } from '../shared/battle/types.ts';
import { isObjective, UNIT_DEFS } from '../shared/battle/units.ts';
import { t } from './i18n.ts';

export interface Score {
  dmg: number;
  kills: number;
}
export interface Tally {
  by: string | null;
  scores: Record<string, Score>;
}

// side and sheet of each unit, stored at the start of the battle (dead units leave the state)
export type Roster = Record<string, { team: Team; def: string }>;

export const emptyTally = (): Tally => ({ by: null, scores: {} });
export const teamsOf = (roster: Roster): Record<string, Team> =>
  Object.fromEntries(Object.entries(roster).map(([id, u]) => [id, u.team]));

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

// the heroes' cards at the end (end-screens.ts resultBoard): everyone who started on the heroes' side but the Beacon, the
// life left (the roster keeps the fallen, at 0: the state drops them), the tally and the highlight
export function endHeroes(tally: Tally, roster: Roster, units: { id: string; hp: number }[]) {
  const best = mvp(tally, teamsOf(roster), 'hero')?.[0];
  return Object.entries(roster)
    .filter(([, r]) => r.team === 'hero' && !isObjective(r.def))
    .map(([id, { def }]) => {
      const s = tally.scores[id];
      return {
        id,
        def,
        hp: units.find((u) => u.id === id)?.hp ?? 0,
        max: UNIT_DEFS[def].hp,
        dmg: s?.dmg ?? 0,
        kills: s?.kills ?? 0,
        mvp: id === best,
      };
    });
}

// the result board card's last line, where the lab mockup had the EXP gained (XP and levels are cancelled): `gain`
// green, `fell` light red, plain muted
export type CardLine = [text: string, tone: 'gain' | 'fell' | ''];

// what the hero did, for the battles that give nothing else to show on the card; a fallen hero says so in words
export const tallyLine = (h: Score & { hp: number }): CardLine =>
  h.hp <= 0
    ? [t('Caído', 'Fallen'), 'fell']
    : [
        t(
          `${h.dmg} de dano · ${h.kills} derrubado${h.kills === 1 ? '' : 's'}`,
          `${h.dmg} damage · ${h.kills} ${h.kills === 1 ? 'takedown' : 'takedowns'}`,
        ),
        '',
      ];

// an expedition room's card line: the life the hero takes into the next room (the recovery already applied), or
// "Fallen · back at" for a fallen hero; with nothing carried (a lost or finished expedition), what the hero did
export const roomLine = (h: Score & { hp: number }, carried?: { hp: number; max: number }): CardLine => {
  if (!carried) return tallyLine(h);
  const life = `${carried.hp}/${carried.max}`;
  return h.hp <= 0
    ? [t(`Caiu · volta com ${life} de vida`, `Fell · back at ${life} HP`), 'fell']
    : [t(`Segue com ${life} de vida`, `Goes on with ${life} HP`), 'gain'];
};
