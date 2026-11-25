// Top view (Fernando, Nov 25: "camera de cima ... igual tactics ogre faz"): the battle seen straight down, turned in
// quarter turns, framing the whole map. The camera math with no Three or DOM, so it is tested (tests/top-view.test.ts);
// scene/camera.ts moves the camera and scene/top-view.ts draws the heights.
import type { Insets } from './scene/camera.ts';

export const TOP_PITCH = 90; // degrees: straight down, as Tactics Ogre's tactical view
export const TOP_MS = 360; // the short ease in and out of it, on the battle clock
const QUARTER = Math.PI / 2;
const MARGIN = 2; // one cell of ground around the map, so its edge does not touch the HUD
// the corner buttons' row on top (56 px at 1920 plus the edge inset; tools-layout.ts): the map stays under it
const BUTTONS = 72;

// the nearest of the 4 straight angles: from above the map's rows run along the screen, as in Tactics Ogre
export const snapQuarter = (yaw: number) => Math.round(yaw / QUARTER) * QUARTER;

// one press of R: a quarter turn from above, an eighth (the 8 angles of Nov 13) at the usual tilt
export const turnStep = (top: boolean) => (top ? QUARTER : QUARTER / 2);

// The view height (CameraRig.viewH) that shows a w x h cell map whole from above on a pageW x pageH page, inside the
// space the HUD leaves; at an odd quarter turn the map's sides swap on screen. A portrait page is widened by frameView,
// so it is undone here
export function topFit(map: { width: number; height: number }, yaw: number, pageW: number, pageH: number, i: Insets) {
  const odd = Math.abs(Math.round(yaw / QUARTER)) % 2 === 1,
    across = (odd ? map.height : map.width) + MARGIN,
    down = (odd ? map.width : map.height) + MARGIN,
    freeW = Math.max(1, pageW - i.left - i.right),
    // the frame centres on the space between the insets, so the band under the buttons is kept at both ends
    freeH = Math.max(1, pageH - i.top - i.bottom - 2 * Math.max(0, BUTTONS - i.top)),
    viewH = Math.max((down * pageH) / freeH, (across * pageH) / freeW),
    a = pageW / pageH;
  return a < 1 ? (viewH * a) / 1.15 : viewH;
}
