// Debug › Models (Fernando, Nov 25: pick the figures' height and each character's body "para testar antes de conferir
// as animações"; "basta homem q eh base e mulher"): the height in heads for the 10 humanoids and, per living humanoid of
// this battle, man or woman. Saved per player (bodies.ts); a change reloads the battle where it stands.
import { type Bodies, bodies, HEADS, type Heads, hasSex, type Sex, setBodies, sexOf } from '../bodies.ts';
import { t, unitName } from '../i18n.ts';
import type { Game } from '../main.ts';
import { navigate } from '../nav.ts';
import { pick } from '../option-row.ts';
import type { OptionsGroup } from './options-list.ts';

// saved, then the same address again (nav.ts): the battle comes back from its save on the same map and tiles, its
// models downloaded and shaped anew behind the loading cover
function change(g: Game, edit: (b: Bodies) => void) {
  const next = structuredClone(bodies());
  edit(next);
  setBodies(next);
  g.save();
  navigate(location.search);
}

export function bodyGroup(g: Game): OptionsGroup {
  const living = g.battle.state.units.filter((u) => hasSex(u.def));
  // two of a class are told apart by their number in it
  const same = (def: string) => living.filter((u) => u.def === def);
  return {
    title: t('Modelos', 'Models'),
    help: t(
      'Altura e corpo dos bonecos, para testar antes das animações. Uma mudança recarrega a batalha onde está.',
      'The figures’ height and body, to test before the animations. A change reloads the battle where it stands.',
    ),
    rows: [
      pick(
        t('Altura', 'Height'),
        t(
          '2 cabeças é o boneco KayKit; 3, 4 e 5 cabeças alongam corpo e pernas. Todos ficam da mesma altura no mapa, então as regras não mudam. Os esqueletos também; cobra, rato, aranha e morcego não.',
          '2 heads is the KayKit figure; 3, 4 and 5 heads stretch body and legs. All stand the same height on the map, so the rules do not change. The skeletons too; snake, rat, spider and bat do not.',
        ),
        HEADS.map((h): [Heads, string] => [
          h,
          h === 2 ? t('2 cabeças (KayKit)', '2 heads (KayKit)') : t(`${h} cabeças`, `${h} heads`),
        ]),
        () => bodies().heads,
        (h) => change(g, (b) => void (b.heads = h)),
      ),
      ...living.map((u) =>
        pick(
          t(`Corpo: ${unitName(u.def)}`, `Body: ${unitName(u.def)}`) +
            (same(u.def).length > 1 ? ` ${same(u.def).indexOf(u) + 1}` : '') +
            (u.team === 'enemy' ? t(' (inimigo)', ' (enemy)') : ''),
          t(
            'Homem usa o corpo do modelo; mulher, quadril largo, cintura fina e busto. Vale só para este personagem.',
            'A man wears the model’s own body; a woman, wide hips, narrow waist and a bust. Only for this character.',
          ),
          [
            ['m', t('Homem', 'Man')],
            ['f', t('Mulher', 'Woman')],
          ] as [Sex, string][],
          () => sexOf(bodies(), u.id, u.def) ?? 'm',
          (s) => change(g, (b) => void (b.sex[u.id] = s)),
        ),
      ),
    ],
  };
}
