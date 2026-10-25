import { describe, expect, it } from 'vitest';
import { confirm, defaultMode, freshUi, highlights, selectMode, tapTile } from '../src/client/interaction.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// arqueiro da vez com um soldado à distância de tiro e um aliado ao lado
const scene = () => new Battle(flat(8, 3), stateOf([
  { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
  { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
  { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 1 },
], HIT_SEED));
const kinds = (b: Battle, ui: ReturnType<typeof freshUi>, kind: string) => highlights(b, ui).tiles.filter((t) => t.kind === kind).map((t) => t.pos);

describe('toque em duas etapas', () => {
  it('começa em Mover e mostra as casas alcançáveis', () => {
    const b = scene();
    const ui = freshUi(b);
    expect(ui.mode).toEqual({ k: 'move' });
    expect(kinds(b, ui, 'move').length).toBe(b.reach().size);
  });

  it('1º toque numa casa marca o destino e o caminho; nada anda antes do Confirmar', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(2, 1));
    expect(ui.pending).toEqual(at(2, 1));
    expect(highlights(b, ui).path?.at(-1)).toEqual(at(2, 1));
    expect(b.actor.pos).toEqual(at(0, 1));
    const done = confirm(b, ui);
    expect(b.actor.pos).toEqual(at(2, 1));
    expect(done.events[0].k).toBe('move');
    expect(done.ui.pending).toBeNull();
  });

  it('casa fora do alcance não vira destino', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(7, 2));
    expect(ui.pending).toBeNull();
    expect(confirm(b, ui).events).toEqual([]);
  });

  it('depois de andar, o modo padrão é a primeira habilidade que tem alvo', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 2)));
    expect(defaultMode(b)).toEqual({ k: 'ability', id: 'shot' });
  });

  it('depois de andar sem nenhum alvo ao alcance, nenhuma habilidade fica escolhida', () => {
    const b = new Battle(flat(12, 1), stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'beacon', team: 'hero', x: 1, y: 0 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 11, y: 0 },
    ], HIT_SEED));
    confirm(b, tapTile(b, freshUi(b), at(2)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
  });

  it('tocar numa casa fora do alcance avisa em vez de não fazer nada', () => {
    const b = scene();
    expect(tapTile(b, freshUi(b), at(7, 2)).invalid).toBe(true);
    expect(tapTile(b, freshUi(b), at(2, 1)).invalid).toBe(false);
  });

  it('habilidade: alvo válido mostra a % de acerto antes de confirmar', () => {
    const b = scene();
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), at(4, 1));
    const h = highlights(b, ui);
    expect(ui.pending).toEqual(at(4, 1));
    expect(h.preview?.ok).toBe(true);
    expect(h.preview?.targets[0].chance).toBeGreaterThan(0);
    const hp = b.state.units[2].hp;
    confirm(b, ui);
    expect(b.state.turn.usedAbility).toBe('shot');
    expect(b.state.units[2].hp).toBeLessThanOrEqual(hp);
  });

  it('tocar num inimigo fora do alcance da habilidade mostra o que ele ameaça', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(4, 1));
    expect(ui.inspect).toBe('f');
    expect(ui.pending).toBeNull();
    expect(kinds(b, ui, 'threat').length).toBeGreaterThan(0);
  });

  it('modo já gasto não pode ser escolhido', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(2, 1)));
    // gasta o resto do movimento (13/11: anda em partes até o movimento)
    while (b.reach().size) b.move([...b.reach().values()][0].pos);
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    expect(ui.mode).toEqual({ k: 'ability', id: 'shot' });
  });

  it('com tudo feito no turno, não há modo nem casa marcada', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 1)));
    confirm(b, tapTile(b, freshUi(b), at(4, 1)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
    expect(highlights(b, freshUi(b)).tiles.filter((t) => t.kind !== 'actor')).toEqual([]);
  });
});
