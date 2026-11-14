// tests check Portuguese texts: the language stays fixed at pt, whatever the system language
// (do not import i18n.ts here: it reads the language on load, and must read it after this line)
import { store } from '../src/client/store.ts';

store.set('dt:lang', 'pt');
