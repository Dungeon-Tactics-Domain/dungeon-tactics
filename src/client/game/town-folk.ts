// The townsfolk of the walkable town: who strolls, who is being talked to, the rumour each one tells next.
import { CLASS_VOICE, GUILD_LINE, TOWNSFOLK, type Townsfolk } from '../../content/crawl/town.ts';
import type { Grid } from '../../shared/battle/grid.ts';
import { SUB } from '../../shared/battle/half.ts';
import type { BattleState, UnitState } from '../../shared/battle/types.ts';
import { GROUP_KEY, parseGroup } from '../group.ts';
import type { BattleScene } from '../scene.ts';
import { store } from '../store.ts';
import { talk } from '../talk.ts';
import { TIMING } from '../timing.ts';
import { cell, clear, ME, memberUnit, near, strollPath } from '../town-map.ts';
import { openSheet } from '../town-sheet.ts';

const STROLL_MS = (TIMING.step / SUB) * 1.6; // townsfolk amble, a little slower than the walker
export const windowOpen = () => !!document.querySelector('.overlay');
const group = () => parseGroup(store.json(GROUP_KEY));

// what the folk need of the town around them
export interface FolkHost {
  scene: BattleScene;
  grid: Grid;
  state: BattleState;
  me: () => UnitState;
  showPrompt: () => void;
}

export class Folk {
  talking: string | null = null; // who listens now: they stop strolling
  private told = new Map<string, number>(); // the next rumour of each townsperson

  constructor(private readonly h: FolkHost) {}

  nameOf(u: UnitState) {
    return u.id.startsWith('f-')
      ? (this.folkOf(u)?.name ?? '')
      : (group().members.find((m) => memberUnit(m.id) === u.id)?.name ?? '');
  }
  private folkOf = (u: UnitState) => TOWNSFOLK.find((f) => `f-${f.id}` === u.id);

  // A townsperson tells the next rumour; a party member greets and opens their sheet (Fernando: talking opens it). Both
  // turn to each other first
  async talkTo(u: UnitState) {
    this.h.scene.rest(ME, u.pos);
    this.h.scene.rest(u.id, this.h.me().pos);
    this.talking = u.id;
    const folk = this.folkOf(u);
    if (folk) {
      const i = this.told.get(folk.id) ?? 0;
      this.told.set(folk.id, i + 1);
      const [pt, en] = folk.lines[i % folk.lines.length];
      await talk([{ who: { name: folk.name, def: folk.def, pitch: folk.pitch }, pt, en }]);
    } else {
      const m = group().members.find((x) => memberUnit(x.id) === u.id);
      if (m) {
        await talk([
          { who: { name: m.name, def: m.cls, pitch: CLASS_VOICE[m.cls] ?? 330 }, pt: GUILD_LINE[0], en: GUILD_LINE[1] },
        ]);
        openSheet(m, () => {});
      }
    }
    this.talking = null;
  }

  // A townsperson ambles to a spot near home every few seconds (cosmetic, so Math.random) along a way that never blocks a
  // door or anyone (town-map.ts clear); stays put while a window is open, while being talked to or while the walker
  // stands beside them
  async stroll(f: Townsfolk) {
    const id = `f-${f.id}`;
    const home = cell(f.home);
    for (;;) {
      await this.h.scene.wait(2500 + Math.random() * 4000);
      if (windowOpen() || this.talking === id) continue;
      const u = this.h.state.units.find((x) => x.id === id);
      if (!u) return;
      // beside the walker, wait to be talked to: they wandered off while the prompt still offered to talk to them
      if (near(this.h.me().pos, u)) continue;
      for (const p of strollPath(this.h.grid, this.h.state, id, home, Math.random)) {
        // checked again at every cell: the walker and the others moved since (never onto the walker's next cell)
        if (windowOpen() || this.talking === id || !clear(this.h.grid, this.h.state, id, p)) break;
        u.pos = p;
        this.h.showPrompt(); // they may stroll into or out of the walker's reach
        await this.h.scene.glide(id, p, STROLL_MS);
      }
      this.h.scene.rest(id);
    }
  }
}
