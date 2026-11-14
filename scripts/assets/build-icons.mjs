// Builds public/icons.svg (a <symbol> sprite) with the game-icons.net icons used in the interface.
// Downloads only from the official repository (github.com/game-icons/icons, CC BY 3.0). Usage: node scripts/assets/build-icons.mjs
// Each symbol keeps the original file's id; the color comes from CSS (fill: currentColor). Credits in public/CREDITS.txt.
import { writeFileSync } from 'node:fs';

const ICONS = [
  // spells
  'lorc/fire-ray',
  'lorc/focused-lightning',
  'lorc/on-target',
  'lorc/shield-reflect',
  'lorc/teleport',
  'lorc/body-swapping',
  'lorc/grab',
  'lorc/meteor-impact',
  'lorc/sprint',
  'lorc/striking-splinter',
  'delapouite/boomerang',
  'lorc/knife-thrust',
  'lorc/vortex',
  'delapouite/menhir',
  'heavenly-dog/defensive-wall',
  'caro-asercion/ricochet',
  'lorc/life-tap',
  'lorc/frozen-orb',
  'lorc/two-shadows',
  'lorc/magnet',
  'lorc/cycle',
  'delapouite/card-exchange',
  'lorc/harpoon-chain',
  'lorc/wind-slap',
  'delapouite/split-arrows',
  'lorc/time-trap',
  // items
  'delapouite/diamond-ring',
  'lorc/skull-ring',
  'delapouite/cape',
  'lorc/breastplate',
  'lorc/leather-boot',
  'skoll/pocket-watch',
  'delapouite/bat',
  'delapouite/flail',
  'lorc/divert',
  'lorc/chalice-drops',
  'delapouite/metal-boot',
  'delapouite/stone-bust',
  'delapouite/spartan-helmet',
  'lorc/winged-leg',
  'lorc/angel-wings',
  'lorc/feather',
  'lorc/magnifying-glass',
  'lorc/pierced-heart',
  'lorc/rune-stone', // critical hit (issue #184)
  // runes, effects and causes of death
  'delapouite/rabbit',
  'delapouite/enrage',
  'lorc/checked-shield',
  'lorc/energise',
  'lorc/star-swirl',
  'lorc/broken-shield',
  'lorc/sunbeams',
  'lorc/padlock',
  'lorc/snail',
  'lorc/small-fire',
  'lorc/magnet-blast',
  'lorc/ghost',
  'lorc/run',
  'lorc/volcano',
  'skoll/knockout',
  'lorc/uncertainty',
  // interface
  'delapouite/histogram',
  'lorc/scroll-unfurled',
  'skoll/talk',
  'delapouite/vote',
  'delapouite/speaker',
  'delapouite/speaker-off',
  'sbed/help',
  'delapouite/keyboard',
  'lorc/skull-crossed-bones',
  'lorc/spiky-explosion',
  'lorc/trophy',
  'lorc/archery-target',
  'delapouite/two-coins',
  'lorc/light-bulb',
  'delapouite/robot-antennas',
  'delapouite/character',
  'delapouite/info',
  'delapouite/shop',
  // settings: gear, controller and video; leave the room; watch (spectator)
  'lorc/cog',
  'delapouite/gamepad',
  'delapouite/tv',
  'delapouite/exit-door',
  'lorc/eyeball',
  // shop card buttons: buy, level up and undo (sell uses the coin)
  'delapouite/shopping-cart',
  'delapouite/upgrade',
  'delapouite/anticlockwise-rotation',
];

const symbols = [];
for (const path of ICONS) {
  const res = await fetch(`https://raw.githubusercontent.com/game-icons/icons/master/${path}.svg`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const svg = await res.text();
  // strips the black background and the fixed white from the drawing; the rest of the content goes as is
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '')
    .replace('<path d="M0 0h512v512H0z"/>', '')
    .replace(/ fill="#fff"/g, '');
  symbols.push(`<symbol id="${path.split('/')[1]}" viewBox="0 0 512 512">${inner}</symbol>`);
}
const ids = symbols.map((s) => s.match(/id="([^"]+)"/)[1]);
if (new Set(ids).size !== ids.length) throw new Error('id repetido no sprite');
writeFileSync(
  new URL('../../public/icons.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`,
);
console.log(`${symbols.length} ícones em public/icons.svg`);
