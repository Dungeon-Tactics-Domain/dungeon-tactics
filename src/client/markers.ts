import { baseDef, HALF } from '../shared/battle/half.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

// Height of the markers around each unit, in meters from the top of the tile. Pure so the test can check the
// order (ground < unit < health bar < cursor arrow), which the scene only applies.
export const UNIT_HEIGHT = { default: 0.85, brute: 1.05, colossus: 2 }; // the Brute is bigger so it reads from afar that it hits hard; the Colossus takes 2x2
// by model, not by id: the campaign and developer-menu Brute has its own sheet (camp1-e0...) and came out small
// half tile (half.ts): the ½ sheet is twice the size of the original, because each tile became 2x2
export const unitHeight = (def: string): number =>
  def.endsWith(HALF)
    ? 2 * unitHeight(baseDef(def))
    : (UNIT_DEFS[def]?.size ?? 1) > 1
      ? UNIT_HEIGHT.colossus
      : modelOf(def) === MODEL.brute
        ? UNIT_HEIGHT.brute
        : UNIT_HEIGHT.default;

// height of each unit's health bar (and crown): the default or, for whoever is taller than that (the Colossus), just above the head
export const barYOf = (def: string) => Math.max(MARKER.barY, unitHeight(def) + 0.3);

export const MARKER = {
  frameY: 0.04, // flush with the tile, above the markings (0.02) and the path (0.03)
  // with the depth test on the unit covers the frame; off, it was drawn over the hero (bug of Oct 25)
  frameDepthTest: true,
  barY: 1.15,
  barHalf: 0.06, // half height of the bar (0.12)
  arrowY: 1.5, // above the health bar: at 1.05 it sat at head height and covered the face
  arrowBob: 0.08, // up-and-down bob of the arrow
  arrowHalf: 0.15, // half height of the cone (0.3)
};

// KayKit model of each unit (public/models/<id>.glb and the portrait public/chars/<id>.webp); the Brute uses the barbarian (there is no
// big skeleton); the Archer uses `ranger` (the wine-colored Rogue, no knives and with a bow: scripts/assets/ranger.mjs). The study
// unit carries its model in its own sheet. The scene and the HUD (portraits) use the same map.
const MODEL: Record<string, string> = {
  warrior: 'knight',
  archer: 'ranger',
  mage: 'mage',
  rogue: 'rogue_hooded',
  soldier: 'skeleton_warrior',
  skeleton_archer: 'skeleton_rogue',
  dark_mage: 'skeleton_mage',
  brute: 'barbarian',
  minion: 'skeleton_minion',
  colossus: 'skeleton_warrior',
  lancer: 'lancer', // Lancer: the Knight without cape or shield, in teal-green steel, with a spear (scripts/assets/lancer.mjs)
  acolyte: 'mage',
  veil_knight: 'knight', // Acolyte and Veil Knight: units with their own glow (UnitDef.tint)
};
export const modelOf = (def: string): string => MODEL[baseDef(def)] ?? UNIT_DEFS[def].model ?? ''; // '' = no model (the Beacon)
