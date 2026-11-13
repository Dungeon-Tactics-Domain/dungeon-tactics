// Tela do mapa mundial (world.ts tem as regras): pergaminho com a estrada, os pontos e o retrato do grupo, que anda de
// ponto em ponto. Setas (ou A D W S) andam, Enter entra, Esc volta ao título; clique num ponto aberto anda até ele.
// Painel do lugar no canto de baixo à direita, como o nome do lugar no mapa do FFT; arte e texto nossos.
import { foesText } from './campaign.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import type { DevUnit } from './dev-roster.ts';
import { dialog } from './dialog.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { abilityDetail, portrait } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { CHEST_KEY, EQUIP_KEY, buy, equip, parseChest, parseEquip, sell } from './chest.ts';
import { MISSIONS, MISSIONS_KEY, parseDone } from './missions.ts';
import { ITEMS, SLOTS, bonusOf, type ItemDef, type Slot } from '../shared/battle/equipment.ts';
import { WORLD, isOpen, step } from './world.ts';

const WALK_MS = 320; // um trecho de estrada; o CSS usa o mesmo valor (--walk-ms)
const FADE_MS = 300; // escurecer antes de entrar no ponto; o CSS usa o mesmo valor (.fade-out)

// Mapa ilustrado (13/11, pedido do Fernando: "um mapa mundial na vibe" de um mapa de fantasia em pergaminho; só a vibe,
// desenho nosso): mar com textura, um continente de costa irregular com halo de água rasa, matas, montanhas com face de
// sombra e neve no alto, a terra cinza da Estrada de Cinzas, rio das montanhas ao lago e ao mar, ilhas, rosa dos ventos e
// cartela com o nome. viewBox 0–100 esticado na tela (os pontos ficam em % do desenho), então cada símbolo é desenhado
// ~2,2x mais estreito em x do que em y (a área do mapa tem ~2,2:1 no PC 16:9) para não sair achatado.
const NODE_CLEAR = (x: number, y: number, dx: number, dy: number) => WORLD.every((w) => Math.abs(w.x - x) > dx || Math.abs(w.y - y) > dy);
const LAND = 'M4 62 C2 50, 8 40, 16 36 C22 26, 30 30, 38 22 C44 12, 56 8, 66 10 C76 4, 90 2, 97 8 L97 60 C94 70, 86 74, 82 84 C76 94, 62 90, 52 94 C42 98, 30 96, 20 95 C10 94, 4 88, 5 78 Z';
const ISLES = [[9, 14, 4, 5], [30, 7, 3, 2.5], [70, 97, 4, 2]]; // nenhuma no canto de baixo à direita: é da rosa dos ventos
const FORESTS: [number, number, number, number, number][] = [[12, 58, 8, 12, 46], [34, 80, 8, 8, 30], [45, 44, 6, 7, 20], [68, 72, 9, 9, 34], [89, 54, 7, 12, 36], [22, 42, 6, 6, 18]];
const PEAKS = [[64, 16], [72, 11], [80, 9], [91, 7], [95, 19], [84, 24], [76, 20], [93, 34], [86, 40], [95, 48], [62, 24], [97, 28]];
// Desenho de cada lugar ao lado do ponto (13/11, mesmo pedido do mapa ilustrado): casas na vila, tenda no acampamento,
// porta de pedra nas criptas, torre com chama nos faróis, bandeira no cume. Fora do SVG esticado para não deformar.
const HOUSES = '<path class="wall" d="M3 28V17l7-6 7 6v11Z M15 28V19l7-6 7 6v9Z" /><path class="roof" d="M1 18l9-8 9 8 M13 20l9-8 9 8" />';
const CRYPT = '<path class="stone" d="M4 29V12a12 12 0 0 1 24 0v17Z" /><path class="door" d="M11 29V17a5 5 0 0 1 10 0v12Z" />';
const TOWER = '<path class="stone" d="M11 29l2-18h6l2 18Z M10 11h12v-3H10Z" /><path class="flame" d="M16 1c3 3 3 5 0 7c-3-2-3-4 0-7Z" />';
const PLACE_ICON: Record<string, string> = {
  vauclair: HOUSES, epilogo: HOUSES, cripta: CRYPT, coracao: CRYPT, farol: TOWER, colina: TOWER,
  acampamento: '<path class="wall" d="M2 28L16 6l14 22Z" /><path class="door" d="M13 28l3-9 3 9Z" />',
  cume: '<path class="stone" d="M2 30L16 10l14 20Z" /><path class="roof" d="M16 10V1" /><path class="flame" d="M16 1h9l-3 3 3 3h-9Z" />',
};
const terrain = (done: number) => {
  let s = 7; // sorteio fixo: o mapa sai igual toda vez
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const trees = FORESTS.flatMap(([cx, cy, rx, ry, n]) => Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, rnd()];
  })).filter(([x, y]) => NODE_CLEAR(x, y, 2.6, 5)).sort((a, b) => a[1] - b[1]);
  const tree = ([x, y, k]: number[]) => k < 0.55
    ? `<path class="pine" d="M${x - 0.6} ${y + 0.6} L${x} ${y - 2.6} L${x + 0.6} ${y + 0.6} Z" />`
    : `<path class="trunk" d="M${x} ${y + 0.8} V${y - 0.4}" /><ellipse class="leaf" cx="${x}" cy="${y - 1}" rx="0.75" ry="1.5" />`;
  const peaks = PEAKS.filter(([x, y]) => NODE_CLEAR(x, y - 4, 4.5, 8)).sort((a, b) => a[1] - b[1]);
  const peak = ([x, y]: number[]) => `<path class="rock" d="M${x - 2.4} ${y} L${x - 0.2} ${y - 9} L${x + 2.4} ${y} Z" />`
    + `<path class="shade" d="M${x - 0.2} ${y - 9} L${x + 2.4} ${y} L${x + 0.5} ${y} Z" />`
    + (y < 26 ? `<path class="snow" d="M${x - 0.95} ${y - 6} L${x - 0.2} ${y - 9} L${x + 0.85} ${y - 5.4} L${x + 0.2} ${y - 6.4} Z" />` : '');
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
  <polyline class="road" points="${WORLD.slice(0, -1).map((w) => `${w.x},${w.y}`).join(' ')}" />
  <polyline class="road walked" points="${WORLD.slice(0, Math.min(done, WORLD.length - 2) + 1).map((w) => `${w.x},${w.y}`).join(' ')}" />
</svg>
<svg class="world-compass" viewBox="-50 -50 100 100" aria-hidden="true">
  <circle r="30" /><circle r="22" />
  <path class="star" d="M0 -46 L7 -7 L46 0 L7 7 L0 46 L-7 7 L-46 0 L-7 -7 Z" />
  <path class="star-shade" d="M0 -46 L7 -7 L0 0 Z M46 0 L7 7 L0 0 Z M0 46 L-7 7 L0 0 Z M-46 0 L-7 -7 L0 0 Z" />
  <text y="-34" text-anchor="middle">${t('N', 'N')}</text>
</svg>
<div class="world-title" aria-hidden="true">${t('Cinzas do Farol', 'Beacon Ashes')}</div>
${WORLD.filter((w) => PLACE_ICON[w.id]).map((w) => `<svg class="world-icon" viewBox="0 0 32 32" style="left:${w.x}%;top:${w.y}%" aria-hidden="true">${PLACE_ICON[w.id]}</svg>`).join('')}`;
};

// Tela Grupo (como a formação do FFT): retrato, classe, números e as habilidades já aprendidas de quem vai à próxima
// batalha; diz quem fica no acampamento para o protagonista entrar. Usa o dialog() de sempre.
export function openParty(units: DevUnit[], benched: string | null) {
  // cada linha abre a ficha da unidade (13/11, 1ª entrega do gerenciamento do grupo como no FFT; desenho em
  // docs/game-design/cidades-grupo-equipamento.md)
  const d = dialog('party', t('Grupo', 'Party'), [
    el('ul', { class: 'party-list' }, ...units.map((u) => el('li', { class: 'party-card', role: 'button', tabindex: '0',
      'aria-label': t(`Ficha de ${u.name}`, `${u.name}'s sheet`),
      onclick: () => { d.close(); openSheet(u, () => openParty(units, benched)); },
      onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); d.close(); openSheet(u, () => openParty(units, benched)); } } }, portrait(u.base),
      el('div', {},
        el('strong', {}, u.name), el('span', { class: 'party-class' }, ` · ${unitName(u.base)}`),
        el('p', { class: 'party-stats' }, t(`Vida ${u.hp} · Velocidade ${u.speed} · Movimento ${u.move} · Salto ${UNIT_DEFS[u.base].jump ?? MAX_JUMP}`, `HP ${u.hp} · Speed ${u.speed} · Move ${u.move} · Jump ${UNIT_DEFS[u.base].jump ?? MAX_JUMP}`)),
        el('p', { class: 'party-skills' }, u.abilities.map(abilityName).join(' · '),
          ...(UNIT_DEFS[u.base].abilities.length > u.abilities.length ? [el('span', { class: 'party-more' }, t(` (+${UNIT_DEFS[u.base].abilities.length - u.abilities.length} na jornada)`, ` (+${UNIT_DEFS[u.base].abilities.length - u.abilities.length} on the journey)`))] : [])))))),
    ...(benched ? [el('p', { class: 'party-bench' }, t(`${benched} fica no acampamento e segue nas conversas.`, `${benched} stays at camp and keeps talking in the story.`))] : []),
  ]);
  d.overlay.querySelector<HTMLElement>('.party-card')?.focus();
}

const SLOT_NAME: Record<Slot, () => string> = { weapon: () => t('Arma', 'Weapon'), armor: () => t('Armadura', 'Armor'), accessory: () => t('Acessório', 'Accessory') };
const itemName = (it: ItemDef) => t(it.name, it.en);
// "+2 dano · +8 acerto": só o que o item muda, nas palavras da ficha
export function itemStats(it: ItemDef): string {
  const parts: [number | undefined, string, string][] = [[it.hp, 'vida', 'HP'], [it.power, 'dano', 'damage'], [it.hit, 'acerto', 'hit'], [it.move, 'movimento', 'move'], [it.jump, 'salto', 'jump'], [it.speed, 'velocidade', 'speed']];
  return parts.filter(([v]) => v).map(([v, pt, en]) => `${v! > 0 ? '+' : ''}${v} ${t(pt, en)}`).join(' · ');
}
const loadChest = () => parseChest(store.json(CHEST_KEY));
const loadEquip = () => parseEquip(store.json(EQUIP_KEY));

// Menu da cidade (13/11, entrega 3): Loja, Bar com boatos e Grupo, em pergaminho por cima do mapa; Esc volta ao mapa
function openTown(i: number, party: () => void) {
  const w = WORLD[i];
  const again = () => openTown(i, party);
  const d = dialog('party', t(w.name[0], w.name[1]), [
    el('div', { class: 'menu-actions camp-list' },
      el('button', { type: 'button', class: 'primary', onclick: () => { d.close(); openShop(again); } }, t('Loja: comprar e vender equipamento', 'Shop: buy and sell equipment')),
      el('button', { type: 'button', class: 'secondary', onclick: () => { d.close(); openBar(i, again); } }, t('Bar: ouvir os boatos', 'Tavern: hear the rumors')),
      el('button', { type: 'button', class: 'secondary', onclick: () => { d.close(); party(); } }, t('Grupo: fichas e equipamento', 'Party: sheets and equipment'))),
  ]);
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
function openBar(i: number, back: () => void) {
  const rumors = WORLD[i].town?.rumors ?? [];
  const done = parseDone(store.json(MISSIONS_KEY));
  const open = MISSIONS.filter((m) => m.town === WORLD[i].id && !done.includes(m.id));
  dialog('party', t('Bar', 'Tavern'), [el('ul', { class: 'legend' }, ...rumors.map(([pt, en]) => el('li', {}, `“${t(pt, en)}”`))),
    el('h3', {}, t('Missões', 'Quests')),
    // missão: batalha extra com o grupo atual; vencer dá ouro e item (missions.ts)
    ...(open.length ? open.map((m) => el('div', { class: 'party-card' }, el('div', {},
      el('strong', {}, t(m.name[0], m.name[1])), el('p', {}, t(m.text[0], m.text[1])),
      el('p', { class: 'party-stats' }, t(`Recompensa: ${m.gold} de ouro${m.item ? ` e ${ITEMS[m.item].name}` : ''}`, `Reward: ${m.gold} gold${m.item ? ` and ${ITEMS[m.item].en}` : ''}`)),
      el('button', { type: 'button', class: 'secondary', onclick: () => { location.search = `?missao=${m.id}`; } }, t('Aceitar', 'Accept')))))
      : [el('p', {}, t('Nenhuma missão por agora.', 'No quests for now.'))]),
  ], { onBack: back });
}

// Loja (13/11, entrega 2: provisória no mapa até as cidades): compra com o ouro do baú, vende pela metade (como no FFT)
export function openShop(back?: () => void) {
  const chest = loadChest();
  const save = (c: ReturnType<typeof buy>) => { if (!c) return void sfx('cancel'); store.set(CHEST_KEY, JSON.stringify(c)); sfx('confirm'); d.close(); openShop(back); };
  const d = dialog('party', t('Loja', 'Shop'), [
    el('p', { class: 'mvp' }, t(`Ouro no baú: ${chest.gold}`, `Gold in chest: ${chest.gold}`)),
    el('dl', { class: 'keys' }, ...Object.values(ITEMS).flatMap((it) => [
      el('dt', {}, `${itemName(it)} (${SLOT_NAME[it.slot]()})`),
      el('dd', {}, `${itemStats(it)} · ${it.price} ${t('de ouro', 'gold')} `,
        el('button', { type: 'button', class: 'secondary', disabled: chest.gold < it.price, onclick: () => save(buy(chest, it.id)) }, t('Comprar', 'Buy'))),
    ])),
    el('h3', {}, t('No baú', 'In the chest')),
    chest.items.length ? el('dl', { class: 'keys' }, ...chest.items.flatMap((id) => [el('dt', {}, itemName(ITEMS[id])),
      el('dd', {}, `${Math.floor(ITEMS[id].price / 2)} ${t('de ouro', 'gold')} `, el('button', { type: 'button', class: 'secondary', onclick: () => save(sell(chest, id)) }, t('Vender', 'Sell')))]))
      : el('p', {}, t('Vazio. Vencer uma fase dá 150 de ouro.', 'Empty. Winning a stage gives 150 gold.')),
  ], { onBack: back });
}

// Ficha da unidade (como a tela de status da formação do FFT): números, cada habilidade com o que faz (as que ainda vêm
// marcadas) e os 3 espaços de equipamento, vazios até a loja das cidades (próxima entrega). Esc/✕ volta à lista.
function openSheet(u: DevUnit, back: () => void) {
  const def = UNIT_DEFS[u.base];
  const row = (k: string, v: string | number) => [el('dt', {}, k), el('dd', {}, String(v))];
  const later = def.abilities.filter((a) => !u.abilities.includes(a));
  const eq = loadEquip(), chest = loadChest(), mine = eq[u.base] ?? {};
  const b = bonusOf(mine);
  // número com o equipamento: "42 (+6)"
  const withB = (v: number, plus: number) => (plus ? `${v + plus} (${plus > 0 ? '+' : ''}${plus})` : String(v));
  const put = (slot: Slot, id: string | null) => {
    const r = equip(loadChest(), loadEquip(), u.base, slot, id);
    if (!r) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    sfx('confirm');
    d.close();
    openSheet(u, back);
  };
  const d = dialog('party', u.name, [
    el('div', { class: 'party-card' }, portrait(u.base), el('div', {},
      el('strong', {}, unitName(u.base)),
      el('dl', { class: 'keys' },
        ...row(t('Vida', 'HP'), withB(u.hp, b.hp)), ...row(t('Velocidade', 'Speed'), withB(u.speed, b.speed)), ...row(t('Movimento', 'Move'), withB(u.move, b.move)),
        ...row(t('Salto', 'Jump'), withB(u.jump ?? def.jump ?? MAX_JUMP, b.jump)),
        ...(b.power ? row(t('Dano', 'Damage'), `+${b.power}`) : []), ...(b.hit ? row(t('Acerto', 'Hit'), `+${b.hit}`) : [])))),
    el('h3', {}, t('Habilidades', 'Abilities')),
    el('dl', { class: 'keys' }, ...u.abilities.flatMap((a) => row(abilityName(a), abilityDetail(a))),
      ...later.flatMap((a) => row(abilityName(a), t('aprende mais adiante na jornada', 'learned later on the journey')))),
    el('h3', {}, t('Equipamento', 'Equipment')),
    // cada espaço: o item de agora e os do baú que cabem nele (Equipar); Tirar devolve ao baú
    el('dl', { class: 'keys' }, ...SLOTS.flatMap((slot) => [el('dt', {}, SLOT_NAME[slot]()), el('dd', {},
      mine[slot] ? `${itemName(ITEMS[mine[slot]!])} (${itemStats(ITEMS[mine[slot]!])}) ` : t('vazio ', 'empty '),
      ...(mine[slot] ? [el('button', { type: 'button', class: 'secondary', onclick: () => put(slot, null) }, t('Tirar', 'Remove'))] : []),
      ...[...new Set(chest.items.filter((id) => ITEMS[id].slot === slot))].map((id) =>
        el('button', { type: 'button', class: 'secondary', title: itemStats(ITEMS[id]), onclick: () => put(slot, id) }, t(`Equipar ${itemName(ITEMS[id])}`, `Equip ${itemName(ITEMS[id])}`))))])),
    ...(chest.items.length ? [] : [el('p', {}, t('O baú está vazio: compre na Loja do mapa com o ouro das vitórias.', 'The chest is empty: buy at the map Shop with gold from victories.'))]),
    el('button', { type: 'button', class: 'primary', onclick: () => { d.close(); back(); } }, t('Voltar ao grupo', 'Back to party')),
  ], { onBack: back });
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

export interface WorldOptions {
  done: number; // pontos já passados (world.ts)
  hero: string; // ficha do retrato que anda no mapa
  enter: (i: number) => void;
  back: () => void;
  party: () => void; // tela do grupo (main.ts), como a formação do FFT
  from?: number; // ponto de onde o grupo vem (fase recém-vencida): abre ali e anda sozinho até o próximo aberto
}

export interface WorldView {
  root: HTMLElement;
  // troca este mapa por um novo; quem chama passa a guardar o novo (senão o 2º refresh duplicava o mapa). `from`: de onde o
  // grupo sai (a história recém-vista); sem ele, o `from` antigo repetia a caminhada da última vitória a cada história
  refresh: (done: number, from?: number) => WorldView;
}

export function openWorld(host: HTMLElement, opts: WorldOptions): WorldView {
  const { done, hero, enter, back } = opts;
  // começa no ponto mais avançado aberto (o próximo a fazer)
  const goal = Math.min(done, WORLD.length - 1);
  let at = opts.from !== undefined && opts.from >= 0 && opts.from < goal ? opts.from : goal;
  let walking = false;
  const tag = el('span', { class: 'world-tag' });
  // nome do lugar logo abaixo do retrato: o olho não precisa ir ao painel do canto para saber onde o grupo está
  const token = el('div', { class: 'world-token', 'aria-hidden': 'true' }, portrait(hero), tag);
  const nodes = WORLD.map((w, i) => {
    const kind = w.chapter !== undefined ? 'battle' : 'story';
    return el('button', {
      type: 'button', class: `world-node ${kind}${i < done ? ' done' : ''}`, style: `left:${w.x}%;top:${w.y}%`,
      // title: com o mouse, o nome aparece sem precisar andar até o ponto (fechado também, para dar vontade de chegar)
      disabled: !isOpen(i, done), 'aria-label': t(w.name[0], w.name[1]), title: t(w.name[0], w.name[1]), onclick: () => void walkTo(i),
      onmouseenter: () => isOpen(i, done) && sfx('cursor'), // som de cursor ao passar por um ponto aberto, como nos menus
    });
  });
  const place = el('strong', { class: 'world-place' });
  const kindText = el('p', { class: 'world-kind' });
  const foes = el('p', { class: 'world-kind' }); // quantos inimigos e o chefe (só nos pontos de batalha)
  const enterBtn = el('button', { type: 'button', class: 'item focus', onclick: () => go() }, t('Entrar', 'Enter'));
  // só nas cidades (WorldNode.town): o menu da cidade, como as cidades do FFT
  const townBtn = el('button', { type: 'button', class: 'item', hidden: true, onclick: () => openTown(at, opts.party) }, t('Cidade', 'Town'));
  const panel = el('div', { class: 'panel world-panel', 'aria-live': 'polite' }, place, kindText, foes, el('div', { class: 'world-actions' }, enterBtn,
    el('button', { type: 'button', class: 'item', onclick: () => opts.party() }, t('Grupo', 'Party')),
    townBtn,
    el('button', { type: 'button', class: 'item', onclick: () => openShop() }, t('Loja', 'Shop')),
    el('button', { type: 'button', class: 'item', onclick: back }, t('Título', 'Title'))));
  const root = el('div', { class: 'world' },
    el('div', { class: 'world-map' }, el('div', { class: 'world-svg' }), ...nodes, token),
    el('div', { class: 'panel world-head' }, el('strong', {}, t('Mapa do Vale', 'Valley Map')), ` · ${t(`${Math.min(done, WORLD.length)} de ${WORLD.length}`, `${Math.min(done, WORLD.length)} of ${WORLD.length}`)}`),
    panel,
    el('p', { class: 'panel world-help' }, t('Setas andam · Enter entra · G grupo · Esc volta', 'Arrows walk · Enter enters · G party · Esc goes back')));
  (root.querySelector('.world-svg') as HTMLElement).innerHTML = terrain(done);
  host.append(root);

  const show = () => {
    const w = WORLD[at];
    token.style.left = `${w.x}%`;
    token.style.top = `${w.y}%`;
    nodes.forEach((n, i) => n.classList.toggle('here', i === at));
    place.textContent = tag.textContent = t(w.name[0], w.name[1]);
    kindText.textContent = w.chapter !== undefined
      ? t(`Batalha · Capítulo ${w.chapter + 1}`, `Battle · Chapter ${w.chapter + 1}`)
      : t('História', 'Story');
    townBtn.hidden = !w.town;
    foes.textContent = w.chapter !== undefined ? foesText(w.chapter, t) : '';
    foes.hidden = w.chapter === undefined;
  };
  // anda um trecho por vez até o ponto pedido, com passo e pausa curta em cada um (o olho segue o caminho)
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
  // entrar: a tela escurece antes (transição de cena, como no FFT); a história abre por cima do escuro e ele some depois
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
    const dir = ['arrowright', 'arrowup', 'd', 'w'].includes(k) ? 1 : ['arrowleft', 'arrowdown', 'a', 's'].includes(k) ? -1 : 0;
    if (dir) {
      e.preventDefault();
      const next = step(at, dir, done);
      if (next === at) sfx('cancel'); // ponta da estrada ou ponto ainda fechado
      else void walkTo(next);
    } else if (k === 'enter' || k === ' ') {
      // com o foco em outro botão do mapa (Título, Grupo), deixa o clique dele acontecer (revisão de 13/11: Enter no
      // Título abria a fase)
      const f = document.activeElement;
      if (f instanceof HTMLButtonElement && f !== enterBtn && root.contains(f)) return;
      e.preventDefault();
      if (!e.repeat) go();
    } else if (k === 'escape') back();
    else if (k === 'g') opts.party();
  });
  // controle: o mesmo tradutor da batalha (gamepad.ts). Direcional anda, A entra, B volta; com uma conversa aberta,
  // A aperta o botão em foco (a caixa de fala), como na batalha
  const mem = emptyMemory();
  let primed = false; // o 1º quadro só registra o que já estava apertado: o A que começou a jornada não entra no 1º ponto
  const poll = () => {
    if (!root.isConnected) return;
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    const actions = padActions({ buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] }, mem, performance.now());
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
  // volta de uma vitória: o grupo anda até o ponto que acabou de abrir (o avanço na jornada fica visível). Rejogar uma fase
  // antiga não abre nada: o grupo fica onde jogou, em vez de atravessar o mapa inteiro sozinho
  if (at === goal - 1) setTimeout(() => void walkTo(goal), 500);
  return { root, refresh: (newDone: number, from?: number) => { root.remove(); return openWorld(host, { ...opts, done: newDone, from }); } };
}
