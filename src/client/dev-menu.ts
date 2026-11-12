// Tela do menu de desenvolvedor (pedido do Fernando, 12/11): escolhe o mapa, monta heróis e inimigos (classe, nome,
// vida, velocidade, movimento e habilidades), salva no navegador, exporta e importa JSON e começa a batalha.
// As regras do elenco ficam em dev-roster.ts (puro, testado); aqui só a tela.
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { choice, dialog } from './dialog.ts';
import { DEV_KEY, DEV_MAPS, LIMITS, defaultSetup, devAbilities, devClasses, parseSetup, problems, slotsOf, unitFrom, type DevSetup, type DevUnit } from './dev-roster.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { store } from './store.ts';

const mapName = (id: string) => t(SCENARIOS[id].name, SCENARIOS[id].en);

export function openDevMenu(start: (setup: DevSetup) => void) {
  let setup = parseSetup(store.json(DEV_KEY)) ?? defaultSetup('beacon_hill');
  const body = el('div', { class: 'dev-body' });
  const save = () => store.set(DEV_KEY, JSON.stringify(setup));

  const number = (label: string, value: number, [lo, hi]: readonly [number, number], set: (v: number) => void) => {
    const input = el('input', { type: 'number', min: String(lo), max: String(hi), value: String(value), 'aria-label': label }) as HTMLInputElement;
    // fora dos limites volta para o mais perto: o JSON salvo nunca fica inválido
    input.addEventListener('change', () => {
      const v = Math.min(hi, Math.max(lo, Math.round(Number(input.value) || lo)));
      input.value = String(v);
      set(v);
    });
    return el('label', { class: 'dev-num' }, el('span', {}, label), input);
  };

  const unitRow = (u: DevUnit, list: DevUnit[], i: number) => {
    const edit = (patch: Partial<DevUnit>, redraw = false) => {
      list[i] = { ...list[i], ...patch };
      save();
      if (redraw) render();
    };
    const cls = el('select', { 'aria-label': t('Classe', 'Class') },
      ...devClasses().map((id) => el('option', { value: id, ...(id === u.base && { selected: '' }) }, unitName(id)))) as HTMLSelectElement;
    // trocar a classe recomeça os números e as habilidades pelos da classe (o nome fica, se foi mudado)
    cls.addEventListener('change', () => {
      const now = list[i]; // o nome pode ter mudado depois do último desenho da linha
      const keepName = now.name !== UNIT_DEFS[now.base].name;
      edit(unitFrom(cls.value, keepName ? now.name : UNIT_DEFS[cls.value].name), true);
    });
    const name = el('input', { type: 'text', value: u.name, maxlength: '24', 'aria-label': t('Nome', 'Name') }) as HTMLInputElement;
    name.addEventListener('change', () => edit({ name: name.value.trim() || UNIT_DEFS[u.base].name }));
    const skills = el('details', { class: 'dev-skills' },
      el('summary', {}, t(`Habilidades (${u.abilities.length})`, `Abilities (${u.abilities.length})`)),
      ...devAbilities().map((id) => {
        const box = el('input', { type: 'checkbox', ...(u.abilities.includes(id) && { checked: '' }) }) as HTMLInputElement;
        // a ordem da lista é a do menu de habilidades; a 1ª marcada é o ataque básico
        box.addEventListener('change', () => edit({ abilities: box.checked ? [...list[i].abilities, id] : list[i].abilities.filter((a) => a !== id) }, true));
        return el('label', { class: 'dev-check' }, box, abilityName(id));
      }));
    return el('li', { class: 'dev-unit' },
      el('div', { class: 'dev-line' }, cls, name,
        el('button', { type: 'button', class: 'secondary', 'aria-label': t(`Tirar ${u.name}`, `Remove ${u.name}`), onclick: () => { list.splice(i, 1); save(); render(); } }, '✕')),
      el('div', { class: 'dev-line' },
        number(t('Vida', 'HP'), u.hp, LIMITS.hp, (hp) => edit({ hp })),
        number(t('Velocidade', 'Speed'), u.speed, LIMITS.speed, (speed) => edit({ speed })),
        number(t('Movimento', 'Move'), u.move, LIMITS.move, (move) => edit({ move }))),
      skills);
  };

  const team = (title: string, list: DevUnit[], slots: number, first: string) =>
    el('section', { class: 'dev-team' },
      el('h3', {}, `${title} · ${list.length}/${slots}`),
      el('ol', { class: 'dev-list' }, ...list.map((u, i) => unitRow(u, list, i))),
      el('button', { type: 'button', class: 'secondary', disabled: list.length >= slots, onclick: () => { list.push(unitFrom(first)); save(); render(); } }, t('+ Adicionar', '+ Add')));

  const exportJson = () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' })), download: `dungeon-tactics-elenco-${setup.map}.json` }) as HTMLAnchorElement;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = () => {
    const input = el('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      let parsed: DevSetup | null = null;
      try {
        parsed = parseSetup(JSON.parse(await file.text()));
      } catch {
        parsed = null;
      }
      if (!parsed) return void (msg.textContent = t('Arquivo inválido: o elenco não mudou.', 'Invalid file: the roster did not change.'));
      setup = parsed;
      save();
      render();
    });
    input.click();
  };
  const msg = el('p', { class: 'dev-msg', role: 'status' });

  function render() {
    const slots = slotsOf(setup.map);
    const issues = problems(setup, t);
    body.replaceChildren(
      choice(t('Mapa', 'Map'), DEV_MAPS.filter((m) => SCENARIOS[m]).map((m) => [m, mapName(m)] as [string, string]), setup.map, (map) => {
        // trocar de mapa mantém as parties e só corta o que não cabe nas casas de partida do mapa novo
        const s = slotsOf(map);
        setup = { map, heroes: setup.heroes.slice(0, s.hero.length), enemies: setup.enemies.slice(0, s.enemy.length) };
        save();
        render();
      }),
      el('p', {}, slots.objective.length
        ? t('Objetivo: derrote os inimigos e proteja o Farol.', 'Goal: defeat the enemies and protect the Beacon.')
        : t('Sem Farol neste mapa: vence quem derrotar o outro lado.', 'No Beacon on this map: whoever defeats the other side wins.')),
      el('div', { class: 'dev-teams' },
        team(t('Heróis', 'Heroes'), setup.heroes, slots.hero.length, 'warrior'),
        team(t('Inimigos', 'Enemies'), setup.enemies, slots.enemy.length, 'soldier')),
      el('ul', { class: 'dev-issues' }, ...issues.map((p) => el('li', {}, p))),
      msg,
      el('div', { class: 'menu-actions' },
        el('button', { type: 'button', class: 'primary', disabled: issues.length > 0, onclick: () => { save(); d.close(); start(setup); } }, t('Começar batalha', 'Start battle')),
        el('button', { type: 'button', class: 'secondary', onclick: exportJson }, t('Exportar', 'Export')),
        el('button', { type: 'button', class: 'secondary', onclick: importJson }, t('Importar', 'Import')),
        el('button', { type: 'button', class: 'secondary', onclick: () => { setup = defaultSetup(setup.map); save(); render(); } }, t('Voltar ao padrão do mapa', 'Reset to map default'))),
    );
  }
  const d = dialog('dev', t('Desenvolvedor', 'Developer'), [body]);
  render();
}
