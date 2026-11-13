import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/client/campaign.ts';
import { DEPLOY_MAX, GROUP_MAX, RECRUIT_COST, changeClass, defaultGroup, dismiss, heroesFor, parseGroup, recruit, toggleDeploy } from '../src/client/group.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Recrutamento e troca de classe (13/11, entrega 5 do desenho do grupo como no FFT)
describe('grupo', () => {
  it('o grupo padrão monta exatamente o elenco medido de cada fase (a curva da campanha não muda)', () => {
    CHAPTERS.forEach((c, n) => expect(heroesFor(defaultGroup(), n)).toEqual(c.setup.heroes.map((u) => ({ ...u, items: undefined }))));
  });

  it('recrutar custa ouro, entra escalado se há vaga e respeita o teto', () => {
    expect(recruit(defaultGroup(), { gold: RECRUIT_COST - 1, items: [] }, 'archer')).toBeNull();
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'archer')!;
    expect(r.chest.gold).toBe(500 - RECRUIT_COST);
    expect(r.group.members.at(-1)).toMatchObject({ id: 'r1', cls: 'archer', recruit: true });
    expect(r.group.deployed).toHaveLength(DEPLOY_MAX); // os 4 da história já ocupam as vagas
    let g = r.group;
    while (g.members.length < GROUP_MAX) g = recruit(g, { gold: 9999, items: [] }, 'mage')!.group;
    expect(new Set(g.members.map((m) => m.name)).size).toBe(GROUP_MAX); // nomes sem repetir
    expect(recruit(g, { gold: 9999, items: [] }, 'mage')).toBeNull();
  });

  it('trocar de classe muda os números e as habilidades na batalha', () => {
    const g = changeClass(defaultGroup(), 'warrior', 'mage');
    const bran = heroesFor(g, 6)[0];
    expect(bran).toMatchObject({ name: 'Bran', base: 'mage', hp: UNIT_DEFS.mage.hp, abilities: UNIT_DEFS.mage.abilities.slice(0, 4) });
  });

  it('escalar: no máximo 4 e nunca nenhum; quem fica no acampamento não vai à batalha', () => {
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'rogue')!.group;
    expect(toggleDeploy(r, 'r1')).toBeNull(); // já são 4
    const swapped = toggleDeploy(toggleDeploy(r, 'archer')!, 'r1')!;
    expect(heroesFor(swapped, 0).map((u) => u.name)).toEqual(['Bran', 'Odo', 'Lia', 'Ivo']);
    let one = defaultGroup();
    for (const id of ['warrior', 'archer', 'mage']) one = toggleDeploy(one, id)!;
    expect(toggleDeploy(one, 'rogue')).toBeNull();
  });

  it('dispensar só recrutados, e o equipamento volta ao baú', () => {
    const r = recruit(defaultGroup(), { gold: 500, items: [] }, 'rogue')!;
    expect(dismiss(r.group, {}, r.chest, 'warrior')).toBeNull();
    const out = dismiss(r.group, { r1: { weapon: 'w1' } }, r.chest, 'r1')!;
    expect(out.group.members.some((m) => m.id === 'r1')).toBe(false);
    expect(out.eq).toEqual({});
    expect(out.chest.items).toEqual(['w1']);
  });

  it('o grupo salvo só aceita o que conhece; os da história voltam sempre', () => {
    expect(parseGroup(null)).toEqual(defaultGroup());
    const g = parseGroup({ members: [{ id: 'warrior', cls: 'rogue' }, { id: 'r2', name: 'Ivo', cls: 'mage' }, { id: 'x', name: 'Hack', cls: 'mage' }, { id: 'r3', name: 'Zé', cls: 'brute' }], deployed: ['r2', 'r2', 'nada', 'warrior'] });
    expect(g.members.map((m) => `${m.id}:${m.cls}`)).toEqual(['warrior:rogue', 'archer:archer', 'mage:mage', 'rogue:rogue', 'r2:mage']);
    expect(g.deployed).toEqual(['r2', 'warrior']);
  });
});
