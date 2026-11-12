// Entrada do jogo: liga a batalha (regras), a cena (Three), o HUD (DOM) e o toque. Dono do laço de turno: o jogador age
// pelo HUD; na vez do inimigo a IA joga sozinha, uma unidade por vez, com pausa para dar para ler.
import { playAiTurn } from '../shared/battle/ai.ts';
import { Battle } from '../shared/battle/battle.ts';
import { FIRST_BATTLE, SCENARIOS } from '../shared/battle/scenarios.ts';
import { ABILITIES } from '../shared/battle/abilities.ts';
import { dist, facingTo, inBounds, neighbors, samePos } from '../shared/battle/grid.ts';
import type { BattleEvent, Pos } from '../shared/battle/types.ts';
import { choice, dialog } from './dialog.ts';
import { BattleHud, eventLog, unitStatus } from './hud.ts';
import { LANG, abilityName, setLang, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { confirm, freshUi, highlights, hoverTile, selectMode, tapTile, type Highlights, type Ui } from './interaction.ts';
import { COMMANDS, abilitiesOf, abilityEnabled, commandEnabled, startScreen, stepIndex, type Screen } from './command.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { cycleUnit, gridStep, keyAction, keyHelp, type KeyAction } from './keyboard.ts';
import { BattleScene } from './scene.ts';
import { store } from './store.ts';
import { TouchInput } from './touch-input.ts';
import { PIXEL_KEY, nextSize, parsePixel, type PixelSettings, type PixelSize } from './pixel-settings.ts';
import { TIMING } from './timing.ts';
import { lookOf } from './fx.ts';
import { jingle, setSound, sfx, soundSettings, type Level, type Sfx } from './sound.ts';

// a batalha que o jogo abre e onde ela fica salva; o estudo do FFT troca os dois no boot (save à parte)
let scenario = FIRST_BATTLE;
let SAVE_KEY = 'dt:battle';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const FPS_KEY = 'dt:fps'; // contador de desempenho ligado (1) ou não (0); começa ligado (pedido do Fernando, 12/11)
const newBattle = () => Battle.start(scenario, (Math.random() * 2 ** 31) | 0);

class Game {
  private ui: Ui;
  // tela do turno do herói no jeito do FFT (command.ts): menu → submenu → mapa → "Executar?" → menu; Esperar → direção
  private screen: Screen;
  private busy = false;
  private log = '';
  private acting: string | null = null;
  private cursor: Pos; // casa do cursor (teclado, mouse e controle andam o mesmo cursor)
  private readonly hud: BattleHud;
  private readonly input: TouchInput;
  private readonly pad = emptyMemory();
  private readonly fps = el('div', { class: 'fps', 'aria-hidden': 'true' });

  constructor(private battle: Battle, private readonly scene: BattleScene, host: HTMLElement, private pixel: PixelSettings) {
    this.ui = freshUi(battle);
    this.screen = startScreen(battle);
    this.cursor = battle.actor.pos;
    this.hud = new BattleHud(host, {
      command: (i) => this.chooseCommand(i),
      ability: (i) => this.chooseAbility(i),
      answer: (yes) => void this.answer(yes),
      cancel: () => this.runKey({ k: 'cancel' }),
      rotate: (dir) => scene.rotate(dir),
      recenter: () => scene.resetView(),
      pixel: () => this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) }),
      menu: () => this.menu(),
    });
    const canvas = host.querySelector('canvas')!;
    this.input = new TouchInput(canvas, {
      tap: (x, y) => {
        const pos = this.scene.pick(x, y);
        if (!pos || this.busy || !this.heroTurn) return;
        if (this.screen.k === 'facing') return this.faceTo(pos);
        // no mapa a casa já está escolhida pelo passar do mouse (ou pelo 1º toque): o clique nela confirma
        if (this.screen.k === 'map' && this.ui.pending && samePos(pos, this.ui.pending)) return void this.mapConfirm();
        this.cursor = pos;
        this.update(this.screen.k === 'map' ? tapTile(this.battle, this.ui, pos) : this.ui);
      },
      hover: (x, y) => {
        const pos = this.scene.pick(x, y);
        if (!pos || this.busy || !this.heroTurn || this.screen.k === 'facing' || this.screen.k === 'confirm' || samePos(pos, this.cursor)) return;
        this.cursor = pos;
        sfx('cursor');
        this.update(this.screen.k === 'map' ? hoverTile(this.battle, this.ui, pos) : this.ui);
      },
      pan: (dx, dy) => scene.pan(dx, dy),
      zoom: (f) => scene.zoom(f),
    });
    // botão direito cancela, como o "voltar" do FFT
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.runKey({ k: 'cancel' });
    });
    addEventListener('keydown', (e) => this.onKey(e));
    host.append(this.fps);
    this.fps.hidden = store.get(FPS_KEY) === '0';
    // contador de desempenho: o texto muda 2 vezes por segundo, não a cada quadro (custo quase zero)
    setInterval(() => this.showFps(), 500);
    requestAnimationFrame(() => this.pollPad());
    this.update(this.ui);
    void this.runEnemies(); // o save pode ter parado na vez do inimigo
  }

  // Teclado (pedido do Fernando, 25/10): toda ação tem tecla. A tradução tecla → ação é pura (keyboard.ts).
  // Com um diálogo aberto, as teclas são dele (Esc fecha, Tab anda entre os botões).
  private onKey(e: KeyboardEvent) {
    if (document.querySelector('.overlay')) return;
    const a = keyAction(e);
    if (!a) return;
    e.preventDefault(); // Tab não pula de botão, Espaço não rola, F3 não abre a busca do navegador
    (document.activeElement as HTMLElement | null)?.blur();
    this.runKey(a);
  }

  // Controle (gamepad.ts): lê o primeiro controle a cada quadro e manda as ações pelo mesmo caminho do teclado. Com um
  // diálogo aberto, o controle anda entre os botões dele (A aperta, B fecha).
  private pollPad() {
    requestAnimationFrame(() => this.pollPad());
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    const actions = padActions({ buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] }, this.pad, performance.now());
    for (const a of actions) {
      const overlay = document.querySelector<HTMLElement>('.overlay');
      if (!overlay) {
        this.runKey(a);
        continue;
      }
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (a.k === 'cancel' || a.k === 'help') dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      else if (a.k === 'confirm') (document.activeElement as HTMLElement | null)?.click();
      else if (a.k === 'cursor') buttons[(at + (a.dir === 'up' || a.dir === 'left' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }

  private showFps() {
    if (this.fps.hidden) return;
    const s = this.scene.stats();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    this.fps.textContent = [
      `${s.fps.toFixed(0)} fps · ${s.ms.toFixed(1)} ms`,
      t(`${s.calls} desenhos · ${(s.triangles / 1000).toFixed(1)} mil triângulos`, `${s.calls} draw calls · ${(s.triangles / 1000).toFixed(1)}k triangles`),
      t(`${s.geometries} geometrias · ${s.textures} texturas`, `${s.geometries} geometries · ${s.textures} textures`),
      ...(mem ? [`JS ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB`] : []),
    ].join('\n');
  }

  private runKey(a: KeyAction) {
    const b = this.battle;
    // câmera, ajuda, status e contador valem sempre, inclusive na vez do inimigo
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView();
    if (a.k === 'help') return this.menu();
    if (a.k === 'pixel') return this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) });
    if (a.k === 'status') return this.status();
    if (a.k === 'fps') {
      this.fps.hidden = !this.fps.hidden;
      store.set(FPS_KEY, this.fps.hidden ? '0' : '1');
      return this.showFps();
    }
    if (this.busy || !this.heroTurn) return;
    if (a.k === 'undo') return this.undo();
    if (a.k === 'face') return this.face();
    const s = this.screen;
    if (a.k === 'slot') {
      // atalho de número: 1 = Mover, 2 em diante = as habilidades na ordem do submenu
      if (a.index === 0) return this.chooseCommand(0);
      if (commandEnabled(b, 'act')) return this.chooseAbility(a.index - 1);
      return;
    }
    if (a.k === 'wait') return this.chooseCommand(2);
    if (s.k === 'menu' || s.k === 'abilities') {
      const list = s.k === 'menu' ? COMMANDS.map((c) => commandEnabled(b, c)) : abilitiesOf(b).map((id) => abilityEnabled(b, id));
      if (a.k === 'cursor' && (a.dir === 'up' || a.dir === 'down')) {
        sfx('cursor');
        this.screen = { ...s, index: stepIndex(s.index, a.dir === 'up' ? -1 : 1, list) };
        return this.update(this.ui);
      }
      if (a.k === 'confirm') return s.k === 'menu' ? this.chooseCommand(s.index) : this.chooseAbility(s.index);
      if (a.k === 'cancel' && s.k === 'abilities') return this.back({ k: 'menu', index: 1 });
      return;
    }
    if (s.k === 'confirm') {
      if (a.k === 'cursor') {
        sfx('cursor');
        this.screen = { ...s, yes: !s.yes };
        return this.update(this.ui);
      }
      if (a.k === 'confirm') return void this.answer(s.yes);
      if (a.k === 'cancel') return void this.answer(false);
      return;
    }
    if (s.k === 'facing') {
      if (a.k === 'cursor') {
        const st = gridStep(a.dir, this.scene.heading);
        this.faceTo({ x: b.actor.pos.x + st.x, y: b.actor.pos.y + st.y });
      } else if (a.k === 'confirm') void this.endTurn();
      else if (a.k === 'cancel') this.back({ k: 'menu', index: 2 });
      return;
    }
    // mapa: escolher a casa
    if (a.k === 'cursor') {
      const step = gridStep(a.dir, this.scene.heading);
      const next = { x: this.cursor.x + step.x, y: this.cursor.y + step.y };
      if (inBounds(b.grid, next)) this.moveCursor(next);
    } else if (a.k === 'cycle') this.moveCursor(cycleUnit(b.state, this.cursor, a.dir));
    else if (a.k === 'confirm') void this.mapConfirm();
    else if (a.k === 'cancel') {
      // volta para onde veio: Mover → menu; habilidade → submenu, na mesma habilidade
      const m = this.ui.mode;
      this.back(m.k === 'ability' ? { k: 'abilities', index: abilitiesOf(b).indexOf(m.id) } : { k: 'menu', index: 0 });
    }
  }

  private back(screen: Screen) {
    sfx('cancel');
    this.screen = screen;
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  // comando do menu (clique, Enter, A do controle ou atalho)
  private chooseCommand(index: number) {
    const b = this.battle;
    const c = COMMANDS[index];
    if (this.busy || !this.heroTurn || !c || !commandEnabled(b, c)) return;
    sfx('confirm');
    if (c === 'status') return this.status();
    if (c === 'wait') return void this.endTurn();
    if (c === 'act') {
      const list = abilitiesOf(b).map((id) => abilityEnabled(b, id));
      this.screen = { k: 'abilities', index: list.indexOf(true) < 0 ? 0 : list.indexOf(true) };
      return this.update(this.ui);
    }
    this.screen = { k: 'map', command: 'move' };
    this.cursorToActor();
    this.update(hoverTile(b, selectMode(b, this.ui, { k: 'move' }), this.cursor));
  }

  // habilidade do submenu: vai para o mapa escolher o alvo; centrada em quem usa vai direto ao "Executar?"
  private chooseAbility(index: number) {
    const b = this.battle;
    const id = abilitiesOf(b)[index];
    if (this.busy || !this.heroTurn || !id || !commandEnabled(b, 'act') || !abilityEnabled(b, id)) return;
    sfx('confirm');
    const ui = selectMode(b, this.ui, { k: 'ability', id });
    if (ABILITIES[id].range[1] === 0) {
      this.screen = { k: 'confirm', ability: id, target: b.actor.pos, yes: true };
      return this.update(ui);
    }
    this.screen = { k: 'map', command: 'act' };
    this.cursorToActor();
    this.update(hoverTile(b, ui, this.cursor));
  }

  // confirmar no mapa: Mover anda na hora (como no FFT); Agir abre o "Executar?"
  private async mapConfirm() {
    const p = this.ui.pending;
    const m = this.ui.mode;
    if (!p) return sfx('cancel');
    if (m.k === 'ability') {
      if (!this.battle.preview(m.id, p).ok) return sfx('cancel');
      sfx('confirm');
      this.screen = { k: 'confirm', ability: m.id, target: p, yes: true };
      return this.update(this.ui);
    }
    sfx('confirm');
    await this.execute();
  }

  private async answer(yes: boolean) {
    const s = this.screen;
    if (s.k !== 'confirm' || this.busy) return;
    if (!yes) {
      sfx('cancel');
      if (ABILITIES[s.ability].range[1] === 0) return this.back({ k: 'abilities', index: abilitiesOf(this.battle).indexOf(s.ability) });
      this.screen = { k: 'map', command: 'act' };
      return this.update(this.ui);
    }
    sfx('confirm');
    await this.execute();
  }

  // executa o que o Ui tem marcado (andar ou agir) e volta ao menu, no próximo comando que vale
  private async execute() {
    const { events, ui } = confirm(this.battle, this.ui);
    if (!events.length) return;
    this.ui = ui;
    await this.animate(events);
    this.save();
    if (this.battle.over) return this.finish();
    this.screen = startScreen(this.battle);
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  private setPixel(p: PixelSettings) {
    this.pixel = p;
    store.set(PIXEL_KEY, JSON.stringify(p));
    this.scene.setPixel(p);
    this.log = t(`Pixel art: ${p.size ? `${p.size} px` : 'desligado'}`, `Pixel art: ${p.size ? `${p.size} px` : 'off'}`);
    this.update(this.ui);
  }

  private moveCursor(p: Pos) {
    sfx('cursor');
    this.cursor = p;
    this.scene.focusOn(p); // a câmera acompanha o cursor, como no FFT
    this.update(hoverTile(this.battle, this.ui, p));
  }

  // cursor volta para quem age (começo do turno, depois de agir, desfazer)
  private cursorToActor() {
    this.cursor = this.battle.actor.pos;
  }

  private get heroTurn() {
    return !this.battle.over && this.battle.actor.team === 'hero';
  }

  private update(ui: Ui) {
    this.ui = ui;
    const s = this.screen;
    // no menu e no submenu só a casa de quem joga fica marcada; o alcance aparece ao escolher (como no FFT)
    const hl = !this.heroTurn || this.busy ? null : s.k === 'facing' ? this.facingMarks()
      : s.k === 'map' || s.k === 'confirm' ? highlights(this.battle, ui) : { tiles: [{ pos: this.battle.actor.pos, kind: 'actor' as const }], path: null, preview: null };
    this.scene.setHighlights(hl);
    this.scene.setCursor(hl ? this.cursor : null);
    this.hud.render({ battle: this.battle, screen: s, hl, busy: this.busy, log: this.log, acting: this.acting, cursor: this.cursor });
    const { top, bottom } = this.hud.insets();
    this.scene.setInsets(top, bottom);
  }

  private async animate(events: BattleEvent[], enemy = false) {
    this.busy = true;
    this.update(this.ui);
    await this.scene.playEvents(events, this.battle.state, (e) => this.beforeEvent(e, enemy));
    this.hud.banner(null);
    this.log = eventLog(events, this.battle.state) || this.log;
    this.busy = false;
  }

  // Passos do FFT antes de cada evento: o inimigo mostra para onde vai antes de andar, e todo golpe mostra o nome da
  // habilidade numa faixa no alto com a área atingida marcada (tempos em timing.ts)
  // Som de cada evento (antes da animação dele): passos casa a casa, golpe no ar, acerto, erro, cura, carga, queda
  private sound(e: BattleEvent) {
    const MELEE = new Set(['slash', 'heavy', 'stab', 'impact', 'spin', 'dash', 'debuff']);
    const BY_EVENT: Partial<Record<BattleEvent['k'], Sfx>> = { hit: 'hit', bump: 'hit', fall: 'hit', miss: 'miss', heal: 'heal', charge: 'charge', fizzle: 'miss', die: 'die' };
    if (e.k === 'move') for (let i = 1; i < e.path.length; i++) setTimeout(() => sfx('step'), (i - 1) * TIMING.step);
    else if (e.k === 'attack') {
      const fx = lookOf(e.ability).fx;
      sfx(MELEE.has(fx) ? 'swing' : fx === 'fire' || fx === 'blast' ? 'fire' : ['heal', 'buff', 'wind'].includes(fx) ? 'spell' : 'throw');
    } else if (BY_EVENT[e.k]) sfx(BY_EVENT[e.k]!);
  }

  private async beforeEvent(e: BattleEvent, enemy: boolean) {
    // os passos do inimigo tocam depois do cursor mostrar o destino, junto da caminhada
    if (!(e.k === 'move' && enemy)) this.sound(e);
    const show = async (hl: Highlights, ms: number) => {
      this.scene.setHighlights(hl);
      await wait(ms);
      this.scene.setHighlights(null);
    };
    if (e.k === 'move' && enemy) {
      const to = e.path.at(-1)!;
      this.scene.setCursor(to);
      await show({ tiles: [{ pos: to, kind: 'target' }], path: e.path, preview: null }, TIMING.enemyDestination);
      this.scene.setCursor(null);
      this.sound(e);
    } else if (e.k === 'attack') {
      const a = ABILITIES[e.ability];
      const area = [e.target, ...this.allTiles().filter((p) => a.radius > 0 && dist(p, e.target) <= a.radius && !samePos(p, e.target))];
      this.hud.banner(abilityName(e.ability));
      await show({ tiles: area.map((pos, i) => ({ pos, kind: i ? 'area' : 'target' })), path: null, preview: null }, TIMING.banner);
    }
  }

  private allTiles(): Pos[] {
    const g = this.battle.grid;
    return Array.from({ length: g.width * g.height }, (_, i) => ({ x: i % g.width, y: Math.floor(i / g.width) }));
  }

  // casas em volta de quem joga: a que ele encara em destaque (escolha de direção no fim do turno)
  private facingMarks(): Highlights {
    const me = this.battle.actor;
    const tiles = neighbors(this.battle.grid, me.pos).map((pos) => ({ pos, kind: facingTo(me.pos, pos) === me.facing ? 'target' as const : 'range' as const }));
    return { tiles: [...tiles, { pos: me.pos, kind: 'actor' }], path: null, preview: null };
  }

  private faceTo(p: Pos) {
    const me = this.battle.actor;
    if (samePos(p, me.pos)) return;
    sfx('cursor');
    this.battle.face(facingTo(me.pos, p));
    this.scene.sync(this.battle.state);
    this.update(this.ui);
  }

  // janela de status da unidade sob o cursor (ou de quem joga), com dialog() como os outros diálogos
  private status() {
    const s = this.battle.state;
    const id = s.units.find((u) => u.pos.x === this.cursor.x && u.pos.y === this.cursor.y)?.id ?? this.battle.actor?.id;
    if (!id) return;
    const u = s.units.find((x) => x.id === id)!;
    dialog('status', unitName(u.def), [el('dl', { class: 'keys' }, ...unitStatus(s, id).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))]);
  }

  private save() {
    store.set(SAVE_KEY, this.battle.over ? '' : this.battle.save());
  }

  private async endTurn() {
    // mapa com direção: antes de passar a vez, escolher para onde olhar (como no FFT)
    if (this.screen.k !== 'facing' && this.heroTurn && this.battle.actor.facing !== undefined) {
      this.screen = { k: 'facing' };
      this.cursorToActor();
      return this.update(this.ui);
    }
    // cargas que saem antes do próximo turno (de heróis ou inimigos) tocam aqui
    const events = this.battle.endTurn();
    if (events.length) await this.animate(events);
    this.save();
    await this.runEnemies();
  }

  private async runEnemies() {
    while (!this.battle.over && !this.heroTurn) {
      this.busy = true;
      this.acting = this.battle.actor.def;
      this.scene.focusOn(this.battle.actor.pos);
      this.update(this.ui);
      await wait(TIMING.enemyStart);
      await this.animate(playAiTurn(this.battle), true);
      // o estado já passou a vez (talvez para um herói): segue travado durante a pausa, senão o toque ou a tecla dessa
      // janela valia e era apagado logo depois pelo freshUi (achado pelo teste só de teclado, 25/10)
      this.busy = true;
      this.update(this.ui); // mostra o resumo ainda com o nome de quem agiu
      await wait(TIMING.enemyAfter);
      this.save();
    }
    this.acting = null;
    this.busy = false;
    this.screen = startScreen(this.battle);
    if (this.heroTurn) {
      this.cursorToActor();
      this.scene.focusOn(this.battle.actor.pos);
    }
    this.update(freshUi(this.battle));
    if (this.battle.over) this.finish();
  }

  // gira a unidade da vez 90° no sentido do relógio (mapas com direção): é a escolha de para onde olhar antes de passar a vez
  private face() {
    const f = this.battle.actor.facing;
    if (this.busy || !this.heroTurn || f === undefined) return;
    this.battle.face((f + 1) % 4);
    this.scene.sync(this.battle.state);
    this.save();
    this.update(this.ui);
  }

  private undo() {
    if (!this.battle.undo()) return;
    sfx('cancel');
    this.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  private restart() {
    this.battle = newBattle();
    this.log = '';
    this.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.update(freshUi(this.battle));
    void this.runEnemies();
  }

  private finish() {
    const won = this.battle.state.outcome === 'victory';
    jingle(won);
    this.scene.celebrate(won ? 'hero' : 'enemy', this.battle.state);
    const d = dialog('result', won ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat'), [
      el('p', {}, won ? t('Todos os inimigos caíram e o Farol resistiu.', 'Every enemy fell and the Beacon held.')
        : t('O Farol caiu ou os heróis tombaram.', 'The Beacon fell or the heroes were defeated.')),
      el('button', { type: 'button', class: 'primary', onclick: () => { d.close(); this.restart(); } }, t('Jogar de novo', 'Play again')),
    ]);
    // Enter joga de novo (o foco ia para o ✕, e fechar deixava a batalha acabada sem tecla para recomeçar)
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  private menu() {
    const d = dialog('menu', t('Menu', 'Menu'), [
      el('p', {}, t('Objetivo: derrote os inimigos e proteja o Farol (o cristal azul).', 'Goal: defeat the enemies and protect the Beacon (the blue crystal).')),
      el('ul', { class: 'legend' },
        el('li', {}, el('i', { class: 'sw move' }), t('Branco: onde o herói pode andar', 'White: where the hero can move')),
        el('li', {}, el('i', { class: 'sw range' }), t('Laranja: alcance da habilidade', 'Orange: ability range')),
        el('li', {}, el('i', { class: 'sw blocked' }), t('Roxo: no alcance, mas sem visão', 'Purple: in range, but no sight')),
        el('li', {}, el('i', { class: 'sw threat' }), t('Vermelho: o que a unidade tocada alcança', 'Red: what the tapped unit can reach'))),
      el('p', {}, t('Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, ombros giram a câmera, Start abre este menu.', 'Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, shoulders rotate the camera, Start opens this menu.')),
      el('h3', {}, t('Pixel art', 'Pixel art')),
      choice(t('Tamanho do pixel', 'Pixel size'), [[0, t('Desligado', 'Off')], [2, '2 px'], [3, '3 px'], [4, '4 px']] as [PixelSize, string][], this.pixel.size, (size) => this.setPixel({ ...this.pixel, size })),
      choice(t('Contorno', 'Outline'), [[true, t('Ligado', 'On')], [false, t('Desligado', 'Off')]], this.pixel.outline, (outline) => this.setPixel({ ...this.pixel, outline })),
      choice(t('Paleta reduzida (16 bits)', 'Reduced palette (16-bit)'), [[false, t('Desligada', 'Off')], [true, t('Ligada', 'On')]], this.pixel.palette, (palette) => this.setPixel({ ...this.pixel, palette })),
      choice(t('Câmera presa à grade de pixels', 'Camera locked to the pixel grid'), [[true, t('Ligada', 'On')], [false, t('Desligada', 'Off')]], this.pixel.snap, (snap) => this.setPixel({ ...this.pixel, snap })),
      el('h3', {}, t('Som', 'Sound')),
      choice(t('Música', 'Music'), [[0, t('Desligada', 'Off')], [1, t('Baixa', 'Low')], [2, t('Alta', 'High')]] as [Level, string][], soundSettings().music, (music) => setSound({ ...soundSettings(), music })),
      choice(t('Efeitos', 'Effects'), [[0, t('Desligados', 'Off')], [1, t('Baixos', 'Low')], [2, t('Altos', 'High')]] as [Level, string][], soundSettings().sfx, (v) => setSound({ ...soundSettings(), sfx: v })),
      el('h3', {}, t('Teclado', 'Keyboard')),
      el('dl', { class: 'keys' }, ...keyHelp().flatMap(([k, what]) => [el('dt', {}, k), el('dd', {}, what)])),
      el('div', { class: 'menu-actions' },
        // durante a animação ou a vez do inimigo o laço ainda está rodando a batalha antiga
        // o 1º toque só pergunta: reiniciar apaga a batalha salva e não tem volta (auditoria mobile de 25/10)
        el('button', { type: 'button', class: 'secondary', disabled: this.busy, onclick: (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (!btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.textContent = t('Toque de novo para reiniciar', 'Tap again to restart');
            return;
          }
          d.close();
          this.restart();
        } }, t('Reiniciar batalha', 'Restart battle')),
        el('button', { type: 'button', class: 'secondary', onclick: () => setLang(LANG === 'pt' ? 'en' : 'pt') }, LANG === 'pt' ? 'English' : 'Português')),
    ]);
  }
}

async function boot() {
  const host = document.getElementById('app')!;
  // Estudo de referência do FFT (11/11): não é conteúdo do jogo. Só abre com o parâmetro e vem num pedaço separado do
  // build (import dinâmico), então nada dele vai no pacote que o jogador baixa.
  const study = new URLSearchParams(location.search).get('cenario');
  if (study === 'fft-gariland' || study === 'fft-classes') {
    const fft = await import('../shared/battle/fft/gariland.ts');
    fft.registerFftStudy();
    scenario = SCENARIOS[study];
    SAVE_KEY = `dt:battle:${study}`;
  } else if (study && SCENARIOS[study]) {
    // outros mapas do jogo pelo mesmo parâmetro (ex.: ?cenario=flooded_crypt), com save próprio
    scenario = SCENARIOS[study];
    SAVE_KEY = `dt:battle:${study}`;
  }
  const saved = store.get(SAVE_KEY);
  const battle = (saved && Battle.load(saved)) || newBattle();
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  const scene = await BattleScene.create(host, battle.grid, battle.state, pixel);
  new Game(battle, scene, host, pixel);
}

void boot();
