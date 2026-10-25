// Ícones do game-icons.net (CC BY 3.0, créditos em public/CREDITS.txt) num sprite só (public/icons.svg, montado por
// scripts/assets/build-icons.mjs). Cor pelo tema (currentColor). `el` e `iconButton` vieram do Warlock sem mudança.

// elemento do DOM com atributos (on* viram ouvintes) e filhos
export type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
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

// botão só de ícone: o nome vira title e aria-label (leitor de tela e toque longo no celular); vários filhos = ícone + dica de tecla
export const iconButton = (child: Child | Child[], name: string, onclick: () => void, props: Record<string, unknown> = {}) =>
  el('button', { type: 'button', class: 'icon', title: name, 'aria-label': name, onclick, ...props }, ...[child].flat());

// símbolo do sprite → <svg> do tamanho da fonte; decorativo (o nome vai no botão que o contém)
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

// desenhos do sprite que já existiam no Warlock, escolhidos pelo gesto de cada habilidade
export const ABILITY_ICON: Record<string, string> = {
  strike: 'knife-thrust', heavy_strike: 'flail', shield_bash: 'checked-shield', spin: 'cycle',
  shot: 'on-target', aimed_shot: 'archery-target', knock_shot: 'ricochet', dagger: 'striking-splinter',
  firebolt: 'fire-ray', blast: 'meteor-impact', gust: 'wind-slap', heal: 'chalice-drops',
  stab: 'knife-thrust', throwing_knife: 'split-arrows', trip: 'snail', deathblow: 'skull-crossed-bones',
  cleave: 'flail', slam: 'knockout',
  lance: 'knife-thrust', sweep: 'ricochet', lance_jump: 'meteor-impact',
};
// habilidades do estudo do FFT (ids `fft_<unidade>_<habilidade>`): o desenho sai do nome da habilidade, sem ícone novo
const STUDY_ICON: Record<string, string> = {
  attack: 'knife-thrust', stone: 'ricochet', dash: 'checked-shield', accumulate: 'cycle', wish: 'chalice-drops', yell: 'wind-slap',
  potion: 'chalice-drops', speed_break: 'snail', power_break: 'knockout', charge1: 'on-target', charge2: 'archery-target', fire: 'fire-ray', cure: 'chalice-drops',
};
export const abilityIcon = (id: string) => ABILITY_ICON[id] ?? STUDY_ICON[id.split('_').slice(2).join('_')];
export const UI_ICON = { move: 'run', undo: 'anticlockwise-rotation', wait: 'pocket-watch', menu: 'cog', recenter: 'on-target', pixel: 'tv' };
