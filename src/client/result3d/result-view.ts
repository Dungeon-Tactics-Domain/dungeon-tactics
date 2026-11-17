// Pure side of the 3D battle result (result3d.ts): what the end of a battle shows, from the same board the HTML window
// gets (game/end-screens.ts resultBoard), text already translated. Read the way FFT: The Ivalice Chronicles lays its
// victory out: the title, a line under it, what the battle gave ("Spoils of war") and who did the most ("Greatest
// contribution"); the heroes' lines, which the reference does not have, share the spoils' block. No DOM or Three here;
// tested in tests/result3d.test.ts.
import type { Board } from '../game/end-screens.ts';
import { t, unitName } from '../i18n.ts';

export interface HeroRow {
  name: string;
  life: string; // "34/50"; 0 for the fallen
  line: string; // what the hero did, or the life it carries on (tally.ts)
  tone: 'gain' | 'fell' | '';
}
export interface ResultView {
  won: boolean;
  title: string; // in capitals, like the reference
  note: string;
  heads: [spoils: string, mvp: string]; // the two plates' titles
  heroes: HeroRow[];
  spoils: [label: string, value: string][];
  mvp: { name: string; line: string } | null; // nobody when no hero scored
  actions: string[]; // the buttons' labels, the primary last
}

export function resultView(b: Pick<Board, 'won' | 'title' | 'cards' | 'cols' | 'note'>, actions: string[]): ResultView {
  const best = b.cards.find(([h]) => h.mvp);
  return {
    won: b.won,
    title: b.title.toUpperCase(),
    note: b.note,
    heads: [t('Resultado', 'Result').toUpperCase(), t('Destaque', 'MVP').toUpperCase()],
    heroes: b.cards.map(([h, [line, tone]]) => ({ name: unitName(h.def), life: `${h.hp}/${h.max}`, line, tone })),
    spoils: b.cols,
    mvp: best ? { name: unitName(best[0].def), line: best[1][0] } : null,
    actions,
  };
}
