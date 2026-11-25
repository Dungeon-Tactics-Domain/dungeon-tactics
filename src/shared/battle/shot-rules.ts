// Switches and numbers for the shot rules of Nov 25, set from Options > Debug (client options-debug.ts) to compare
// balances while playing (Fernando, Nov 25: "togleavel no menu de debug ... para testarmos varios tipos de
// balanceamento"; he picked the numbers too). All switches off is the rule of commit 44aac769: one path from the middle
// of the shooter's body to the middle of the target's
export type BodyForm = 'humanoid' | 'quadruped' | 'flying' | 'serpent';
export interface ShotRules {
  launch: boolean; // the shooter tries heights inside its body's and the ability's launch range (shot.ts)
  parts: boolean; // the shot may aim at any point of the target's body inside its form's aim range (`aims`)
  cover: boolean; // the hit chance drops with the share of the target's points the shooter cannot see
  // each body form's launch range, as a share of its height (Nov 25 grill: a quadruped only from its head)
  forms: Record<BodyForm, [low: number, high: number]>;
  // where on each body form a shot may land, as a share of its height: a small creature's head is too small to count, so
  // a rat on a ledge stays hidden (Nov 25, Fernando picked "Rato no alto mais escondido")
  aims: Record<BodyForm, [low: number, high: number]>;
  coverWeight: number; // 0 to 1: how much a hidden share takes off the chance (1: chance x visible share)
}
export const SHOT_DEFAULTS: ShotRules = {
  launch: true,
  parts: true,
  cover: true,
  forms: { humanoid: [0.5, 0.95], quadruped: [0.7, 1], flying: [0.1, 1], serpent: [0.3, 0.9] },
  aims: { humanoid: [0.2, 0.9], quadruped: [0.1, 0.5], flying: [0.2, 0.9], serpent: [0.1, 0.5] },
  coverWeight: 1,
};
// mutable: the client copies the saved settings in at boot and on every change
export const SHOT_RULES: ShotRules = structuredClone(SHOT_DEFAULTS);
