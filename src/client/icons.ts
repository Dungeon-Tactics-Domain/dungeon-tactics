// Icons from game-icons.net (CC BY 3.0, credits in public/CREDITS.txt) in a single sprite (public/icons.svg, built by
// scripts/assets/build-icons.mjs). Color from the theme (currentColor). `el` and `iconButton` came from the Warlock unchanged.

// DOM element with attributes (on* become listeners) and children
export type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  // biome-ignore lint/suspicious/noExplicitAny: DOM properties and handlers of every type are assigned by name
  props: Record<string, any> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

// button of the design system: `primary` (gold, the one that continues the flow), `secondary` (paper) or `item` (menu row);
// several children = label + key hint
export const button = (
  cls: string,
  label: Child | Child[],
  onclick: (e: Event) => void,
  props: Record<string, unknown> = {},
) => el('button', { type: 'button', class: cls, onclick, ...props }, ...[label].flat());

// icon-only button: the name becomes title and aria-label (screen reader and long press on mobile); several children = icon + key hint
export const iconButton = (
  child: Child | Child[],
  name: string,
  onclick: () => void,
  props: Record<string, unknown> = {},
) => button('icon', child, onclick, { title: name, 'aria-label': name, ...props });

// sprite symbol → <svg> at font size; decorative (the name goes on the button that contains it)
export function icon(id: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gi');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `/icons.svg#${id}`);
  svg.append(use);
  return svg;
}

// the interface symbols kept in public/icons.svg (game-icons.net, credited in public/CREDITS.txt); the second row is the
// town's action balloon, one per kind of `townAct` (town-map.ts)
export const UI_ICON = {
  undo: 'anticlockwise-rotation',
  menu: 'cog',
  recenter: 'on-target',
  pixel: 'tv',
  talk: 'talk',
  party: 'character',
  shop: 'shop',
  tavern: 'chalice-drops', // a goblet: the sprite has no mug
  enter: 'exit-door',
  quest: 'skull-crossed-bones', // the dungeon behind the gate
  soon: 'pocket-watch', // comes later
};

// Ability icons (Nov 15, Fernando approved the 32 px set): one 6x4 atlas of 32 px cells, in the order of its .json (abilities,
// then the Move and Wait commands): /ui/fft/atlas-32.png, drawn by the 3D turn list (turn3d.ts).
const ATLAS = [
  'strike',
  'heavy_strike',
  'shield_bash',
  'spin',
  'cleave',
  'slam',
  'shot',
  'aimed_shot',
  'knock_shot',
  'dagger',
  'throwing_knife',
  'stab',
  'firebolt',
  'blast',
  'gust',
  'heal',
  'shadow_wave',
  'deathblow',
  'trip',
  'sweep',
  'lance',
  'lance_jump',
  'move',
  'wait',
];
export const ATLAS_COLUMNS = 6;
// cell of an ability or command in the atlas; null when it has none (a new ability)
export const atlasCell = (id: string): [x: number, y: number] | null => {
  const n = ATLAS.indexOf(id);
  return n < 0 ? null : [n % ATLAS_COLUMNS, Math.floor(n / ATLAS_COLUMNS)];
};
// 32 px ability icon, decorative. The atlas cell is transparent, so the CSS hides the game-icons symbol when there is a cell;
// an ability without one shows the symbol
export function abilityIcon(id: string): HTMLElement {
  const cell = atlasCell(id);
  return el(
    'span',
    {
      class: `ability-icon${cell ? ' in-atlas' : ''}`,
      'aria-hidden': 'true',
      style: cell ? `--cell-x:${cell[0]};--cell-y:${cell[1]}` : null,
    },
    icon(UI_ICON.recenter),
  );
}
