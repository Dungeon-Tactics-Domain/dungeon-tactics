// HUD da batalha no jeito da tela de batalha do FFT (pedido do Fernando, 12/11: "descarte as interfaces atuais e recrie
// a interface do mesmo jeito da do final fantasy tactics original"). Só a disposição e o fluxo vêm de lá; molduras,
// cores e retratos são nossos (CSS e bonecos KayKit). Peças, de cima para baixo:
//   canto de cima à esquerda: a casa sob o cursor (altura e piso) e, embaixo, a lista dos próximos turnos (AT);
//   alto, no meio: a linha de ajuda do que fazer agora e, abaixo, a faixa com o nome da habilidade;
//   ao lado do boneco da vez: o menu de comandos (Mover · Agir · Esperar · Status), o submenu das habilidades e o
//   "Executar?" (13/11, pedido do Fernando: "do lado do boneco igual no FFT"; `place` acompanha a câmera a cada quadro);
//   embaixo à esquerda: a unidade da vez (retrato, vida, MP e CT em barras); embaixo à direita: a unidade sob o cursor,
//   que ao mirar mostra a prévia do golpe (acerto, dano e o pedaço da vida que sai, como no FFT e no Tactics Ogre).
// Redesenha tudo a cada mudança (é pouco DOM); a posição do menu muda só em left/top.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { COMBAT, simulatePush, type Preview } from '../shared/battle/combat.ts';
import { TERRAIN, posKey, standH, tileAt, type Grid } from '../shared/battle/grid.ts';
import { jumpOf, unitAt } from '../shared/battle/pathing.ts';
import { rulesOf } from '../shared/battle/rules.ts';
import { SURVIVAL_ID, turnsLeft } from './survival.ts';
import { TURN_THRESHOLD, previewOrder } from '../shared/battle/turn-queue.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { COMMANDS, abilitiesOf, abilityEnabled, canUndoMove, commandEnabled, type Command, type Screen } from './command.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { UI_ICON, el, icon, iconButton, type Child } from './icons.ts';
import { classOf } from './dev-roster.ts';
import { chargeDanger, type Highlights } from './interaction.ts';
import { modelOf } from './markers.ts';

export interface HudActions {
  command(index: number): void; // clique num item do menu de comandos
  ability(index: number): void; // clique numa habilidade do submenu
  answer(yes: boolean): void; // "Executar?" Sim ou Não
  cancel(): void;
  rotate(dir: 1 | -1): void;
  recenter(): void;
  pixel(): void;
  fast(): void; // liga e desliga a batalha 3 vezes mais rápida (o jeito do toque; no teclado, segurar Enter)
  undo(): void; // desfaz o último passo (o mesmo da tecla Z): quem joga só de mouse não tinha como
  menu(): void;
}
export interface HudView {
  battle: Battle;
  screen: Screen;
  hl: Highlights | null;
  busy: boolean; // animação ou vez do inimigo: nada responde
  log: string; // resumo da última ação (eventLog)
  acting: string | null; // def do inimigo que está jogando agora (o estado já passou a vez quando a animação toca)
  cursor: Pos; // casa sob o cursor (teclado, mouse ou controle)
  ability: string | null; // habilidade em mira no mapa (a prévia do golpe no painel do alvo)
}

const QUEUE_SIZE = 8;
const KEYS = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const hint = (k: string) => el('kbd', { class: 'hint', 'aria-hidden': 'true' }, k);
const hpText = (u: UnitState) => `${u.hp}/${UNIT_DEFS[u.def].hp}`;
const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

// ficha de uma habilidade (submenu e janela de status)
export function abilityDetail(id: string): string {
  const a = ABILITIES[id];
  const parts = [a.range[1] === 0 ? t('em volta de você', 'around you') : t(`alcance ${range(a.range)}`, `range ${range(a.range)}`)];
  if (a.damage[1]) parts.push(t(`dano ${range(a.damage)}`, `damage ${range(a.damage)}`), t(`acerto ${a.accuracy}%`, `accuracy ${a.accuracy}%`));
  if (a.heal[1]) parts.push(t(`cura ${range(a.heal)}`, `heals ${range(a.heal)}`));
  if (a.radius) parts.push(t(`área de raio ${a.radius} (pega aliados)`, `area of radius ${a.radius} (hits allies)`)); // raio 2 existe desde a Onda sombria
  if (a.push) parts.push(t(`empurra ${a.push}`, `pushes ${a.push}`));
  if (a.needsSight) parts.push(t('precisa de visão', 'needs sight'));
  if (a.heightRange) parts.push(t('+1 de alcance por nível acima', '+1 range per level above'));
  if (a.cost) parts.push(t(`gasta ${a.cost[1]} de ${a.cost[0] === 'mp' ? 'MP' : 'estoque'}`, `costs ${a.cost[1]} ${a.cost[0] === 'mp' ? 'MP' : 'stock'}`));
  if (a.charge) parts.push(a.panel ? t(`carrega ${a.charge} tiques; mira a casa e erra se o alvo sair dela`, `charges ${a.charge} ticks; aims at the tile and misses if the target leaves`)
    : t(`carrega ${a.charge} tiques e segue o alvo`, `charges ${a.charge} ticks and follows the target`));
  return parts.join(' · ');
}

// Resumo em texto do que a última ação fez: o número flutuante some em 1 s e o leitor de tela não o lê.
// Quem morreu já saiu do estado; o nome vem do cenário.
export function eventLog(events: BattleEvent[], state: BattleState): string {
  const name = (id: string) => unitName((state.units.find((u) => u.id === id) ?? SCENARIOS[state.scenario].spawns.find((s) => s.id === id))!.def);
  // uma frase por ação: cargas que saem no mesmo intervalo trazem várias ações numa lista só
  const out: string[] = [];
  let head = '';
  let parts: string[] = [];
  // ação sem resultado em alvo (Acumular, Grito): só quem usou o quê
  const flush = () => {
    if (parts.length) out.push(head + parts.join(' · '));
    else if (head) out.push(head.slice(0, -3));
    head = '';
    parts = [];
  };
  for (const e of events) {
    if (e.k === 'attack') {
      flush();
      head = `${name(e.unit)}: ${abilityName(e.ability)} → `;
    } else if (e.k === 'charge') {
      flush();
      out.push(t(`${name(e.unit)} carrega ${abilityName(e.ability)}`, `${name(e.unit)} charges ${abilityName(e.ability)}`));
    } else if (e.k === 'fizzle') {
      flush();
      out.push(t(`${name(e.unit)}: ${abilityName(e.ability)} não achou o alvo`, `${name(e.unit)}: ${abilityName(e.ability)} found no target`));
    } else if (e.k === 'hit') parts.push(`${name(e.unit)} −${e.dmg}`);
    else if (e.k === 'miss') parts.push(t(`${name(e.unit)} errou (${e.chance}%)`, `missed ${name(e.unit)} (${e.chance}%)`));
    else if (e.k === 'heal') parts.push(`${name(e.unit)} +${e.amount}`);
    else if (e.k === 'bump') parts.push(t(`${name(e.unit)} bateu −${e.dmg}`, `${name(e.unit)} crashed −${e.dmg}`));
    else if (e.k === 'fall') parts.push(t(`${name(e.unit)} caiu de altura −${e.dmg}`, `${name(e.unit)} fell −${e.dmg}`));
    else if (e.k === 'spike') parts.push(t(`${name(e.unit)} nos espinhos −${e.dmg}`, `${name(e.unit)} on the spikes −${e.dmg}`));
    else if (e.k === 'die') parts.push(t(`${name(e.unit)} caiu`, `${name(e.unit)} is down`));
  }
  flush();
  return out.join(' | ');
}

// Ficha da janela de status (como a do FFT): o que a unidade é agora. Linhas [rótulo, valor]; puro para o teste.
const INFO_LABEL: Record<string, () => string> = {
  pa: () => t('Força (PA)', 'Physical attack (PA)'), ma: () => t('Magia (MA)', 'Magic attack (MA)'), brave: () => 'Brave',
  faith: () => t('Fé', 'Faith'), weapon: () => t('Arma', 'Weapon'), shield: () => t('Escudo', 'Shield'),
};
export function unitStatus(state: BattleState, unitId: string): [string, string][] {
  const u = state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  const bonus = (k: string) => (u.vars?.[k] ? ` (${u.vars[k] > 0 ? '+' : ''}${u.vars[k]})` : '');
  const rows: [string, string][] = [
    [t('Lado', 'Side'), u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy')],
    [t('Vida', 'HP'), hpText(u)],
  ];
  if (u.vars?.mp !== undefined) rows.push(['MP', String(u.vars.mp)]);
  if (u.vars?.potions !== undefined) rows.push([t('Poções', 'Potions'), String(u.vars.potions)]);
  rows.push(
    ['CT', `${Math.max(0, u.ct)}/${TURN_THRESHOLD}`],
    [t('Velocidade', 'Speed'), `${rulesOf(state).speed?.(u) ?? def.speed}${bonus('sp')}`],
    [t('Movimento', 'Move'), String(def.move)],
    [t('Salto', 'Jump'), String(jumpOf(state, u.def))],
  );
  for (const [k, v] of Object.entries(def.info ?? {})) rows.push([INFO_LABEL[k]?.() ?? k, `${v}${k === 'pa' ? bonus('pa') : ''}`]);
  const c = state.charges.find((x) => x.unit === u.id);
  if (c) rows.push([t('Carregando', 'Charging'), t(`${abilityName(c.ability)}, sai em ${c.ticks} tiques`, `${abilityName(c.ability)}, goes off in ${c.ticks} ticks`)]);
  // pontos cardeais do mapa (convenção nossa: a linha 0 da grade é o norte)
  if (u.facing !== undefined) rows.push([t('Olhando para', 'Facing'), [t('sul', 'south'), t('leste', 'east'), t('norte', 'north'), t('oeste', 'west')][u.facing]]);
  rows.push([t('Habilidades', 'Abilities'), def.abilities.map(abilityName).join(', ') || '—']);
  return rows;
}

// Informação da casa sob o cursor (canto do FFT): posição, altura e o tipo de piso
const LOOK_NAME: Record<string, () => string> = {
  grass: () => t('grama', 'grass'), stone: () => t('pedra', 'stone'), water: () => t('água', 'water'), roof: () => t('telhado', 'roof'),
  chimney: () => t('chaminé', 'chimney'), wood: () => t('madeira', 'wood'), bridge: () => t('ponte', 'bridge'), box: () => t('caixa', 'crate'), tree: () => t('árvore', 'tree'),
  // Colina do Farol e Cripta Alagada (12/11)
  rock: () => t('rocha', 'rock'), summit: () => t('topo de rocha', 'rock top'), sand: () => t('areia', 'sand'), gold: () => t('veio de ouro', 'gold vein'),
  brick: () => t('muro de tijolo', 'brick wall'), snow: () => t('neve', 'snow'), snow_rock: () => t('rocha com neve', 'snowy rock'),
  tree2: () => t('árvore', 'tree'), tree3: () => t('árvore', 'tree'), tree4: () => t('árvore', 'tree'), bare1: () => t('árvore seca', 'bare tree'), bare2: () => t('árvore seca', 'bare tree'),
  crypt: () => t('piso de pedra', 'stone floor'), altar: () => t('altar', 'altar'), pillar: () => t('coluna', 'pillar'), crates: () => t('caixotes', 'crates'),
  barrel: () => t('barril', 'barrel'), chest: () => t('baú', 'chest'), rubble: () => t('entulho', 'rubble'),
  spikes: () => t('armadilha de espinhos', 'spike trap'),
};
const TERRAIN_NAME: Record<string, () => string> = { floor: () => t('chão', 'ground'), forest: () => t('árvore', 'tree'), rubble: () => t('entulho (cobertura)', 'rubble (cover)'), wall: () => t('muro', 'wall') };
export function tileInfo(grid: Grid, p: Pos): string {
  const tile = tileAt(grid, p);
  const kind = tile.look ? LOOK_NAME[tile.look]?.() ?? tile.look : TERRAIN_NAME[tile.terrain]();
  // água rasa e funda têm o mesmo desenho: o texto da casa é o que diz qual é qual (achado olhando o Coração da Cripta)
  const blocked = (TERRAIN[tile.terrain].walkable ? '' : t(' · não dá para pisar', ' · not walkable'))
    + ((tile.depth ?? 0) >= 2 ? t(' · funda: não se atravessa', ' · deep: cannot be crossed') : tile.depth === 1 ? t(' · rasa: custa 2 de movimento', ' · shallow: costs 2 movement') : '')
    + (tile.spikes ? t(` · espinhos: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez ou ser empurrado aqui`, ` · spikes: −${COMBAT.SPIKE_DAMAGE} when ending a turn or pushed here`) : '');
  // na água rasa vale a altura em que se fica de pé (a que o Salto compara), não a da superfície
  const h = tile.depth === 1 ? standH(tile) : tile.h;
  return t(`Casa ${p.x},${p.y} · altura ${h}${tile.ramp ? ' (rampa)' : ''} · ${kind}${blocked}`, `Tile ${p.x},${p.y} · height ${h}${tile.ramp ? ' (slope)' : ''} · ${kind}${blocked}`);
}

const REASON: Record<string, () => string> = {
  range: () => t('Fora do alcance', 'Out of range'),
  sight: () => t('Sem linha de visão', 'No line of sight'),
  'no-target': () => t('Nenhum alvo nesta casa', 'No target on this tile'),
  unknown: () => t('Não dá para usar aqui', 'Cannot use here'),
  spent: () => t('Acabou o estoque ou o MP', 'Out of stock or MP'),
};
const COMMAND_NAME: Record<Command, () => string> = {
  move: () => t('Mover', 'Move'), act: () => t('Agir', 'Act'), wait: () => t('Esperar', 'Wait'), status: () => 'Status',
};

// barra com rótulo e número (vida, MP, CT), como as do painel de unidade do FFT. `change` marca em listras o trecho
// que o golpe tira (loss) ou a cura põe (gain), como a barra do alvo no Tactics Ogre; o número vem junto no painel
function gauge(cls: string, label: string, value: number, max: number, change?: { from: number; to: number; kind: 'loss' | 'gain' }) {
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * 100);
  return el('div', { class: `gauge ${cls}` }, el('span', { class: 'gauge-label' }, label),
    el('span', { class: 'gauge-bar' }, el('i', { style: `width:${pct(value)}%` }),
      change ? el('b', { class: `gauge-change ${change.kind}`, style: `left:${pct(change.from)}%;width:${pct(change.to) - pct(change.from)}%` }) : null),
    el('span', { class: 'gauge-num' }, `${Math.max(0, value)}/${max}`));
}

// Prévia de um golpe em cada alvo (a do "Executar?" e a do painel do alvo ao mirar): mesma conta nos dois lugares.
export interface Forecast {
  unit: UnitState;
  chance: number; // % de acerto (cura e apoio não erram: 100)
  dmg: [number, number] | null;
  heal: [number, number] | null;
  push: number; // dano extra do empurrão (batida, queda, espinhos)
  spikes: boolean;
  after: [number, number]; // vida depois, menor e maior
  ally: boolean; // golpe que pega alguém do mesmo lado de quem usa
  support: boolean; // apoio sem cura: só o efeito
  side: 'front' | 'side' | 'back'; // de onde o golpe pega (direção do alvo, 13/11); "pelas costas" acerta mais
}
export function forecast(b: Battle, ability: string, p: Preview): Forecast[] {
  const a = ABILITIES[ability];
  return p.targets.map((tg) => {
    const u = b.state.units.find((x) => x.id === tg.unit)!;
    const max = UNIT_DEFS[u.def].hp;
    const heal: [number, number] | null = tg.healMax ? [tg.healMin, tg.healMax] : null;
    const support = !!a.ally && !heal;
    // empurrão: o dano extra de batida, queda e espinhos, para ver o combo antes de confirmar (noite de 12/11)
    const shove = a.push && !heal && !support ? simulatePush(b.grid, b.state, u, p.center, b.actor.pos, a.push) : null;
    const push = shove?.dmg ?? 0;
    // o empurrão vem junto de todo acerto (sem `pushChance`, que só o estudo do FFT usa): entra na vida depois
    const sure = a.pushChance === undefined ? push : 0;
    const after: [number, number] = heal ? [Math.min(max, u.hp + heal[0]), Math.min(max, u.hp + heal[1])]
      : support ? [u.hp, u.hp] : [Math.max(0, u.hp - tg.dmgMax - sure), Math.max(0, u.hp - tg.dmgMin - sure)];
    return { unit: u, chance: tg.chance, dmg: heal || support ? null : [tg.dmgMin, tg.dmgMax], heal, push,
      spikes: !!shove?.events.some((e) => e.k === 'spike'), after, ally: !heal && !support && u.team === b.actor.team, support,
      side: a.magic || heal || support ? 'front' : tg.side };
  });
}
// "dano 9–12 · empurrão +3", "acerto 85% · dano 9–12 · empurrão +3" ou "cura 7–10"; e "vida 25 → 10–13"
const dmgText = (f: Forecast) => t(`dano ${range(f.dmg!)}`, `damage ${range(f.dmg!)}`)
  + (f.push ? t(` · empurrão +${f.push}${f.spikes ? ' (espinhos!)' : ''}`, ` · push +${f.push}${f.spikes ? ' (spikes!)' : ''}`) : '');
// golpe físico pelo lado ou pelas costas diz de onde vem o bônus de acerto (combat.ts SIDE_BONUS/BACK_BONUS)
const fromText = (f: Forecast) => (f.side === 'back' ? t(' (pelas costas)', ' (from behind)') : f.side === 'side' ? t(' (de lado)', ' (from the side)') : '');
export const forecastText = (f: Forecast) => f.heal ? t(`cura ${range(f.heal)}`, `heals ${range(f.heal)}`) : `${t(`acerto ${f.chance}%`, `hit ${f.chance}%`)}${fromText(f)} · ${dmgText(f)}`;
export const hpAfterText = (f: Forecast) => `${t('vida', 'HP')} ${f.unit.hp} → ${range(f.after)}`;

// bloco da prévia no painel do alvo: acerto grande à esquerda (o número do FFT), dano e vida depois ao lado
function forecastBlock(f: Forecast, ability: string, others: Forecast[]) {
  const names = others.map((o) => unitName(o.unit.def) + (o.ally ? t(' (aliado!)', ' (ally!)') : ''));
  return el('div', { class: 'forecast' },
    f.support ? null : el('span', { class: `forecast-hit${f.heal ? ' gain' : ''}` }, el('small', {}, f.heal ? t('Cura', 'Heal') : t('Acerto', 'Hit')), f.heal ? `+${range(f.heal)}` : `${f.chance}%`),
    el('div', { class: 'forecast-body' },
      f.heal ? null : el('span', {}, f.support ? abilityDetail(ability) : dmgText(f)),
      f.support ? null : el('strong', { class: 'forecast-hp' }, hpAfterText(f)),
      f.ally ? el('span', { class: 'forecast-warn' }, t('Pega um ALIADO!', 'Hits an ALLY!')) : null,
      // área com vários alvos: o painel é de um só, e a linha diz quem mais leva (até 3 nomes)
      names.length ? el('span', { class: 'forecast-more' }, t(`+${names.length} ${names.length === 1 ? 'alvo' : 'alvos'}: `, `+${names.length} ${names.length === 1 ? 'target' : 'targets'}: `)
        + names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '')) : null));
}

// Painel ao lado do boneco, como o menu do FFT: à direita dele; sem lugar, à esquerda; sempre dentro de `area` (a parte
// da tela livre do HUD). Centrado na altura do boneco; se cobriria algo de `avoid` (a lista de turnos, o alvo do
// "Executar?"), desce ou sobe ao lado dele até sair de cima, o mais perto possível. `prefer` 'left' tenta a esquerda
// antes (o "Executar?" foge do lado do alvo). Puro para o teste.
export interface Anchor { x: number; y: number; r: number } // centro do boneco na tela e meia largura dele, em px
export interface Rect { left: number; top: number; right: number; bottom: number }
export function placeBeside(a: Anchor, w: number, h: number, area: Rect, prefer: 'right' | 'left' = 'right', avoid: Rect[] = [], gap = 12) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const xs = { right: a.x + a.r + gap, left: a.x - a.r - gap - w };
  const fits = (s: 'right' | 'left') => xs[s] >= area.left && xs[s] + w <= area.right;
  const sides: ('right' | 'left')[] = prefer === 'right' ? ['right', 'left'] : ['left', 'right'];
  const covers = (l: number, t: number) => avoid.some((o) => l < o.right && l + w > o.left && t < o.bottom && t + h > o.top);
  const mid = a.y - h / 2;
  const tops = [mid, ...avoid.flatMap((o) => [o.bottom + gap, o.top - gap - h])].map((t) => clamp(t, area.top, area.bottom - h))
    .sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
  for (const side of sides.filter(fits)) {
    const top = tops.find((t) => !covers(xs[side], t));
    if (top !== undefined) return { left: xs[side], top, side };
  }
  // nada livre (tela estreita, boneco fora da tela): o lado que couber, preso dentro da área
  const side = fits(sides[0]) || !fits(sides[1]) ? sides[0] : sides[1];
  return { left: clamp(xs[side], area.left, area.right - w), top: tops[0], side };
}

// retrato do boneco KayKit renderizado (public/chars, scripts/portraits.mjs); o Farol não tem boneco: um cristal em CSS
export function portrait(def: string) {
  const model = modelOf(def);
  // unidade tingida (UnitDef.tint, o Acólito sobre o mago): o retrato ganha o filtro .tinted para casar com o boneco
  return model ? el('img', { class: `portrait${UNIT_DEFS[def]?.tint ? ' tinted' : ''}`, src: `/chars/${model}.webp`, alt: '' }) : el('span', { class: 'portrait gem', 'aria-hidden': 'true' });
}

// lado e, para quem tem nome próprio (campanha, menu de desenvolvedor), a classe: "Ladino · herói"
function sideText(u: UnitState) {
  const base = classOf(u.def);
  const side = u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy');
  return base && unitName(base) !== unitName(u.def) ? `${unitName(base)} · ${side}` : side;
}

// painel de unidade (o da vez embaixo à esquerda, o do alvo embaixo à direita); com `f`, a prévia do golpe nele
function unitPanel(state: BattleState, u: UnitState, extra: HTMLElement[] = [], f?: Forecast) {
  const def = UNIT_DEFS[u.def];
  const change = !f || f.support ? undefined : f.heal ? { from: u.hp, to: f.after[1], kind: 'gain' as const } : { from: f.after[0], to: u.hp, kind: 'loss' as const };
  const rows = [gauge('hp', t('Vida', 'HP'), u.hp, def.hp, change)];
  if (u.vars?.mp !== undefined) rows.push(gauge('mp', 'MP', u.vars.mp, def.vars?.mp ?? u.vars.mp));
  if (def.speed > 0) rows.push(gauge('ct', 'CT', Math.min(u.ct, TURN_THRESHOLD), TURN_THRESHOLD));
  const charge = state.charges.find((c) => c.unit === u.id);
  return el('div', { class: `panel unit-panel ${u.team}` }, portrait(u.def),
    el('div', { class: 'unit-body' },
      el('strong', { class: 'unit-name' }, unitName(u.def), el('span', { class: 'unit-side' }, sideText(u))),
      ...rows,
      charge ? el('p', { class: 'unit-note' }, t(`Carregando ${abilityName(charge.ability)} (${charge.ticks} tiques)`, `Charging ${abilityName(charge.ability)} (${charge.ticks} ticks)`)) : null,
      ...extra));
}

// Fila do topo com a carga que ainda vai ser confirmada (13/11, pedido do Fernando, como a lista de CT do FFT): a magia
// entra onde vai sair (`at`) e quem ela pega fica em `targets`, para ver se o alvo joga antes dela (e sai da casa) ou não.
// Fora do "Executar?" de uma habilidade com carga, é a fila de sempre.
export function queueRows(b: Battle, pending: { ability: string; target: Pos } | null, n: number) {
  const a = pending ? ABILITIES[pending.ability] : null;
  if (!pending || !a?.charge) return { rows: previewOrder(b.state, n), targets: new Set<string>(), at: -1 };
  const me = b.actor.id;
  const follow = a.panel ? null : unitAt(b.state, pending.target)?.id ?? null;
  // a mesma carga que Battle.act registraria (uma carga nova troca a anterior da mesma unidade)
  const charge = { unit: me, ability: pending.ability, target: pending.target, follow, ticks: a.charge };
  const rows = previewOrder({ ...b.state, charges: [...b.state.charges.filter((c) => c.unit !== me), charge] }, 24);
  const at = rows.findIndex((r) => r.unit === me && r.charge === pending.ability);
  const targets = new Set(b.preview(pending.ability, pending.target).targets.map((tg) => tg.unit));
  return { rows: rows.slice(0, Math.max(n, at + 1)), targets, at };
}

export class BattleHud {
  private readonly tile = el('div', { class: 'panel tile-info', 'aria-live': 'off' });
  private readonly queue = el('ol', { class: 'panel queue short', 'aria-label': t('Ordem dos turnos', 'Turn order') });
  private fastBtn!: HTMLElement;
  setFast(on: boolean) {
    this.fastBtn.setAttribute('aria-checked', String(on));
  }
  get queueFull() {
    return !this.queue.classList.contains('short');
  }
  setQueueFull(full: boolean) {
    this.queue.classList.toggle('short', !full);
  }
  private readonly help = el('div', { class: 'panel help', 'aria-live': 'polite' });
  private readonly bannerEl = el('div', { class: 'panel banner', role: 'status', hidden: true });
  private readonly commands = el('div', { class: 'panel commands', role: 'menu' });
  private readonly abilities = el('div', { class: 'panel abilities', role: 'menu' });
  private readonly confirmBox = el('div', { class: 'panel confirm', role: 'dialog' });
  private readonly active = el('div', { class: 'active-slot' });
  private readonly target = el('div', { class: 'target-slot' });
  private readonly root: HTMLElement;

  private readonly toolsMenu = el('div', { class: 'panel tools-menu', role: 'menu', hidden: true });
  private readonly burger = iconButton(el('span', { class: 'burger-bars', 'aria-hidden': 'true' }), t('Menu', 'Menu'),
    () => this.showTools(!!this.toolsMenu.hidden), { class: 'icon burger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // fecha ao clicar fora ou ao apertar qualquer tecla (Esc também volta no jogo; a tecla da ação continua agindo). A
  // tecla fecha mesmo com o foco no botão do menu, que fica com ele depois do clique
  private readonly closeOutside = (e: Event) => {
    if (e.type === 'keydown' || !(e.target instanceof Node && this.toolsMenu.parentElement?.contains(e.target))) this.showTools(false);
  };
  private showTools(open: boolean) {
    this.toolsMenu.hidden = !open;
    this.burger.setAttribute('aria-expanded', String(open));
    for (const ev of ['pointerdown', 'keydown']) {
      if (open) document.addEventListener(ev, this.closeOutside, true);
      else document.removeEventListener(ev, this.closeOutside, true);
    }
  }
  private toolItem(glyph: Child, label: string, key: string, run: () => void, props: Record<string, unknown> = {}) {
    return el('button', { type: 'button', class: 'item', role: 'menuitem', ...props, onclick: () => { this.showTools(false); run(); } },
      el('span', { class: 'tool-label' }, el('span', { class: 'tool-glyph', 'aria-hidden': 'true' }, glyph), label), key ? hint(key) : null);
  }

  constructor(host: HTMLElement, private readonly act: HudActions) {
    this.fastBtn = this.toolItem('»', t('Batalha rápida', 'Fast battle'), '', () => act.fast(), { role: 'menuitemcheckbox', 'aria-checked': 'false' });
    this.toolsMenu.append(
      this.toolItem(icon(UI_ICON.undo), t('Desfazer', 'Undo'), 'Z', () => act.undo()),
      this.toolItem('⟲', t('Girar à esquerda', 'Rotate left'), '⇧R', () => act.rotate(-1)),
      this.toolItem('⟳', t('Girar à direita', 'Rotate right'), 'R', () => act.rotate(1)),
      this.toolItem(icon(UI_ICON.recenter), t('Ver o mapa inteiro', 'Show the whole map'), 'F', () => act.recenter()),
      this.toolItem(icon(UI_ICON.pixel), t('Tamanho do pixel', 'Pixel size'), 'V', () => act.pixel()),
      this.fastBtn,
      this.toolItem(icon(UI_ICON.menu), t('Opções e ajuda', 'Options and help'), 'H', () => act.menu()));
    this.root = el('div', { class: `hud${KEYS ? ' kbd' : ''}` },
      this.tile, this.queue, this.help, this.bannerEl,
      // um botão de menu (3 traços) no pergaminho do HUD no lugar da fileira de 7 botões de pedra (13/11, pedido do
      // Fernando: "tosco e despadronizado"); as teclas continuam valendo e aparecem em cada linha
      el('div', { class: 'tools' }, this.burger, this.toolsMenu),
      this.commands, this.abilities, this.confirmBox, this.active, this.target);
    host.append(this.root);
  }

  render(v: HudView) {
    const b = v.battle;
    const heroTurn = !b.over && b.actor.team === 'hero';
    const open = heroTurn && !v.busy;
    const hit = chargeDanger(b.state, b.grid.width, b.grid.height).get(posKey(v.cursor));
    this.tile.textContent = b.over ? '' : tileInfo(b.grid, v.cursor) + (hit ? t(` · ⚠ ${abilityName(hit)} vai cair aqui`, ` · ⚠ ${abilityName(hit)} lands here`) : '');
    this.renderQueue(b, v.screen);
    this.help.textContent = this.helpText(v, heroTurn);
    this.renderCommands(v, open);
    this.renderAbilities(v, open);
    this.renderConfirm(v, open);
    // unidade da vez: o inimigo que está jogando (o estado já pode ter passado a vez durante a animação)
    const actingUnit = v.acting ? b.state.units.find((u) => u.def === v.acting && u.team === 'enemy') : undefined;
    const me = b.over ? undefined : actingUnit ?? b.actor;
    this.active.replaceChildren(...(me ? [unitPanel(b.state, me)] : []));
    // unidade sob o cursor (ou o alvo do "Executar?")
    const at = v.screen.k === 'confirm' ? v.screen.target : v.cursor;
    // unitAt: qualquer casa da unidade grande mostra o painel dela
    const found = unitAt(b.state, at);
    // mirando (mapa de Agir ou "Executar?"): o painel do alvo traz a prévia do golpe; numa área, o alvo sob o cursor ou o
    // primeiro, e os outros numa linha. Vale até para quem cura a si mesmo (fora da mira, o próprio painel não se repete)
    const ability = v.screen.k === 'confirm' ? v.screen.ability : v.screen.k === 'map' ? v.ability : null;
    const fs = open && ability && v.hl?.preview?.ok ? forecast(b, ability, v.hl.preview) : [];
    const main = fs.find((f) => f.unit.id === found?.id) ?? fs[0];
    const other = main?.unit ?? (found?.id !== me?.id ? found : undefined);
    this.target.replaceChildren(...(other ? [unitPanel(b.state, other, main ? [forecastBlock(main, ability!, fs.filter((f) => f !== main))] : [], main)] : []));
    // tamanho dos painéis que andam com o boneco, medido uma vez por desenho (o `place` de cada quadro só lê o cache)
    const box = (e: HTMLElement) => ({ w: e.offsetWidth, h: e.offsetHeight });
    this.sizes = { commands: box(this.commands), abilities: box(this.abilities), confirm: box(this.confirmBox),
      bottom: Math.max(this.active.offsetHeight, this.target.offsetHeight) };
  }

  private sizes = { commands: { w: 0, h: 0 }, abilities: { w: 0, h: 0 }, confirm: { w: 0, h: 0 }, bottom: 0 };
  get menuOpen() {
    return !this.commands.hidden || !this.confirmBox.hidden;
  }

  // Põe o menu, o submenu ou o "Executar?" ao lado do boneco da vez (`a`, em px da tela). Chamado a cada quadro enquanto
  // o menu está aberto (a câmera desliza e gira): só left/top mudam, e só quando o px muda. `target`: o alvo do
  // "Executar?", que a janela não cobre (nem a lista de turnos, que mostra onde a carga sai)
  place(a: Anchor | null, target: Anchor | null = null) {
    if (!a || !this.menuOpen) return;
    // livre: abaixo da linha de ajuda e do botão de menu (que ficam no alto), acima dos painéis de unidade de baixo
    const area = { left: 12, top: 72, right: this.root.clientWidth - 12, bottom: this.root.clientHeight - 24 - this.sizes.bottom };
    const q = this.queue.getBoundingClientRect();
    // o boneco na tela vai de ~1,5 meia largura acima do meio (barra de vida) a ~1,5 abaixo (aro no chão)
    const avoid = [{ left: q.left, top: q.top, right: q.right, bottom: q.bottom },
      ...(target ? [{ left: target.x - target.r, top: target.y - 1.5 * target.r, right: target.x + target.r, bottom: target.y + 1.5 * target.r }] : [])];
    const prefer = target && target.x > a.x ? 'left' : 'right';
    const put = (e: HTMLElement, left: number, top: number) => {
      const l = `${Math.round(left)}px`, tp = `${Math.round(top)}px`;
      if (e.style.left !== l) e.style.left = l;
      if (e.style.top !== tp) e.style.top = tp;
    };
    const { commands: c, abilities: s, confirm: f } = this.sizes;
    if (!this.confirmBox.hidden) {
      const p = placeBeside(a, f.w, f.h, area, prefer, avoid);
      return put(this.confirmBox, p.left, p.top);
    }
    const sub = !this.abilities.hidden;
    // com o submenu aberto, os dois decidem o lado juntos (senão o submenu caía em cima do boneco); o menu fica do lado dele
    const gap = 8;
    const p = placeBeside(a, sub ? c.w + gap + s.w : c.w, Math.max(c.h, sub ? s.h : 0), area, 'right', avoid);
    const right = p.side === 'right';
    put(this.commands, right || !sub ? p.left : p.left + s.w + gap, p.top);
    if (!sub) return;
    put(this.abilities, right ? p.left + c.w + gap : p.left, p.top);
    // o submenu abre vindo do menu: da esquerda quando está à direita dele, e vice-versa
    this.abilities.classList.toggle('from-right', !right);
  }

  // linha do alto: o que fazer agora (como a ajuda do FFT), e o resumo da última ação
  private helpText(v: HudView, heroTurn: boolean): string {
    const b = v.battle;
    if (b.over) return b.state.outcome === 'victory' ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat');
    if (v.busy || !heroTurn) return v.log || (v.acting ? t(`Vez do inimigo: ${unitName(v.acting)}`, `Enemy turn: ${unitName(v.acting)}`) : '');
    const s = v.screen;
    const say = (pt: string, en: string) => (v.log ? `${v.log} — ` : '') + t(pt, en);
    if (s.k === 'menu') return say(`${unitName(b.actor.def)}: escolha um comando.`, `${unitName(b.actor.def)}: pick a command.`);
    if (s.k === 'abilities') {
      const id = abilitiesOf(b)[s.index];
      return id ? `${abilityName(id)}: ${abilityDetail(id)}` : '';
    }
    if (s.k === 'map' && s.command === 'move') return t('Mover: escolha uma casa clara.', 'Move: pick a highlighted tile.');
    if (s.k === 'map') {
      const p = v.hl?.preview;
      return p && !p.ok ? REASON[p.reason ?? 'unknown']() : t('Escolha o alvo na área laranja (roxo = sem visão).', 'Pick the target in the orange area (purple = no sight).');
    }
    if (s.k === 'confirm') return t(`${abilityName(s.ability)}: executar?`, `${abilityName(s.ability)}: execute?`);
    return t('Para onde olhar? Setas escolhem; confirmar passa a vez.', 'Which way to face? Arrows choose; confirm ends the turn.');
  }

  private renderQueue(b: Battle, s: Screen) {
    const { rows, targets, at } = b.over ? { rows: [], targets: new Set<string>(), at: -1 } : queueRows(b, s.k === 'confirm' ? s : null, QUEUE_SIZE);
    // no modo Até o amanhecer, o título conta os turnos que faltam: o mesmo número que a regra usa (todos os turnos)
    const left = b.state.scenario === SURVIVAL_ID ? turnsLeft(b.state) : null;
    // com a carga em prévia a lista curta não esconde nada até a linha dela (a lista some de novo ao sair do "Executar?")
    this.queue.classList.toggle('preview', at >= 0);
    this.queue.replaceChildren(el('li', { class: 'queue-title', 'aria-hidden': left === null ? 'true' : undefined }, left === null ? t('Turnos', 'Turns') : t(`Turnos · faltam ${left}`, `Turns · ${left} to dawn`)), ...rows.map(({ unit, charge }, i) => {
      const u = b.state.units.find((x) => x.id === unit)!;
      const label = i === at ? t(`⏳ ${abilityName(charge!)} sai aqui`, `⏳ ${abilityName(charge!)} goes off here`) : charge ? `${unitName(u.def)}: ${abilityName(charge)}` : unitName(u.def);
      const mark = !charge && i > 0 && targets.has(unit) ? el('span', { class: 'queue-target' }, t('◎ alvo', '◎ target')) : null;
      return el('li', { class: `queue-row ${u.team}${i === 0 ? ' now' : ''}${charge ? ' charge' : ''}${i === at ? ' pending' : ''}` }, portrait(u.def), el('span', {}, label), mark);
    }));
  }

  private renderCommands(v: HudView, open: boolean) {
    const s = v.screen;
    this.commands.hidden = !open || !(s.k === 'menu' || s.k === 'abilities');
    if (this.commands.hidden) return;
    const b = v.battle;
    const current = s.k === 'menu' ? s.index : 1;
    // andou e não agiu: Mover vira "Desfazer movimento" (Esc também desfaz), como no Tactics Ogre
    const undo = canUndoMove(b);
    this.commands.replaceChildren(...COMMANDS.map((c, i) => el('button', {
      type: 'button', class: `item${i === current ? ' focus' : ''}`, role: 'menuitem', disabled: !commandEnabled(b, c),
      onclick: () => this.act.command(i),
    }, c === 'move' && undo ? t('Desfazer movimento', 'Undo move') : COMMAND_NAME[c](),
    c === 'move' && undo ? hint('Esc') : c === 'wait' ? hint('P') : c === 'status' ? hint('C') : null)));
  }

  private renderAbilities(v: HudView, open: boolean) {
    const s = v.screen;
    this.abilities.hidden = !open || s.k !== 'abilities';
    if (s.k !== 'abilities' || this.abilities.hidden) return;
    const b = v.battle;
    this.abilities.replaceChildren(...abilitiesOf(b).map((id, i) => {
      const a = ABILITIES[id];
      const cost = a.cost ? `${a.cost[1]} ${a.cost[0] === 'mp' ? 'MP' : t('un.', 'pcs')}` : a.charge ? t(`${a.charge} tiq.`, `${a.charge} tk`) : '';
      return el('button', { type: 'button', class: `item${i === s.index ? ' focus' : ''}`, role: 'menuitem', disabled: !abilityEnabled(b, id), onclick: () => this.act.ability(i) },
        el('span', {}, abilityName(id)), el('span', { class: 'item-cost' }, cost));
    }));
  }

  // janela do "Executar?": acerto e efeito em cada alvo, vida antes → depois, e Sim/Não
  private renderConfirm(v: HudView, open: boolean) {
    const s = v.screen;
    this.confirmBox.hidden = !open || s.k !== 'confirm';
    if (s.k !== 'confirm' || this.confirmBox.hidden) return;
    const b = v.battle;
    const a = ABILITIES[s.ability];
    const rows = forecast(b, s.ability, b.preview(s.ability, s.target)).map((f) => f.support
      ? el('p', {}, `${unitName(f.unit.def)}: ${abilityDetail(s.ability)}`)
      : el('p', {}, el('strong', {}, unitName(f.unit.def)), ` ${forecastText(f)} · ${hpAfterText(f)}${f.ally ? t(' · ALIADO!', ' · ALLY!') : ''}`));
    if (a.charge) rows.push(el('p', { class: 'unit-note' }, a.panel ? t(`Sai em ${a.charge} tiques; se o alvo sair da casa, erra.`, `Goes off in ${a.charge} ticks; misses if the target leaves the tile.`)
      : t(`Sai em ${a.charge} tiques e segue o alvo.`, `Goes off in ${a.charge} ticks and follows the target.`)));
    this.confirmBox.replaceChildren(el('strong', {}, t(`${abilityName(s.ability)}: executar?`, `${abilityName(s.ability)}: execute?`)), ...rows,
      el('div', { class: 'yes-no' },
        el('button', { type: 'button', class: `item${s.yes ? ' focus' : ''}`, onclick: () => this.act.answer(true) }, t('Sim', 'Yes'), hint('Enter')),
        el('button', { type: 'button', class: `item${s.yes ? '' : ' focus'}`, onclick: () => this.act.answer(false) }, t('Não', 'No'), hint('Esc'))));
  }

  banner(text: string | null) {
    this.bannerEl.hidden = !text;
    this.bannerEl.textContent = text ?? '';
  }

  // altura que o HUD cobre embaixo (painel da unidade da vez), para a cena centrar o mapa no que sobra. Só o da vez: o do
  // alvo cresce com a prévia do golpe e o mapa pulava cada vez que o cursor passava por um alvo
  insets() {
    return { top: 0, bottom: this.active.getBoundingClientRect().height };
  }

  dispose() {
    this.showTools(false);
    this.root.remove();
  }
}
