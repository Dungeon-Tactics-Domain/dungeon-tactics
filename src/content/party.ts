// Party (data): the 4 story members, who never leave, and the names recruits take in order. The Member type and the party
// rules (recruit, dismiss, class change, who goes to battle) live in src/client/group.ts.
import type { Member } from '../client/group.ts';

export const STORY: Member[] = [
  { id: 'warrior', name: 'Bran', cls: 'warrior', recruit: false },
  { id: 'archer', name: 'Tess', cls: 'archer', recruit: false },
  { id: 'mage', name: 'Odo', cls: 'mage', recruit: false },
  { id: 'rogue', name: 'Lia', cls: 'rogue', recruit: false },
];
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
