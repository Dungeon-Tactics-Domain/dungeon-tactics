// Worldmap screen (world.ts has the rules): a parchment with the road, the nodes and the party portrait, which walks from
// node to node. Arrows (or A D W S) walk, Enter enters, Esc goes back to the title; clicking an open node walks to it.
// Place panel in the bottom-right corner, like the place name on the FFT map; art and text are ours.

import { bonusOf, ITEMS, type ItemDef, SLOTS, type Slot } from '../shared/battle/equipment.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { foesText } from './campaign.ts';
import { buy, CHEST_KEY, EQUIP_KEY, equip, parseChest, parseEquip, sell } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { choice, dialog } from './dialog.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import {
  changeClass,
  DEPLOY_MAX,
  dismiss,
  GROUP_KEY,
  GROUP_MAX,
  type Group,
  JOBS,
  learnedCount,
  type Member,
  parseGroup,
  RECRUIT_COST,
  recruit,
  toggleDeploy,
} from './group.ts';
import type { Hero } from './hero.ts';
import { abilityDetail, portrait } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { MISSIONS, MISSIONS_KEY, parseDone } from './missions.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { isOpen, step, WORLD } from './world.ts';

const WALK_MS = 320; // one stretch of road; the CSS uses the same value (--walk-ms)
const FADE_MS = 300; // fade to dark before entering the node; the CSS uses the same value (.fade-out)

// Illustrated map (Nov 13, Fernando's request: "a worldmap with the vibe" of a fantasy parchment map; vibe only,
// our own drawing): textured sea, a continent with an irregular coast and a shallow-water halo, forests, mountains with a
// shaded face and snow on top, the gray land of the Ash Road, a river from the mountains to the lake and the sea, islands, compass rose and
// name cartouche. viewBox 0-100 stretched over the screen (nodes sit at % of the drawing), so each symbol is drawn
// ~2.2x narrower in x than in y (the map area is ~2.2:1 on a 16:9 PC) so it doesn't come out squashed.
const NODE_CLEAR = (x: number, y: number, dx: number, dy: number) =>
  WORLD.every((w) => Math.abs(w.x - x) > dx || Math.abs(w.y - y) > dy);
const LAND =
  'M4 62 C2 50, 8 40, 16 36 C22 26, 30 30, 38 22 C44 12, 56 8, 66 10 C76 4, 90 2, 97 8 L97 60 C94 70, 86 74, 82 84 C76 94, 62 90, 52 94 C42 98, 30 96, 20 95 C10 94, 4 88, 5 78 Z';
const ISLES = [
  [9, 14, 4, 5],
  [30, 7, 3, 2.5],
  [70, 97, 4, 2],
]; // none in the bottom-right corner: that's the compass rose's spot
const FORESTS: [number, number, number, number, number][] = [
  [12, 58, 8, 12, 46],
  [34, 80, 8, 8, 30],
  [45, 44, 6, 7, 20],
  [68, 72, 9, 9, 34],
  [89, 54, 7, 12, 36],
  [22, 42, 6, 6, 18],
];
const PEAKS = [
  [64, 16],
  [72, 11],
  [80, 9],
  [91, 7],
  [95, 19],
  [84, 24],
  [76, 20],
  [93, 34],
  [86, 40],
  [95, 48],
  [62, 24],
  [97, 28],
];
// Drawing of each place beside its node (Nov 13, same request as the illustrated map): houses in the village, tent in the camp,
// stone door at the crypts, tower with a flame at the lighthouses, flag at the summit. Outside the stretched SVG so it isn't deformed.
const HOUSES =
  '<path class="wall" d="M3 28V17l7-6 7 6v11Z M15 28V19l7-6 7 6v9Z" /><path class="roof" d="M1 18l9-8 9 8 M13 20l9-8 9 8" />';
const CRYPT =
  '<path class="stone" d="M4 29V12a12 12 0 0 1 24 0v17Z" /><path class="door" d="M11 29V17a5 5 0 0 1 10 0v12Z" />';
const TOWER =
  '<path class="stone" d="M11 29l2-18h6l2 18Z M10 11h12v-3H10Z" /><path class="flame" d="M16 1c3 3 3 5 0 7c-3-2-3-4 0-7Z" />';
const PLACE_ICON: Record<string, string> = {
  vauclair: HOUSES,
  epilogue: HOUSES,
  crypt: CRYPT,
  heart: CRYPT,
  beacon: TOWER,
  hill: TOWER,
  camp: '<path class="wall" d="M2 28L16 6l14 22Z" /><path class="door" d="M13 28l3-9 3 9Z" />',
  summit:
    '<path class="stone" d="M2 30L16 10l14 20Z" /><path class="roof" d="M16 10V1" /><path class="flame" d="M16 1h9l-3 3 3 3h-9Z" />',
};
const terrain = (done: number) => {
  let s = 7; // fixed seed: the map comes out the same every time
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const trees = FORESTS.flatMap(([cx, cy, rx, ry, n]) =>
    Array.from({ length: n }, () => {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd());
      return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, rnd()];
    }),
  )
    .filter(([x, y]) => NODE_CLEAR(x, y, 2.6, 5))
    .sort((a, b) => a[1] - b[1]);
  const tree = ([x, y, k]: number[]) =>
    k < 0.55
      ? `<path class="pine" d="M${x - 0.6} ${y + 0.6} L${x} ${y - 2.6} L${x + 0.6} ${y + 0.6} Z" />`
      : `<path class="trunk" d="M${x} ${y + 0.8} V${y - 0.4}" /><ellipse class="leaf" cx="${x}" cy="${y - 1}" rx="0.75" ry="1.5" />`;
  const peaks = PEAKS.filter(([x, y]) => NODE_CLEAR(x, y - 4, 4.5, 8)).sort((a, b) => a[1] - b[1]);
  const peak = ([x, y]: number[]) =>
    `<path class="rock" d="M${x - 2.4} ${y} L${x - 0.2} ${y - 9} L${x + 2.4} ${y} Z" />` +
    `<path class="shade" d="M${x - 0.2} ${y - 9} L${x + 2.4} ${y} L${x + 0.5} ${y} Z" />` +
    (y < 26
      ? `<path class="snow" d="M${x - 0.95} ${y - 6} L${x - 0.2} ${y - 9} L${x + 0.85} ${y - 5.4} L${x + 0.2} ${y - 6.4} Z" />`
      : '');
  return `<svg class="world-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <filter id="w-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="3" /><feDisplacementMap in="SourceGraphic" scale="2.2" /></filter>
    <filter id="w-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.11" numOctaves="4" seed="9" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.1" /></filter>
    <clipPath id="w-land"><path d="${LAND}" />${ISLES.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" />`).join('')}</clipPath>
  </defs>
  <rect class="sea" width="100" height="100" />
  <rect class="grain" width="100" height="100" filter="url(#w-grain)" />
  <g filter="url(#w-rough)">
    <path class="shallow" d="${LAND}" />${ISLES.map(([x, y, rx, ry]) => `<ellipse class="shallow" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" />`).join('')}
    <path class="land" d="${LAND}" />${ISLES.map(([x, y, rx, ry]) => `<ellipse class="land" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" />`).join('')}
  </g>
  <g clip-path="url(#w-land)" filter="url(#w-rough)">
    <ellipse class="plain" cx="40" cy="74" rx="10" ry="9" /><ellipse class="plain" cx="20" cy="84" rx="9" ry="8" />
    ${FORESTS.map(([x, y, rx, ry]) => `<ellipse class="wood" cx="${x}" cy="${y}" rx="${rx * 1.15}" ry="${ry * 1.15}" />`).join('')}
    <ellipse class="ash" cx="27" cy="63" rx="7" ry="8" />
    <path class="highland" d="M56 4 C70 2, 92 0, 99 6 L99 54 C92 50, 88 42, 80 40 C70 36, 62 30, 56 20 Z" />
    <ellipse class="snowfield" cx="84" cy="8" rx="16" ry="10" />
    <rect class="grain" width="100" height="100" filter="url(#w-grain)" />
  </g>
  <path class="river" d="M90 30 C84 38, 76 40, 70 46 S62 52, 60 54" /><path class="river" d="M52 58 C50 66, 52 74, 48 82 S46 92, 45 97" />
  <ellipse class="lake" cx="57" cy="56" rx="6" ry="5" filter="url(#w-rough)" />
  <g class="trees">${trees.map(tree).join('')}</g>
  <g class="peaks">${peaks.map(peak).join('')}</g>
  <polyline class="road" points="${WORLD.slice(0, -1)
    .map((w) => `${w.x},${w.y}`)
    .join(' ')}" />
  <polyline class="road walked" points="${WORLD.slice(0, Math.min(done, WORLD.length - 2) + 1)
    .map((w) => `${w.x},${w.y}`)
    .join(' ')}" />
</svg>
<svg class="world-compass" viewBox="-50 -50 100 100" aria-hidden="true">
  <circle r="30" /><circle r="22" />
  <path class="star" d="M0 -46 L7 -7 L46 0 L7 7 L0 46 L-7 7 L-46 0 L-7 -7 Z" />
  <path class="star-shade" d="M0 -46 L7 -7 L0 0 Z M46 0 L7 7 L0 0 Z M0 46 L-7 7 L0 0 Z M-46 0 L-7 -7 L0 0 Z" />
  <text y="-34" text-anchor="middle">${t('N', 'N')}</text>
</svg>
<div class="world-title" aria-hidden="true">${t('Cinzas do Farol', 'Beacon Ashes')}</div>
${WORLD.filter((w) => PLACE_ICON[w.id])
  .map(
    (w) =>
      `<svg class="world-icon" viewBox="0 0 32 32" style="left:${w.x}%;top:${w.y}%" aria-hidden="true">${PLACE_ICON[w.id]}</svg>`,
  )
  .join('')}`;
};

// Party screen (like the FFT formation): everyone in the party, who goes to the next battle (up to 4) and who stays in camp,
// with portrait, class and numbers; each row opens the sheet. `n`: the next stage (the unlocked abilities).
// Nov 13, delivery 5 of the design (docs/game-design/towns-party-equipment.md): recruits and class change
const loadGroup = () => parseGroup(store.json(GROUP_KEY));
const saveGroup = (g: Group) => store.set(GROUP_KEY, JSON.stringify(g));
// name on screen: the protagonist takes the place of the story companion with that companion's starting class (group.ts)
const shown = (m: Member, hero: Hero | null) => (hero && m.id === hero.cls ? hero.name : m.name);
const unitOf = (m: Member, n: number, hero: Hero | null) => {
  const u = unitFrom(m.cls, shown(m, hero));
  return { ...u, abilities: u.abilities.slice(0, learnedCount(n)) };
};

export function openParty(n: number, hero: Hero | null) {
  const g = loadGroup();
  const again = () => openParty(n, hero);
  const card = (m: Member) => {
    const u = unitOf(m, n, hero),
      going = g.deployed.includes(m.id);
    const open = () => {
      d.close();
      openSheet(m, n, hero, again);
    };
    return el(
      'li',
      {
        class: 'party-card',
        role: 'button',
        tabindex: '0',
        'aria-label': t(`Ficha de ${u.name}`, `${u.name}'s sheet`),
        onclick: open,
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            open();
          }
        },
      },
      portrait(m.cls),
      el(
        'div',
        {},
        el('strong', {}, u.name),
        el(
          'span',
          { class: 'party-class' },
          ` · ${unitName(m.cls)} · ${going ? t('vai à batalha', 'in battle') : t('no acampamento', 'at camp')}`,
        ),
        el(
          'p',
          { class: 'party-stats' },
          t(
            `Vida ${u.hp} · Velocidade ${u.speed} · Movimento ${u.move} · Salto ${u.jump}`,
            `HP ${u.hp} · Speed ${u.speed} · Move ${u.move} · Jump ${u.jump}`,
          ),
        ),
        el('p', { class: 'party-skills' }, u.abilities.map(abilityName).join(' · ')),
      ),
    );
  };
  const benched = hero ? g.members.find((m) => m.id === hero.cls) : undefined;
  const d = dialog('party', t('Grupo', 'Party'), [
    el(
      'p',
      {},
      t(
        `${g.deployed.length} de ${DEPLOY_MAX} vão à batalha. Escolha alguém para trocar a classe ou quem vai.`,
        `${g.deployed.length} of ${DEPLOY_MAX} go to battle. Pick someone to change class or who goes.`,
      ),
    ),
    el(
      'ul',
      { class: 'party-list' },
      ...g.deployed.map((id) => g.members.find((m) => m.id === id)!).map(card),
      ...g.members.filter((m) => !g.deployed.includes(m.id)).map(card),
    ),
    ...(benched
      ? [
          el(
            'p',
            { class: 'party-bench' },
            t(
              `${benched.name} fica no acampamento e segue nas conversas.`,
              `${benched.name} stays at camp and keeps talking in the story.`,
            ),
          ),
        ]
      : []),
  ]);
  d.overlay.querySelector<HTMLElement>('.party-card')?.focus();
}

const SLOT_NAME: Record<Slot, () => string> = {
  weapon: () => t('Arma', 'Weapon'),
  armor: () => t('Armadura', 'Armor'),
  accessory: () => t('Acessório', 'Accessory'),
};
const itemName = (it: ItemDef) => t(it.name, it.en);
// "+2 damage · +8 accuracy": only what the item changes, in the sheet's wording
export function itemStats(it: ItemDef): string {
  const parts: [number | undefined, string, string][] = [
    [it.hp, 'vida', 'HP'],
    [it.power, 'dano', 'damage'],
    [it.hit, 'acerto', 'hit'],
    [it.move, 'movimento', 'move'],
    [it.jump, 'salto', 'jump'],
    [it.speed, 'velocidade', 'speed'],
  ];
  return parts
    .filter(([v]) => v)
    .map(([v, pt, en]) => `${v! > 0 ? '+' : ''}${v} ${t(pt, en)}`)
    .join(' · ');
}
const loadChest = () => parseChest(store.json(CHEST_KEY));
const loadEquip = () => parseEquip(store.json(EQUIP_KEY));

// Town menu (Nov 13, delivery 3): Shop, Bar with rumors and Party, as parchment over the map; Esc goes back to the map
function openTown(i: number, party: () => void) {
  const w = WORLD[i];
  const again = () => openTown(i, party);
  const d = dialog('party', t(w.name[0], w.name[1]), [
    el(
      'div',
      { class: 'menu-actions camp-list' },
      button('primary', t('Loja: comprar e vender equipamento', 'Shop: buy and sell equipment'), () => {
        d.close();
        openShop(again);
      }),
      button('secondary', t('Bar: ouvir os boatos', 'Tavern: hear the rumors'), () => {
        d.close();
        openBar(i, again);
      }),
      button('secondary', t('Grupo: classe, equipamento e quem vai', 'Party: class, equipment and who goes'), () => {
        d.close();
        party();
      }),
    ),
  ]);
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
function openBar(i: number, back: () => void) {
  const rumors = WORLD[i].town?.rumors ?? [];
  const done = parseDone(store.json(MISSIONS_KEY));
  const open = MISSIONS.filter((m) => m.town === WORLD[i].id && !done.includes(m.id));
  const gold = loadChest().gold;
  const why =
    loadGroup().members.length >= GROUP_MAX
      ? t(
          'Grupo cheio: dispense alguém na ficha para recrutar.',
          'Party is full: dismiss someone on their sheet to recruit.',
        )
      : gold < RECRUIT_COST
        ? t(
            `Faltam ${RECRUIT_COST - gold} de ouro para recrutar.`,
            `${RECRUIT_COST - gold} more gold needed to recruit.`,
          )
        : '';
  const d = dialog(
    'party',
    t('Bar', 'Tavern'),
    [
      el('ul', { class: 'legend' }, ...rumors.map(([pt, en]) => el('li', {}, `“${t(pt, en)}”`))),
      el('h3', {}, t('Missões', 'Quests')),
      // mission: extra battle with the current party; winning gives gold and an item (missions.ts)
      ...(open.length
        ? open.map((m) =>
            el(
              'div',
              { class: 'party-card' },
              el(
                'div',
                {},
                el('strong', {}, t(m.name[0], m.name[1])),
                el('p', {}, t(m.text[0], m.text[1])),
                el(
                  'p',
                  { class: 'party-stats' },
                  t(
                    `Recompensa: ${m.gold} de ouro${m.item ? ` e ${ITEMS[m.item].name}` : ''}`,
                    `Reward: ${m.gold} gold${m.item ? ` and ${ITEMS[m.item].en}` : ''}`,
                  ),
                ),
                button('secondary', t('Aceitar', 'Accept'), () => {
                  location.search = `?quest=${m.id}`;
                }),
              ),
            ),
          )
        : [el('p', {}, t('Nenhuma missão por agora.', 'No quests for now.'))]),
      // recruit (delivery 5): one person of any of the 4 classes for gold, up to the party cap
      el('h3', {}, t('Recrutar', 'Recruit')),
      el(
        'p',
        {},
        t(
          `${RECRUIT_COST} de ouro cada · ouro no baú: ${loadChest().gold} · grupo ${loadGroup().members.length} de ${GROUP_MAX}`,
          `${RECRUIT_COST} gold each · gold in chest: ${loadChest().gold} · party ${loadGroup().members.length} of ${GROUP_MAX}`,
        ),
      ),
      // without gold or with a full party the buttons turn off and the line says what is missing (before, only the error sound played)
      ...(why ? [el('p', { class: 'learned' }, why)] : []),
      el(
        'div',
        { class: 'menu-actions' },
        ...JOBS.map((c) =>
          button(
            'secondary',
            t(`Recrutar ${unitName(c)}`, `Recruit ${unitName(c)}`),
            () => {
              const r = recruit(loadGroup(), loadChest(), c);
              if (!r) return void sfx('cancel');
              saveGroup(r.group);
              store.set(CHEST_KEY, JSON.stringify(r.chest));
              sfx('confirm');
              d.close();
              openBar(i, back);
            },
            { disabled: !!why },
          ),
        ),
      ),
    ],
    { onBack: back },
  );
}

// Shop (Nov 13, delivery 2: provisional on the map until the towns): buy with the chest gold, sell for half (as in FFT)
export function openShop(back?: () => void) {
  const chest = loadChest();
  const save = (c: ReturnType<typeof buy>) => {
    if (!c) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(c));
    sfx('confirm');
    d.close();
    openShop(back);
  };
  const d = dialog(
    'party shop',
    t('Loja', 'Shop'),
    [
      el('p', { class: 'mvp' }, t(`Ouro no baú: ${chest.gold}`, `Gold in chest: ${chest.gold}`)),
      el(
        'dl',
        { class: 'keys' },
        ...Object.values(ITEMS).flatMap((it) => [
          el('dt', {}, `${itemName(it)} (${SLOT_NAME[it.slot]()})`),
          // too expensive: the button turns off and its text says how much is missing (before, it only went grey)
          el(
            'dd',
            {},
            `${itemStats(it)} · ${it.price} ${t('de ouro', 'gold')} `,
            button(
              'secondary',
              chest.gold < it.price
                ? t(`Faltam ${it.price - chest.gold}`, `${it.price - chest.gold} short`)
                : t('Comprar', 'Buy'),
              () => save(buy(chest, it.id)),
              { disabled: chest.gold < it.price },
            ),
          ),
        ]),
      ),
      el('h3', {}, t('No baú', 'In the chest')),
      chest.items.length
        ? el(
            'dl',
            { class: 'keys' },
            ...chest.items.flatMap((id) => [
              el('dt', {}, itemName(ITEMS[id])),
              el(
                'dd',
                {},
                `${Math.floor(ITEMS[id].price / 2)} ${t('de ouro', 'gold')} `,
                button('secondary', t('Vender', 'Sell'), () => save(sell(chest, id))),
              ),
            ]),
          )
        : el('p', {}, t('Vazio. Vencer uma fase dá 150 de ouro.', 'Empty. Winning a stage gives 150 gold.')),
    ],
    { onBack: back },
  );
}

// Unit sheet (like the FFT formation status screen): numbers, each ability with what it does (the ones still to come are
// marked), the 3 equipment slots and the party actions: class, go or not to battle, and dismiss (recruits only).
// Esc/✕ goes back to the list
// `at`: the button that had focus before the sheet rebuilt itself (every action closes and reopens the dialog): focus
// returns to the same place instead of jumping to the top, otherwise equipping by keyboard restarted the Tab walk each time
function openSheet(m: Member, n: number, hero: Hero | null, back: () => void, at = -1) {
  const u = unitOf(m, n, hero);
  const def = UNIT_DEFS[m.cls];
  const buttons = () => [...d.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const again = (x: Member) => {
    const i = buttons().indexOf(document.activeElement as HTMLButtonElement);
    d.close();
    openSheet(x, n, hero, back, i);
  };
  const row = (k: string, v: string | number) => [el('dt', {}, k), el('dd', {}, String(v))];
  const later = def.abilities.filter((a) => !u.abilities.includes(a));
  const eq = loadEquip(),
    chest = loadChest(),
    mine = eq[m.id] ?? {};
  const b = bonusOf(mine);
  const g = loadGroup(),
    going = g.deployed.includes(m.id);
  // number with the equipment: "42 (+6)"
  const withB = (v: number, plus: number) => (plus ? `${v + plus} (${plus > 0 ? '+' : ''}${plus})` : String(v));
  const put = (slot: Slot, id: string | null) => {
    const r = equip(loadChest(), loadEquip(), m.id, slot, id);
    if (!r) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    sfx('confirm');
    again(m);
  };
  const deploy = () => {
    const r = toggleDeploy(loadGroup(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r);
    sfx('confirm');
    again(m);
  };
  const setClass = (c: (typeof JOBS)[number]) => {
    saveGroup(changeClass(loadGroup(), m.id, c));
    sfx('confirm');
    again({ ...m, cls: c });
  };
  const fire = () => {
    const r = dismiss(loadGroup(), loadEquip(), loadChest(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r.group);
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    sfx('confirm');
    d.close();
    back();
  };
  // two columns on PC (13/11, design system): who the unit is and the decisions on the left, what it knows and wears on
  // the right; in one column the sheet was 927 px inside a 644 px dialog and equipment sat below the fold
  const d = dialog(
    'party sheet',
    u.name,
    [
      el(
        'div',
        { class: 'sheet-cols' },
        el(
          'div',
          {},
          el(
            'div',
            { class: 'party-card' },
            portrait(m.cls),
            el(
              'div',
              {},
              el('strong', {}, unitName(m.cls)),
              el(
                'dl',
                { class: 'keys' },
                ...row(t('Vida', 'HP'), withB(u.hp, b.hp)),
                ...row(t('Velocidade', 'Speed'), withB(u.speed, b.speed)),
                ...row(t('Movimento', 'Move'), withB(u.move, b.move)),
                ...row(t('Salto', 'Jump'), withB(u.jump ?? def.jump ?? MAX_JUMP, b.jump)),
                ...(b.power ? row(t('Dano', 'Damage'), `+${b.power}`) : []),
                ...(b.hit ? row(t('Acerto', 'Hit'), `+${b.hit}`) : []),
              ),
            ),
          ),
          el(
            'div',
            { class: 'menu-actions' },
            button(
              'primary',
              going ? t('Deixar no acampamento', 'Leave at camp') : t('Levar à batalha', 'Bring to battle'),
              deploy,
              { disabled: !going && g.deployed.length >= DEPLOY_MAX },
            ),
            ...(m.recruit ? [button('secondary', t('Dispensar', 'Dismiss'), fire)] : []),
          ),
          ...(!going && g.deployed.length >= DEPLOY_MAX
            ? [
                el(
                  'p',
                  {},
                  t(
                    `Já vão ${DEPLOY_MAX}: deixe alguém no acampamento antes.`,
                    `${DEPLOY_MAX} already go: leave someone at camp first.`,
                  ),
                ),
              ]
            : []),
          // class change (like FFT's Job): the numbers and abilities become those of the new class; the equipment stays
          el('h3', {}, t('Classe', 'Class')),
          choice(
            t(
              'Trocar muda os números e as habilidades; o equipamento fica.',
              'Changing swaps stats and abilities; equipment stays.',
            ),
            JOBS.map((c) => [c, unitName(c)]),
            m.cls,
            (c) => c !== m.cls && setClass(c),
          ),
          button('secondary', t('Voltar ao grupo', 'Back to party'), () => {
            d.close();
            back();
          }),
        ),
        el(
          'div',
          {},
          el('h3', {}, t('Habilidades', 'Abilities')),
          el(
            'dl',
            { class: 'keys' },
            ...u.abilities.flatMap((a) => row(abilityName(a), abilityDetail(a))),
            ...later.flatMap((a) =>
              row(abilityName(a), t('aprende mais adiante na jornada', 'learned later on the journey')),
            ),
          ),
          el('h3', {}, t('Equipamento', 'Equipment')),
          // each slot: the current item and the chest items that fit it (Equip); Unequip returns it to the chest
          el(
            'dl',
            { class: 'keys' },
            ...SLOTS.flatMap((slot) => [
              el('dt', {}, SLOT_NAME[slot]()),
              el(
                'dd',
                {},
                mine[slot]
                  ? `${itemName(ITEMS[mine[slot]!])} (${itemStats(ITEMS[mine[slot]!])}) `
                  : t('vazio ', 'empty '),
                ...(mine[slot] ? [button('secondary', t('Tirar', 'Remove'), () => put(slot, null))] : []),
                ...[...new Set(chest.items.filter((id) => ITEMS[id].slot === slot))].map((id) =>
                  button(
                    'secondary',
                    t(`Equipar ${itemName(ITEMS[id])}`, `Equip ${itemName(ITEMS[id])}`),
                    () => put(slot, id),
                    { title: itemStats(ITEMS[id]) },
                  ),
                ),
              ),
            ]),
          ),
          ...(chest.items.length
            ? []
            : [
                el(
                  'p',
                  {},
                  t(
                    'O baú está vazio: compre na Loja do mapa com o ouro das vitórias.',
                    'The chest is empty: buy at the map Shop with gold from victories.',
                  ),
                ),
              ]),
        ),
      ),
    ],
    { onBack: back },
  );
  (buttons()[at] ?? d.overlay.querySelector<HTMLButtonElement>('.primary')!).focus();
}

export interface WorldOptions {
  done: number; // points already passed (world.ts)
  hero: string; // sheet of the portrait that walks on the map
  enter: (i: number) => void;
  back: () => void;
  party: () => void; // party screen (game/world-screen.ts), like the FFT formation
  from?: number; // node the party comes from (just-won stage): opens there and walks on its own to the next open one
}

export interface WorldView {
  root: HTMLElement;
  // swaps this map for a new one; the caller now holds the new one (otherwise the 2nd refresh duplicated the map). `from`: where the
  // party leaves from (the story just seen); without it, the old `from` repeated the walk of the last victory on every story
  refresh: (done: number, from?: number) => WorldView;
}

export function openWorld(host: HTMLElement, opts: WorldOptions): WorldView {
  const { done, hero, enter, back } = opts;
  // starts at the most advanced open node (the next one to do)
  const goal = Math.min(done, WORLD.length - 1);
  let at = opts.from !== undefined && opts.from >= 0 && opts.from < goal ? opts.from : goal;
  let walking = false;
  const tag = el('span', { class: 'world-tag' });
  // place name right below the portrait: the eye needn't go to the corner panel to know where the party is
  const token = el('div', { class: 'world-token', 'aria-hidden': 'true' }, portrait(hero), tag);
  const nodes = WORLD.map((w, i) => {
    const kind = w.chapter !== undefined ? 'battle' : 'story';
    return el('button', {
      type: 'button',
      class: `world-node ${kind}${i < done ? ' done' : ''}`,
      style: `left:${w.x}%;top:${w.y}%`,
      // title: with the mouse, the name shows without walking to the node (closed ones too, to make you want to reach it)
      disabled: !isOpen(i, done),
      'aria-label': t(w.name[0], w.name[1]),
      title: t(w.name[0], w.name[1]),
      onclick: () => void walkTo(i),
      onmouseenter: () => isOpen(i, done) && sfx('cursor'), // cursor sound when hovering an open node, like in the menus
    });
  });
  const place = el('strong', { class: 'world-place' });
  const kindText = el('p', { class: 'world-kind' });
  const foes = el('p', { class: 'world-kind' }); // how many enemies and the boss (only on battle nodes)
  const enterBtn = button('item focus', t('Entrar', 'Enter'), () => go());
  // only in towns (WorldNode.town): the town menu, like the FFT towns
  const townBtn = button('item', t('Cidade', 'Town'), () => openTown(at, opts.party), { hidden: true });
  const panel = el(
    'div',
    { class: 'panel world-panel', 'aria-live': 'polite' },
    place,
    kindText,
    foes,
    el(
      'div',
      { class: 'world-actions' },
      enterBtn,
      button('item', t('Grupo', 'Party'), () => opts.party()),
      townBtn,
      button('item', t('Loja', 'Shop'), () => openShop()),
      button('item', t('Título', 'Title'), back),
    ),
  );
  const root = el(
    'div',
    { class: 'world' },
    el('div', { class: 'world-map' }, el('div', { class: 'world-svg' }), ...nodes, token),
    el(
      'div',
      { class: 'panel world-head' },
      el('strong', {}, t('Mapa do Vale', 'Valley Map')),
      ` · ${t(`${Math.min(done, WORLD.length)} de ${WORLD.length}`, `${Math.min(done, WORLD.length)} of ${WORLD.length}`)}`,
    ),
    panel,
    el(
      'p',
      { class: 'panel world-help' },
      t('Setas andam · Enter entra · G grupo · Esc volta', 'Arrows walk · Enter enters · G party · Esc goes back'),
    ),
  );
  (root.querySelector('.world-svg') as HTMLElement).innerHTML = terrain(done);
  host.append(root);

  const show = () => {
    const w = WORLD[at];
    token.style.left = `${w.x}%`;
    token.style.top = `${w.y}%`;
    nodes.forEach((n, i) => n.classList.toggle('here', i === at));
    place.textContent = tag.textContent = t(w.name[0], w.name[1]);
    kindText.textContent =
      w.chapter !== undefined
        ? t(`Batalha · Capítulo ${w.chapter + 1}`, `Battle · Chapter ${w.chapter + 1}`)
        : t('História', 'Story');
    townBtn.hidden = !w.town;
    foes.textContent = w.chapter !== undefined ? foesText(w.chapter, t) : '';
    foes.hidden = w.chapter === undefined;
  };
  // walks one stretch at a time to the requested node, with a step and a short pause at each (the eye follows the path)
  async function walkTo(target: number) {
    if (walking || target === at) return;
    walking = true;
    while (at !== target) {
      at += target > at ? 1 : -1;
      sfx('step');
      show();
      await new Promise((r) => setTimeout(r, WALK_MS));
    }
    walking = false;
  }
  // enter: the screen fades to dark first (scene transition, as in FFT); the story opens over the dark and it fades out afterwards
  const go = () => {
    if (walking) return;
    sfx('confirm');
    const fade = el('div', { class: 'fade-out', 'aria-hidden': 'true' });
    document.body.append(fade);
    walking = true;
    setTimeout(() => {
      walking = false;
      enter(at);
      setTimeout(() => fade.remove(), 400);
    }, FADE_MS);
  };
  addEventListener('keydown', (e) => {
    if (!root.isConnected || document.querySelector('.overlay')) return;
    const k = e.key.toLowerCase();
    const dir = ['arrowright', 'arrowup', 'd', 'w'].includes(k)
      ? 1
      : ['arrowleft', 'arrowdown', 'a', 's'].includes(k)
        ? -1
        : 0;
    if (dir) {
      e.preventDefault();
      const next = step(at, dir, done);
      if (next === at)
        sfx('cancel'); // end of the road or node still closed
      else void walkTo(next);
    } else if (k === 'enter' || k === ' ') {
      // with focus on another map button (Title, Party), lets its click happen (Nov 13 review: Enter on
      // Title opened the stage)
      const f = document.activeElement;
      if (f instanceof HTMLButtonElement && f !== enterBtn && root.contains(f)) return;
      e.preventDefault();
      if (!e.repeat) go();
    } else if (k === 'escape') back();
    else if (k === 'g') opts.party();
  });
  // gamepad: the same translator as the battle (gamepad.ts). D-pad walks, A enters, B goes back; with a conversation open,
  // A presses the focused button (the speech box), as in battle
  const mem = emptyMemory();
  let primed = false; // the 1st frame only records what was already pressed: the A that started the journey doesn't enter the 1st node
  const poll = () => {
    if (!root.isConnected) return;
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    const actions = padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      mem,
      performance.now(),
    );
    if (!primed) return void (primed = true);
    for (const a of actions) {
      if (document.querySelector('.overlay')) {
        if (a.k === 'confirm') (document.activeElement as HTMLElement | null)?.click();
        continue;
      }
      if (a.k === 'cursor') {
        const next = step(at, a.dir === 'right' || a.dir === 'up' ? 1 : -1, done);
        if (next === at) sfx('cancel');
        else void walkTo(next);
      } else if (a.k === 'confirm') go();
      else if (a.k === 'cancel') back();
    }
  };
  requestAnimationFrame(poll);
  root.style.setProperty('--walk-ms', `${WALK_MS}ms`);
  show();
  enterBtn.focus();
  // back from a victory: the party walks to the node that just opened (progress in the journey is visible). Replaying an
  // old stage opens nothing: the party stays where it played, instead of crossing the whole map on its own
  if (at === goal - 1) setTimeout(() => void walkTo(goal), 500);
  return {
    root,
    refresh: (newDone: number, from?: number) => {
      root.remove();
      return openWorld(host, { ...opts, done: newDone, from });
    },
  };
}
