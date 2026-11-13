// HUD da batalha no jeito da tela de batalha do FFT (pedido do Fernando, 12/11: "descarte as interfaces atuais e recrie
// a interface do mesmo jeito da do final fantasy tactics original"). Só a disposição e o fluxo vêm de lá; molduras,
// cores e retratos são nossos (CSS e bonecos KayKit). Peças, de cima para baixo:
//   canto de cima à esquerda: a casa sob o cursor (altura e piso) e, embaixo, a lista dos próximos turnos (AT);
//   alto, no meio: a linha de ajuda do que fazer agora e, abaixo, a faixa com o nome da habilidade;
//   direita: o menu de comandos (Mover · Agir · Esperar · Status), o submenu das habilidades e o "Executar?";
//   embaixo à esquerda: a unidade da vez (retrato, vida, MP e CT em barras); embaixo à direita: a unidade sob o cursor.
// Redesenha tudo a cada mudança (é pouco DOM).
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { COMBAT, type Preview } from '../shared/battle/combat.ts';
import { TERRAIN, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { rulesOf } from '../shared/battle/rules.ts';
import { TURN_THRESHOLD, previewOrder } from '../shared/battle/turn-queue.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { COMMANDS, abilitiesOf, abilityEnabled, commandEnabled, type Command, type Screen } from './command.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { UI_ICON, el, icon, iconButton } from './icons.ts';
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
    [t('Salto', 'Jump'), String(rulesOf(state).jump?.(u.def) ?? MAX_JUMP)],
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
const TERRAIN_NAME: Record<string, () => string> = { floor: () => t('chão', 'ground'), forest: () => t('floresta (cobertura)', 'forest (cover)'), wall: () => t('muro', 'wall') };
export function tileInfo(grid: Grid, p: Pos): string {
  const tile = tileAt(grid, p);
  const kind = tile.look ? LOOK_NAME[tile.look]?.() ?? tile.look : TERRAIN_NAME[tile.terrain]();
  const blocked = (TERRAIN[tile.terrain].walkable ? '' : t(' · não dá para pisar', ' · not walkable'))
    + (tile.spikes ? t(` · espinhos: −${COMBAT.SPIKE_DAMAGE} ao terminar a vez ou ser empurrado aqui`, ` · spikes: −${COMBAT.SPIKE_DAMAGE} when ending a turn or pushed here`) : '');
  return t(`Casa ${p.x},${p.y} · altura ${tile.h}${tile.ramp ? ' (rampa)' : ''} · ${kind}${blocked}`, `Tile ${p.x},${p.y} · height ${tile.h}${tile.ramp ? ' (slope)' : ''} · ${kind}${blocked}`);
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

// barra com rótulo e número (vida, MP, CT), como as do painel de unidade do FFT
function gauge(cls: string, label: string, value: number, max: number) {
  const k = Math.max(0, Math.min(1, value / max));
  return el('div', { class: `gauge ${cls}` }, el('span', { class: 'gauge-label' }, label),
    el('span', { class: 'gauge-bar' }, el('i', { style: `width:${Math.round(k * 100)}%` })), el('span', { class: 'gauge-num' }, `${Math.max(0, value)}/${max}`));
}

// retrato do boneco KayKit renderizado (public/chars, scripts/portraits.mjs); o Farol não tem boneco: um cristal em CSS
export function portrait(def: string) {
  const model = modelOf(def);
  return model ? el('img', { class: 'portrait', src: `/chars/${model}.webp`, alt: '' }) : el('span', { class: 'portrait gem', 'aria-hidden': 'true' });
}

// lado e, para quem tem nome próprio (campanha, menu de desenvolvedor), a classe: "Ladino · herói"
function sideText(u: UnitState) {
  const base = classOf(u.def);
  const side = u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy');
  return base && unitName(base) !== unitName(u.def) ? `${unitName(base)} · ${side}` : side;
}

// painel de unidade (o da vez embaixo à esquerda, o do alvo embaixo à direita)
function unitPanel(state: BattleState, u: UnitState, extra: HTMLElement[] = []) {
  const def = UNIT_DEFS[u.def];
  const rows = [gauge('hp', t('Vida', 'HP'), u.hp, def.hp)];
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

export class BattleHud {
  private readonly tile = el('div', { class: 'panel tile-info', 'aria-live': 'off' });
  private readonly queue = el('ol', { class: 'panel queue short', 'aria-label': t('Ordem dos turnos', 'Turn order') });
  private fastBtn!: HTMLElement;
  setFast(on: boolean) {
    this.fastBtn.setAttribute('aria-pressed', String(on));
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

  constructor(host: HTMLElement, private readonly act: HudActions) {
    this.root = el('div', { class: `hud${KEYS ? ' kbd' : ''}` },
      this.tile, this.queue, this.help, this.bannerEl,
      el('div', { class: 'tools' },
        iconButton(['⟲', hint('⇧R')], t('Girar câmera para a esquerda (Shift+R)', 'Rotate camera left (Shift+R)'), () => act.rotate(-1)),
        iconButton(['⟳', hint('R')], t('Girar câmera para a direita (R)', 'Rotate camera right (R)'), () => act.rotate(1)),
        iconButton([icon(UI_ICON.recenter), hint('F')], t('Ver o mapa inteiro (F)', 'Show the whole map (F)'), () => act.recenter()),
        iconButton([icon(UI_ICON.pixel), hint('V')], t('Trocar o tamanho do pixel art (V)', 'Change the pixel art size (V)'), () => act.pixel()),
        this.fastBtn = iconButton(['⏩'], t('Batalha 3 vezes mais rápida (ou segure Enter)', 'Battle 3 times faster (or hold Enter)'), () => act.fast()),
        iconButton([icon(UI_ICON.menu), hint('H')], t('Menu e ajuda (H)', 'Menu and help (H)'), () => act.menu())),
      this.commands, this.abilities, this.confirmBox, this.active, this.target);
    host.append(this.root);
  }

  render(v: HudView) {
    const b = v.battle;
    const heroTurn = !b.over && b.actor.team === 'hero';
    const open = heroTurn && !v.busy;
    const hit = chargeDanger(b.state, b.grid.width, b.grid.height).get(posKey(v.cursor));
    this.tile.textContent = b.over ? '' : tileInfo(b.grid, v.cursor) + (hit ? t(` · ⚠ ${abilityName(hit)} vai cair aqui`, ` · ⚠ ${abilityName(hit)} lands here`) : '');
    this.renderQueue(b);
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
    const other = b.state.units.find((u) => u.pos.x === at.x && u.pos.y === at.y && u.id !== me?.id);
    this.target.replaceChildren(...(other ? [unitPanel(b.state, other)] : []));
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

  private renderQueue(b: Battle) {
    const order = b.over ? [] : previewOrder(b.state, QUEUE_SIZE);
    this.queue.replaceChildren(el('li', { class: 'queue-title', 'aria-hidden': 'true' }, t('Turnos', 'Turns')), ...order.map(({ unit, charge }, i) => {
      const u = b.state.units.find((x) => x.id === unit)!;
      const label = charge ? `${unitName(u.def)}: ${abilityName(charge)}` : unitName(u.def);
      return el('li', { class: `queue-row ${u.team}${i === 0 ? ' now' : ''}${charge ? ' charge' : ''}` }, portrait(u.def), el('span', {}, label));
    }));
  }

  private renderCommands(v: HudView, open: boolean) {
    const s = v.screen;
    this.commands.hidden = !open || !(s.k === 'menu' || s.k === 'abilities');
    if (this.commands.hidden) return;
    const b = v.battle;
    const current = s.k === 'menu' ? s.index : 1;
    this.commands.replaceChildren(...COMMANDS.map((c, i) => el('button', {
      type: 'button', class: `item${i === current ? ' focus' : ''}`, role: 'menuitem', disabled: !commandEnabled(b, c),
      onclick: () => this.act.command(i),
    }, COMMAND_NAME[c](), c === 'wait' ? hint('P') : c === 'status' ? hint('C') : null)));
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
    const p: Preview = b.preview(s.ability, s.target);
    const a = ABILITIES[s.ability];
    const rows = p.targets.map((tg) => {
      const u = b.state.units.find((x) => x.id === tg.unit)!;
      const max = UNIT_DEFS[u.def].hp;
      if (a.ally && !tg.healMax) return el('p', {}, `${unitName(u.def)}: ${abilityDetail(s.ability)}`);
      const after = tg.healMax ? range([Math.min(max, u.hp + tg.healMin), Math.min(max, u.hp + tg.healMax)]) : range([Math.max(0, u.hp - tg.dmgMax), Math.max(0, u.hp - tg.dmgMin)]);
      const warn = u.team === b.actor.team && !tg.healMax ? t(' · ALIADO!', ' · ALLY!') : '';
      return el('p', {}, el('strong', {}, unitName(u.def)), ' ',
        tg.healMax ? t(`cura ${range([tg.healMin, tg.healMax])}`, `heals ${range([tg.healMin, tg.healMax])}`)
          : t(`acerto ${tg.chance}% · dano ${range([tg.dmgMin, tg.dmgMax])}`, `hit ${tg.chance}% · damage ${range([tg.dmgMin, tg.dmgMax])}`),
        ` · ${t('vida', 'HP')} ${u.hp} → ${after}${warn}`);
    });
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

  // altura que o HUD cobre embaixo (painéis de unidade), para a cena centrar o mapa no que sobra
  insets() {
    return { top: 0, bottom: Math.max(this.active.getBoundingClientRect().height, this.target.getBoundingClientRect().height) };
  }

  dispose() {
    this.root.remove();
  }
}
