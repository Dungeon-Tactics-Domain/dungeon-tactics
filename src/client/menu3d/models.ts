// The low-poly models of the 3D command menu: its command and ability icons, the plates under them, the sheet's emblem
// and the pointing glove, built with the kit (ui3d/icons.ts) from our own shapes; nothing comes from the original game.
import type { BufferGeometry } from 'three';
import { TorusGeometry } from 'three';
import type { Element } from '../../shared/battle/units.ts';
import { ball, box, build, cone, cyl, dropGeometry, gem, part, pyramid, takeGeometry } from '../ui3d/icons.ts';
import type { IconKind } from './menu-view.ts';

const STEEL = 0xdfe6ee,
  STEEL_LOW = 0xa9b6c6,
  IRON = 0x5a6470,
  GOLD = 0xd9a441,
  WOOD = 0x8a5a2b,
  LEATHER = 0x9a6233,
  DARK = 0x3d2b1f,
  GLASS = 0xbfe3ea,
  WHITE = 0xf6f5ec,
  WHITE_LOW = 0xdcdacd,
  RED = 0xb3262e;
const HALF = Math.PI / 2;

// outer flame and bright core of a spell, by its element
const FLAME: Record<Element | 'none', [number, number]> = {
  fire: [0xf0792b, 0xffd34d],
  ice: [0x5aa7e0, 0xe2f4ff],
  lightning: [0xe8c531, 0xfff7c2],
  shadow: [0x7b4bb8, 0xd6b8f5],
  wind: [0x4fb89a, 0xd9f7e6],
  light: [0xf0cf55, 0xfffbe0],
  none: [0x6a8fd8, 0xdfe9ff],
};

const blade = (w: number, len: number, guard: number, grip: number) => [
  part(box(w, len, 0.05), STEEL, [0, len / 2 - 0.18, 0]),
  part(box(w / 3, len - 0.04, 0.07), STEEL_LOW, [0, len / 2 - 0.18, 0]), // the ridge down the middle of the blade
  part(pyramid(w, 0.17), STEEL, [0, len - 0.18 + 0.085, 0], [0, 0, 0], [1, 1, 0.05 / w]),
  part(box(w * 2.8, 0.08, 0.11), guard, [0, -0.22, 0]),
  part(cyl(0.05, 0.2, 6), grip, [0, -0.36, 0]),
  part(gem(0.085), guard, [0, -0.5, 0]),
];

const MODELS: Record<IconKind | 'disc' | 'tile' | 'gem' | 'glove', (element?: Element) => BufferGeometry> = {
  sword: () => build(blade(0.15, 0.62, GOLD, WOOD)).rotateZ(-0.62),
  dagger: () =>
    build(blade(0.17, 0.4, IRON, RED))
      .rotateZ(-0.62)
      .translate(-0.08, -0.08, 0),
  // seen from the side, toe to the right
  boot: () =>
    build([
      part(box(0.62, 0.09, 0.3), DARK, [0.05, -0.42, 0]),
      part(box(0.56, 0.2, 0.28), LEATHER, [0.07, -0.28, 0]),
      part(box(0.2, 0.13, 0.3), 0xb9793f, [0.27, -0.25, 0]),
      part(box(0.3, 0.48, 0.28), LEATHER, [-0.09, 0.05, 0]),
      part(box(0.36, 0.13, 0.32), 0xd9a86a, [-0.09, 0.33, 0]),
      part(box(0.09, 0.09, 0.31), GOLD, [-0.01, -0.03, 0]),
    ]),
  // the sand already at the bottom: time to wait
  hourglass: () =>
    build([
      part(cyl(0.27, 0.07, 6), WOOD, [0, 0.42, 0]),
      part(cyl(0.27, 0.07, 6), WOOD, [0, -0.42, 0]),
      part(cone(0.22, 0.38, 6), GLASS, [0, 0.19, 0], [Math.PI, 0, 0]),
      part(cone(0.22, 0.38, 6), 0xe6b84a, [0, -0.19, 0]),
      part(cyl(0.028, 0.8, 4), DARK, [0.23, 0, 0.1]),
      part(cyl(0.028, 0.8, 4), DARK, [-0.23, 0, 0.1]),
      part(cyl(0.028, 0.8, 4), DARK, [0, 0, -0.25]),
    ]),
  scroll: () =>
    build([
      part(box(0.52, 0.62, 0.04), 0xf1e6c4),
      part(cyl(0.075, 0.66, 6), 0xd8c08a, [0, 0.33, 0], [0, 0, HALF]),
      part(cyl(0.075, 0.66, 6), 0xd8c08a, [0, -0.33, 0], [0, 0, HALF]),
      part(box(0.32, 0.035, 0.02), 0x8a7a55, [-0.04, 0.16, 0.03]),
      part(box(0.32, 0.035, 0.02), 0x8a7a55, [-0.04, 0.06, 0.03]),
      part(box(0.2, 0.035, 0.02), 0x8a7a55, [-0.1, -0.04, 0.03]),
      part(cyl(0.085, 0.05, 6), RED, [0.13, -0.17, 0.04], [HALF, 0, 0]),
    ]),
  shield: () =>
    build([
      part(box(0.6, 0.4, 0.09), 0x3f6fb5, [0, 0.14, 0]),
      part(pyramid(0.6, 0.42), 0x3f6fb5, [0, -0.27, 0], [Math.PI, 0, 0], [1, 1, 0.15]),
      part(box(0.66, 0.07, 0.12), GOLD, [0, 0.35, 0]),
      part(box(0.1, 0.56, 0.11), WHITE, [0, 0.04, 0.01]),
      part(box(0.4, 0.1, 0.11), WHITE, [0, 0.14, 0.01]),
      part(gem(0.09), GOLD, [0, 0.14, 0.07]),
    ]),
  // two bits: the strike that takes everyone around
  axe: () =>
    build([
      part(cyl(0.04, 0.96, 5), WOOD, [0, -0.02, 0]),
      part(gem(0.26), STEEL, [0.19, 0.24, 0], [0, 0, 0], [1, 1.25, 0.22]),
      part(gem(0.26), STEEL, [-0.19, 0.24, 0], [0, 0, 0], [1, 1.25, 0.22]),
      part(box(0.14, 0.2, 0.12), IRON, [0, 0.24, 0]),
      part(gem(0.06), GOLD, [0, 0.47, 0]),
    ]).rotateZ(-0.5),
  bow: () =>
    build([
      part(new TorusGeometry(0.4, 0.04, 4, 7, Math.PI), WOOD, [-0.12, 0, 0], [0, 0, -HALF]),
      part(box(0.016, 0.8, 0.016), 0xe8e0c8, [-0.12, 0, 0]),
      part(cyl(0.02, 0.78, 4), 0xc9a36a, [0.02, 0, 0.03], [0, 0, HALF]),
      part(cone(0.07, 0.16, 4), STEEL, [0.46, 0, 0.03], [0, 0, -HALF]),
      part(box(0.12, 0.1, 0.02), RED, [-0.36, 0, 0.03]),
    ]).rotateZ(0.5),
  flame: (element) => {
    const [outer, core] = FLAME[element ?? 'none'];
    return build([
      part(gem(0.27), outer, [0, -0.2, 0], [0, 0, 0], [1, 0.9, 0.8]),
      part(cone(0.24, 0.52, 5), outer, [0.02, 0.14, 0]),
      part(cone(0.12, 0.3, 4), outer, [-0.2, 0.06, 0.02], [0, 0, 0.5]),
      part(cone(0.1, 0.26, 4), outer, [0.22, 0, 0.02], [0, 0, -0.55]),
      part(gem(0.15), core, [0, -0.16, 0.16], [0, 0, 0], [1, 1.2, 0.6]),
      part(cone(0.1, 0.26, 4), core, [0.01, 0.04, 0.17]),
    ]);
  },
  potion: () =>
    build([
      part(cyl(0.27, 0.34, 6), 0x4fb36b, [0, -0.22, 0]),
      part(cyl(0.27, 0.2, 6, 0.09), GLASS, [0, 0.05, 0]),
      part(cyl(0.09, 0.16, 6), GLASS, [0, 0.22, 0]),
      part(cyl(0.12, 0.05, 6), GLASS, [0, 0.3, 0]),
      part(cyl(0.085, 0.1, 6), 0xa8743f, [0, 0.36, 0]),
      part(box(0.2, 0.065, 0.03), WHITE, [0, -0.22, 0.27]),
      part(box(0.065, 0.2, 0.03), WHITE, [0, -0.22, 0.27]),
    ]),
  // the plates under the icons: a dark disc for a command, a red tile with a gold frame for an ability
  disc: () =>
    build([
      part(cyl(0.5, 0.1, 14), 0x4d4838, [0, 0, 0], [HALF, 0, 0]),
      part(cyl(0.43, 0.04, 14), 0x6a634f, [0, 0, 0.06], [HALF, 0, 0]),
    ]),
  tile: () =>
    build([
      part(box(1, 1, 0.08), 0xc2ab78),
      part(box(0.9, 0.9, 0.06), 0x6e1d27, [0, 0, 0.02]),
      part(box(0.8, 0.8, 0.06), 0x8c2731, [0, 0, 0.04]),
    ]),
  // the class emblem on the sheet's head
  gem: () =>
    build([
      part(gem(0.5), 0x6b6248, [0, 0, 0], [0, 0, 0], [0.8, 1, 0.5]),
      part(gem(0.2), 0xd9c9a0, [0, 0, 0.18], [0, 0, 0], [0.8, 1, 0.5]),
    ]),
  // the pointing hand, finger to the right
  glove: () =>
    build([
      part(cyl(0.2, 0.16, 8, 0.17), 0xb9b6aa, [-0.37, -0.02, 0], [0, 0, HALF]), // cuff, wider at the wrist's end
      part(ball(0.21), WHITE, [-0.12, -0.02, 0], [0, 0, 0], [1.15, 1, 0.8]), // palm
      part(cyl(0.062, 0.36, 6), WHITE, [0.2, 0.09, 0.03], [0, 0, HALF]), // the pointing finger
      part(ball(0.064), WHITE, [0.38, 0.09, 0.03]),
      part(cyl(0.055, 0.16, 6), WHITE, [-0.06, 0.17, 0.06], [0, 0, 0.9]), // thumb, raised
      part(ball(0.058), WHITE, [0.0, 0.22, 0.06]),
      part(ball(0.075), WHITE_LOW, [0.07, -0.02, 0.1]), // three curled fingers
      part(ball(0.072), WHITE_LOW, [0.06, -0.12, 0.09]),
      part(ball(0.064), WHITE_LOW, [0.03, -0.21, 0.07]),
    ]),
};

export type ModelKind = keyof typeof MODELS;
// a flame is one model per element
const keyOf = (kind: ModelKind, element?: Element) => (kind === 'flame' ? `flame:${element}` : kind);
export const takeModel = (kind: ModelKind, element?: Element): BufferGeometry =>
  takeGeometry(keyOf(kind, element), () => MODELS[kind](element));
export const dropModel = (kind: ModelKind, element?: Element) => dropGeometry(keyOf(kind, element));
