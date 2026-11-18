// Developer menu screen (Fernando's request, Nov 12): picks the map, builds heroes and enemies (class, name,
// HP, speed, movement and abilities), saves in the browser, exports and imports JSON and starts the battle.
// The cast rules live in dev-roster.ts (pure, tested); here it's only the screen.

import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  DEV_KEY,
  DEV_MAPS,
  type DevSetup,
  type DevUnit,
  defaultSetup,
  devAbilities,
  devClasses,
  LIMITS,
  parseSetup,
  problems,
  slotsOf,
  unitFrom,
} from './dev-roster.ts';
import { choice, dialog } from './dialog.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { store } from './store.ts';

const mapName = (id: string) => t(SCENARIOS[id].name, SCENARIOS[id].en);

// The 3D menu (flow3d/dev3d.ts; Fernando, Nov 18) takes the opening while it is set: the default on localhost. This
// HTML window stays for ?ui=html, for a browser without WebGL and for a lost context, until it leaves in a later phase
type Dev3d = (start: (setup: DevSetup) => void, onBack?: () => void) => boolean;
let dev3d: Dev3d | undefined;
let html: { overlay: HTMLElement; close(): void; again(): void } | undefined; // this window, while it is on screen
// the 3D layer comes after the title: a menu opened before it changes look in place (every edit is already saved)
export function setDev3d(show?: Dev3d) {
  dev3d = show;
  if (!show || !html?.overlay.isConnected) return;
  html.close();
  html.again();
}

export function openDevMenu(start: (setup: DevSetup) => void, onBack?: () => void) {
  if (dev3d?.(start, onBack)) return;
  let setup = parseSetup(store.json(DEV_KEY)) ?? defaultSetup('beacon_hill');
  const body = el('div', { class: 'dev-body' });
  const save = () => store.set(DEV_KEY, JSON.stringify(setup));

  // `k`: the step on screen; Move and Jump show in half tiles like the battle (Nov 15), the cast keeps whole tiles
  const number = (
    label: string,
    value: number,
    [lo, hi]: readonly [number, number],
    set: (v: number) => void,
    k = 1,
  ) => {
    const input = el('input', {
      type: 'number',
      min: String(lo * k),
      max: String(hi * k),
      step: String(k),
      value: String(value * k),
      'aria-label': label,
    }) as HTMLInputElement;
    // out of limits goes back to the nearest: the saved JSON never becomes invalid
    input.addEventListener('change', () => {
      const v = Math.min(hi, Math.max(lo, Math.round((Number(input.value) || lo * k) / k)));
      input.value = String(v * k);
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
    const cls = el(
      'select',
      { 'aria-label': t('Classe', 'Class') },
      ...devClasses().map((id) => el('option', { value: id, ...(id === u.base && { selected: '' }) }, unitName(id))),
    ) as HTMLSelectElement;
    // changing the class restarts the numbers and abilities from the class's (the name stays, if it was changed)
    cls.addEventListener('change', () => {
      const now = list[i]; // the name may have changed since the row was last drawn
      const keepName = now.name !== UNIT_DEFS[now.base].name;
      edit(unitFrom(cls.value, keepName ? now.name : UNIT_DEFS[cls.value].name), true);
    });
    const name = el('input', {
      type: 'text',
      value: u.name,
      maxlength: '24',
      'aria-label': t('Nome', 'Name'),
    }) as HTMLInputElement;
    name.addEventListener('change', () => edit({ name: name.value.trim() || UNIT_DEFS[u.base].name }));
    const skills = el(
      'details',
      { class: 'dev-skills' },
      el('summary', {}, t(`Habilidades (${u.abilities.length})`, `Abilities (${u.abilities.length})`)),
      ...devAbilities().map((id) => {
        const box = el('input', {
          type: 'checkbox',
          ...(u.abilities.includes(id) && { checked: '' }),
        }) as HTMLInputElement;
        // the list order is the ability menu's; the 1st checked is the basic attack
        box.addEventListener('change', () =>
          edit(
            { abilities: box.checked ? [...list[i].abilities, id] : list[i].abilities.filter((a) => a !== id) },
            true,
          ),
        );
        return el('label', { class: 'dev-check' }, box, abilityName(id));
      }),
    );
    return el(
      'li',
      { class: 'dev-unit' },
      el(
        'div',
        { class: 'dev-line' },
        cls,
        name,
        button(
          'secondary',
          '✕',
          () => {
            list.splice(i, 1);
            save();
            render();
          },
          { 'aria-label': t(`Tirar ${u.name}`, `Remove ${u.name}`) },
        ),
      ),
      el(
        'div',
        { class: 'dev-line' },
        number(t('Vida', 'HP'), u.hp, LIMITS.hp, (hp) => edit({ hp })),
        number(t('Velocidade', 'Speed'), u.speed, LIMITS.speed, (speed) => edit({ speed })),
        number(t('Movimento', 'Move'), u.move, LIMITS.move, (move) => edit({ move }), SUB),
        number(
          t('Salto', 'Jump'),
          u.jump ?? UNIT_DEFS[u.base].jump ?? MAX_JUMP,
          LIMITS.jump,
          (jump) => edit({ jump }),
          SUB,
        ),
      ),
      skills,
    );
  };

  const team = (title: string, list: DevUnit[], slots: number, first: string) =>
    el(
      'section',
      { class: 'dev-team' },
      el('h3', {}, `${title} · ${list.length}/${slots}`),
      el('ol', { class: 'dev-list' }, ...list.map((u, i) => unitRow(u, list, i))),
      button(
        'secondary',
        t('+ Adicionar', '+ Add'),
        () => {
          list.push(unitFrom(first));
          save();
          render();
        },
        { disabled: list.length >= slots },
      ),
    );

  const exportJson = () => {
    const a = el('a', {
      href: URL.createObjectURL(new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' })),
      download: `dungeon-tactics-elenco-${setup.map}.json`,
    }) as HTMLAnchorElement;
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
      if (!parsed)
        return void (msg.textContent = t(
          'Arquivo inválido: o elenco não mudou.',
          'Invalid file: the roster did not change.',
        ));
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
      choice(
        t('Mapa', 'Map'),
        DEV_MAPS.filter((m) => SCENARIOS[m]).map((m) => [m, mapName(m)] as [string, string]),
        setup.map,
        (map) => {
          // switching maps keeps the parties and only cuts what doesn't fit the new map's starting tiles
          const s = slotsOf(map);
          setup = {
            map,
            heroes: setup.heroes.slice(0, s.hero.length),
            enemies: setup.enemies.slice(0, s.enemy.length),
          };
          save();
          render();
        },
      ),
      el(
        'p',
        {},
        slots.objective.length
          ? t('Objetivo: derrote os inimigos e proteja o Farol.', 'Goal: defeat the enemies and protect the Beacon.')
          : t(
              'Sem Farol neste mapa: vence quem derrotar o outro lado.',
              'No Beacon on this map: whoever defeats the other side wins.',
            ),
      ),
      el(
        'div',
        { class: 'dev-teams' },
        team(t('Heróis', 'Heroes'), setup.heroes, slots.hero.length, 'warrior'),
        team(t('Inimigos', 'Enemies'), setup.enemies, slots.enemy.length, 'soldier'),
      ),
      el('ul', { class: 'dev-issues' }, ...issues.map((p) => el('li', {}, p))),
      msg,
      el(
        'div',
        { class: 'menu-actions' },
        button(
          'primary',
          t('Começar batalha', 'Start battle'),
          () => {
            save();
            d.close();
            start(setup);
          },
          { disabled: issues.length > 0 },
        ),
        button('secondary', t('Exportar', 'Export'), exportJson),
        button('secondary', t('Importar', 'Import'), importJson),
        button('secondary', t('Voltar ao padrão do mapa', 'Reset to map default'), () => {
          setup = defaultSetup(setup.map);
          save();
          render();
        }),
      ),
    );
  }
  const d = dialog('dev', t('Desenvolvedor', 'Developer'), [body], { onBack });
  html = { ...d, again: () => openDevMenu(start, onBack) };
  render();
}
