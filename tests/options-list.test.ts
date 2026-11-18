import { describe, expect, it, vi } from 'vitest';
import { type OptionsGroup, settings } from '../src/client/game/options-list.ts';

vi.stubGlobal('document', { fullscreenEnabled: false }); // the rows are read with no page: no Fullscreen API

// Fernando, Nov 18 night: no ☰ menu, so its rows moved into Options; the battle's own rows only show in a battle
const battle = { room: false, busy: false, restart() {}, fast: () => false, setFast() {}, fps() {} };
const names = (g: OptionsGroup) => g.rows.map((r) => ('run' in r ? r.link : r.label));
const group = (o: Parameters<typeof settings>[0], title: string) => settings(o).find((g) => g.title === title)!;

describe('Options rows', () => {
  it('Marks lead Display, Back to title closes Game', () => {
    expect(names(group({ relayout() {}, battle }, 'Imagem'))[0]).toBe('Marcações');
    expect(names(group({ relayout() {}, battle }, 'Jogo')).at(-1)).toBe('Voltar ao título');
  });
  it('Fast battle and the fps counter only in a battle; Screen buttons everywhere', () => {
    const inBattle = [
      ...names(group({ relayout() {}, battle }, 'Jogo')),
      ...names(group({ relayout() {}, battle }, 'Imagem')),
    ];
    const inTown = [...names(group({ relayout() {} }, 'Jogo')), ...names(group({ relayout() {} }, 'Imagem'))];
    for (const row of ['Batalha rápida (3×)', 'Contador de fps']) {
      expect(inBattle).toContain(row);
      expect(inTown).not.toContain(row);
    }
    for (const row of ['Botões na tela', 'Voltar ao título']) expect(inTown).toContain(row);
  });
});
