// The action cameras the strike can play (scene/camera.ts actionCam), apart so the camera file stays under its size cap.
import { param } from '../store.ts';

// Action cameras to compare (Nov 13, Fernando's request: "test several action cam options like over the shoulder,
// from behind the enemy, etc"): `?camera=<name>` picks one; without the parameter `hero` applies (his pick on Nov 13,
// after seeing the prints of all of them), which alternates `shoulder` and `behind` to stay always on the heroes' side.
// turn: rotation around the target from the strike line (0 = behind the attacker, π = behind the target); pitch: tilt
// in degrees (32 = the game's; low = camera near the ground); zoom: view height, base + per tile of distance; aim: where
// the camera aims between the attacker (0) and the target (1); lift: how much the focus rises off the ground, so the unit is not at the edge;
// clip: with the camera low, whatever sits between it and the units (outside forest, ravine, tree) would cover the strike, so everything
// more than `clip` tiles in front of the focus stops being drawn (the camera's clipping plane) while it lasts
export interface ActionCam {
  turn: number;
  pitch: number;
  zoom: [base: number, perTile: number];
  aim: number;
  lift: number;
  clip?: number;
}
export const ACTION_CAMS: Record<string, ActionCam | null> = {
  xcom: { turn: 0.35, pitch: 32, zoom: [4, 0.9], aim: 0.5, lift: 0 },
  shoulder: { turn: 0.45, pitch: 20, zoom: [2.6, 0.7], aim: 0.6, lift: 0.45, clip: 3.2 }, // over the shoulder of the attacker
  behind: { turn: Math.PI - 0.45, pitch: 20, zoom: [2.6, 0.7], aim: 0.4, lift: 0.45, clip: 3.2 }, // from behind the enemy
  side: { turn: Math.PI / 2, pitch: 16, zoom: [2.6, 0.95], aim: 0.5, lift: 0.4, clip: 3 }, // the two in profile
  top: { turn: 0.35, pitch: 60, zoom: [4.2, 0.9], aim: 0.5, lift: 0 }, // from above, tactical
  none: null, // no action camera
}; // and `hero`, which alternates between `shoulder` and `behind` (actionCam)
const camAsked = param('camera');
export const CAM_NAME = camAsked !== null && camAsked in ACTION_CAMS ? camAsked : 'hero';
