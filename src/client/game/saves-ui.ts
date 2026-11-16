// The title's saved games (Nov 15, Fernando: "save games so New game does not erase the progress"): New game starts a new
// slot, Continue opens the list of every slot, the latest played first, to load one or delete it. Rules in saves.ts.
import { dialog } from '../dialog.ts';
import { stillFace } from '../hud-pieces.ts';
import { LOCALE, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { byPlayed, deleteSlot, loadSlot, newGame, readSaves, type SlotSummary, summary } from '../saves.ts';
import { store } from '../store.ts';
import { goHome, savedRoom } from './crawl.ts';

// through store, so a blocked browser storage still plays in this tab's memory like every other save
const live = { getItem: store.get, setItem: store.set, saved: store.saved };
const full = () =>
  alert(
    t(
      'O navegador está sem espaço para salvar. Apague um jogo salvo e tente de novo.',
      'The browser has no room left to save. Delete a saved game and try again.',
    ),
  );

export const savedGames = () => readSaves(live).slots.map(summary).sort(byPlayed);

// the title closes before this runs: a refused save reopens it (onBack), so the screen is never left empty. The town is
// its own page (?home, game/town.ts), not a window over the title's backdrop battle
export function startNewGame(onBack: () => void) {
  if (!newGame(live, Date.now())) {
    full();
    return onBack();
  }
  goHome();
}

// where a loaded game opens: the room in play (closing the tab is not leaving it), else the town (crawl.ts savedRoom)
function resume() {
  const room = savedRoom();
  if (room === null) goHome();
  else location.search = `?room=${room}`;
}

const where = (s: SlotSummary) =>
  s.floor === null
    ? t('Na cidade', 'In town')
    : s.room
      ? t(`Sala da masmorra, andar ${s.floor}`, `Dungeon room, floor ${s.floor}`)
      : t(`Expedição, andar ${s.floor}`, `Expedition, floor ${s.floor}`);
const when = (ms: number) => new Date(ms).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' });

// One row per slot: the load row (the leader's face, who goes, where, gold and when) and its Delete, which asks a 2nd tap
// like the other losing actions (New game used to, the expedition's way back). The list scrolls past a screenful
export function openSaves(onBack: () => void) {
  const rows = savedGames().flatMap((s) => [
    button(
      'secondary save-load',
      [
        stillFace(s.leader, 'neutral'),
        el(
          'span',
          { class: 'save-text' },
          el('span', {}, s.names.join(' · ')),
          el(
            'small',
            { class: 'continue-where' },
            [where(s), t(`${s.gold} de ouro`, `${s.gold} gold`), s.played ? when(s.played) : '']
              .filter(Boolean)
              .join(' · '),
          ),
        ),
      ],
      () => {
        if (!loadSlot(live, s.id)) return full();
        d.close();
        resume();
      },
    ),
    button('secondary save-delete', t('Apagar', 'Delete'), (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement;
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = t('Toque de novo: apaga', 'Tap again: deletes');
        return;
      }
      if (!deleteSlot(live, s.id)) return full();
      d.close();
      if (savedGames().length) openSaves(onBack);
      else onBack();
    }),
  ]);
  const d = dialog(
    'title',
    t('Continuar', 'Continue'),
    [el('div', { class: 'menu-actions camp-list save-list' }, ...rows)],
    {
      onBack,
    },
  );
  d.overlay.classList.add('save-slots');
  d.overlay.querySelector<HTMLButtonElement>('.save-load')?.focus();
}
