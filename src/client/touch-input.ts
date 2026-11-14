// Touch and mouse on the map: a short tap picks the tile, dragging with one finger moves the camera, two fingers (or the wheel) zoom.
export interface TouchHandlers {
  tap(x: number, y: number, mouse: boolean): void;
  hover?(x: number, y: number): void; // mouse only, no button pressed: the PC uses it like the keyboard cursor
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
}

// above this the finger dragged, didn't tap (8 px: a thumb tap slips about 3 to 5 px)
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
      // only the primary button taps and drags (Nov 13, review): the right one became a tap and confirmed the move instead of going back
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      target.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downAt = { x: e.clientX, y: e.clientY };
        this.dragged = false;
      } else {
        this.dragged = true; // second finger: it's a pinch, never a tap
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
