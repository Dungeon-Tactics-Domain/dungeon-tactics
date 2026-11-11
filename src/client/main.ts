// Entrada do jogo: liga a batalha (regras), a cena (Three), o HUD (DOM) e o toque. Dono do laço de turno: o jogador age
// pelo HUD; na vez do inimigo a IA joga sozinha, uma unidade por vez, com pausa para dar para ler.
import { playAiTurn } from '../shared/battle/ai.ts';
import { Battle } from '../shared/battle/battle.ts';
import { FIRST_BATTLE } from '../shared/battle/scenarios.ts';
import { inBounds } from '../shared/battle/grid.ts';
import type { BattleEvent, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { choice, dialog } from './dialog.ts';
import { BattleHud, eventLog } from './hud.ts';
import { LANG, setLang, t } from './i18n.ts';
import { el } from './icons.ts';
import { cancel, confirm, freshUi, highlights, hoverTile, selectMode, tapTile, type Mode, type Ui } from './interaction.ts';
import { cycleUnit, gridStep, keyAction, keyHelp, type KeyAction } from './keyboard.ts';
import { BattleScene } from './scene.ts';
import { store } from './store.ts';
import { TouchInput } from './touch-input.ts';
import { PIXEL_KEY, nextSize, parsePixel, type PixelSettings, type PixelSize } from './pixel-settings.ts';

// a batalha que o jogo abre e onde ela fica salva; o estudo do FFT troca os dois no boot (save à parte)
let scenario = FIRST_BATTLE;
let SAVE_KEY = 'dt:battle';
const ENEMY_PAUSE_MS = 700; // tempo para ler de quem é a vez antes do inimigo agir
const ENEMY_AFTER_MS = 600; // e para ler o resultado antes do próximo (com 450 e nada depois, o turno passava em <0,6 s)

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const newBattle = () => Battle.start(scenario, (Math.random() * 2 ** 31) | 0);

class Game {
  private ui: Ui;
  private busy = false;
  private log = '';
  private acting: string | null = null;
  private cursor: Pos; // casa do cursor do teclado; o toque também o move, para os dois não se desencontrarem
  private readonly hud: BattleHud;
  private readonly input: TouchInput;

  constructor(private battle: Battle, private readonly scene: BattleScene, host: HTMLElement, private pixel: PixelSettings) {
    this.ui = freshUi(battle);
    this.cursor = battle.actor.pos;
    this.hud = new BattleHud(host, {
      mode: (m: Mode) => this.update(selectMode(this.battle, this.ui, m)),
      confirm: () => void this.confirm(),
      endTurn: () => void this.endTurn(),
      undo: () => this.undo(),
      rotate: (dir) => scene.rotate(dir),
      recenter: () => scene.resetView(),
      pixel: () => this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) }),
      menu: () => this.menu(),
    });
    this.input = new TouchInput(host.querySelector('canvas')!, {
      tap: (x, y) => {
        const pos = this.scene.pick(x, y);
        if (!pos || this.busy || !this.heroTurn) return;
        this.cursor = pos;
        this.update(tapTile(this.battle, this.ui, pos));
      },
      pan: (dx, dy) => scene.pan(dx, dy),
      zoom: (f) => scene.zoom(f),
    });
    addEventListener('keydown', (e) => this.onKey(e));
    this.update(this.ui);
    void this.runEnemies(); // o save pode ter parado na vez do inimigo
  }

  // Teclado (pedido do Fernando, 25/10): toda ação do toque tem tecla. A tradução tecla → ação é pura (keyboard.ts);
  // aqui só se executa. Com um diálogo aberto, as teclas são dele (Esc fecha, Tab anda entre os botões).
  private onKey(e: KeyboardEvent) {
    if (document.querySelector('.overlay')) return;
    const a = keyAction(e);
    if (!a) return;
    e.preventDefault(); // Tab não pula de botão, Espaço não rola nem aperta o botão que ficou com o foco do mouse
    (document.activeElement as HTMLElement | null)?.blur();
    this.runKey(a);
  }

  private runKey(a: KeyAction) {
    const b = this.battle;
    // câmera e ajuda valem sempre, inclusive na vez do inimigo
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView();
    if (a.k === 'help') return this.menu();
    if (a.k === 'pixel') return this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) });
    if (this.busy || !this.heroTurn) return;
    if (a.k === 'cursor') {
      const step = gridStep(a.dir, this.scene.heading);
      const next = { x: this.cursor.x + step.x, y: this.cursor.y + step.y };
      if (inBounds(b.grid, next)) this.moveCursor(next);
    } else if (a.k === 'cycle') this.moveCursor(cycleUnit(b.state, this.cursor, a.dir));
    else if (a.k === 'confirm') void this.confirm();
    else if (a.k === 'cancel') this.update(cancel(b, this.ui));
    else if (a.k === 'slot') {
      const modes: Mode[] = [{ k: 'move' }, ...UNIT_DEFS[b.actor.def].abilities.map((id) => ({ k: 'ability' as const, id }))];
      // a prévia já aparece se o cursor estiver em cima de um alvo
      if (modes[a.index]) this.update(hoverTile(b, selectMode(b, this.ui, modes[a.index]), this.cursor));
    } else if (a.k === 'info') this.hud.toggleDetail();
    else if (a.k === 'undo') this.undo();
    else if (a.k === 'wait') this.hud.pressWait();
  }

  private setPixel(p: PixelSettings) {
    this.pixel = p;
    store.set(PIXEL_KEY, JSON.stringify(p));
    this.scene.setPixel(p);
    this.log = t(`Pixel art: ${p.size ? `${p.size} px` : 'desligado'}`, `Pixel art: ${p.size ? `${p.size} px` : 'off'}`);
    this.update(this.ui);
  }

  private moveCursor(p: Pos) {
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
    const hl = this.heroTurn && !this.busy ? highlights(this.battle, ui) : null;
    this.scene.setHighlights(hl);
    this.scene.setCursor(hl ? this.cursor : null);
    this.hud.render({ battle: this.battle, ui, hl, busy: this.busy, log: this.log, acting: this.acting });
    const { top, bottom } = this.hud.insets();
    this.scene.setInsets(top, bottom);
  }

  private async animate(events: BattleEvent[]) {
    this.busy = true;
    this.update(this.ui);
    await this.scene.playEvents(events, this.battle.state);
    this.log = eventLog(events, this.battle.state) || this.log;
    this.busy = false;
  }

  private save() {
    store.set(SAVE_KEY, this.battle.over ? '' : this.battle.save());
  }

  private async confirm() {
    const { events, ui } = confirm(this.battle, this.ui);
    if (!events.length) return;
    this.ui = ui;
    await this.animate(events);
    this.save();
    if (!this.battle.over) this.cursorToActor();
    this.update(freshUi(this.battle));
    if (this.battle.over) this.finish();
  }

  private async endTurn() {
    this.battle.endTurn();
    this.save();
    await this.runEnemies();
  }

  private async runEnemies() {
    while (!this.battle.over && !this.heroTurn) {
      this.busy = true;
      this.acting = this.battle.actor.def;
      this.scene.focusOn(this.battle.actor.pos);
      this.update(this.ui);
      await wait(ENEMY_PAUSE_MS);
      await this.animate(playAiTurn(this.battle));
      // o estado já passou a vez (talvez para um herói): segue travado durante a pausa, senão o toque ou a tecla dessa
      // janela valia e era apagado logo depois pelo freshUi (achado pelo teste só de teclado, 25/10)
      this.busy = true;
      this.update(this.ui); // mostra o resumo ainda com o nome de quem agiu
      await wait(ENEMY_AFTER_MS);
      this.save();
    }
    this.acting = null;
    this.busy = false;
    if (this.heroTurn) {
      this.cursorToActor();
      this.scene.focusOn(this.battle.actor.pos);
    }
    this.update(freshUi(this.battle));
    if (this.battle.over) this.finish();
  }

  private undo() {
    if (!this.battle.undo()) return;
    this.scene.sync(this.battle.state);
    this.save();
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  private restart() {
    this.battle = newBattle();
    this.log = '';
    this.scene.sync(this.battle.state);
    this.save();
    this.update(freshUi(this.battle));
    void this.runEnemies();
  }

  private finish() {
    const won = this.battle.state.outcome === 'victory';
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
        el('li', {}, el('i', { class: 'sw move' }), t('Azul: onde o herói pode andar', 'Blue: where the hero can move')),
        el('li', {}, el('i', { class: 'sw range' }), t('Laranja: alcance da habilidade', 'Orange: ability range')),
        el('li', {}, el('i', { class: 'sw blocked' }), t('Roxo: no alcance, mas sem visão', 'Purple: in range, but no sight')),
        el('li', {}, el('i', { class: 'sw threat' }), t('Vermelho: o que a unidade tocada alcança', 'Red: what the tapped unit can reach'))),
      el('p', {}, t('Segure um ícone para ver os detalhes. Arraste para mover a câmera, use dois dedos para zoom.', 'Hold an icon to see its details. Drag to move the camera, pinch to zoom.')),
      el('h3', {}, t('Pixel art', 'Pixel art')),
      choice(t('Tamanho do pixel', 'Pixel size'), [[0, t('Desligado', 'Off')], [2, '2 px'], [3, '3 px'], [4, '4 px']] as [PixelSize, string][], this.pixel.size, (size) => this.setPixel({ ...this.pixel, size })),
      choice(t('Contorno', 'Outline'), [[true, t('Ligado', 'On')], [false, t('Desligado', 'Off')]], this.pixel.outline, (outline) => this.setPixel({ ...this.pixel, outline })),
      choice(t('Paleta reduzida (16 bits)', 'Reduced palette (16-bit)'), [[false, t('Desligada', 'Off')], [true, t('Ligada', 'On')]], this.pixel.palette, (palette) => this.setPixel({ ...this.pixel, palette })),
      choice(t('Câmera presa à grade de pixels', 'Camera locked to the pixel grid'), [[true, t('Ligada', 'On')], [false, t('Desligada', 'Off')]], this.pixel.snap, (snap) => this.setPixel({ ...this.pixel, snap })),
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
  if (new URLSearchParams(location.search).get('cenario') === 'fft-gariland') {
    const fft = await import('../shared/battle/fft/gariland.ts');
    fft.registerFftStudy();
    scenario = fft.GARILAND;
    SAVE_KEY = 'dt:battle:fft-gariland';
  }
  const saved = store.get(SAVE_KEY);
  const battle = (saved && Battle.load(saved)) || newBattle();
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  const scene = await BattleScene.create(host, battle.grid, battle.state, pixel);
  new Game(battle, scene, host, pixel);
}

void boot();
