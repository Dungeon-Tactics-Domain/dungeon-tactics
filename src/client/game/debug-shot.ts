// Debug › Shot rules (Fernando, Nov 25: "coloque essa logica de cover como algo togleavel no menu de debug ... para
// testarmos varios tipos de balanceamento"; he picked the numbers too): the shot rules' switches and ranges, saved per
// player (shot-debug.ts), a category of the debug panel (debug-menu.ts). A change counts from the next action previewed

import type { BodyForm, ShotRules } from '../../shared/battle/shot-rules.ts';
import { forgetOptions } from '../act-flow.ts';
import { t } from '../i18n.ts';
import { type Option, percent, pick } from '../option-row.ts';
import { setShotRules, shotRules } from '../shot-debug.ts';
import type { OptionsGroup } from './options-list.ts';

const edit = (change: (r: ShotRules) => void) => {
  const next = structuredClone(shotRules());
  change(next);
  setShotRules(next);
  forgetOptions(); // the Agir screens kept their marks and chances by the state, which a rule does not change
};

const onOff = (label: string, help: string, k: 'launch' | 'parts' | 'cover'): Option => ({
  ...pick(
    label,
    help,
    [
      [false, t('Desligado', 'Off')],
      [true, t('Ligado', 'On')],
    ],
    () => shotRules()[k],
    (v) => edit((r) => void (r[k] = v)),
  ),
  on: () => shotRules()[k],
});

// one end of a body form's launch range (`forms`) or aim range (`aims`), in % of its height; the other end moves along
// so the range never turns over
const end = (label: string, help: string, form: BodyForm, i: 0 | 1, k: 'forms' | 'aims' = 'forms'): Option =>
  percent(
    label,
    help,
    () => Math.round(shotRules()[k][form][i] * 100),
    (v) =>
      edit((r) => {
        const range = r[k][form];
        range[i] = v / 100;
        if (range[0] > range[1]) range[1 - i] = v / 100;
      }),
  );

export const shotGroup = (): OptionsGroup => ({
  title: t('Regras de tiro', 'Shot rules'),
  help: t(
    'Regras de tiro para testar balanceamento: de que altura o personagem lança, que parte do alvo vê e quanto a cobertura tira da chance. Vale a partir da próxima ação.',
    'Shot rules to test balance: from what height a unit launches, what part of the target it sees and how much cover takes off the chance. Counts from the next action.',
  ),
  rows: [
    onOff(
      t('Faixa de lançamento', 'Launch range'),
      t(
        'Ligado: quem atira agacha ou ergue o braço dentro da faixa do seu corpo até achar uma linha livre. Desligado: sai sempre do meio do corpo.',
        'On: the shooter crouches or raises its arm inside its body’s range until a line is clear. Off: always from the middle of the body.',
      ),
      'launch',
    ),
    onOff(
      t('Partes visíveis do alvo', 'Visible parts of the target'),
      t(
        'Ligado: acerta qualquer parte do alvo que apareça, dentro da faixa de alvo do corpo dele. Desligado: só o meio do corpo.',
        'On: any part of the target that shows can be hit, inside its body’s aim range. Off: only the middle of the body.',
      ),
      'parts',
    ),
    onOff(
      t('Chance pela cobertura', 'Chance by cover'),
      t(
        'Ligado: quanto menos do alvo aparece, menor a chance de acerto. Desligado: a cobertura não muda a chance.',
        'On: the less of the target shows, the lower the hit chance. Off: cover does not change the chance.',
      ),
      'cover',
    ),
    percent(
      t('Peso da cobertura', 'Cover weight'),
      t(
        '100%: chance vezes a parte visível. 50%: metade disso. 0%: como desligado.',
        '100%: chance times the visible share. 50%: half of that. 0%: as if off.',
      ),
      () => Math.round(shotRules().coverWeight * 100),
      (v) => edit((r) => void (r.coverWeight = v / 100)),
    ),
    end(
      t('Humanoide: lança de (base)', 'Humanoid: launches from (low)'),
      t(
        'O ponto mais baixo de onde um humanoide lança, em % da altura.',
        'The lowest point a humanoid launches from, in % of its height.',
      ),
      'humanoid',
      0,
    ),
    end(
      t('Humanoide: lança até (topo)', 'Humanoid: launches up to (high)'),
      t('O ponto mais alto, braço erguido, em % da altura.', 'The highest point, arm raised, in % of its height.'),
      'humanoid',
      1,
    ),
    end(
      t('Quadrúpede: lança de (base)', 'Quadruped: launches from (low)'),
      t(
        'Rato e aranha: o ponto mais baixo da cabeça, em % da altura.',
        'Rat and spider: the lowest point of the head, in % of its height.',
      ),
      'quadruped',
      0,
    ),
    end(
      t('Quadrúpede: lança até (topo)', 'Quadruped: launches up to (high)'),
      t('O ponto mais alto da cabeça, em % da altura.', 'The highest point of the head, in % of its height.'),
      'quadruped',
      1,
    ),
    // where a shot may land (Nov 25: a small creature's head is too small to count, so a rat on a ledge stays hidden)
    end(
      t('Quadrúpede: alvo até (topo)', 'Quadruped: aimed up to (high)'),
      t(
        'O ponto mais alto do corpo de um rato ou aranha que um tiro pode acertar, em % da altura.',
        'The highest point of a rat or spider a shot may hit, in % of its height.',
      ),
      'quadruped',
      1,
      'aims',
    ),
    end(
      t('Humanoide: alvo até (topo)', 'Humanoid: aimed up to (high)'),
      t(
        'O ponto mais alto do corpo de um humanoide que um tiro pode acertar, em % da altura.',
        'The highest point of a humanoid a shot may hit, in % of its height.',
      ),
      'humanoid',
      1,
      'aims',
    ),
  ],
});
