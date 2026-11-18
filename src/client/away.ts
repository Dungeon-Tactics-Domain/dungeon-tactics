// The game left in the background (another tab, another app, the phone locked) is paused: the battle clock skips the
// time it was away instead of playing it all in the first frame back. sound.ts stops the music the same way.
let away = false;
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) away = true;
  });

// 0 on the first frame after coming back, 1 on every other: what a frame's elapsed time is multiplied by
export const awayFactor = (hidden = document.hidden): 0 | 1 => {
  if (!away || hidden) return 1;
  away = false;
  return 0;
};
// tests: as if the page had been hidden
export const wentAway = () => {
  away = true;
};
