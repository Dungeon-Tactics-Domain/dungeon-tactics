// The rendered KayKit portrait of a unit: the dialogue box, the HUD and the town windows show it when there is no painted
// face. Kept apart from the faces so talk.ts can use it without importing the HUD.
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { el } from './icons.ts';
import { modelOf } from './markers.ts';

// portrait of the rendered KayKit character (public/chars, scripts/portraits.mjs); the Beacon has no character: a CSS crystal
export function portrait(def: string) {
  const model = modelOf(def);
  // tinted unit (UnitDef.tint, the Acolyte over the mage): the portrait gets the .tinted filter to match the character
  return model
    ? el('img', { class: `portrait${UNIT_DEFS[def]?.tint ? ' tinted' : ''}`, src: `/chars/${model}.webp`, alt: '' })
    : el('span', { class: 'portrait gem', 'aria-hidden': 'true' });
}
