// Drawing guides for the labs (?guides=1, localhost only): the 16:9 drawing area, the thirds, the screen centre and every
// region of layout.ts at the place it takes in the layout picked. Dashed lines over the game, never in the way of a click.
import { getLayout } from '../layout-mode.ts';
import { place, REGIONS, SCREEN, stage } from './layout.ts';

const LINE = '1px dashed';
const box = (css: string, text = '') => {
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;box-sizing:border-box;${css}`;
  d.textContent = text;
  return d;
};

export function showGuides() {
  const host = box('inset:0;pointer-events:none;z-index:99999;font:11px monospace');
  document.body.append(host);
  const draw = () => {
    const w = innerWidth,
      h = innerHeight,
      mode = getLayout();
    const fit = stage(w, h, 'frame'); // the 16:9 area that fits the window, whatever the layout
    const st = stage(w, h, mode);
    host.replaceChildren(
      // the 16:9 drawing area, with its thirds and centre
      box(`left:${fit.x}px;top:${fit.y}px;width:${fit.w}px;height:${fit.h}px;border:2px solid #ff2d95;`),
      box(
        `left:${fit.x + 4}px;top:${fit.y + 4}px;color:#ff2d95;background:#000a;padding:1px 4px`,
        `16:9 ${Math.round(fit.w)}x${Math.round(fit.h)} (referência ${SCREEN.w}x${SCREEN.h}), layout ${mode}`,
      ),
      ...[1, 2].flatMap((i) => [
        box(`left:${fit.x + (fit.w * i) / 3}px;top:${fit.y}px;height:${fit.h}px;border-left:${LINE} #ff2d9566`),
        box(`left:${fit.x}px;top:${fit.y + (fit.h * i) / 3}px;width:${fit.w}px;border-top:${LINE} #ff2d9566`),
      ]),
      box(`left:${fit.x + fit.w / 2}px;top:${fit.y}px;height:${fit.h}px;border-left:${LINE} #ffd400`),
      box(`left:${fit.x}px;top:${fit.y + fit.h / 2}px;width:${fit.w}px;border-top:${LINE} #ffd400`),
      // every region where the layout puts it
      ...Object.entries(REGIONS).flatMap(([name, r]) => {
        const b = place(r, st);
        return [
          box(`left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border:${LINE} #00e5ff`),
          box(`left:${b.x + 2}px;top:${b.y + 2}px;color:#00e5ff;background:#000a;padding:0 3px`, name),
        ];
      }),
    );
  };
  addEventListener('resize', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
  draw();
}
