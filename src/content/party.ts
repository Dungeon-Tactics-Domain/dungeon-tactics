// Party (data): the 4 story members, who never leave, and the names recruits take in order. The party rules (recruit, dismiss,
// class change, who goes to battle) live in src/client/group.ts.
// party classes: the 4 starting ones and the new ones, which only join via recruitment and class change (design, section 4)
export const JOBS = ['warrior', 'archer', 'mage', 'rogue', 'lancer'] as const;
export type Job = (typeof JOBS)[number];

export interface Member {
  id: string; // equipment key (dt:equip); the story ones use the starting class, like the old save
  name: string;
  cls: Job;
  recruit: boolean;
}

export const STORY: Member[] = [
  { id: 'warrior', name: 'Bran', cls: 'warrior', recruit: false },
  { id: 'archer', name: 'Tess', cls: 'archer', recruit: false },
  { id: 'mage', name: 'Odo', cls: 'mage', recruit: false },
  { id: 'rogue', name: 'Lia', cls: 'rogue', recruit: false },
];
// a new game: 0 gold and each story member with the common weapon of their class in the main hand (the Mechanics lab's
// gold grill, Nov 15). The lab has no common dagger, so the Rogue takes the blade
export const STARTING_WEAPON: Record<string, string> = {
  warrior: 'iron_blade',
  archer: 'hunter_bow',
  mage: 'ash_staff',
  rogue: 'iron_blade',
};
// names of the recruits, in order (no draw: the same party gives the same names)
export const RECRUIT_NAMES = [
  'Ivo',
  'Nina',
  'Caio',
  'Vera',
  'Rui',
  'Duda',
  'Téo',
  'Mira',
  'Saulo',
  'Bia',
  'Otto',
  'Lena',
];
