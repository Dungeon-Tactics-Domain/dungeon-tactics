// Icons from game-icons.net (CC BY 3.0, credits in public/CREDITS.txt) in a single sprite (public/icons.svg, built by
// scripts/assets/build-icons.mjs). Color from the theme (currentColor). `el` and `iconButton` came from the Warlock unchanged.

// DOM element with attributes (on* become listeners) and children
export type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
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

// icon-only button: the name becomes title and aria-label (screen reader and long press on mobile); several children = icon + key hint
export const iconButton = (
  child: Child | Child[],
  name: string,
  onclick: () => void,
  props: Record<string, unknown> = {},
) =>
  el(
    'button',
    { type: 'button', class: 'icon', title: name, 'aria-label': name, onclick, ...props },
    ...[child].flat(),
  );

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

// sprite drawings that already existed in the Warlock, chosen by each ability's gesture
export const ABILITY_ICON: Record<string, string> = {
  strike: 'knife-thrust',
  heavy_strike: 'flail',
  shield_bash: 'checked-shield',
  spin: 'cycle',
  shot: 'on-target',
  aimed_shot: 'archery-target',
  knock_shot: 'ricochet',
  dagger: 'striking-splinter',
  firebolt: 'fire-ray',
  blast: 'meteor-impact',
  gust: 'wind-slap',
  heal: 'chalice-drops',
  stab: 'knife-thrust',
  throwing_knife: 'split-arrows',
  trip: 'snail',
  deathblow: 'skull-crossed-bones',
  cleave: 'flail',
  slam: 'knockout',
  lance: 'knife-thrust',
  sweep: 'ricochet',
  lance_jump: 'meteor-impact',
};
// FFT study abilities (ids `fft_<unit>_<ability>`): the drawing comes from the ability's name, no new icon
const STUDY_ICON: Record<string, string> = {
  attack: 'knife-thrust',
  stone: 'ricochet',
  dash: 'checked-shield',
  accumulate: 'cycle',
  wish: 'chalice-drops',
  yell: 'wind-slap',
  potion: 'chalice-drops',
  speed_break: 'snail',
  power_break: 'knockout',
  charge1: 'on-target',
  charge2: 'archery-target',
  fire: 'fire-ray',
  cure: 'chalice-drops',
};
export const abilityIcon = (id: string) => ABILITY_ICON[id] ?? STUDY_ICON[id.split('_').slice(2).join('_')];
export const UI_ICON = {
  move: 'run',
  undo: 'anticlockwise-rotation',
  wait: 'pocket-watch',
  menu: 'cog',
  recenter: 'on-target',
  pixel: 'tv',
};
