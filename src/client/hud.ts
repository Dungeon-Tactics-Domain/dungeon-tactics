// HUD da batalha no DOM: fila de turnos no topo; embaixo o cartão do que está acontecendo, a barra de habilidades
// (Mover + até 5) e os botões Desfazer, girar câmera e Confirmar/Passar a vez. Redesenha tudo a cada mudança (é pouco DOM).
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Preview } from '../shared/battle/combat.ts';
import { previewOrder } from '../shared/battle/turn-queue.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import type { BattleEvent, BattleState, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { ABILITY_ICON, UI_ICON, el, icon, iconButton } from './icons.ts';
import { selectMode, type Highlights, type Mode, type Ui } from './interaction.ts';

export interface HudActions {
  mode(m: Mode): void;
  confirm(): void;
  endTurn(): void;
  undo(): void;
  rotate(dir: 1 | -1): void;
  recenter(): void;
  pixel(): void;
  menu(): void;
}
export interface HudView {
  battle: Battle;
  ui: Ui;
  hl: Highlights | null;
  busy: boolean; // animação ou vez do inimigo: nada responde
  log: string; // resumo da última ação (eventLog)
  acting: string | null; // def do inimigo que está jogando agora (o estado já passou a vez quando a animação toca)
}

const QUEUE_SIZE = 8;
// PC com mouse: mostra a tecla de cada botão (no celular a dica só ocupava espaço)
const KEYS = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const hint = (k: string) => el('kbd', { class: 'hint', 'aria-hidden': 'true' }, k);
const HOLD_MS = 450; // segurar o ícone mostra os detalhes (spec); menos que isso é toque

const sameMode = (a: Mode, b: Mode) => a.k === b.k && (a.k !== 'ability' || (b.k === 'ability' && a.id === b.id));
const hpText = (u: UnitState) => `${u.hp}/${UNIT_DEFS[u.def].hp}`;
const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

// ficha de uma habilidade, para o toque longo
export function abilityDetail(id: string): string {
  const a = ABILITIES[id];
  const parts = [a.range[1] === 0 ? t('em volta de você', 'around you') : t(`alcance ${range(a.range)}`, `range ${range(a.range)}`)];
  if (a.damage[1]) parts.push(t(`dano ${range(a.damage)}`, `damage ${range(a.damage)}`), t(`acerto ${a.accuracy}%`, `accuracy ${a.accuracy}%`));
  if (a.heal[1]) parts.push(t(`cura ${range(a.heal)}`, `heals ${range(a.heal)}`));
  if (a.radius) parts.push(t('área (pega aliados)', 'area (hits allies)'));
  if (a.push) parts.push(t(`empurra ${a.push}`, `pushes ${a.push}`));
  if (a.needsSight) parts.push(t('precisa de visão', 'needs sight'));
  if (a.heightRange) parts.push(t('+1 de alcance por nível acima', '+1 range per level above'));
  if (a.delay) parts.push(t(`atrasa seu próximo turno (+${a.delay})`, `delays your next turn (+${a.delay})`));
  return parts.join(' · ');
}

// Resumo em texto do que a última ação fez: o número flutuante some em 1 s e o leitor de tela não o lê.
// Quem morreu já saiu do estado; o nome vem do cenário.
export function eventLog(events: BattleEvent[], state: BattleState): string {
  const name = (id: string) => unitName((state.units.find((u) => u.id === id) ?? SCENARIOS[state.scenario].spawns.find((s) => s.id === id))!.def);
  let head = '';
  const parts: string[] = [];
  for (const e of events) {
    if (e.k === 'attack') head = `${name(e.unit)}: ${abilityName(e.ability)} → `;
    else if (e.k === 'hit') parts.push(`${name(e.unit)} −${e.dmg}`);
    else if (e.k === 'miss') parts.push(t(`${name(e.unit)} errou (${e.chance}%)`, `missed ${name(e.unit)} (${e.chance}%)`));
    else if (e.k === 'heal') parts.push(`${name(e.unit)} +${e.amount}`);
    else if (e.k === 'bump') parts.push(t(`${name(e.unit)} bateu −${e.dmg}`, `${name(e.unit)} crashed −${e.dmg}`));
    else if (e.k === 'fall') parts.push(t(`${name(e.unit)} caiu de altura −${e.dmg}`, `${name(e.unit)} fell −${e.dmg}`));
    else if (e.k === 'die') parts.push(t(`${name(e.unit)} caiu`, `${name(e.unit)} is down`));
  }
  return parts.length ? head + parts.join(' · ') : '';
}

const REASON: Record<string, () => string> = {
  range: () => t('Fora do alcance', 'Out of range'),
  sight: () => t('Sem linha de visão', 'No line of sight'),
  'no-target': () => t('Nenhum alvo nesta casa', 'No target on this tile'),
  unknown: () => t('Não dá para usar aqui', 'Cannot use here'),
};

export class BattleHud {
  private readonly queue = el('ol', { class: 'queue', 'aria-label': t('Ordem dos turnos', 'Turn order') });
  private readonly card = el('div', { class: 'card', 'aria-live': 'polite' });
  private readonly bar = el('div', { class: 'bar', role: 'toolbar', 'aria-label': t('Ações do herói', 'Hero actions') });
  private readonly actions = el('div', { class: 'actions' });
  private readonly root: HTMLElement;
  private detail: string | null = null; // habilidade com a ficha aberta pelo toque longo
  private held = false;
  private view: HudView | null = null;
  private waitArmed = false; // primeiro toque em Passar a vez sem ter feito nada só pergunta

  constructor(host: HTMLElement, private readonly act: HudActions) {
    this.root = el('div', { class: `hud${KEYS ? ' kbd' : ''}` },
      el('header', { class: 'top' }, this.queue, iconButton([icon(UI_ICON.menu), hint('H')], t('Menu e ajuda (H)', 'Menu and help (H)'), () => act.menu(), { class: 'icon menu-btn' })),
      el('section', { class: 'bottom' },
        el('div', { class: 'cam' },
          iconButton(['⟲', hint('⇧R')], t('Girar câmera para a esquerda (Shift+R)', 'Rotate camera left (Shift+R)'), () => act.rotate(-1)),
          iconButton(['⟳', hint('R')], t('Girar câmera para a direita (R)', 'Rotate camera right (R)'), () => act.rotate(1)),
          iconButton([icon(UI_ICON.recenter), hint('F')], t('Ver o mapa inteiro (F)', 'Show the whole map (F)'), () => act.recenter()),
          iconButton([icon(UI_ICON.pixel), hint('V')], t('Trocar o tamanho do pixel art (V)', 'Change the pixel art size (V)'), () => act.pixel())),
        this.card, this.bar, this.actions));
    host.append(this.root);
  }

  render(v: HudView) {
    this.view = v;
    this.waitArmed = false; // qualquer outra ação desarma o "Passar sem agir?"
    const b = v.battle;
    const heroTurn = !b.over && b.actor.team === 'hero';
    const lock = v.busy || !heroTurn;
    this.renderQueue(b);
    this.renderCard(v, heroTurn);
    this.renderBar(v, lock);
    this.renderActions(v, lock);
  }

  private renderQueue(b: Battle) {
    const order = b.over ? [] : previewOrder(b.state, QUEUE_SIZE);
    this.queue.replaceChildren(...order.map((id, i) => {
      const u = b.state.units.find((x) => x.id === id)!;
      const k = u.hp / UNIT_DEFS[u.def].hp;
      const who = `${unitName(u.def)} (${u.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy')}), ${t('vida', 'HP')} ${hpText(u)}`;
      return el('li', { class: `chip ${u.team}${i === 0 ? ' now' : ''}`, title: who, 'aria-label': i === 0 ? t(`Agora: ${who}`, `Now: ${who}`) : who },
        el('span', { class: 'chip-name', 'aria-hidden': 'true' }, unitName(u.def).slice(0, 2)),
        el('span', { class: 'chip-hp', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round(k * 100)}%` })));
    }));
  }

  private previewLines(p: Preview, b: Battle): string[] {
    if (!p.ok) return [REASON[p.reason ?? 'unknown']()];
    return p.targets.map((tg) => {
      const u = b.state.units.find((x) => x.id === tg.unit)!;
      const ally = u.team === b.actor.team;
      if (tg.healMax) return t(`Cura ${range([tg.healMin, tg.healMax])} em ${unitName(u.def)} (${hpText(u)})`, `Heals ${range([tg.healMin, tg.healMax])} on ${unitName(u.def)} (${hpText(u)})`);
      const warn = ally ? t(' · ALIADO!', ' · ALLY!') : '';
      return t(`Acerto ${tg.chance}% · dano ${range([tg.dmgMin, tg.dmgMax])} em ${unitName(u.def)} (${hpText(u)})${warn}`,
        `Hit ${tg.chance}% · damage ${range([tg.dmgMin, tg.dmgMax])} on ${unitName(u.def)} (${hpText(u)})${warn}`);
    });
  }

  private renderCard(v: HudView, heroTurn: boolean) {
    const b = v.battle;
    const lines: string[] = [];
    let title: string;
    if (b.over) title = b.state.outcome === 'victory' ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat');
    else if (v.acting || !heroTurn) {
      const def = v.acting ?? b.actor.def;
      title = t(`Vez do inimigo: ${unitName(def)}`, `Enemy turn: ${unitName(def)}`);
    }
    else title = `${unitName(b.actor.def)} · ${t('vida', 'HP')} ${hpText(b.actor)}`;
    const inspected = v.ui.inspect ? b.state.units.find((u) => u.id === v.ui.inspect) : undefined;
    if (v.log) lines.push(v.log);
    if (v.ui.invalid) lines.push(t('Essa casa não serve: fora do alcance ou ocupada.', 'That tile does not work: out of range or taken.'));
    if (this.detail) {
      lines.push(`${abilityName(this.detail)}: ${abilityDetail(this.detail)}`);
    } else if (heroTurn && !v.busy && !v.ui.invalid) {
      const m = v.ui.mode;
      if (m.k === 'move') lines.push(v.ui.pending ? t('Andar até a casa marcada? Confirmar.', 'Move to the marked tile? Confirm.') : t('Mover: escolha uma casa azul.', 'Move: pick a blue tile.'));
      else if (m.k === 'ability') {
        if (v.hl?.preview && v.ui.pending) lines.push(...this.previewLines(v.hl.preview, b));
        else lines.push(t(`${abilityName(m.id)}: escolha um alvo na área laranja (roxo = sem visão).`, `${abilityName(m.id)}: pick a target in the orange area (purple = no sight).`));
      } else if (b.state.turn.usedAbility) lines.push(t('Turno feito: Passar a vez.', 'Turn done: End turn.'));
      else lines.push(t('Nenhum alvo ao alcance daqui: Passar a vez.', 'No target in reach from here: End turn.'));
    }
    if (inspected) {
      const side = inspected.team === 'hero' ? t('herói', 'hero') : t('inimigo', 'enemy');
      lines.push(t(`${unitName(inspected.def)} (${side}) · vida ${hpText(inspected)} · vermelho = onde alcança no próximo turno.`,
        `${unitName(inspected.def)} (${side}) · HP ${hpText(inspected)} · red = what it reaches next turn.`));
    }
    this.card.replaceChildren(el('strong', {}, title), ...lines.map((l) => el('p', {}, l)));
  }

  private renderBar(v: HudView, lock: boolean) {
    const b = v.battle;
    if (b.over) return this.bar.replaceChildren();
    const actorDef = UNIT_DEFS[b.actor.def];
    const modes: Mode[] = b.actor.team === 'hero' ? [{ k: 'move' }, ...actorDef.abilities.map((id) => ({ k: 'ability' as const, id }))] : [];
    this.bar.replaceChildren(...modes.map((m, i) => {
      const id = m.k === 'ability' ? m.id : null;
      const label = id ? abilityName(id) : t('Mover', 'Move');
      // o modo que não muda ao ser escolhido já foi gasto neste turno
      const spent = !sameMode(selectMode(b, { ...v.ui, mode: { k: 'idle' } }, m).mode, m);
      const btn = el('button', {
        type: 'button', class: 'slot', 'aria-pressed': String(sameMode(m, v.ui.mode)), disabled: lock || spent,
        'aria-label': id ? `${label}: ${abilityDetail(id)}` : label,
      }, icon(id ? ABILITY_ICON[id] : UI_ICON.move), el('span', {}, label), hint(String(i + 1)));
      if (id) this.holdForDetail(btn, id);
      btn.addEventListener('click', () => {
        if (this.held) return void (this.held = false); // soltar depois do toque longo não troca o modo
        this.detail = null;
        this.act.mode(m);
      });
      return btn;
    }));
  }

  private holdForDetail(btn: HTMLButtonElement, id: string) {
    let timer = 0;
    const cancel = () => clearTimeout(timer);
    btn.addEventListener('pointerdown', () => {
      this.held = false;
      timer = window.setTimeout(() => {
        this.held = true;
        this.detail = id;
        if (this.view) this.render(this.view);
      }, HOLD_MS);
    });
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
    // no celular o toque longo abre o menu do navegador; o detalhe já vai no cartão
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private renderActions(v: HudView, lock: boolean) {
    const b = v.battle;
    const canConfirm = !!v.ui.pending && v.ui.mode.k !== 'idle' && (v.ui.mode.k === 'move' || !!v.hl?.preview?.ok);
    const undo = el('button', { type: 'button', class: 'secondary undo', disabled: lock || !b.canUndo, onclick: () => this.act.undo(),
      'aria-label': t(`Desfazer (restam ${b.undosLeft})`, `Undo (${b.undosLeft} left)`) }, icon(UI_ICON.undo), el('span', {}, String(b.undosLeft)), hint('Z'));
    // Confirmar nunca troca de lugar com Passar a vez: um toque que falhou no mapa seguido de "Confirmar" passava a vez sem querer
    // sem ter andado nem agido, o 1º toque só pergunta: passar a vez não tem desfazer (auditoria mobile de 25/10)
    const idle = !b.state.turn.moved && !b.state.turn.usedAbility;
    const wait = el('button', { type: 'button', class: `secondary wait${this.waitArmed ? ' armed' : ''}`, disabled: lock, onclick: () => {
      this.detail = null;
      if (idle && !this.waitArmed) {
        this.waitArmed = true;
        return this.renderActions(v, lock);
      }
      this.act.endTurn();
    } }, icon(UI_ICON.wait), this.waitArmed ? t('Passar sem agir?', 'Skip without acting?') : t('Passar a vez', 'End turn'), hint('P'));
    const ok = el('button', { type: 'button', class: 'primary', disabled: lock || !canConfirm, onclick: () => { this.detail = null; this.act.confirm(); } },
      t('Confirmar', 'Confirm'), hint('Enter'));
    this.actions.replaceChildren(undo, wait, ok);
  }

  // P no teclado: o mesmo botão, para valer a mesma pergunta de "Passar sem agir?"
  pressWait() {
    this.actions.querySelector<HTMLButtonElement>('.wait')?.click();
  }

  // I no teclado: a ficha da habilidade escolhida, como o toque longo no ícone
  toggleDetail() {
    const m = this.view?.ui.mode;
    this.detail = this.detail || m?.k !== 'ability' ? null : m.id;
    if (this.view) this.render(this.view);
  }

  // altura que o HUD cobre em cima e embaixo, para a cena centrar o mapa no que sobra
  insets() {
    const top = this.root.querySelector('.top')!.getBoundingClientRect();
    const bottom = this.root.querySelector('.bottom')!.getBoundingClientRect();
    return { top: top.bottom, bottom: innerHeight - bottom.top };
  }

  dispose() {
    this.root.remove();
  }
}
