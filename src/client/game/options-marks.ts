// The Options row that picks how the board's marks are drawn (Nov 17, Fernando: relief, texture and light, with no
// automatic fallback: the player picks). In its own file so options.ts takes one line for it.
import { t } from '../i18n.ts';
import { getMarkStyle, type MarkStyle, setMarkStyle } from '../mark-style.ts';
import { type Option, pick } from '../option-row.ts';

export const marksOption = (): Option =>
  pick(
    t('Marcações', 'Marks'),
    t(
      'Como as casas, o cursor, os aros dos personagens e as linhas aparecem no mapa. Simples é o desenho chapado, o mais leve.',
      'How the tiles, the cursor, the rings round the characters and the lines show on the map. Simple is the flat drawing, the lightest.',
    ),
    [
      ['simples', t('Simples', 'Simple')],
      ['luz', t('Luz', 'Light')],
      ['pedra', t('Pedra', 'Stone')],
      ['neon', 'Neon'],
    ] as [MarkStyle, string][],
    getMarkStyle,
    setMarkStyle,
  );
