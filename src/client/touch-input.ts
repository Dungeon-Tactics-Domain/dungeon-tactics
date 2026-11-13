// Toque e mouse no mapa: toque curto escolhe a casa, arrastar com um dedo move a câmera, dois dedos (ou a roda) dão zoom.
export interface TouchHandlers {
  tap(x: number, y: number, mouse: boolean): void;
  hover?(x: number, y: number): void; // só o mouse, sem botão apertado: o PC usa como o cursor do teclado
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
}

// acima disto o dedo arrastou, não tocou (8 px: o toque de um polegar escorrega uns 3 a 5 px)
const TAP_SLOP = 8;

export class TouchInput {
  private readonly ac = new AbortController();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private downAt: { x: number; y: number } | null = null;
  private dragged = false;
  private pinch = 0;

  constructor(target: HTMLElement, h: TouchHandlers) {
    const opts = { signal: this.ac.signal };
    target.addEventListener('pointerdown', (e) => {
      // só o botão principal toca e arrasta (13/11, revisão): o direito virava toque e confirmava o andar em vez de voltar
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      target.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downAt = { x: e.clientX, y: e.clientY };
        this.dragged = false;
      } else {
        this.dragged = true; // segundo dedo: é pinça, nunca toque
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }, opts);
    target.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') h.hover?.(e.clientX, e.clientY);
        return;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch && d) h.zoom(this.pinch / d);
        this.pinch = d;
        return;
      }
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > TAP_SLOP) this.dragged = true;
      if (this.dragged) h.pan(e.clientX - prev.x, e.clientY - prev.y);
    }, opts);
    const up = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size) return;
      if (this.downAt && !this.dragged && e.type === 'pointerup') h.tap(e.clientX, e.clientY, e.pointerType === 'mouse');
      this.downAt = null;
      this.pinch = 0;
    };
    target.addEventListener('pointerup', up, opts);
    target.addEventListener('pointercancel', up, opts);
    target.addEventListener('wheel', (e) => {
      e.preventDefault();
      h.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    }, { ...opts, passive: false });
  }

  dispose() {
    this.ac.abort();
  }
}
