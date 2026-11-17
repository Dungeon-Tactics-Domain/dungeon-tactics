// Pure side of the 3D battle result (result3d.ts): what the end of a battle shows, from the same board the HTML window
// gets (game/end-screens.ts resultBoard), text already translated. Read the way FFT: The Ivalice Chronicles lays its
// victory out: the title, a line under it, what the battle gave ("Spoils of war") and who did the most ("Greatest
// contribution"); the heroes' lines, which the reference does not have, share the spoils' block. No DOM or Three here;
// tested in tests/result3d.test.ts.
import { type Expression, endExpression } from '../battle-face.ts';
import { classOf } from '../dev-roster.ts';
import type { Board } from '../game/end-screens.ts';
import { t, unitName } from '../i18n.ts';

// a hero's row, as the HTML board's (end-screens.ts heroCard): face, name and class, life, what it did in two columns
export interface HeroRow {
  def: string; // whose face
  face: Expression; // as the battle ended: smiling on a win, wounded, fallen
  name: string;
  cls: string; // the class, only for a hero with a name of its own ("Lia", Rogue)
  life: string; // "34/50"; 0 for the fallen
  line: string; // the life it carries on, or that it fell (tally.ts); empty when the columns already say it all
  tone: 'gain' | 'fell' | '';
  dmg: string;
  kills: string;
}
export interface ResultView {
  won: boolean;
  title: string; // in capitals, like the reference
  note: string;
  heads: [spoils: string, mvp: string]; // the two plates' titles
  did: [dmg: string, kills: string]; // the names of the heroes' two columns
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
    did: [t('Dano', 'Damage'), t('Derrubados', 'Takedowns')],
    heroes: b.cards.map(([h, [line, tone]]) => {
      const base = classOf(h.def),
        name = unitName(h.def);
      return {
        def: h.def,
        face: endExpression(h.hp, h.max, b.won),
        name,
        cls: base && unitName(base) !== name ? unitName(base) : '',
        life: `${h.hp}/${h.max}`,
        line: tone ? line : '', // the plain line is the damage and the takedowns, which the columns say
        tone,
        dmg: String(h.dmg),
        kills: String(h.kills),
      };
    }),
    spoils: b.cols,
    mvp: best ? { name: unitName(best[0].def), line: best[1][0] } : null,
    actions,
  };
}
